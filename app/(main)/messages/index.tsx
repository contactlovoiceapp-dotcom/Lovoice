/* Messages inbox route — feeds cached conversation data into MessagesScreen.
   Realtime invalidation is handled globally by useRealtimeInbox in _layout.tsx. */

import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Href } from 'expo-router';

import { COLORS } from '../../../src/theme';
import { useConversations } from '../../../src/features/chat/api/conversationQueries';
import MessagesScreen from '../../../src/components/main/MessagesScreen';

export default function MessagesRoute() {
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useConversations();
  const conversations = data ?? [];

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
