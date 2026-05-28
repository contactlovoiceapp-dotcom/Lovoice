// Session-scoped voice recorder: mounts fresh per recording, owns the native AVAudioRecorder,
// and unmounts when the session ends (send, cancel, hard-cap, or parent unmount).

import { useEffect, useRef } from 'react';
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

  // Mount: pause all players, request permission, prepare, record.
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      console.warn('[REC] session_mounted');

      pauseAllChatMessages();
      pauseFeedPlayer();
      pauseProfileVoicePlayer();
      console.warn('[REC] players_paused');

      const { granted } = await requestRecordingPermissionsAsync();
      if (cancelled) return;
      if (!granted) {
        console.warn('[REC] permission_denied');
        onErrorRef.current('permission_denied');
        return;
      }
      console.warn('[REC] permission_granted');

      try {
        await recorder.prepareToRecordAsync();
      } catch (err) {
        if (cancelled) return;
        console.warn('[REC] prepare THREW', err);
        Sentry.captureException(err, { extra: { step: 'prepare' } });
        onErrorRef.current('prepare_failed');
        return;
      }
      console.warn('[REC] prepare_done');

      if (cancelled) return;

      try {
        recorder.record();
      } catch (err) {
        if (cancelled) return;
        console.warn('[REC] record THREW', err);
        Sentry.captureException(err, { extra: { step: 'record' } });
        onErrorRef.current('record_failed');
        return;
      }

      console.warn('[REC] record_started');
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

  async function doFinalize(requestedBy: 'send' | 'cap') {
    Sentry.addBreadcrumb({ category: 'recording', message: 'recording.stop_called', level: 'info', data: { requestedBy } });
    console.warn('[REC] stop_called', { requestedBy });

    try {
      await recorder.stop();
    } catch (err) {
      console.warn('[REC] stop THREW', err);
      Sentry.captureException(err, { extra: { step: 'stop', requestedBy } });
      onErrorRef.current('stop_failed');
      return;
    }

    const tempUri = recorder.uri;
    console.warn('[REC] after stop', { tempUri, isRecording: recorder.isRecording });
    if (!tempUri) {
      console.warn('[REC] NO URI after stop');
      Sentry.addBreadcrumb({ category: 'recording', message: 'recording.no_uri', level: 'warning' });
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

      console.warn('[REC] finalized', { durationMs, fileSize, bitrateOk, destUri: destFile.uri });

      Sentry.captureMessage('recording.finalized', {
        level: bitrateOk ? 'info' : 'warning',
        extra: { durationMs, fileSize, bitrateOk, requestedBy, destUri: destFile.uri },
      });

      onFinalizedRef.current({ uri: destFile.uri, durationMs });
    } catch (err) {
      console.warn('[REC] file_move THREW', err);
      Sentry.captureException(err, { extra: { step: 'file_move' } });
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
