/* Types for the Discover feed: server-returned items, filters slice, and pagination cursor. */

import type { Database } from '@/types/database';

export type FeedItemRow = Database['public']['Functions']['get_feed']['Returns'][number];

/** Theme literal as stored on `voices.theme`; null tolerated by the server. */
export type FeedItemTheme = 'sunset' | 'chill' | 'electric' | 'midnight';

/** Strongly-typed feed item: mirrors FeedItemRow but narrows `theme` to known values. */
export interface FeedItem {
  voiceId: string;
  storagePath: string;
  durationMs: number;
  theme: FeedItemTheme;
  title: string | null;
  promptBody: string | null;
  createdAt: string;
  userId: string;
  displayName: string;
  birthdate: string;
  city: string;
  bioEmojis: string[];
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}
