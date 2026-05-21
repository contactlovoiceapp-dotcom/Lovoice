/* Types for the Likes feature: liked-id set, received-likes row, given-likes row. */

import type { Database } from '@/types/database';

export type LikeRow = Database['public']['Tables']['likes']['Row'];

export interface LikedProfileSummary {
  id: string;
  displayName: string;
  birthdate: string;
  city: string;
  bioEmojis: string[];
}

export interface ReceivedLike {
  likeId: string;
  voiceId: string;
  createdAt: string;
  liker: LikedProfileSummary;
}

export interface GivenLike {
  likeId: string;
  voiceId: string;
  createdAt: string;
  author: LikedProfileSummary;
}
