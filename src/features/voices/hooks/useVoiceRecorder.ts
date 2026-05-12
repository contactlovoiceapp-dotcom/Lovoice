// Voice recording hook: wraps expo-audio's useAudioRecorder with state machine, metering ring buffer, and file persistence.
//
// Why we copy to documentDirectory/pending/:
// expo-audio writes the raw recording to a system-managed cache URI that the OS may evict.
// After stop(), we move the file to documentDirectory/pending/<uuid>.m4a which is user-managed
// storage (never evicted by the OS) so the pending upload survives app backgrounding.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

import {
  VOICE_AUDIO_FORMAT,
  MAX_VOICE_DURATION_MS,
  MIN_VOICE_DURATION_MS,
  METERING_INTERVAL_MS,
  configureAudioSessionForRecording,
  configureAudioSessionForPlayback,
} from '@/lib/audio';

export type RecorderState = 'idle' | 'recording' | 'paused' | 'stopped' | 'error';

export interface VoiceRecorderResult {
  uri: string;
  durationMs: number;
}

export interface VoiceRecorderHook {
  state: RecorderState;
  durationMs: number;
  meteringDb: number[];
  canStop: boolean;
  result: VoiceRecorderResult | null;
  error: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<void>;
  reset: () => Promise<void>;
}

// Ring buffer capacity: 3 seconds of history at 50ms intervals, enough for a smooth waveform.
const METERING_RING_SIZE = 60;

function ensurePendingDirectory(): Directory {
  const dir = new Directory(Paths.document, 'pending');
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

export function useVoiceRecorder(): VoiceRecorderHook {
  const [state, setState] = useState<RecorderState>('idle');
  const [durationMs, setDurationMs] = useState(0);
  const [meteringDb, setMeteringDb] = useState<number[]>([]);
  const [result, setResult] = useState<VoiceRecorderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tracks whether stop was triggered by the hard cap to avoid double-stop.
  const hardCapFiredRef = useRef(false);

  const recorder = useAudioRecorder(VOICE_AUDIO_FORMAT);
  // Poll at METERING_INTERVAL_MS for live duration and metering updates.
  const recorderState = useAudioRecorderState(recorder, METERING_INTERVAL_MS);

  // Mirror native duration and metering into React state while actively recording.
  useEffect(() => {
    if (state !== 'recording' && state !== 'paused') return;
    setDurationMs(recorderState.durationMillis);

    if (recorderState.metering !== undefined && state === 'recording') {
      setMeteringDb((prev) => {
        const next = [...prev, recorderState.metering as number];
        // Trim to ring size so the array never grows past METERING_RING_SIZE.
        return next.length > METERING_RING_SIZE ? next.slice(-METERING_RING_SIZE) : next;
      });
    }
  }, [recorderState.durationMillis, recorderState.metering, state]);

  // Hard cap: auto-stop when the recording reaches MAX_VOICE_DURATION_MS.
  useEffect(() => {
    if (
      state === 'recording' &&
      recorderState.durationMillis >= MAX_VOICE_DURATION_MS &&
      !hardCapFiredRef.current
    ) {
      hardCapFiredRef.current = true;
      stop();
    }
    // 'stop' is stable (useCallback with no deps that change on record); including it is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.durationMillis, state]);

  // Restore playback session when the hook unmounts (component leaves without publishing).
  // The recorder.isRecording getter and stop() can both throw NativeSharedObjectNotFoundException
  // when expo-audio has already released the underlying native recorder; we treat those as no-ops.
  useEffect(() => {
    return () => {
      try {
        if (recorder.isRecording) {
          recorder.stop().catch(() => null);
        }
      } catch {
        // Native recorder already released — nothing to stop.
      }
      configureAudioSessionForPlayback().catch(() => null);
    };
    // recorder reference is stable for the component lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setState('error');
        setError('permission_denied');
        return;
      }

      await configureAudioSessionForRecording();
      await recorder.prepareToRecordAsync();
      recorder.record();

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

  const pause = useCallback(() => {
    if (state !== 'recording') return;
    recorder.pause();
    setState('paused');
  }, [recorder, state]);

  const resume = useCallback(() => {
    if (state !== 'paused') return;
    recorder.record();
    setState('recording');
  }, [recorder, state]);

  const stop = useCallback(async () => {
    if (state !== 'recording' && state !== 'paused') return;
    try {
      await recorder.stop();
      const tempUri = recorder.uri;

      if (!tempUri) {
        throw new Error('recorder_no_uri');
      }

      // Move from cache to persistent storage so the OS cannot evict it before upload.
      const pendingDir = ensurePendingDirectory();
      const uuid = Crypto.randomUUID();
      const destFile = new File(pendingDir, `${uuid}.m4a`);
      const srcFile = new File(tempUri);
      srcFile.move(destFile);

      const finalUri = destFile.uri;
      const finalDuration = recorderState.durationMillis || durationMs;

      setResult({ uri: finalUri, durationMs: finalDuration });
      setState('stopped');
      await configureAudioSessionForPlayback();
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'stop_failed');
    }
  }, [recorder, recorderState.durationMillis, durationMs, state]);

  const reset = useCallback(async () => {
    try {
      try {
        if (recorder.isRecording) {
          await recorder.stop();
        }
      } catch {
        // Native recorder may already be released; safe to skip.
      }
      // Delete the pending file if it was not consumed by an upload.
      if (result?.uri) {
        try {
          new File(result.uri).delete();
        } catch {
          // Non-fatal: file may have already been moved or deleted.
        }
      }
    } finally {
      setResult(null);
      setError(null);
      setDurationMs(0);
      setMeteringDb([]);
      hardCapFiredRef.current = false;
      setState('idle');
      await configureAudioSessionForPlayback();
    }
  }, [recorder, result]);

  const canStop = durationMs >= MIN_VOICE_DURATION_MS;

  return { state, durationMs, meteringDb, canStop, result, error, start, pause, resume, stop, reset };
}
