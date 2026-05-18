/* Likes tab — shows received and given likes. */

import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '../../src/theme';
import LikesScreen from '../../src/components/main/LikesScreen';

export default function LikesRoute() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 112, paddingTop: insets.top + 16 }}>
        {/* TODO(phase-6): wire useLikes / useLikedVoices queries. */}
        <LikesScreen
          likedProfiles={[]}
          receivedLikeProfiles={[]}
          onUnlike={() => undefined}
          onOpenReceivedLike={() => undefined}
        />
      </View>
    </View>
  );
}
