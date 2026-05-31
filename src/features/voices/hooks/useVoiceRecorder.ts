// Voice recording hook: wraps expo-audio's useAudioRecorder with state machine, metering ring buffer, and file persistence.
//
// Why we copy to documentDirectory/pending/:
// expo-audio writes the raw recording to a system-managed cache URI that the OS may evict.
// After stop(), we move the file to documentDirectory/pending/<uuid>.m4a which is user-managed
// storage (never evicted by the OS) so the pending upload survives app backgrounding.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

import {
  VOICE_AUDIO_FORMAT,
  MAX_VOICE_DURATION_MS,
  MIN_VOICE_DURATION_MS,
  METERING_INTERVAL_MS,
  useAudioRecorderStateGated,
} from '@/lib/audio';
import { pauseProfileVoicePlayer } from '@/features/voices/hooks/useVoicePlayer';

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
  /** True when the recording peak never exceeded SILENCE_THRESHOLD_DB — likely silence or white noise. */
  isLikelySilent: boolean;
  result: VoiceRecorderResult | null;
  error: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<void>;
  reset: () => Promise<void>;
}

// A real voice consistently exceeds this level; ambient noise rarely does for sustained periods.
// -30 dBFS sits above typical room noise peaks (-45 to -35) and below a quiet close-mic voice (-25 to -15).
const VOICE_THRESHOLD_DB = -30;
// If fewer than 5% of metering samples exceed VOICE_THRESHOLD_DB we consider the recording silent.
// Ambient noise may occasionally spike above -30, but a real voice will do so continuously.
const VOICE_SAMPLE_MIN_RATIO = 0.05;

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
  const [isLikelySilent, setIsLikelySilent] = useState(false);
  const [result, setResult] = useState<VoiceRecorderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tracks whether stop was triggered by the hard cap to avoid double-stop.
  const hardCapFiredRef = useRef(false);
  // Counts all metering samples and those above VOICE_THRESHOLD_DB for ratio-based silence detection.
  // We use refs (not state) to avoid re-renders on every 50ms tick.
  const totalSamplesRef = useRef(0);
  const voiceSamplesRef = useRef(0);

  const recorder = useAudioRecorder(VOICE_AUDIO_FORMAT);
  // Gated polling: 20 Hz only while actively recording or paused, zero otherwise.
  // Mirrors the chat recorder optimisation — see src/lib/audio.ts for the rationale.
  const recorderState = useAudioRecorderStateGated(
    recorder,
    state === 'recording' || state === 'paused',
    METERING_INTERVAL_MS,
  );

  // Mirror native duration and metering into React state while actively recording.
  useEffect(() => {
    if (state !== 'recording' && state !== 'paused') return;
    // Clamp so the displayed timer never overshoots the 1:30 hard cap during the brief
    // window between the auto-stop trigger and the actual recorder.stop() resolving.
    setDurationMs(Math.min(recorderState.durationMillis, MAX_VOICE_DURATION_MS));

    if (recorderState.metering !== undefined && state === 'recording') {
      const sample = recorderState.metering as number;
      totalSamplesRef.current += 1;
      if (sample > VOICE_THRESHOLD_DB) {
        voiceSamplesRef.current += 1;
      }
      setMeteringDb((prev) => {
        const next = [...prev, sample];
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
    // stop is excluded intentionally: state is already in the deps array, and stop's
    // identity changes whenever state changes. Since the effect re-runs on every state
    // transition, the captured stop is always current when the hard cap fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.durationMillis, state]);

  useEffect(() => {
    return () => {
      try {
        if (recorder.isRecording) {
          recorder.stop().catch(() => null);
        }
      } catch {
        // Native recorder already released — nothing to stop.
      }
    };
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

      // Release any profile-tab preview player so Android does not keep audio
      // focus while the recorder is active.
      pauseProfileVoicePlayer();

      await recorder.prepareToRecordAsync();
      recorder.record();

      hardCapFiredRef.current = false;
      totalSamplesRef.current = 0;
      voiceSamplesRef.current = 0;
      setDurationMs(0);
      setMeteringDb([]);
      setIsLikelySilent(false);
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
      // Clamp to the hard cap: the metering poll fires every METERING_INTERVAL_MS and the
      // native stop() takes a few extra ms, so durationMillis can land at e.g. 300_050 when
      // the auto-stop triggers. The server enforces a strict <= MAX so we mirror it here.
      const rawDuration = recorderState.durationMillis || durationMs;
      const finalDuration = Math.min(rawDuration, MAX_VOICE_DURATION_MS);

      const voiceRatio = totalSamplesRef.current > 0
        ? voiceSamplesRef.current / totalSamplesRef.current
        : 0;
      const likelySilent = voiceRatio < VOICE_SAMPLE_MIN_RATIO;
      if (__DEV__) {
        console.warn('[REC] recorder_stopped', {
          durationMs: finalDuration,
          fileSize: destFile.size ?? 0,
          voiceRatio,
          isLikelySilent: likelySilent,
          uri: finalUri,
        });
      }
      setIsLikelySilent(likelySilent);
      setResult({ uri: finalUri, durationMs: finalDuration });
      setState('stopped');
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
      setIsLikelySilent(false);
      hardCapFiredRef.current = false;
      totalSamplesRef.current = 0;
      voiceSamplesRef.current = 0;
      setState('idle');
    }
  }, [recorder, result]);

  const canStop = durationMs >= MIN_VOICE_DURATION_MS;

  return { state, durationMs, meteringDb, canStop, isLikelySilent, result, error, start, pause, resume, stop, reset };
}
