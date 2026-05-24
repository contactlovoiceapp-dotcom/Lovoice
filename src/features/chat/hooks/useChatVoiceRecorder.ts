// Hold-to-record voice recorder state machine for in-conversation voice messages.

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
  MIN_VOICE_MESSAGE_DURATION_MS,
  METERING_INTERVAL_MS,
  configureAudioSessionForRecording,
  configureAudioSessionForPlayback,
} from '@/lib/audio';

export type ChatRecorderState =
  | 'idle'
  | 'recording'
  | 'cancel_hover'
  | 'preview'
  | 'cancelled'
  | 'error';

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
  isLikelySilent: boolean;
  start: () => Promise<void>;
  setCancelHover: (active: boolean) => void;
  stopAndSend: () => Promise<ChatVoiceRecorderResult | null>;
  stopAndPreview: () => Promise<void>;
  reset: () => Promise<void>;
  rerecord: () => Promise<void>;
}

const VOICE_THRESHOLD_DB = -30;
const VOICE_SAMPLE_MIN_RATIO = 0.05;
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
  const [isLikelySilent, setIsLikelySilent] = useState(false);
  const [result, setResult] = useState<ChatVoiceRecorderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hardCapFiredRef = useRef(false);
  const totalSamplesRef = useRef(0);
  const voiceSamplesRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const recorder = useAudioRecorder(VOICE_AUDIO_FORMAT);
  const recorderState = useAudioRecorderState(recorder, METERING_INTERVAL_MS);

  useEffect(() => {
    if (state !== 'recording' && state !== 'cancel_hover') return;
    setDurationMs(Math.min(recorderState.durationMillis, MAX_VOICE_DURATION_MS));

    if (recorderState.metering !== undefined) {
      const sample = recorderState.metering as number;
      totalSamplesRef.current += 1;
      if (sample > VOICE_THRESHOLD_DB) {
        voiceSamplesRef.current += 1;
      }
      setMeteringDb((prev) => {
        const next = [...prev, sample];
        return next.length > METERING_RING_SIZE ? next.slice(-METERING_RING_SIZE) : next;
      });
    }
  }, [recorderState.durationMillis, recorderState.metering, state]);

  // Hard cap auto-stop: always lands in preview so the user can decide.
  useEffect(() => {
    if (
      (state === 'recording' || state === 'cancel_hover') &&
      recorderState.durationMillis >= MAX_VOICE_DURATION_MS &&
      !hardCapFiredRef.current
    ) {
      hardCapFiredRef.current = true;
      void performStopAndPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.durationMillis, state]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      try {
        if (recorder.isRecording) {
          recorder.stop().catch(() => null);
        }
      } catch {
        // Native recorder already released.
      }
      configureAudioSessionForPlayback().catch(() => null);
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
      srcFile.move(destFile);

      const rawDuration = recorderState.durationMillis || durationMs;
      const finalDuration = Math.min(rawDuration, MAX_VOICE_DURATION_MS);

      const voiceRatio =
        totalSamplesRef.current > 0
          ? voiceSamplesRef.current / totalSamplesRef.current
          : 0;
      setIsLikelySilent(voiceRatio < VOICE_SAMPLE_MIN_RATIO);

      return { uri: destFile.uri, durationMs: finalDuration };
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'stop_failed');
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

      await configureAudioSessionForRecording();
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

  const setCancelHover = useCallback((active: boolean) => {
    setState((prev) => {
      if (active && prev === 'recording') return 'cancel_hover';
      if (!active && prev === 'cancel_hover') return 'recording';
      return prev;
    });
  }, []);

  const stopAndSend = useCallback(async (): Promise<ChatVoiceRecorderResult | null> => {
    if (stateRef.current !== 'recording' && stateRef.current !== 'cancel_hover') return null;
    const res = await finalizeRecording();
    if (!res) return null;

    if (res.durationMs < MIN_VOICE_MESSAGE_DURATION_MS) {
      try {
        new File(res.uri).delete();
      } catch { /* non-fatal */ }
      setState('idle');
      setError('too_short');
      await configureAudioSessionForPlayback();
      return null;
    }

    setResult(res);
    setState('idle');
    await configureAudioSessionForPlayback();
    return res;
  }, [finalizeRecording]);

  const performStopAndPreview = useCallback(async (): Promise<void> => {
    const res = await finalizeRecording();
    if (!res) return;

    if (res.durationMs < MIN_VOICE_MESSAGE_DURATION_MS) {
      try {
        new File(res.uri).delete();
      } catch { /* non-fatal */ }
      setState('idle');
      setError('too_short');
      await configureAudioSessionForPlayback();
      return;
    }

    setResult(res);
    setState('preview');
    await configureAudioSessionForPlayback();
  }, [finalizeRecording]);

  const stopAndPreview = useCallback(async (): Promise<void> => {
    if (stateRef.current !== 'recording' && stateRef.current !== 'cancel_hover') return;
    await performStopAndPreview();
  }, [performStopAndPreview]);

  const reset = useCallback(async () => {
    try {
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
      await configureAudioSessionForPlayback();
    }
  }, [recorder, result]);

  const rerecord = useCallback(async () => {
    await reset();
    await start();
  }, [reset, start]);

  return {
    state,
    durationMs,
    meteringDb,
    result,
    error,
    isLikelySilent,
    start,
    setCancelHover,
    stopAndSend,
    stopAndPreview,
    reset,
    rerecord,
  };
}
