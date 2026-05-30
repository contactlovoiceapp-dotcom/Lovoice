// Session-scoped voice recorder: mounts fresh per recording, owns the native AVAudioRecorder,
// and unmounts when the session ends (send, cancel, hard-cap, or parent unmount).

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

import {
  VOICE_AUDIO_FORMAT,
  MAX_VOICE_DURATION_MS,
  METERING_INTERVAL_MS,
  useAudioRecorderStateGated,
  estimateBitrateOk,
} from '@/lib/audio';
import { Sentry } from '@/lib/sentry';
import { pauseAllChatMessages } from '../lib/chatMessagePlayer';
import { pauseFeedPlayer } from '@/lib/feedPlayer';
import { pauseProfileVoicePlayer } from '@/features/voices/hooks/useVoicePlayer';

export type RecordingSessionMode = 'recording' | 'finalizing' | 'cancelling';

export type RecordingErrorCode =
  | 'permission_denied'
  | 'prepare_failed'
  | 'record_failed'
  | 'no_uri'
  | 'stop_failed';

export interface RecordingSessionCallbacks {
  onReady: () => void;
  onTick: (durationMs: number, meteringDb: number[]) => void;
  onFinalized: (result: { uri: string; durationMs: number }) => void;
  onCancelled: () => void;
  onError: (code: RecordingErrorCode) => void;
}

interface VoiceRecordingSessionProps extends RecordingSessionCallbacks {
  mode: RecordingSessionMode;
}

const METERING_RING_SIZE = 60;

