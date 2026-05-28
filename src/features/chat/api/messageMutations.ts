/* Mutations for sending messages, starting conversations, and marking messages as read. */

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type InfiniteData,
} from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import { Sentry } from '@/lib/sentry';
import type { RequestUploadResult } from '@/features/voices/types';
import {
  extractFunctionErrorCode,
  putAudioWithRetry,
  safeDelete,
} from '@/features/voices/api/uploadHelpers';
import type {
  ChatMessage,
  ConversationRow,
  MessageKind,
  MessageRow,
  SendTextMessageInput,
  SendVoiceMessageInput,
} from '../types';
import { mapMessageError } from '../types';
import { chatQueryKeys } from './conversationQueries';
import { rowToMessage } from './messageQueries';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Classifies a thrown Error into a COPY key for failureReason.
// DB trigger errors surface as 'messages.<code>' in error.message.
function classifyError(err: Error): string {
  const msg = err.message ?? '';
  if (msg.startsWith('messages.')) {
    return mapMessageError(msg);
  }
  if (/fetch|network|timeout/i.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

function makeSyntheticId(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Optimistic cache helpers
// ---------------------------------------------------------------------------

function prependMessage(
  old: InfiniteData<ChatMessage[]> | undefined,
  msg: ChatMessage,
): InfiniteData<ChatMessage[]> {
  if (!old) {
    return { pages: [[msg]], pageParams: [null] };
  }
  return {
    ...old,
    pages: [[msg, ...(old.pages[0] ?? [])], ...old.pages.slice(1)],
  };
}

function replaceMessage(
  old: InfiniteData<ChatMessage[]> | undefined,
  clientId: string,
  serverRow: MessageRow,
): InfiniteData<ChatMessage[]> | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) =>
      page.map((m) =>
        // Preserve the optimistic clientId so the FlatList key stays stable
        // across the optimistic→confirmed transition. Without this the bubble
        // would unmount and remount, recreating its native AVAudioPlayer just
        // after every voice message is sent (cf. crash 2026-05-27).
        m.clientId === clientId ? { ...rowToMessage(serverRow), clientId } : m,
      ),
    ),
  };
}

function markMessageFailed(
  old: InfiniteData<ChatMessage[]> | undefined,
  clientId: string,
  failureReason: string,
): InfiniteData<ChatMessage[]> | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) =>
      page.map((m) =>
        m.clientId === clientId ? { ...m, status: 'failed' as const, failureReason } : m,
      ),
    ),
  };
}

// ---------------------------------------------------------------------------
// Optimistic context types
// ---------------------------------------------------------------------------

interface SendMessageOptimisticContext {
  conversationId: string;
  clientId: string;
  previousMessages: InfiniteData<ChatMessage[]> | undefined;
}

// ---------------------------------------------------------------------------
// useStartConversation
// ---------------------------------------------------------------------------

export function useStartConversation(): UseMutationResult<
  ConversationRow,
  Error,
  { otherUserId: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ otherUserId }): Promise<ConversationRow> => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('chat.supabase_unavailable');

      const { data, error } = await supabase.rpc('start_conversation', {
        p_other_user_id: otherUserId,
      });

      if (error) throw new Error(error.message);

      // start_conversation returns SETOF conversations; the JS client returns an array.
      // Cast through the array shape once since the RPC type says `Row[]`.
      const rows = data as ConversationRow[] | null;
      const row = rows?.[0];
      if (!row) throw new Error('messages.conversation_not_found');

      return row;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.inbox });
    },
  });
}

// ---------------------------------------------------------------------------
// useSendTextMessage
// ---------------------------------------------------------------------------

export function useSendTextMessage(): UseMutationResult<
  MessageRow,
  Error,
  SendTextMessageInput,
  SendMessageOptimisticContext
> {
  const queryClient = useQueryClient();

  return useMutation<MessageRow, Error, SendTextMessageInput, SendMessageOptimisticContext>({
    mutationFn: async (input): Promise<MessageRow> => {
      const trimmed = input.bodyText.trim();
      if (!trimmed) throw new Error('messages.empty_body');

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('chat.supabase_unavailable');

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('chat.session_missing');

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: input.conversationId,
          sender_id: uid,
          kind: 'text',
          body_text: trimmed,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as MessageRow;
    },

    onMutate: async (input) => {
      const supabase = getSupabaseClient();
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const uid = session?.user?.id ?? 'unknown';

      const qKey = chatQueryKeys.messages(input.conversationId);
      await queryClient.cancelQueries({ queryKey: qKey });

      const previousMessages = queryClient.getQueryData<InfiniteData<ChatMessage[]>>(qKey);
      const clientId = makeSyntheticId();

      const optimistic: ChatMessage = {
        id: clientId,
        clientId,
        conversationId: input.conversationId,
        senderId: uid,
        kind: 'text' as MessageKind,
        bodyText: input.bodyText.trim(),
        voicePath: null,
        voiceDurationMs: null,
        status: 'sending',
        failureReason: null,
        createdAt: new Date().toISOString(),
        readAt: null,
      };

      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        qKey,
        (old) => prependMessage(old, optimistic),
      );

      return { conversationId: input.conversationId, clientId, previousMessages };
    },

    onSuccess: (serverRow, _vars, context) => {
      if (!context) return;
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        chatQueryKeys.messages(context.conversationId),
        (old) => replaceMessage(old, context.clientId, serverRow),
      );
    },

    onError: (err, _vars, context) => {
      if (!context) return;
      const reason = classifyError(err instanceof Error ? err : new Error(String(err)));
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        chatQueryKeys.messages(context.conversationId),
        (old) => markMessageFailed(old, context.clientId, reason),
      );
    },

    onSettled: async (_data, _err, vars) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.inbox }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.feedConversations }),
        // Refresh conversation details so lifecycle state reflects DB-side changes
        // (e.g. first_reply_at being set by the trigger when the recipient replies).
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(vars.conversationId) }),
      ]);
    },
  });
}

