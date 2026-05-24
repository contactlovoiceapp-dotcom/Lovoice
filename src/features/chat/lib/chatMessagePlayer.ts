// Single-instance audio player for chat voice message bubbles. Only one bubble plays at a time.

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

  // Register/unregister with the module-scoped singleton.
  const releaseOwnership = useCallback(() => {
    try {
      player.pause();
    } catch { /* native recycled */ }
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

  const play = useCallback(async () => {
    if (!source) return;

    // Claim ownership, kicking out any other playing bubble.
    if (activeMessageId && activeMessageId !== messageId && activeReleaseCallback) {
      activeReleaseCallback();
    }
    activeMessageId = messageId;
    activeReleaseCallback = releaseOwnership;
    setIsActive(true);

    if (!sessionConfiguredRef.current) {
      await configureAudioSessionForPlayback();
      sessionConfiguredRef.current = true;
    }

    const token = ++loadTokenRef.current;
    setIsLoading(true);
    setError(null);

    try {
      let url: string;
      if (isLocalFile) {
        url = source;
      } else {
        url = await ensureSignedUrl(source);
      }

      if (loadTokenRef.current !== token) return;

      try {
        player.replace(url);
      } catch {
        // Native player mid-recycle.
      }

      // Seek to 0 if the track previously ended.
      const atEnd =
        status.didJustFinish ||
        (status.duration > 0 && status.currentTime >= status.duration - 0.1);
      if (atEnd) {
        try {
          player.seekTo(0);
        } catch { /* native recycled */ }
      }

      try {
        player.play();
      } catch { /* native recycled */ }

      setIsLoading(false);
    } catch (err) {
      if (loadTokenRef.current !== token) return;
      setError(err instanceof Error ? err.message : 'play_failed');
      setIsLoading(false);
    }
  }, [source, isLocalFile, messageId, player, releaseOwnership, status.didJustFinish, status.duration, status.currentTime]);

  const pause = useCallback(() => {
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