function ensurePendingDirectory(): Directory {
  const dir = new Directory(Paths.document, 'pending');
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

export default function VoiceRecordingSession({
  mode,
  onReady,
  onTick,
  onFinalized,
  onCancelled,
  onError,
}: VoiceRecordingSessionProps) {
  const recorder = useAudioRecorder(VOICE_AUDIO_FORMAT);
  const recorderState = useAudioRecorderStateGated(
    recorder,
    mode === 'recording',
    METERING_INTERVAL_MS,
  );

  const meteringRef = useRef<number[]>([]);
  const hardCapFiredRef = useRef(false);
  const didStartRef = useRef(false);
  const finalizingRef = useRef(false);
  const cancellingRef = useRef(false);

  // Boot timestamps, attached to the recording.finalized Sentry event. Pausing a player
  // schedules a ~100ms-delayed AVAudioSession deactivation that expo-audio's patch only
  // skips while a recorder is already active. The boot now calls record() *before* pausing
  // (docs/CHAT_AUDIO.md §9.11), so the recorder is always active when that timer fires.
  // msRecordToPause = how long the recorder was active before the pause scheduled the timer;
  // it must stay positive. A negative value would mean record() ran after the pause again.
  const bootRef = useRef({ playersPausedAt: 0, recordAt: 0, appState: 'unknown' as string });

  // Stable refs for callbacks to avoid re-running effects on identity change.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const onFinalizedRef = useRef(onFinalized);
  onFinalizedRef.current = onFinalized;
  const onCancelledRef = useRef(onCancelled);
  onCancelledRef.current = onCancelled;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Mount: request permission, prepare, start recording, then pause the players.
  // The order is load-bearing (docs/CHAT_AUDIO.md §9.11). Pausing a player schedules a
  // ~100ms-delayed AVAudioSession deactivation that expo-audio's patch skips only while a
  // recorder is active (registry-wide hasActiveRecorders check). Starting record() *before*
  // pausing guarantees the recorder is already active when any pause timer fires, so the
  // session can never be torn down mid-start — no matter how long record() takes under
  // thermal throttling. The earlier orders (pause→…→record) raced that 100ms timer and
  // produced silent ~32KB M4A files when record() landed late. A short bleed of a still-
  // playing voice into the first tens of ms is the accepted trade-off vs. losing audio.
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (__DEV__) console.warn('[REC] session_mounted');

      bootRef.current.appState = AppState.currentState;

      const { granted } = await requestRecordingPermissionsAsync();
      if (cancelled) return;
      if (!granted) {
        if (__DEV__) console.warn('[REC] permission_denied');
        onErrorRef.current('permission_denied');
        return;
      }
      if (__DEV__) console.warn('[REC] permission_granted');

      try {
        await recorder.prepareToRecordAsync();
      } catch (err) {
        if (cancelled) return;
        if (__DEV__) console.warn('[REC] prepare THREW', err);
        Sentry.captureException(err, { extra: { step: 'prepare' } });
        onErrorRef.current('prepare_failed');
        return;
      }
      if (cancelled) return;
      if (__DEV__) console.warn('[REC] prepare_done');

      try {
        recorder.record();
      } catch (err) {
        if (cancelled) return;
        if (__DEV__) console.warn('[REC] record THREW', err);
        Sentry.captureException(err, { extra: { step: 'record' } });
        onErrorRef.current('record_failed');
        return;
      }
      bootRef.current.recordAt = Date.now();

      // Pause players only after the recorder is active. The deactivation timer this
      // schedules can no longer tear the session down — hasActiveRecorders is now true.
      pauseAllChatMessages();
      pauseFeedPlayer();
      pauseProfileVoicePlayer();
      bootRef.current.playersPausedAt = Date.now();

      // Torture-test signal: must stay positive (recorder active before the pause timer).
      if (__DEV__) console.warn('[REC] record_started', { msRecordToPause: bootRef.current.playersPausedAt - bootRef.current.recordAt });
      didStartRef.current = true;
      hardCapFiredRef.current = false;
      meteringRef.current = [];
      onReadyRef.current();
    }

    void boot();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick: forward metering and duration while recording.
  useEffect(() => {
    if (mode !== 'recording') return;
    const durationMs = Math.min(recorderState.durationMillis, MAX_VOICE_DURATION_MS);

    if (recorderState.metering !== undefined) {
      const sample = recorderState.metering as number;
      const ring = [...meteringRef.current, sample];
      meteringRef.current = ring.length > METERING_RING_SIZE
        ? ring.slice(-METERING_RING_SIZE)
        : ring;
    }

    onTickRef.current(durationMs, meteringRef.current);
  }, [mode, recorderState.durationMillis, recorderState.metering]);

  // Hard cap: auto-finalize when duration reaches MAX.
  useEffect(() => {
    if (
      mode === 'recording' &&
      recorderState.durationMillis >= MAX_VOICE_DURATION_MS &&
      !hardCapFiredRef.current
    ) {
      hardCapFiredRef.current = true;
      Sentry.addBreadcrumb({ category: 'recording', message: 'recording.hard_cap_reached', level: 'info', data: { durationMs: recorderState.durationMillis } });
      void doFinalize('cap');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, recorderState.durationMillis]);

  // Finalize effect: triggered when parent sets mode to 'finalizing'.
  useEffect(() => {
    if (mode !== 'finalizing' || finalizingRef.current) return;
    finalizingRef.current = true;
    void doFinalize('send');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Cancel effect: triggered when parent sets mode to 'cancelling'.
  useEffect(() => {
    if (mode !== 'cancelling' || cancellingRef.current) return;
    cancellingRef.current = true;
    void doCancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Unmount cleanup: stop the recorder if still active.
  useEffect(() => {
    return () => {
      Sentry.addBreadcrumb({ category: 'recording', message: 'recording.session_unmounted', level: 'info', data: { active: didStartRef.current } });
      if (didStartRef.current) {
        try {
          recorder.stop().catch(() => null);
        } catch {
          // Native recorder already released.
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Snapshot the recorder's native state plus the boot timing for a finalize. This is
  // temporary diagnostic scaffolding (docs/CHAT_AUDIO.md §9.11): a non-positive msRecordToPause
  // points at the AVAudioSession deactivation race, while mediaServicesDidReset / a false
  // isRecording point at the alternative interruption / media-reset hypotheses. getStatus()
  // is read-only and may throw if the native recorder was already released, so it is guarded.
  function collectFinalizeDiagnostics() {
    const b = bootRef.current;
    const recorderSnapshot: {
      isRecording: boolean | null;
      mediaServicesDidReset: boolean | null;
      recorderDurationMs: number | null;
      recorderUrl: string | null;
    } = {
      isRecording: null,
      mediaServicesDidReset: null,
      recorderDurationMs: null,
      recorderUrl: null,
    };

    try {
      const status = recorder.getStatus();
      recorderSnapshot.isRecording = status.isRecording;
      recorderSnapshot.mediaServicesDidReset = status.mediaServicesDidReset;
      recorderSnapshot.recorderDurationMs = status.durationMillis;
      recorderSnapshot.recorderUrl = status.url;
    } catch {
      // Native recorder already released — keep the null fallbacks above.
    }

    return {
      // How long the recorder was active before pausing the players scheduled the ~100ms
      // AVAudioSession deactivation. Positive = the §9.11 race is structurally closed;
      // a negative value would mean record() ran after the pause (regression).
      msRecordToPause: b.recordAt && b.playersPausedAt ? b.playersPausedAt - b.recordAt : -1,
      appStateAtBoot: b.appState,
      ...recorderSnapshot,
    };
  }

  async function doFinalize(requestedBy: 'send' | 'cap') {
    Sentry.addBreadcrumb({ category: 'recording', message: 'recording.stop_called', level: 'info', data: { requestedBy } });
    if (__DEV__) console.warn('[REC] stop_called', { requestedBy });

    // Capture the recorder state before stopping so silent/oversized/no-uri captures
    // can be told apart from a mediaServicesDidReset interruption.
    const diagnostics = collectFinalizeDiagnostics();

    try {
      await recorder.stop();
    } catch (err) {
      if (__DEV__) console.warn('[REC] stop THREW', err);
      Sentry.captureException(err, { extra: { step: 'stop', requestedBy, ...diagnostics } });
      onErrorRef.current('stop_failed');
      return;
    }

    const tempUri = recorder.uri;
    if (__DEV__) console.warn('[REC] after stop', { tempUri, isRecording: recorder.isRecording });
    if (!tempUri) {
      if (__DEV__) console.warn('[REC] NO URI after stop');
      // Promoted from a breadcrumb to a standalone event: a null uri leaves no other
      // trace, so it was previously invisible in Sentry.
      Sentry.captureMessage('recording.no_uri', {
        level: 'error',
        tags: {
          'recording.appStateAtBoot': diagnostics.appStateAtBoot,
          'recording.mediaServicesDidReset': String(diagnostics.mediaServicesDidReset),
        },
        extra: { requestedBy, ...diagnostics },
      });
      onErrorRef.current('no_uri');
      return;
    }

    try {
      const pendingDir = ensurePendingDirectory();
      const uuid = Crypto.randomUUID();
      const destFile = new File(pendingDir, `${uuid}.m4a`);
      const srcFile = new File(tempUri);
      srcFile.move(destFile);

      const durationMs = Math.min(recorderState.durationMillis, MAX_VOICE_DURATION_MS);
      const fileSize = destFile.size ?? 0;
      const bitrateOk = estimateBitrateOk(fileSize, durationMs);
      // Raw ratio so an oversized-but-playable file (false positive of the ±15% band)
      // can be distinguished from a truly empty ~32KB capture.
      const bytesPerMs = durationMs > 0 ? fileSize / durationMs : -1;

      if (__DEV__) console.warn('[REC] finalized', { durationMs, fileSize, bitrateOk, bytesPerMs, msRecordToPause: diagnostics.msRecordToPause, destUri: destFile.uri });

      Sentry.captureMessage('recording.finalized', {
        level: bitrateOk ? 'info' : 'warning',
        // Tags are filterable in Sentry (unlike extra) so warnings can be isolated.
        // voice.sourceUuid is the searchable join key: a broken file (playback.failed →
        // recording.uploaded → sourceUuid) resolves to this exact event and its diagnostics.
        tags: {
          'voice.sourceUuid': uuid,
          'recording.bitrateOk': String(bitrateOk),
          'recording.appStateAtBoot': diagnostics.appStateAtBoot,
          'recording.mediaServicesDidReset': String(diagnostics.mediaServicesDidReset),
        },
        extra: {
          durationMs,
          fileSize,
          bytesPerMs,
          bitrateOk,
          requestedBy,
          destUri: destFile.uri,
          ...diagnostics,
        },
      });

      onFinalizedRef.current({ uri: destFile.uri, durationMs });
    } catch (err) {
      if (__DEV__) console.warn('[REC] file_move THREW', err);
      Sentry.captureException(err, { extra: { step: 'file_move', requestedBy, ...diagnostics } });
      onErrorRef.current('stop_failed');
    }
  }

  async function doCancel() {
    Sentry.addBreadcrumb({ category: 'recording', message: 'recording.stop_called', level: 'info', data: { requestedBy: 'cancel' } });

    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch {
      Sentry.addBreadcrumb({ category: 'recording', message: 'recording.cancel_stop_swallowed', level: 'warning' });
    }

    const tempUri = recorder.uri;
    if (tempUri) {
      try {
        new File(tempUri).delete();
      } catch {
        Sentry.addBreadcrumb({ category: 'recording', message: 'recording.cancel_delete_swallowed', level: 'warning' });
      }
    }

    Sentry.addBreadcrumb({ category: 'recording', message: 'recording.cancelled', level: 'info', data: { requestedBy: 'cancel' } });
    onCancelledRef.current();
  }

  // Renderless component — all work is in effects.
  return null;
}
