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
  /** Pause + seek to 0 so the next play() restarts from the beginning. */
  stop: () => void;
  /** Pause and clear the source so the player releases its audio focus. */
  unload: () => void;
}

export function useVoicePlayer({ uri }: { uri: string | null }): VoicePlayerHook {
  const sessionConfiguredRef = useRef(false);
  const isFirstRenderRef = useRef(true);
  // When stop() is called (tab switch), the next play() must seekTo(0) first.
  const needsRestartRef = useRef(false);

  const source: AudioSource = uri ?? null;
  // updateInterval at 100ms gives smooth progress bars without excessive JS bridge traffic.
  const player = useAudioPlayer(source, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  // When the URI changes after the initial mount, pause the current track and swap the source.
  // pause() and replace() can throw NativeSharedObjectNotFoundException when expo-audio is in
  // the middle of recycling the player for a source change — both are recoverable.
  // We only call replace() with a non-null URI: expo-audio 0.5 rejects `null` (ArgumentCastException),
  // so when the consumer hands us null we simply pause and let the next non-null replace happen later.
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    try {
      player.pause();
      if (uri) {
        player.replace(uri);
      }
    } catch {
      // Player wrapper outlived its native counterpart; expo-audio handles the source swap.
    }
    sessionConfiguredRef.current = false;
  }, [uri]); // player reference is stable for the hook's lifetime

  // Handle system interruptions (e.g. incoming phone call): expo-audio's session will pause
  // automatically; we track it via `status.playing` so the UI stays in sync.
  // If the system resumes after the interruption ends, `status.playing` will flip back to true.
  // No manual resume is needed here — OS handles it when interruptionMode is 'mixWithOthers'.

  // Release audio resources when the component unmounts.
  // We swallow errors because expo-audio recreates the native player whenever the source
  // changes; calling pause() on a wrapper whose native counterpart has already been released
  // throws NativeSharedObjectNotFoundException, which is harmless in cleanup.
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // Native object already released by expo-audio — nothing to do.
      }
    };
    // The player ref is intentionally omitted: this effect must run cleanup only on unmount,
    // not whenever expo-audio recycles the underlying player on source change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = useCallback(async () => {
    if (!sessionConfiguredRef.current) {
      await configureAudioSessionForPlayback();
      sessionConfiguredRef.current = true;
    }
    // After stop() or when the track ended, seek back to 0 before playing.
    const shouldRestart =
      needsRestartRef.current ||
      status.didJustFinish ||
      (status.duration > 0 && status.currentTime >= status.duration - 0.1);

    if (shouldRestart) {
      try {
        player.seekTo(0);
      } catch {
        // Native player recycled — the subsequent play() will handle it.
      }
      needsRestartRef.current = false;
    }
    player.play();
  }, [player, status.didJustFinish, status.duration, status.currentTime]);

  const pause = useCallback(() => {
    try {
      player.pause();
    } catch {
      // Native player already released by expo-audio — nothing to do.
    }
  }, [player]);

  const stop = useCallback(() => {
    try {
      player.pause();
    } catch {
      // Native player already released by expo-audio — nothing to do.
    }
    // Don't seekTo here — defer to the next play() call where the player is
    // guaranteed to be in a stable loaded state.
    needsRestartRef.current = true;
  }, [player]);

  const unload = useCallback(() => {
    // expo-audio 0.5 doesn't accept null in replace(), so we just pause to release the audio
    // session. The next replace() with a real URI will reuse the same native player.
    try {
      player.pause();
    } catch {
      // Native player already gone — nothing to do.
    }
    sessionConfiguredRef.current = false;
  }, [player]);

  return {
    // AudioStatus.currentTime and .duration are in seconds; convert to ms for consumers.
    isPlaying: status.playing,
    durationMs: Math.round(status.duration * 1000),
    positionMs: Math.round(status.currentTime * 1000),
    play,
    pause,
    stop,
    unload,
  };
}
