// Single-instance voice preview player: wraps expo-audio's useAudioPlayer with session management and interruption awareness.

import { useCallback, useEffect, useRef } from 'react';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import type { AudioSource } from 'expo-audio';

import { configureAudioSessionForPlayback } from '@/lib/audio';

export interface VoicePlayerHook {
  isPlaying: boolean;
  /** Total duration in milliseconds, 0 while not loaded. */
  durationMs: number;
  /** Current playback position in milliseconds. */
  positionMs: number;
  play: () => void;
  pause: () => void;
  /** Seek to an absolute position. */
  seek: (ms: number) => void;
  /** Pause and clear the source so the player releases its audio focus. */
  unload: () => void;
}

export function useVoicePlayer({ uri }: { uri: string | null }): VoicePlayerHook {
  // sessionConfiguredRef prevents redundant setAudioModeAsync calls on every play().
  const sessionConfiguredRef = useRef(false);
  // Skip the URI effect on the very first render: the player is already initialised with
  // the source by useAudioPlayer(source) and there is nothing to pause yet.
  const isFirstRenderRef = useRef(true);

  const source: AudioSource = uri ?? null;
  // updateInterval at 100ms gives smooth progress bars without excessive JS bridge traffic.
  const player = useAudioPlayer(source, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  // When the URI changes after the initial mount, pause the current track and swap the source.
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    player.pause();
    player.replace(uri ?? null);
    sessionConfiguredRef.current = false;
  }, [uri]); // player reference is stable for the hook's lifetime

  // Handle system interruptions (e.g. incoming phone call): expo-audio's session will pause
  // automatically; we track it via `status.playing` so the UI stays in sync.
  // If the system resumes after the interruption ends, `status.playing` will flip back to true.
  // No manual resume is needed here — OS handles it when interruptionMode is 'mixWithOthers'.

  // Release audio resources when the component unmounts.
  useEffect(() => {
    return () => {
      player.pause();
    };
  }, [player]);

  const play = useCallback(async () => {
    if (!sessionConfiguredRef.current) {
      await configureAudioSessionForPlayback();
      sessionConfiguredRef.current = true;
    }
    player.play();
  }, [player]);

  const pause = useCallback(() => {
    player.pause();
  }, [player]);

  const seek = useCallback(
    (ms: number) => {
      // seekTo takes seconds; convert from ms.
      player.seekTo(ms / 1000);
    },
    [player],
  );

  const unload = useCallback(() => {
    player.pause();
    // Replacing with null clears the source and releases audio focus.
    player.replace(null);
    sessionConfiguredRef.current = false;
  }, [player]);

  return {
    // AudioStatus.currentTime and .duration are in seconds; convert to ms for consumers.
    isPlaying: status.playing,
    durationMs: Math.round(status.duration * 1000),
    positionMs: Math.round(status.currentTime * 1000),
    play,
    pause,
    seek,
    unload,
  };
}
