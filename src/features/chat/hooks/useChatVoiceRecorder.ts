// Tap-to-record voice recorder for in-conversation voice messages (WhatsApp-style).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setIsAudioActiveAsync,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

import {
  VOICE_AUDIO_FORMAT,
  MAX_VOICE_DURATION_MS,
  MIN_VOICE_MESSAGE_DURATION_MS,
  METERING_INTERVAL_MS,
  configureAudioSessionForRecording,
  configureAudioSessionForPlayback,
  useAudioRecorderStateGated,
} from '@/lib/audio';
import { Sentry } from '@/lib/sentry';
import {
  suspendHostForRecording,
  resumeHostAfterRecording,
} from '../lib/chatMessagePlayer';

export type ChatRecorderState = 'idle' | 'recording' | 'error';

export interface ChatVoiceRecorderResult {
  uri: string;
  durationMs: number;
}

export interface ChatVoiceRecorderHook {
  state: ChatRecorderState;
  durationMs: number;
  meteringDb: number[];
  result: ChatVoiceRecorderResult | null;
  error: string | null;
  start: () => Promise<void>;
  stopAndSend: () => Promise<ChatVoiceRecorderResult | null>;
  cancel: () => Promise<void>;
}

const METERING_RING_SIZE = 60;

function ensurePendingDirectory(): Directory {
  const dir = new Directory(Paths.document, 'pending');
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

export function useChatVoiceRecorder(): ChatVoiceRecorderHook {
  const [state, setState] = useState<ChatRecorderState>('idle');
  const [durationMs, setDurationMs] = useState(0);
  const [meteringDb, setMeteringDb] = useState<number[]>([]);
  const [result, setResult] = useState<ChatVoiceRecorderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hardCapFiredRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Tracks whether the recording session was activated at least once so cleanup only
  // restores the playback session when we actually swapped to recording mode.
  const recordingSessionTouchedRef = useRef(false);

  const recorder = useAudioRecorder(VOICE_AUDIO_FORMAT);
  // Gated polling: 20 Hz only while recording, zero otherwise. Eliminates the
  // ~20 Hz baseline TurboModule traffic per mounted conversation (idle convs in
  // the navigation stack were polling continuously even with no UI activity).
  const recorderState = useAudioRecorderStateGated(
    recorder,
    state === 'recording',
    METERING_INTERVAL_MS,
  );

  useEffect(() => {
    if (state !== 'recording') return;
    setDurationMs(Math.min(recorderState.durationMillis, MAX_VOICE_DURATION_MS));

    if (recorderState.metering !== undefined) {
      const sample = recorderState.metering as number;
      setMeteringDb((prev) => {
        const next = [...prev, sample];
        return next.length > METERING_RING_SIZE ? next.slice(-METERING_RING_SIZE) : next;
      });
    }
  }, [recorderState.durationMillis, recorderState.metering, state]);

  // Hard cap auto-stop: finalize and return to idle with result ready to send.
  useEffect(() => {
    if (
      state === 'recording' &&
      recorderState.durationMillis >= MAX_VOICE_DURATION_MS &&
      !hardCapFiredRef.current
    ) {
      hardCapFiredRef.current = true;
      void finalizeRecording().then((res) => {
        if (res) {
          setResult(res);
          setState('idle');
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.durationMillis, state]);

  // Cleanup on unmount. We only restore the playback session if we actually
  // swapped to recording mode during this hook's lifetime — otherwise the call
  // is a redundant `setAudioModeAsync` round-trip that adds pressure to the
  // native bridge during conv unmount (often racing with iOS audio reactivation
  // when the user is navigating between conversations).
  useEffect(() => {
    return () => {
      try {
        if (recorder.isRecording) {
          recorder.stop().catch(() => null);
        }
      } catch {
        // Native recorder already released.
      }
      if (recordingSessionTouchedRef.current) {
        setIsAudioActiveAsync(true)
          .then(() => configureAudioSessionForPlayback())
          .catch(() => null);
      }
      // Always clear the suspension flag — if the hook unmounts while the
      // host was suspended (e.g. the user backs out mid-recording), the next
      // ConversationScreen mount must be able to remount its host.
      resumeHostAfterRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finalizeRecording = useCallback(async (): Promise<ChatVoiceRecorderResult | null> => {
    try {
      await recorder.stop();
      const tempUri = recorder.uri;
      if (!tempUri) throw new Error('recorder_no_uri');

      const pendingDir = ensurePendingDirectory();
      const uuid = Crypto.randomUUID();
      const destFile = new File(pendingDir, `${uuid}.m4a`);
      const srcFile = new File(tempUri);

      const srcSize = srcFile.size ?? 0;
      srcFile.move(destFile);
      const destSize = destFile.size ?? 0;

      const rawDuration = recorderState.durationMillis || durationMs;
      const finalDuration = Math.min(rawDuration, MAX_VOICE_DURATION_MS);

      if (__DEV__) {
        console.log('[ChatRecorder] finalize', { srcSize, destSize, finalDuration, tempUri });
      }

      // Flag suspiciously small recordings: at 32 kbps, even 1 second produces ~4 KB.
      // A multi-second recording under 35 KB strongly suggests a corrupt M4A container
      // where the AAC encoder didn't flush its samples (seen on some iOS builds).
      if (destSize > 0 && destSize < 35_000 && finalDuration > 2_000) {
        Sentry.captureMessage('Chat voice recording suspiciously small', {
          level: 'warning',
          extra: { srcSize, destSize, finalDuration, tempUri },
        });
      }

      await setIsAudioActiveAsync(true);
      await configureAudioSessionForPlayback();
      // Re-mount the chat host now that the recorder has released the session
      // and we are back in playback mode. Safe to call when not suspended.
      resumeHostAfterRecording();
      return { uri: destFile.uri, durationMs: finalDuration };
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'stop_failed');
      await setIsAudioActiveAsync(true).catch(() => null);
      await configureAudioSessionForPlayback();
      resumeHostAfterRecording();
      return null;
    }
  }, [recorder, recorderState.durationMillis, durationMs]);

  const start = useCallback(async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setState('error');
        setError('permission_denied');
        return;
      }

      // Tear down the chat host's native AVAudioPlayer first so it does not
      // contend with the recorder for the iOS AVAudioSession. Without this,
      // the AAC encoder occasionally receives zero samples and writes a
      // ~32 KB silent .m4a (see docs/CHAT_AUDIO.md §9bis and Sentry
      // LOVOICE-1). suspendHostForRecording awaits the React commit so the
      // native player is actually released before we continue.
      await suspendHostForRecording();

      try {
        // Belt-and-suspenders: deactivate the audio subsystem before swapping
        // categories. Even with the host released, a foreground transition
        // can momentarily reactivate playback mode (cf. expo/expo#39030).
        await setIsAudioActiveAsync(false);
        await configureAudioSessionForRecording();
        recordingSessionTouchedRef.current = true;
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch (setupErr) {
        // Restore the host so the user can keep playing existing voices.
        resumeHostAfterRecording();
        throw setupErr;
      }

      hardCapFiredRef.current = false;
      setDurationMs(0);
      setMeteringDb([]);
      setResult(null);
      setError(null);
      setState('recording');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'start_failed');
    }
  }, [recorder]);

  const stopAndSend = useCallback(async (): Promise<ChatVoiceRecorderResult | null> => {
    if (stateRef.current !== 'recording') return null;
    const res = await finalizeRecording();
    if (!res) return null;

    if (res.durationMs < MIN_VOICE_MESSAGE_DURATION_MS) {
      try {
        new File(res.uri).delete();
      } catch { /* non-fatal */ }
      setState('idle');
      setError('too_short');
      return null;
    }

    setResult(res);
    setState('idle');
    return res;
  }, [finalizeRecording]);

  const cancel = useCallback(async () => {
    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch { /* already released */ }

    if (result?.uri) {
      try {
        new File(result.uri).delete();
      } catch { /* non-fatal */ }
    }

    setResult(null);
    setError(null);
    setDurationMs(0);
    setMeteringDb([]);
    hardCapFiredRef.current = false;
    setState('idle');
    await setIsAudioActiveAsync(true).catch(() => null);
    await configureAudioSessionForPlayback();
    resumeHostAfterRecording();
  }, [recorder, result]);

  return {
    state,
    durationMs,
    meteringDb,
    result,
    error,
    start,
    stopAndSend,
    cancel,
  };
}
