/* Mutations for the likes feature: like a voice, unlike a voice. */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { toRateLimitAwareError } from '@/lib/rateLimitErrors';
import { getSupabaseClient } from '@/lib/supabase';
import { likeQueryKeys } from './likeQueries';

export interface LikeVoiceInput {
  voiceId: string;
  // ownerId is accepted for forward-compat with toasts/analytics; not used today.
  ownerId: string;
}

export interface UnlikeVoiceInput {
  voiceId: string;
}

interface LikeOptimisticContext {
  uid: string | null;
  previous: Set<string> | undefined;
}

export function useLikeVoice(): UseMutationResult<void, Error, LikeVoiceInput, LikeOptimisticContext> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, LikeVoiceInput, LikeOptimisticContext>({
    mutationFn: async ({ voiceId }) => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('likes.supabase_unavailable');
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.id) {
        throw new Error('likes.session_missing');
      }

      const uid = userData.user.id;

      const { error } = await supabase
        .from('likes')
        .upsert(
          { liker_id: uid, voice_id: voiceId },
          { onConflict: 'liker_id,voice_id', ignoreDuplicates: true },
        );

      if (error) {
        throw toRateLimitAwareError(error.message, 'like');
      }
    },

    onMutate: async ({ voiceId }) => {
      const supabase = getSupabaseClient();
      // getSession reads from local cache — safe to call synchronously in onMutate
      // since uid is only needed for the cache key, not for server authorization.
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const uid = session?.user?.id ?? null;

      const queryKey = likeQueryKeys.likedIds(uid);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Set<string>>(queryKey);

      const next = new Set(previous ?? []);
      next.add(voiceId);
      queryClient.setQueryData<Set<string>>(queryKey, next);

      return { uid, previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<Set<string>>(
          likeQueryKeys.likedIds(context.uid),
          context.previous,
        );
      }
    },

    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: likeQueryKeys.received }),
        queryClient.invalidateQueries({ queryKey: likeQueryKeys.given }),
      ]);
    },
  });
}

export function useUnlikeVoice(): UseMutationResult<void, Error, UnlikeVoiceInput, LikeOptimisticContext> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, UnlikeVoiceInput, LikeOptimisticContext>({
    mutationFn: async ({ voiceId }) => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('likes.supabase_unavailable');
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.id) {
        throw new Error('likes.session_missing');
      }

      const uid = userData.user.id;

      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('liker_id', uid)
        .eq('voice_id', voiceId);

      if (error) {
        throw new Error(error.message);
      }
    },

    onMutate: async ({ voiceId }) => {
      const supabase = getSupabaseClient();
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const uid = session?.user?.id ?? null;

      const queryKey = likeQueryKeys.likedIds(uid);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Set<string>>(queryKey);

      const next = new Set(previous ?? []);
      next.delete(voiceId);
      queryClient.setQueryData<Set<string>>(queryKey, next);

      return { uid, previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<Set<string>>(
          likeQueryKeys.likedIds(context.uid),
          context.previous,
        );
      }
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: likeQueryKeys.given });
    },
  });
}
