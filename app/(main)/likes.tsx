/* Likes tab — feeds received and given likes from Supabase into LikesScreen. */

import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MemberProfileModal from '@/features/profile/components/MemberProfileModal';
import { COLORS } from '../../src/theme';
import { ageFromBirthdate } from '../../src/lib/age';
import { useReceivedLikes, useGivenLikes } from '../../src/features/likes/api/likeQueries';
import LikesScreen from '../../src/components/main/LikesScreen';

export default function LikesRoute() {
  const insets = useSafeAreaInsets();
  const [memberPreview, setMemberPreview] = useState<{ userId: string; voiceId: string | null } | null>(null);

  const receivedQuery = useReceivedLikes();
  const givenQuery = useGivenLikes();

  const isLoading = receivedQuery.isLoading || givenQuery.isLoading;

  if (receivedQuery.isError) {
    console.warn('[LikesRoute] receivedLikes error:', receivedQuery.error);
  }
  if (givenQuery.isError) {
    console.warn('[LikesRoute] givenLikes error:', givenQuery.error);
  }

  const receivedLikeProfiles = (receivedQuery.data ?? []).map((like) => ({
    rowKey: like.likeId,
    userId: like.liker.id,
    voiceId: like.voiceId,
    displayName: like.liker.displayName,
    age: ageFromBirthdate(like.liker.birthdate),
    city: like.liker.city,
    emojis: like.liker.bioEmojis,
  }));

  const likedProfiles = (givenQuery.data ?? []).map((like) => ({
    rowKey: like.likeId,
    userId: like.author.id,
    voiceId: like.voiceId,
    displayName: like.author.displayName,
    age: ageFromBirthdate(like.author.birthdate),
    city: like.author.city,
    emojis: like.author.bioEmojis,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 112, paddingTop: insets.top + 16 }}>
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <LikesScreen
            likedProfiles={likedProfiles}
            receivedLikeProfiles={receivedLikeProfiles}
            onOpenProfile={(userId, voiceId) => setMemberPreview({ userId, voiceId })}
          />
        )}
      </View>

      <MemberProfileModal
        visible={memberPreview !== null}
        userId={memberPreview?.userId ?? null}
        voiceId={memberPreview?.voiceId ?? null}
        onClose={() => setMemberPreview(null)}
      />
    </View>
  );
}
