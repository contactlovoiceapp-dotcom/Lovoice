// Tap-to-record voice recorder for in-conversation voice messages (WhatsApp-style).

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

  const recorder = useAudioRecorder(VOICE_AUDIO_FORMAT);
  const recorderState = useAudioRecorderState(recorder, METERING_INTERVAL_MS);

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

      await configureAudioSessionForPlayback();
      return { uri: destFile.uri, durationMs: finalDuration };
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'stop_failed');
      await configureAudioSessionForPlayback();
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
    await configureAudioSessionForPlayback();
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
