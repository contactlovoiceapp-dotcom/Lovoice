/* Likes tab — feeds received and given likes from Supabase into LikesScreen. */

import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '../../src/theme';
import { ageFromBirthdate } from '../../src/lib/age';
import { useReceivedLikes, useGivenLikes } from '../../src/features/likes/api/likeQueries';
import { useUnlikeVoice } from '../../src/features/likes/api/likeMutations';
import LikesScreen from '../../src/components/main/LikesScreen';

export default function LikesRoute() {
  const insets = useSafeAreaInsets();

  const receivedQuery = useReceivedLikes();
  const givenQuery = useGivenLikes();
  const unlikeVoice = useUnlikeVoice();

  const isLoading = receivedQuery.isLoading || givenQuery.isLoading;

  if (receivedQuery.isError) {
    console.warn('[LikesRoute] receivedLikes error:', receivedQuery.error);
  }
  if (givenQuery.isError) {
    console.warn('[LikesRoute] givenLikes error:', givenQuery.error);
  }

  // Map received likes — profile.id is the liker user id (used as React key and passed to onOpenReceivedLike).
  const receivedLikeProfiles = (receivedQuery.data ?? []).map((like) => ({
    id: like.liker.id,
    displayName: like.liker.displayName,
    age: ageFromBirthdate(like.liker.birthdate),
    city: like.liker.city,
    emojis: like.liker.bioEmojis,
  }));

  // Map given likes — profile.id is set to the voiceId so onUnlike can call
  // unlikeVoice.mutate({ voiceId: id }) directly. The field doubles as a unique
  // React key and the routing token for the unlike mutation.
  const likedProfiles = (givenQuery.data ?? []).map((like) => ({
    id: like.voiceId,
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
            onUnlike={(profileId) => {
              // profileId is the voiceId for the Given tab (see map above).
              unlikeVoice.mutate({ voiceId: profileId });
            }}
            onOpenReceivedLike={(profileId) => {
              console.log('open profile detail', profileId);
              // TODO(phase-7): route to chat or profile detail when those screens exist.
            }}
          />
        )}
      </View>
    </View>
  );
}
