/* Full-screen modal wrapping the immersive ProfileCard from Discover for the likes context. */

import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { COPY } from '@/copy';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useLikedVoiceIds } from '@/features/likes/api/likeQueries';
import { useLikeVoice, useUnlikeVoice } from '@/features/likes/api/likeMutations';
import { useMemberVoicePreview, useVoiceSignedUrl } from '@/features/voices/api/voiceQueries';
import { useVoicePlayer } from '@/features/voices/hooks/useVoicePlayer';
import ProfileCard from '@/components/ProfileCard';
import type { FeedItem, FeedItemTheme } from '@/features/feed/types';
import type { FeedPlayerControls, FeedPlayerSnapshot } from '@/lib/feedPlayer';
import { COLORS, FONT } from '@/theme';

interface MemberProfileRow {
  display_name: string;
  birthdate: string;
  city: string;
  bio_emojis: string[] | null;
}

async function fetchMemberProfileRow(userId: string): Promise<MemberProfileRow> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('profile.supabase_unavailable');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, birthdate, city, bio_emojis')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('profile.not_found');
  }

  return data as MemberProfileRow;
}

const VALID_THEMES = new Set<FeedItemTheme>(['sunset', 'chill', 'electric', 'midnight']);

function normalizeTheme(raw: string | null | undefined): FeedItemTheme {
  if (raw && VALID_THEMES.has(raw as FeedItemTheme)) {
    return raw as FeedItemTheme;
  }
  return 'sunset';
}

export interface MemberProfileModalProps {
  visible: boolean;
  userId: string | null;
  voiceId: string | null;
  onClose: () => void;
}

export default function MemberProfileModal({ visible, userId, voiceId, onClose }: MemberProfileModalProps) {
  const insets = useSafeAreaInsets();
  const enabled = visible && !!userId;

  const { profile: ownProfile } = useAuth();
  const ownUserId = ownProfile?.id ?? null;

  const profileQuery = useQuery({
    queryKey: ['profiles', 'member-modal', userId],
    queryFn: () => fetchMemberProfileRow(userId as string),
    enabled,
  });

  const voiceQuery = useMemberVoicePreview(userId, voiceId, enabled);
  const voice = voiceQuery.data ?? null;
  const signedUrlQuery = useVoiceSignedUrl(voice?.storage_path ?? null);
  const signedUrl = signedUrlQuery.data ?? null;
  const voicePlayer = useVoicePlayer({ uri: signedUrl });

  const likedIdsQuery = useLikedVoiceIds(ownUserId);
  const likedIds = likedIdsQuery.data ?? new Set<string>();
  const likeVoice = useLikeVoice();
  const unlikeVoice = useUnlikeVoice();

  const voicePlayerRef = useRef(voicePlayer);
  voicePlayerRef.current = voicePlayer;

  useEffect(() => {
    if (!visible) {
      voicePlayerRef.current.stop();
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    voicePlayerRef.current.stop();
    onClose();
  }, [onClose]);

  const isLoading = profileQuery.isLoading || voiceQuery.isLoading;
  const isError = profileQuery.isError || voiceQuery.isError;

  const feedItem: FeedItem | null =
    profileQuery.data && voice
      ? {
          voiceId: voice.id,
          storagePath: voice.storage_path,
          durationMs: voice.duration_ms,
          theme: normalizeTheme(voice.theme),
          title: voice.title ?? null,
          promptBody: null,
          createdAt: voice.created_at,
          userId: voice.user_id,
          displayName: profileQuery.data.display_name,
          birthdate: profileQuery.data.birthdate,
          city: profileQuery.data.city,
          bioEmojis: (profileQuery.data.bio_emojis ?? []).filter(Boolean),
        }
      : null;

  const snapshot: FeedPlayerSnapshot = {
    isPlaying: voicePlayer.isPlaying,
    positionMs: voicePlayer.positionMs,
    durationMs: voicePlayer.durationMs,
    isLoading: signedUrlQuery.isLoading,
    error: signedUrlQuery.isError ? 'member_profile.signed_url_failed' : null,
  };

  const controls: FeedPlayerControls = {
    play: voicePlayer.play,
    pause: voicePlayer.pause,
    stop: voicePlayer.stop,
  };

  const isLiked = feedItem ? likedIds.has(feedItem.voiceId) : false;

  const handleToggleLike = useCallback(() => {
    if (!feedItem) return;
    if (isLiked) {
      unlikeVoice.mutate({ voiceId: feedItem.voiceId });
    } else {
      likeVoice.mutate({ voiceId: feedItem.voiceId, ownerId: feedItem.userId });
    }
  }, [feedItem, isLiked, likeVoice, unlikeVoice]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : isError || !feedItem ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <Text style={{ fontFamily: FONT.regular, color: '#ef4444', textAlign: 'center' }}>
              {COPY.memberProfilePreview.error}
            </Text>
            <Pressable onPress={handleClose} style={{ marginTop: 24 }}>
              <Text style={{ fontFamily: FONT.bold, color: COLORS.primary }}>
                {COPY.common.close}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <ProfileCard
              item={feedItem}
              snapshot={snapshot}
              controls={controls}
              isLiked={isLiked}
              onToggleLike={handleToggleLike}
              hasRecordedVoice
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={COPY.memberProfilePreview.closeA11y}
              onPress={handleClose}
              hitSlop={12}
              style={{
                position: 'absolute',
                top: insets.top + 12,
                right: 16,
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: 'rgba(0,0,0,0.3)',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 100,
              }}
            >
              <X size={20} color="white" />
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}
