/* Batches feed_seen inserts: flushes at 5 candidates, every 30s, or on unmount/blur. */

import { useCallback, useEffect, useRef } from 'react';

import { useMarkFeedSeen } from '../api/feedMutations';

const BATCH_THRESHOLD = 5;
const FLUSH_INTERVAL_MS = 30_000;

export interface FeedSeenBatcher {
  /** Add a voiceId to the next batch. Idempotent within the current pending set. */
  enqueue: (voiceId: string) => void;
  /** Force a flush now (e.g. on screen blur / unmount). */
  flush: () => void;
}

export function useFeedSeenBatcher(): FeedSeenBatcher {
  // Buffer kept in a ref so re-renders don't lose it; flush() drains the ref into a mutation call.
  const pendingRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const markSeen = useMarkFeedSeen();
  // Stable ref to mutate so flush() never captures a stale closure after a state change.
  const mutatRef = useRef(markSeen.mutate);
  useEffect(() => {
    mutatRef.current = markSeen.mutate;
  });

  const flush = useCallback(() => {
    if (pendingRef.current.size === 0) return;
    const ids = Array.from(pendingRef.current);
    pendingRef.current.clear();
    // Fire-and-forget. A failed flush is non-critical — the next 30s window retries surviving ids.
    mutatRef.current({ voiceIds: ids });
  }, []); // stable: reads only refs

  const enqueue = useCallback(
    (voiceId: string) => {
      if (pendingRef.current.has(voiceId)) return;
      pendingRef.current.add(voiceId);
      if (pendingRef.current.size >= BATCH_THRESHOLD) {
        flush();
      }
    },
    [flush],
  );

  // 30s periodic flush; cleanup runs on unmount to drain any remaining candidates.
  useEffect(() => {
    timerRef.current = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // Final flush so pending rows aren't lost when the screen unmounts.
      flush();
    };
  }, [flush]);

  return { enqueue, flush };
}