// ---------------------------------------------------------------------------
// useSendVoiceMessage
// ---------------------------------------------------------------------------

// Shape returned by commit_upload when kind='message'.
interface CommitMessageUploadResult {
  message: MessageRow;
}

export function useSendVoiceMessage(): UseMutationResult<
  MessageRow,
  Error,
  SendVoiceMessageInput,
  SendMessageOptimisticContext
> {
  const queryClient = useQueryClient();

  return useMutation<MessageRow, Error, SendVoiceMessageInput, SendMessageOptimisticContext>({
    mutationFn: async (input): Promise<MessageRow> => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('chat.supabase_unavailable');

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('chat.session_missing');

      const { data: requestData, error: requestError } =
        await supabase.functions.invoke<RequestUploadResult>('request_upload', {
          body: {
            kind: 'message',
            durationMs: input.durationMs,
            conversationId: input.conversationId,
          },
        });

      if (requestError || !requestData) {
        const code = await extractFunctionErrorCode(requestError);
        Sentry.addBreadcrumb({ category: 'upload', message: 'upload.failed', level: 'warning', data: { stage: 'request', code } });
        throw new Error(`chat.request_upload_failed:${code}`);
      }

      Sentry.addBreadcrumb({ category: 'upload', message: 'upload.request_signed_ok', level: 'info', data: { objectPath: requestData.objectPath } });

      await putAudioWithRetry(input.uri, requestData.signedUrl);

      Sentry.addBreadcrumb({ category: 'upload', message: 'upload.put_ok', level: 'info' });

      const { data: commitData, error: commitError } =
        await supabase.functions.invoke<CommitMessageUploadResult>('commit_upload', {
          body: {
            kind: 'message',
            objectPath: requestData.objectPath,
            durationMs: input.durationMs,
            conversationId: input.conversationId,
          },
        });

      if (commitError || !commitData?.message) {
        const code = await extractFunctionErrorCode(commitError);
        Sentry.addBreadcrumb({ category: 'upload', message: 'upload.failed', level: 'warning', data: { stage: 'commit', code } });
        throw new Error(`chat.commit_upload_failed:${code}`);
      }

      Sentry.addBreadcrumb({ category: 'upload', message: 'upload.commit_ok', level: 'info', data: { messageId: commitData.message.id } });

      safeDelete(input.uri);

      return commitData.message;
    },

    onMutate: async (input) => {
      const supabase = getSupabaseClient();
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const uid = session?.user?.id ?? 'unknown';

      const qKey = chatQueryKeys.messages(input.conversationId);
      await queryClient.cancelQueries({ queryKey: qKey });

      const previousMessages = queryClient.getQueryData<InfiniteData<ChatMessage[]>>(qKey);
      const clientId = makeSyntheticId();

      // Point voicePath at the local file so the player can render immediately.
      // Once confirmed, the server row replaces this and the player resolves the signed URL.
      const optimistic: ChatMessage = {
        id: clientId,
        clientId,
        conversationId: input.conversationId,
        senderId: uid,
        kind: 'voice' as MessageKind,
        bodyText: null,
        voicePath: input.uri,
        voiceDurationMs: input.durationMs,
        status: 'sending',
        failureReason: null,
        createdAt: new Date().toISOString(),
        readAt: null,
      };

      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        qKey,
        (old) => prependMessage(old, optimistic),
      );

      return { conversationId: input.conversationId, clientId, previousMessages };
    },

    onSuccess: (serverRow, _vars, context) => {
      if (!context) return;
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        chatQueryKeys.messages(context.conversationId),
        (old) => replaceMessage(old, context.clientId, serverRow),
      );
    },

    onError: (err, _vars, context) => {
      if (!context) return;
      const reason = classifyError(err instanceof Error ? err : new Error(String(err)));
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        chatQueryKeys.messages(context.conversationId),
        (old) => markMessageFailed(old, context.clientId, reason),
      );
    },

    onSettled: async (_data, _err, vars) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.inbox }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.feedConversations }),
        // Same as text: refresh lifecycle after sending (trigger may update first_reply_at).
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(vars.conversationId) }),
      ]);
    },
  });
}

// ---------------------------------------------------------------------------
// useMarkMessagesRead
// ---------------------------------------------------------------------------

export function useMarkMessagesRead(): UseMutationResult<
  number,
  Error,
  { conversationId: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId }): Promise<number> => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('chat.supabase_unavailable');

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('chat.session_missing');

      const { data, error } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .neq('sender_id', uid)
        .is('read_at', null)
        .select('id');

      if (error) throw new Error(error.message);

      return (data ?? []).length;
    },

    onSuccess: async (_count, { conversationId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.inbox }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(conversationId) }),
      ]);
    },
  });
}
