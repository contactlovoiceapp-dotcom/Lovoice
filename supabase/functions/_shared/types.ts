// Re-defines the voice upload request/response shapes for use within Edge Functions.
// These mirror src/features/voices/types.ts but are self-contained — no mobile imports.

export type VoiceTheme = 'sunset' | 'chill' | 'electric' | 'midnight';
export type VoiceStatus = 'pending' | 'approved' | 'rejected' | 'manual_review';
export type MessageKind = 'text' | 'voice';

export interface VoiceRow {
  id: string;
  user_id: string;
  prompt_id: string | null;
  storage_path: string;
  duration_ms: number;
  transcript: string | null;
  theme: string | null;
  title: string | null;
  status: VoiceStatus;
  moderation_reason: string | null;
  is_active: boolean;
  created_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: MessageKind;
  body_text: string | null;
  voice_path: string | null;
  voice_duration_ms: number | null;
  status: VoiceStatus;
  created_at: string;
  read_at: string | null;
}

// Matches RequestUploadInput in src/features/voices/types.ts
export interface RequestUploadInput {
  kind: 'voice' | 'message';
  durationMs: number;
  conversationId?: string;
}

// Matches RequestUploadResult in src/features/voices/types.ts
export interface RequestUploadResult {
  objectPath: string;
  signedUrl: string;
  token: string;
}

// Matches CommitVoiceUploadInput in src/features/voices/types.ts (plus the kind discriminant)
export interface CommitVoiceUploadInput {
  kind: 'voice';
  objectPath: string;
  durationMs: number;
  promptId?: string | null;
  title?: string | null;
  theme?: string | null;
}

export interface CommitMessageUploadInput {
  kind: 'message';
  objectPath: string;
  durationMs: number;
  conversationId: string;
  bodyText?: string | null;
}

export type CommitUploadInput = CommitVoiceUploadInput | CommitMessageUploadInput;

// Matches CommitVoiceUploadResult in src/features/voices/types.ts
export interface CommitVoiceUploadResult {
  voice: VoiceRow;
}

export interface CommitMessageUploadResult {
  message: MessageRow;
}
