// Single-instance voice preview player for profile and feed-reply contexts.
// Exposes module-scoped pauseProfileVoicePlayer() so VoiceRecordingSession can
// silence playback before recording without importing the full hook.

import { useCallback, useEffect, useRef } from 'react';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioPlayer,
  type AudioSource,
} from 'expo-audio';

// Module-scoped ref to the active profile voice player. Allows
// VoiceRecordingSession to pause this player before recording.
let activeProfilePlayer: AudioPlayer | null = null;

/** Pause the profile voice preview player if it is alive. Called before recording. */
export function pauseProfileVoicePlayer(): void {
  if (!activeProfilePlayer) return;
  try {
    activeProfilePlayer.pause();
  } catch {
    // Native player recycled — safe to ignore.
  }
}

export interface VoicePlayerHook {
  isPlaying: boolean;
  /** Total duration in milliseconds, 0 while not loaded. */
  durationMs: number;
  /** Current playback position in milliseconds. */
  positionMs: number;
  play: () => Promise<void>;
  pause: () => void;
  /** Pause + seek to 0 so the next play() restarts from the beginning. */
  stop: () => void;
  /** Pause and clear the source so the player releases its audio focus. */
  unload: () => void;
}

// After replace() or a fresh source swap, ExoPlayer on Android needs a moment
// before play() actually starts — calling play() too early is a silent no-op.
const PLAYER_READY_TIMEOUT_MS = 2_000;
const PLAYER_READY_POLL_MS = 50;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlayerLoaded(player: AudioPlayer): boolean {
  try {
    return player.isLoaded === true;
  } catch {
    return false;
  }
}

async function waitForPlayerReady(player: AudioPlayer): Promise<boolean> {
  const deadline = Date.now() + PLAYER_READY_TIMEOUT_MS;
  while (!isPlayerLoaded(player) && Date.now() < deadline) {
    await delay(PLAYER_READY_POLL_MS);
  }
  return isPlayerLoaded(player);
}

function devLog(label: string, payload?: Record<string, unknown>): void {
  if (!__DEV__) return;
  if (payload) {
    console.warn(`[voicePlayer] ${label}`, payload);
  } else {
    console.warn(`[voicePlayer] ${label}`);
  }
}

function safeReplace(player: AudioPlayer, uri: string): void {
  try {
    devLog('replace', { uri });
    player.replace(uri);
  } catch (err) {
    devLog('replace_threw', { uri, err: String(err) });
  }
}

export function useVoicePlayer({ uri }: { uri: string | null }): VoicePlayerHook {
  // When stop() is called (tab switch), the next play() must seekTo(0) first.
  const needsRestartRef = useRef(false);

  const source: AudioSource = uri ?? null;
  const player = useAudioPlayer(source, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  // Keep the native source in sync whenever the URI changes. Consumers that
  // mount this hook with a file URI already set (e.g. profile preview after
  // stop) rely on the constructor; consumers that swap null→uri rely on this
  // effect. Android ExoPlayer can silently ignore play() until replace() lands.
  useEffect(() => {
    if (!uri) return;
    safeReplace(player, uri);
  }, [uri, player]);

  useEffect(() => {
    activeProfilePlayer = player;
    return () => {
      if (activeProfilePlayer === player) activeProfilePlayer = null;
      try {
        player.pause();
      } catch {
        // Native object already released by expo-audio — nothing to do.
      }
    };
  }, [player]);

  const play = useCallback(async () => {
    devLog('play_requested', {
      uri,
      isLoaded: isPlayerLoaded(player),
      playing: status.playing,
      duration: status.duration,
    });

    if (!uri) {
      devLog('play_aborted_no_uri');
      return;
    }

    const shouldRestart =
      needsRestartRef.current ||
      status.didJustFinish ||
      (status.duration > 0 && status.currentTime >= status.duration - 0.1);

    if (shouldRestart) {
      try {
        player.seekTo(0);
      } catch (err) {
        devLog('seekTo_threw', { err: String(err) });
      }
      needsRestartRef.current = false;
    }

    let ready = await waitForPlayerReady(player);
    if (!ready) {
      devLog('play_retry_replace', { uri });
      safeReplace(player, uri);
      ready = await waitForPlayerReady(player);
    }

    devLog('play_firing', { uri, isLoaded: ready });

    try {
      player.play();
    } catch (err) {
      devLog('play_threw', { err: String(err) });
      throw err;
    }
  }, [player, uri, status.didJustFinish, status.duration, status.currentTime, status.playing]);

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
    needsRestartRef.current = true;
  }, [player]);

  const unload = useCallback(() => {
    try {
      player.pause();
    } catch {
      // Native player already gone — nothing to do.
    }
  }, [player]);

  return {
    isPlaying: status.playing,
    durationMs: Math.round(status.duration * 1000),
    positionMs: Math.round(status.currentTime * 1000),
    play,
    pause,
    stop,
    unload,
  };
}
