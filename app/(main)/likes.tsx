/* Likes tab — shows received and given likes. */

import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { COLORS } from '../../src/theme';
import { useFeedState } from '../../src/features/feed/hooks/useFeedState';
import LikesScreen from '../../src/components/main/LikesScreen';

export default function LikesRoute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { likedProfiles, receivedLikeProfiles, toggleLike } = useFeedState();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 112, paddingTop: insets.top + 16 }}>
        <LikesScreen
          likedProfiles={likedProfiles()}
          receivedLikeProfiles={receivedLikeProfiles()}
          onUnlike={toggleLike}
          onOpenReceivedLike={() => router.navigate('/(main)/discover')}
        />
      </View>
    </View>
  );
}
