/* Fetches the latest message per conversation for the inbox list preview.

   A single global ORDER BY created_at + LIMIT cannot return one row per
   conversation: active threads consume the limit and quieter ones vanish from
   the inbox until a new message bumps them back into the window. */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

export interface InboxLastMessageRow {
  conversation_id: string;
  kind: string;
  body_text: string | null;
  voice_duration_ms: number | null;
  sender_id: string;
}

/** First row per conversation_id when rows are sorted newest-first globally. */
export function buildLastMessageMap(
  rows: InboxLastMessageRow[],
): Map<string, InboxLastMessageRow> {
  const map = new Map<string, InboxLastMessageRow>();
  for (const msg of rows) {
    if (!map.has(msg.conversation_id)) {
      map.set(msg.conversation_id, msg);
    }
  }
  return map;
}

/** One network round-trip per conversation so every inbox row gets its preview. */
export async function fetchLastMessagePerConversation(
  supabase: SupabaseClient<Database>,
  conversationIds: string[],
): Promise<Map<string, InboxLastMessageRow>> {
  if (conversationIds.length === 0) return new Map();

  const pairs = await Promise.all(
    conversationIds.map(async (conversationId) => {
      const { data, error } = await supabase
        .from('messages')
        .select('conversation_id, kind, body_text, voice_duration_ms, sender_id')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw new Error(error.message);

      const row = (data ?? [])[0] as InboxLastMessageRow | undefined;
      return row ?? null;
    }),
  );

  const map = new Map<string, InboxLastMessageRow>();
  for (const row of pairs) {
    if (row) map.set(row.conversation_id, row);
  }
  return map;
}
