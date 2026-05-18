/* Discover feed — vertical paging FlatList of voice cards with autoplay, filters, and seen batching. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';

import { COLORS, CTA_GRADIENT, FONT, RADIUS, THEME_GRADIENTS, isHexLight } from '../../src/theme';
import { COPY } from '../../src/copy';
import { useFeedState } from '../../src/features/feed/hooks/useFeedState';
import { useAuth } from '../../src/features/auth/hooks/useAuth';
import { useActiveVoice } from '../../src/features/voices/api/voiceQueries';
import { useHideSplash } from '../../src/lib/useHideSplash';
import { useFeedItems } from '../../src/features/feed/api/feedQueries';
import { useResetFeedSeen } from '../../src/features/feed/api/feedMutations';
import { useFeedSeenBatcher } from '../../src/features/feed/hooks/useFeedSeenBatcher';
import { useFeedPlayer } from '../../src/lib/feedPlayer';
import { ageFromBirthdate } from '../../src/lib/age';
import type { FeedItem, FeedItemTheme } from '../../src/features/feed/types';
import type { FeedPlayerControls, FeedPlayerSnapshot } from '../../src/lib/feedPlayer';

import ProfileCard from '../../src/components/ProfileCard';
import DiscoverHeader from '../../src/components/DiscoverHeader';
import FiltersModal from '../../src/components/main/FiltersModal';

// Cards that aren't in the current viewport receive a zeroed, paused snapshot.
const INACTIVE_SNAPSHOT: FeedPlayerSnapshot = {
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  isLoading: false,
  error: null,
};
const INACTIVE_CONTROLS: FeedPlayerControls = {
  play: () => undefined,
  pause: () => undefined,
};
const DEFAULT_THEME: FeedItemTheme = 'sunset';

export default function DiscoverScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const { profile } = useAuth();
  const activeVoiceQuery = useActiveVoice(profile?.id ?? null);
  const hasRecordedVoice = !!activeVoiceQuery.data;
  const onSplashReady = useHideSplash();

  const { autoplay, setAutoplay, filters } = useFeedState();

  const feedQuery = useFeedItems(filters);

  // Flatten pages then apply client-side age filter per ARCHITECTURE.md §8.
  // Age is post-query because the SQL RPC doesn't expose server-side age bounds directly.
  const items: FeedItem[] = useMemo(() => {
    const all = feedQuery.data?.pages.flatMap((p) => p.items) ?? [];
    return all.filter((it) => {
      const age = ageFromBirthdate(it.birthdate);
      return age >= filters.minAge && age <= filters.maxAge;
    });
  }, [feedQuery.data, filters.minAge, filters.maxAge]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Keep activeIndex in-bounds if the visible items list shrinks (filter change or refetch).
  useEffect(() => {
    if (items.length > 0 && activeIndex >= items.length) {
      setActiveIndex(items.length - 1);
    }
  }, [items.length, activeIndex]);

  const seenBatcher = useFeedSeenBatcher();
  const resetFeedSeen = useResetFeedSeen();

  const flatListRef = useRef<FlatList<FeedItem>>(null);
  // lastSeenIdRef prevents the 50% threshold from being enqueued more than once per play-through.
  const lastSeenIdRef = useRef<string | null>(null);

  const handleEnded = useCallback(
    (voiceId: string) => {
      seenBatcher.enqueue(voiceId);
      if (autoplay && activeIndex < items.length - 1) {
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
        });
      }
    },
    [autoplay, activeIndex, items.length, seenBatcher],
  );

  const { snapshot, controls } = useFeedPlayer({
    items,
    currentIndex: activeIndex,
    onCurrentEnded: handleEnded,
  });

  // Flush pending seen batch when the screen loses focus (navigation away, tab switch, etc.).
  useFocusEffect(
    useCallback(() => {
      return () => {
        seenBatcher.flush();
      };
    }, [seenBatcher]),
  );

  // Track 50% listen progress and enqueue the voice as a seen candidate.
  useEffect(() => {
    const item = items[activeIndex];
    if (!item || snapshot.durationMs <= 0) return;
    const pct = snapshot.positionMs / snapshot.durationMs;
    if (pct >= 0.5 && lastSeenIdRef.current !== item.voiceId) {
      lastSeenIdRef.current = item.voiceId;
      seenBatcher.enqueue(item.voiceId);
    }
  }, [activeIndex, items, snapshot.positionMs, snapshot.durationMs, seenBatcher]);

  // Reset the 50% tracking ref each time the active card changes.
  useEffect(() => {
    lastSeenIdRef.current = null;
  }, [activeIndex]);

  // Proactively load the next page when the user is within 5 items of the last fetched item.
  useEffect(() => {
    if (
      feedQuery.hasNextPage &&
      !feedQuery.isFetchingNextPage &&
      items.length - activeIndex <= 5
    ) {
      void feedQuery.fetchNextPage();
    }
  }, [activeIndex, items.length, feedQuery]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  const activeTheme = items[activeIndex]?.theme ?? DEFAULT_THEME;
  const statusBarStyle = useMemo<'light' | 'dark'>(
    () => (isHexLight(THEME_GRADIENTS[activeTheme].colors[0]) ? 'dark' : 'light'),
    [activeTheme],
  );

  const renderProfileCard = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => (
      <View style={{ width: windowWidth, height: windowHeight }}>
        <ProfileCard
          item={item}
          snapshot={index === activeIndex ? snapshot : INACTIVE_SNAPSHOT}
          controls={index === activeIndex ? controls : INACTIVE_CONTROLS}
          hasRecordedVoice={hasRecordedVoice}
          isLiked={false /* TODO(phase-6): wire useLiked(voiceId) */}
          onToggleLike={() => undefined /* TODO(phase-6): wire useToggleLike */}
          onRecordVoice={() => router.push('/(auth)/onboarding/record')}
        />
      </View>
    ),
    [windowWidth, windowHeight, activeIndex, snapshot, controls, hasRecordedVoice, router],
  );

  // --- Loading state (initial fetch, no cached pages yet) ---
  if (feedQuery.isLoading) {
    return (
      <View
        style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}
        onLayout={onSplashReady}
      >
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 16, fontFamily: FONT.medium, color: COLORS.textSecondary }}>
          {COPY.feed.loading}
        </Text>
      </View>
    );
  }

  // --- Error state ---
  if (feedQuery.isError) {
    return (
      <View
        style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}
        onLayout={onSplashReady}
      >
        <StatusBar style="dark" />
        <Text style={{ marginBottom: 16, textAlign: 'center', fontFamily: FONT.medium, color: COLORS.textSecondary }}>
          {COPY.feed.loadError}
        </Text>
        <Pressable onPress={() => feedQuery.refetch()}>
          <LinearGradient
            colors={[...CTA_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: RADIUS.cta, paddingHorizontal: 32, paddingVertical: 12 }}
          >
            <Text style={{ textAlign: 'center', fontFamily: FONT.bold, color: 'white' }}>
              {COPY.feed.retry}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }} onLayout={onSplashReady}>
      <StatusBar style={statusBarStyle} />

      <DiscoverHeader
        autoplay={autoplay}
        onToggleAutoplay={() => setAutoplay(!autoplay)}
        onOpenFilters={() => setShowFilters(true)}
      />

      {items.length > 0 ? (
        <FlatList
          ref={flatListRef}
          data={items}
          renderItem={renderProfileCard}
          keyExtractor={(item) => item.voiceId}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          snapToAlignment="start"
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          getItemLayout={(_, index) => ({
            length: windowHeight,
            offset: windowHeight * index,
            index,
          })}
          refreshing={feedQuery.isRefetching}
          onRefresh={() => feedQuery.refetch()}
          ListFooterComponent={
            feedQuery.isFetchingNextPage ? (
              <View
                style={{
                  height: 60,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: COLORS.background,
                }}
              >
                <ActivityIndicator size="small" color={COLORS.primary} />
              </View>
            ) : null
          }
        />
      ) : (
        // Empty state: all pages fetched, but no items pass the age filter or the feed is exhausted.
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}
        >
          <View
            style={{
              marginBottom: 24,
              height: 96,
              width: 96,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 48,
              backgroundColor: COLORS.primaryMuted,
            }}
          >
            <Sparkles size={40} color={COLORS.primary} />
          </View>
          <Text
            style={{
              marginBottom: 8,
              textAlign: 'center',
              fontSize: 24,
              fontFamily: FONT.bold,
              color: COLORS.dark,
            }}
          >
            {COPY.feed.emptyTitle}
          </Text>
          <Text
            style={{
              marginBottom: 32,
              maxWidth: 250,
              textAlign: 'center',
              fontFamily: FONT.regular,
              color: COLORS.textSecondary,
            }}
          >
            {COPY.feed.emptyBody}
          </Text>
          <View style={{ gap: 12, width: '100%', alignItems: 'center' }}>
            <Pressable onPress={() => setShowFilters(true)} style={{ width: '100%' }}>
              <LinearGradient
                colors={[...CTA_GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ borderRadius: RADIUS.cta, paddingHorizontal: 32, paddingVertical: 12 }}
              >
                <Text style={{ textAlign: 'center', fontFamily: FONT.bold, color: 'white' }}>
                  {COPY.feed.editFilters}
                </Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => setShowResetConfirm(true)}
              style={{
                borderRadius: RADIUS.cta,
                borderWidth: 1,
                borderColor: COLORS.border,
                paddingHorizontal: 32,
                paddingVertical: 12,
                width: '100%',
              }}
            >
              <Text
                style={{
                  textAlign: 'center',
                  fontFamily: FONT.medium,
                  color: COLORS.textSecondary,
                }}
              >
                {COPY.feed.resetSeen}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {showFilters && <FiltersModal onClose={() => setShowFilters(false)} />}

      {/* Confirm feed reset — inline modal to avoid a shared component dependency in V1. */}
      {showResetConfirm && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            backgroundColor: 'rgba(45, 17, 54, 0.45)',
          }}
        >
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: RADIUS.modal,
              padding: 24,
              width: '100%',
              maxWidth: 384,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontFamily: FONT.bold,
                marginBottom: 12,
                color: COLORS.dark,
              }}
            >
              {COPY.feed.resetConfirmTitle}
            </Text>
            <Text style={{ color: COLORS.textSecondary, marginBottom: 24 }}>
              {COPY.feed.resetConfirmBody}
            </Text>
            {resetFeedSeen.isError && (
              <Text style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>
                {COPY.feed.resetError}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                style={{
                  flex: 1,
                  borderRadius: RADIUS.cta,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  paddingVertical: 14,
                  alignItems: 'center',
                }}
                onPress={() => {
                  resetFeedSeen.reset();
                  setShowResetConfirm(false);
                }}
              >
                <Text style={{ fontFamily: FONT.medium, color: COLORS.textSecondary }}>
                  {COPY.common.cancel}
                </Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, opacity: resetFeedSeen.isPending ? 0.6 : 1 }}
                disabled={resetFeedSeen.isPending}
                onPress={() => {
                  resetFeedSeen.mutate(undefined, {
                    onSuccess: () => setShowResetConfirm(false),
                  });
                }}
              >
                <LinearGradient
                  colors={[...CTA_GRADIENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius: RADIUS.cta,
                    paddingVertical: 14,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontFamily: FONT.bold, color: 'white' }}>
                    {COPY.feed.resetConfirmCta}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
