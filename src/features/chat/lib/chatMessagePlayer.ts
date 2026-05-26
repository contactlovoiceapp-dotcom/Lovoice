// Single-instance audio player for chat voice message bubbles. Only one bubble plays at a time.
// Uses an event-driven approach: waits for the native player to confirm source loading
// before issuing play(), preventing silent failures and premature didJustFinish.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { configureAudioSessionForPlayback } from '@/lib/audio';
import { getSupabaseClient } from '@/lib/supabase';

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_BUFFER_MS = 10 * 60 * 1000;
const SIGNED_URL_LIFETIME_MS = SIGNED_URL_TTL_SECONDS * 1000 - SIGNED_URL_REFRESH_BUFFER_MS;

interface SignedUrlEntry {
  url: string;
  fetchedAt: number;
}

const signedUrlCache = new Map<string, SignedUrlEntry>();

async function ensureSignedUrl(path: string): Promise<string> {
  const now = Date.now();
  const cached = signedUrlCache.get(path);
  if (cached && now - cached.fetchedAt < SIGNED_URL_LIFETIME_MS) {
    return cached.url;
  }

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('chat_player.supabase_unavailable');

  const { data, error } = await supabase.storage
    .from('messages')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error('chat_player.signed_url_failed');
  }

  signedUrlCache.set(path, { url: data.signedUrl, fetchedAt: now });
  return data.signedUrl;
}

// Module-scoped: tracks which messageId is currently "owning" the shared player.
let activeMessageId: string | null = null;
let activeReleaseCallback: (() => void) | null = null;

/** Pauses whatever message bubble is currently playing. Called before recording starts. */
export function pauseAllChatMessages(): void {
  if (activeReleaseCallback) {
    activeReleaseCallback();
  }
}

export interface ChatMessagePlayerSnapshot {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  isLoading: boolean;
  error: string | null;
}

export interface ChatMessagePlayerControls {
  play: () => void;
  pause: () => void;
}

// Deterministic bar heights derived from a seed string — stable across renders.
export function generateBarHeights(seedId: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < seedId.length; i++) {
    hash = ((hash << 5) - hash + seedId.charCodeAt(i)) | 0;
  }

  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    hash = ((hash << 13) ^ hash) | 0;
    hash = ((hash >> 7) ^ hash) | 0;
    hash = ((hash << 17) ^ hash) | 0;
    const normalised = (Math.abs(hash) % 1000) / 1000;
    bars.push(0.2 + normalised * 0.8);
  }
  return bars;
}

interface UseChatMessagePlayerArgs {
  messageId: string;
  /** Local file URI (optimistic / sending) or Supabase storage path (confirmed). */
  source: string | null;
  /** True when the message is still optimistic and source is a local file URI. */
  isLocalFile: boolean;
}

export function useChatMessagePlayer({
  messageId,
  source,
  isLocalFile,
}: UseChatMessagePlayerArgs): {
  snapshot: ChatMessagePlayerSnapshot;
  controls: ChatMessagePlayerControls;
} {
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const loadTokenRef = useRef(0);
  const sessionConfiguredRef = useRef(false);
  // Track whether we want to auto-play once the native player finishes loading.
  const pendingPlayRef = useRef(false);
  // Track the source we last fed to player.replace() to avoid redundant reloads.
  const loadedSourceRef = useRef<string | null>(null);

  // Register/unregister with the module-scoped singleton.
  const releaseOwnership = useCallback(() => {
    try {
      player.pause();
    } catch { /* native recycled */ }
    pendingPlayRef.current = false;
    setIsActive(false);
    if (activeMessageId === messageId) {
      activeMessageId = null;
      activeReleaseCallback = null;
    }
  }, [player, messageId]);

  useEffect(() => {
    return () => {
      releaseOwnership();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-play once the native player transitions from buffering to ready.
  // This handles the case where play() is called before the source is loaded.
  useEffect(() => {
    if (!pendingPlayRef.current || !isActive) return;
    // status.playing means the player already started on its own after replace+play.
    // duration > 0 means the source is loaded and ready.
    if (status.playing) {
      pendingPlayRef.current = false;
      setIsLoading(false);
      return;
    }
    if (status.duration > 0 && !status.playing && !status.didJustFinish) {
      pendingPlayRef.current = false;
      setIsLoading(false);
      try {
        player.seekTo(0);
        player.play();
      } catch { /* native recycled */ }
    }
  }, [isActive, status.playing, status.duration, status.didJustFinish, player]);

  // Reset play state when the track ends naturally.
  useEffect(() => {
    if (isActive && status.didJustFinish) {
      pendingPlayRef.current = false;
      setIsActive(false);
      if (activeMessageId === messageId) {
        activeMessageId = null;
        activeReleaseCallback = null;
      }
    }
  }, [isActive, status.didJustFinish, messageId]);

  const play = useCallback(async () => {
    if (!source) return;

    // Claim ownership, kicking out any other playing bubble.
    if (activeMessageId && activeMessageId !== messageId && activeReleaseCallback) {
      activeReleaseCallback();
    }
    activeMessageId = messageId;
    activeReleaseCallback = releaseOwnership;
    setIsActive(true);
    setError(null);

    if (!sessionConfiguredRef.current) {
      await configureAudioSessionForPlayback();
      sessionConfiguredRef.current = true;
    }

    const token = ++loadTokenRef.current;
    setIsLoading(true);

    try {
      let url: string;
      if (isLocalFile) {
        url = source;
      } else {
        url = await ensureSignedUrl(source);
      }

      if (loadTokenRef.current !== token) return;

      // Only call replace() if the source changed, to avoid resetting mid-playback.
      if (loadedSourceRef.current !== url) {
        try {
          player.replace(url);
          loadedSourceRef.current = url;
        } catch {
          setError('play_failed');
          setIsLoading(false);
          return;
        }
      }

      // Mark that we want to play once the player is ready.
      pendingPlayRef.current = true;

      // Attempt immediate play — works if the source loaded synchronously (local file)
      // or the native player already buffered enough. If the player is not ready yet,
      // the effect above will catch it once duration > 0.
      try {
        player.seekTo(0);
        player.play();
      } catch { /* native recycled */ }
    } catch (err) {
      if (loadTokenRef.current !== token) return;
      setError(err instanceof Error ? err.message : 'play_failed');
      setIsLoading(false);
    }
  }, [source, isLocalFile, messageId, player, releaseOwnership]);

  const pause = useCallback(() => {
    pendingPlayRef.current = false;
    try {
      player.pause();
    } catch { /* native recycled */ }
  }, [player]);

  const snapshot = useMemo<ChatMessagePlayerSnapshot>(() => {
    if (!isActive) {
      return { isPlaying: false, positionMs: 0, durationMs: 0, isLoading: false, error };
    }
    return {
      isPlaying: status.playing,
      positionMs: Math.round(status.currentTime * 1000),
      durationMs: Math.round(status.duration * 1000),
      isLoading,
      error,
    };
  }, [isActive, status.playing, status.currentTime, status.duration, isLoading, error]);

  const controls = useMemo<ChatMessagePlayerControls>(
    () => ({ play: () => void play(), pause }),
    [play, pause],
  );

  return { snapshot, controls };
}
