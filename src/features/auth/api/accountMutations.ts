/* Mutations for the authenticated user's own account lifecycle (RGPD self-service deletion). */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';

// Calls the `delete_account` Edge Function (server-side hard purge of the caller's data and
// auth.users row, see ARCHITECTURE §9), then clears the now-invalid local session so the app
// returns to the auth flow. The local sign-out uses scope 'local' to avoid a server round-trip
// with a token whose user no longer exists.
export function useDeleteAccount(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const supabase = getSupabaseClient();

      if (!supabase) {
        throw new Error('account.supabase_unavailable');
      }

      const { error } = await supabase.functions.invoke('delete_account', { body: {} });

      if (error) {
        throw new Error('account.delete_failed');
      }

      // Clear the local session (the JWT is now orphaned). onAuthStateChange('SIGNED_OUT')
      // fires next and AuthRedirector navigates back to the auth stack.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => null);
    },
    onSuccess: () => {
      // Drop every cached query so no stale profile/feed/conversation data lingers for the
      // next account that signs in on this device.
      queryClient.clear();
    },
  });
}
