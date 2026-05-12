/* Type definitions for the voices feature: voice rows, upload payloads, and signed URL helpers. */

import type { Database } from '@/types/database';

export type VoiceRow = Database['public']['Tables']['voices']['Row'];
export type VoiceInsert = Database['public']['Tables']['voices']['Insert'];
export type VoiceUpdate = Database['public']['Tables']['voices']['Update'];

export type VoiceStatus = 'pending' | 'approved' | 'rejected' | 'manual_review';

export interface RequestUploadInput {
  kind: 'voice' | 'message';
  durationMs: number;
  conversationId?: string;
}

export interface RequestUploadResult {
  objectPath: string;
  signedUrl: string;
  token: string;
}

export interface CommitVoiceUploadInput {
  objectPath: string;
  durationMs: number;
  promptId?: string | null;
  title?: string | null;
  theme?: string | null;
}

export interface CommitVoiceUploadResult {
  voice: VoiceRow;
}
