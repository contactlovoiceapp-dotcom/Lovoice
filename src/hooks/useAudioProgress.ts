/* Encapsulates the simulated audio playback timer: elapsed tracking, finish detection, and auto-stop timeout. */

import { useCallback, useEffect, useRef, useState } from 'react';

interface AudioProgressResult {
  elapsed: number;
  progress: number;
  hasFinished: boolean;
  reset: () => void;
}

export function useAudioProgress(
  isPlaying: boolean,
  durationSec: number,
  onFinish?: () => void,
): AudioProgressResult {
  const [elapsed, setElapsed] = useState(0);
  const [hasFinished, setHasFinished] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isPlaying) {
      interval = setInterval(() => {
        setElapsed((prev) => Math.min(prev + 0.1, durationSec));
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, durationSec]);

  useEffect(() => {
    if (!isPlaying && elapsed > 0 && elapsed >= durationSec - 0.5) {
      setHasFinished(true);
    }
  }, [isPlaying, elapsed, durationSec]);

  useEffect(() => {
    if (isPlaying) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onFinish?.();
      }, durationSec * 1000);
    } else if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isPlaying, durationSec, onFinish]);

  const reset = useCallback(() => {
    setElapsed(0);
    setHasFinished(false);
  }, []);

  const progress = durationSec > 0 ? (elapsed / durationSec) * 100 : 0;

  return { elapsed, progress, hasFinished, reset };
}
