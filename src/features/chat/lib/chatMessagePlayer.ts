// Single-instance audio player for chat voice message bubbles. Only one bubble plays at a time.
// Uses an event-driven approach: waits for the native player to confirm source loading
// before issuing play(), preventing silent failures and premature didJustFinish.
// Includes timeout detection and one auto-retry with cache-bust for broken/expired URLs.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { configureAudioSessionForPlayback } from '@/lib/audio';
import { getSupabaseClient } from '@/lib/supabase';

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_BUFFER_MS = 10 * 60 * 1000;
const SIGNED_URL_LIFETIME_MS = SIGNED_URL_TTL_SECONDS * 1000 - SIGNED_URL_REFRESH_BUFFER_MS;

// If the player doesn't start within this delay, consider the file unplayable.
const PLAY_TIMEOUT_MS = 8_000;
// If didJustFinish fires within this window after confirmed playback, it's likely a broken file.
const SUSPICIOUS_FINISH_MS = 400;

interface SignedUrlEntry {
  url: string;
  fetchedAt: number;
}

const signedUrlCache = new Map<string, SignedUrlEntry>();

function invalidateCachedUrl(path: string): void {
  signedUrlCache.delete(path);
}

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

function clearActiveOwner(messageId: string): void {
  if (activeMessageId === messageId) {
    activeMessageId = null;
    activeReleaseCallback = null;
  }
}

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
  const pendingPlayRef = useRef(false);
  const loadedSourceRef = useRef<string | null>(null);
  const playConfirmedAtRef = useRef<number>(0);
  const retriedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rising-edge detection: only react when didJustFinish transitions false→true.
  // Prevents stale didJustFinish=true from killing a new play attempt.
  const prevDidJustFinishRef = useRef(false);

  const clearPlayTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const releaseOwnership = useCallback(() => {
    try {
      player.pause();
    } catch { /* native recycled */ }
    pendingPlayRef.current = false;
    clearPlayTimeout();
    setIsActive(false);
    clearActiveOwner(messageId);
  }, [player, messageId, clearPlayTimeout]);

  useEffect(() => {
    return () => {
      releaseOwnership();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Core play logic — extracted so it can be called for initial play and for retry.
  const doPlay = useCallback(async (isRetry: boolean) => {
    if (!source) return;

    // Claim ownership, kicking out any other playing bubble.
    if (activeMessageId && activeMessageId !== messageId && activeReleaseCallback) {
      activeReleaseCallback();
    }
    activeMessageId = messageId;
    activeReleaseCallback = releaseOwnership;
    setIsActive(true);
    setError(null);

    // Reset rising-edge detector so we catch the next didJustFinish transition.
    prevDidJustFinishRef.current = true;

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
        if (isRetry) invalidateCachedUrl(source);
        url = await ensureSignedUrl(source);
      }

      if (loadTokenRef.current !== token) return;

      // Always replace on retry; otherwise only if the source changed.
      if (isRetry || loadedSourceRef.current !== url) {
        try {
          player.replace(url);
          loadedSourceRef.current = url;
        } catch {
          setError('play_failed');
          setIsLoading(false);
          return;
        }
      }

      pendingPlayRef.current = true;
      playConfirmedAtRef.current = 0;

      try {
        player.seekTo(0);
        player.play();
      } catch { /* native recycled */ }

      // Safety timeout: if the player doesn't confirm playback within PLAY_TIMEOUT_MS,
      // surface an error so the user is not left hanging.
      clearPlayTimeout();
      timeoutRef.current = setTimeout(() => {
        if (!pendingPlayRef.current) return;
        pendingPlayRef.current = false;
        setIsLoading(false);
        setError('play_timeout');
        setIsActive(false);
        clearActiveOwner(messageId);
      }, PLAY_TIMEOUT_MS);
    } catch (err) {
      if (loadTokenRef.current !== token) return;
      setError(err instanceof Error ? err.message : 'play_failed');
      setIsLoading(false);
    }
  }, [source, isLocalFile, messageId, player, releaseOwnership, clearPlayTimeout]);

  // Detect when playback actually starts (player confirms it's running).
  useEffect(() => {
    if (!pendingPlayRef.current || !isActive) return;
    if (status.playing) {
      pendingPlayRef.current = false;
      playConfirmedAtRef.current = Date.now();
      setIsLoading(false);
      clearPlayTimeout();
      // Reset edge detector now that playback is confirmed — next didJustFinish=true is real.
      prevDidJustFinishRef.current = false;
      return;
    }
    // Source loaded (duration known) but not yet playing — kick it.
    if (status.duration > 0 && !status.playing && !status.didJustFinish) {
      pendingPlayRef.current = false;
      playConfirmedAtRef.current = Date.now();
      setIsLoading(false);
      clearPlayTimeout();
      prevDidJustFinishRef.current = false;
      try {
        player.seekTo(0);
        player.play();
      } catch { /* native recycled */ }
    }
  }, [isActive, status.playing, status.duration, status.didJustFinish, player, clearPlayTimeout]);

  // Handle track end — only on rising edge (false→true) to avoid reacting to stale state.
  useEffect(() => {
    const wasFinished = prevDidJustFinishRef.current;
    prevDidJustFinishRef.current = status.didJustFinish;

    // Only act on rising edge: was false, now true.
    if (!status.didJustFinish || wasFinished) return;
    if (!isActive) return;

    clearPlayTimeout();

    // If playback was never confirmed (or confirmed very recently), the file is likely broken.
    const timeSinceConfirmed = playConfirmedAtRef.current > 0
      ? Date.now() - playConfirmedAtRef.current
      : 0;

    const isSuspicious = playConfirmedAtRef.current === 0 || timeSinceConfirmed < SUSPICIOUS_FINISH_MS;

    if (isSuspicious && !retriedRef.current) {
      retriedRef.current = true;
      void doPlay(true);
      return;
    }

    // Normal end of playback, or retry also failed with the same suspicious finish.
    pendingPlayRef.current = false;

    if (isSuspicious) {
      setError('play_failed');
    }

    setIsActive(false);
    clearActiveOwner(messageId);
  }, [isActive, status.didJustFinish, messageId, doPlay, clearPlayTimeout]);

  const play = useCallback(() => {
    retriedRef.current = false;
    void doPlay(false);
  }, [doPlay]);

  const pause = useCallback(() => {
    pendingPlayRef.current = false;
    clearPlayTimeout();
    try {
      player.pause();
    } catch { /* native recycled */ }
  }, [player, clearPlayTimeout]);

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
    () => ({ play, pause }),
    [play, pause],
  );

  return { snapshot, controls };
}
