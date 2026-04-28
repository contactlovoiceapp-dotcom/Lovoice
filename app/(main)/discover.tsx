/* Discover feed — vertical paging FlatList of voice cards with autoplay and filters. */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';

import type { Profile } from '../../src/types';
import { ColorTheme } from '../../src/types';
import { COLORS, CTA_GRADIENT, FONT, RADIUS, THEME_GRADIENTS, isHexLight } from '../../src/theme';
import { COPY } from '../../src/copy';
import { useFeedState } from '../../src/features/feed/hooks/useFeedState';

import ProfileCard from '../../src/components/ProfileCard';
import DiscoverHeader from '../../src/components/DiscoverHeader';
import FiltersModal from '../../src/components/main/FiltersModal';

export default function DiscoverScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const router = useRouter();

  const {
    profiles,
    likedIds,
    autoplay,
    activeProfileIndex,
    isGenerating,
    hasRecordedVoice,
    setActiveProfileIndex,
    setAutoplay,
    toggleLike,
    togglePlay,
    handleTrackFinish,
    loadMore,
  } = useFeedState();

  const [showFilters, setShowFilters] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const flatListRef = useRef<FlatList<Profile>>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveProfileIndex(viewableItems[0].index);
      }
    },
  ).current;
  const firstLikeShown = useRef(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string) => {
      setToastMessage(message);
      toastOpacity.setValue(0);
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => setToastMessage(null));
      }, 2500);
    },
    [toastOpacity],
  );

  const handleToggleLike = useCallback(
    (id: string) => {
      const isAdding = !likedIds.has(id);
      const profile = profiles.find((p) => p.id === id);
      toggleLike(id);
      if (isAdding && !firstLikeShown.current && profile) {
        firstLikeShown.current = true;
        showToast(COPY.likeToast.firstLike(profile.name));
      }
    },
    [likedIds, profiles, toggleLike, showToast],
  );

  const handleFinish = useCallback(
    (finishedId: string) => {
      handleTrackFinish(finishedId);
      if (autoplay) {
        const currentIndex = profiles.findIndex((p) => p.id === finishedId);
        if (currentIndex !== -1 && currentIndex < profiles.length - 1) {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: currentIndex + 1,
              animated: true,
            });
          }, 500);
        }
      }
    },
    [autoplay, profiles, handleTrackFinish],
  );

  const activeTheme = profiles[activeProfileIndex]?.theme ?? ColorTheme.Sunset;
  const statusBarStyle = useMemo<'light' | 'dark'>(
    () => (isHexLight(THEME_GRADIENTS[activeTheme].colors[0]) ? 'dark' : 'light'),
    [activeTheme],
  );

  const renderProfileCard = useCallback(
    ({ item }: { item: Profile }) => (
      <View style={{ width: windowWidth, height: windowHeight }}>
        <ProfileCard
          profile={item}
          togglePlay={togglePlay}
          onFinish={handleFinish}
          hasRecordedVoice={hasRecordedVoice}
          isLiked={likedIds.has(item.id)}
          onToggleLike={() => handleToggleLike(item.id)}
          onRecordVoice={() => router.push('/(auth)/record')}
        />
      </View>
    ),
    [windowWidth, windowHeight, togglePlay, handleFinish, hasRecordedVoice, likedIds, handleToggleLike, router],
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar style={statusBarStyle} />

      <DiscoverHeader
        autoplay={autoplay}
        onToggleAutoplay={() => setAutoplay(!autoplay)}
        onOpenFilters={() => setShowFilters(true)}
      />

      {profiles.length > 0 ? (
        <FlatList
          ref={flatListRef}
          data={profiles}
          renderItem={renderProfileCard}
          keyExtractor={(item) => item.id}
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
          ListFooterComponent={
            <View
              style={{
                height: windowHeight * 0.4,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: COLORS.background,
              }}
            >
              <Pressable
                onPress={loadMore}
                disabled={isGenerating}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: RADIUS.cta,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: 'rgba(45,17,54,0.05)',
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  opacity: isGenerating ? 0.4 : 1,
                }}
              >
                {isGenerating ? (
                  <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.textSecondary }}>
                    {COPY.feed.loading}
                  </Text>
                ) : (
                  <>
                    <Sparkles size={16} color={COLORS.secondary} />
                    <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.textSecondary }}>
                      {COPY.feed.loadMore}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          }
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ marginBottom: 24, height: 96, width: 96, alignItems: 'center', justifyContent: 'center', borderRadius: 48, backgroundColor: COLORS.primaryMuted }}>
            <Sparkles size={40} color={COLORS.primary} />
          </View>
          <Text style={{ marginBottom: 8, textAlign: 'center', fontSize: 24, fontFamily: FONT.bold, color: COLORS.dark }}>
            {COPY.feed.emptyTitle}
          </Text>
          <Text style={{ marginBottom: 32, maxWidth: 250, textAlign: 'center', fontFamily: FONT.regular, color: COLORS.textSecondary }}>
            {COPY.feed.emptyBody}
          </Text>
          <Pressable onPress={() => setShowFilters(true)}>
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
        </View>
      )}

      {toastMessage !== null && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 12 + 64 + 16 + 24,
            left: 24,
            right: 24,
            zIndex: 30,
            opacity: toastOpacity,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: 'rgba(45,17,54,0.92)',
              borderRadius: RADIUS.cta,
              paddingHorizontal: 20,
              paddingVertical: 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.18,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <Text style={{ color: 'white', fontSize: 14, fontFamily: FONT.medium }}>
              {toastMessage}
            </Text>
          </View>
        </Animated.View>
      )}

      {showFilters && <FiltersModal onClose={() => setShowFilters(false)} />}
    </View>
  );
}
