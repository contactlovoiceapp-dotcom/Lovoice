/* Messages inbox route — subscribes to Realtime and feeds data into MessagesScreen. */

import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import type { Href } from 'expo-router';

import { COLORS } from '../../../src/theme';
import { useAuth } from '../../../src/features/auth/hooks/useAuth';
import { useConversations, chatQueryKeys } from '../../../src/features/chat/api/conversationQueries';
import { getSupabaseClient } from '../../../src/lib/supabase';
import MessagesScreen from '../../../src/components/main/MessagesScreen';

export default function MessagesRoute() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useConversations();
  const conversations = data ?? [];

  // Invalidate inbox cache whenever a new message is inserted — RLS ensures we only
  // receive events for conversations we belong to.
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !session) return;

    const channel = supabase
      .channel(`inbox:${session.user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          void queryClient.invalidateQueries({ queryKey: chatQueryKeys.inbox });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session, queryClient]);

  // Refetch when the tab gains focus — the user may have read messages on another device.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const handleOpenConversation = useCallback((id: string) => {
    router.push(`/messages/${id}` as Href);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar style="dark" />
      <View
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingBottom: 112,
          paddingTop: insets.top + 16,
        }}
      >
        <MessagesScreen
          conversations={conversations}
          isLoading={isLoading}
          isError={isError}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onOpenConversation={handleOpenConversation}
        />
      </View>
    </View>
  );
}
