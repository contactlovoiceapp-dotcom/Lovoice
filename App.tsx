/* Root application shell — manages navigation state, the Discover feed (FlatList), font loading, and safe-area context. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  ViewToken,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useFonts,
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_900Black,
} from '@expo-google-fonts/playfair-display';
import {
  ChevronUp,
  SlidersHorizontal,
  Sparkles,
  User,
} from 'lucide-react-native';

import { Profile, ColorTheme, Tab, AppState } from './src/types';
import { COLORS, CTA_GRADIENT, FONT, RADIUS, THEME_GRADIENTS, isHexLight } from './src/theme';
import { COPY } from './src/copy';
import { generateNewProfile } from './src/services/geminiService';

import SplashScreen from './src/components/onboarding/SplashScreen';
import HomeScreen from './src/components/onboarding/HomeScreen';
import PhoneScreen from './src/components/onboarding/PhoneScreen';
import RecordVibeScreen from './src/components/onboarding/RecordVibeScreen';
import MyVibeScreen from './src/components/onboarding/MyVibeScreen';

import MessagesScreen from './src/components/main/MessagesScreen';
import LikesScreen from './src/components/main/LikesScreen';
import FiltersModal from './src/components/main/FiltersModal';

import ProfileCard from './src/components/ProfileCard';
import BottomNav from './src/components/BottomNav';

import './global.css';

const LOGO = require('./assets/logo.png');

function SwipeHintOverlay({
  bottom,
  onDone,
}: {
  bottom: number;
  onDone: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const entrance = Animated.sequence([
      Animated.delay(900),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.delay(2800),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]);
    const lift = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -8,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
      { iterations: 3 },
    );

    entrance.start(({ finished }) => {
      if (finished) onDone();
    });
    lift.start();

    return () => {
      entrance.stop();
      lift.stop();
    };
  }, [onDone, opacity, translateY]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom,
        zIndex: 35,
        alignItems: 'center',
        opacity,
      }}
    >
      <Animated.View
        style={{
          alignItems: 'center',
          minWidth: 248,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.2)',
          backgroundColor: 'rgba(255,255,255,0.14)',
          paddingHorizontal: 24,
          paddingVertical: 18,
          transform: [{ translateY }],
        }}
      >
        <ChevronUp size={24} color="rgba(255,255,255,0.9)" />
        <Text style={{ marginTop: 8, color: 'rgba(255,255,255,0.92)', fontFamily: FONT.semibold, fontSize: 15 }}>
          {COPY.feed.swipeHintTitle}
        </Text>
        <Text style={{ marginTop: 4, color: 'rgba(255,255,255,0.7)', fontFamily: FONT.medium, fontSize: 13 }}>
          {COPY.feed.swipeHintBody}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const INITIAL_PROFILES: Profile[] = [
  {
    id: '1',
    name: 'Alex',
    age: 28,
    city: 'Paris 11e',
    promptTitle: 'Ma pire honte en cuisine 🍳',
    transcript:
      "Alors, j'avais invité mes beaux-parents pour la première fois. J'ai voulu faire le malin avec un bœuf bourguignon. Sauf que j'ai confondu le sel et le sucre...",
    emojis: ['😂', '🌯', '🏄‍♂️'],
    theme: ColorTheme.Sunset,
    isPlaying: false,
    audioDurationSec: 15,
  },
  {
    id: '2',
    name: 'Sarah',
    age: 31,
    city: 'Montmartre',
    promptTitle: "Ce qui m'émeut le plus...",
    transcript:
      "Je crois que c'est de voir des gens âgés se tenir la main dans la rue. Ça me donne toujours l'espoir que l'amour peut vraiment durer toute une vie.",
    emojis: ['😌', '📚', '☕️'],
    theme: ColorTheme.Chill,
    isPlaying: false,
    audioDurationSec: 12,
  },
  {
    id: '3',
    name: 'Théo',
    age: 26,
    city: 'Boulogne-Billancourt',
    promptTitle: 'Mon plus beau voyage solo ✈️',
    transcript:
      "Salut ! Moi c'est Théo. Je suis passionné de voyages et de photographie. Si tu aimes les randos le week-end et les discussions refaire le monde jusqu'à pas d'heure...",
    emojis: ['✈️', '🎒', '🌍'],
    theme: ColorTheme.Electric,
    isPlaying: false,
    audioDurationSec: 10,
  },
  {
    id: '4',
    name: 'Léa',
    age: 24,
    city: 'Lyon 3e',
    promptTitle: 'Mon secret inavouable...',
    transcript:
      "Bon, promettez-moi de ne pas juger. J'écoute du Taylor Swift en boucle, même en soirée, et je pleure devant les vidéos de chats.",
    emojis: ['🌙', '🎵', '🍷'],
    theme: ColorTheme.Midnight,
    isPlaying: false,
    audioDurationSec: 18,
  },
  {
    id: '5',
    name: 'Camille',
    age: 27,
    city: 'Bordeaux',
    promptTitle: 'Ma playlist du dimanche matin ☀️',
    transcript:
      "Le dimanche matin, c'est sacré. Café, croissant, et ma playlist qui va du jazz à l'électro. Un peu comme moi, un mélange improbable.",
    emojis: ['🎶', '☕', '🌻'],
    theme: ColorTheme.Chill,
    isPlaying: false,
    audioDurationSec: 14,
  },
];

function AppContent() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [appState, setAppState] = useState<AppState>('splash');
  const [profiles, setProfiles] = useState<Profile[]>(INITIAL_PROFILES);
  const [activeTab, setActiveTab] = useState<Tab>('discover');
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [hasRecordedVibe, setHasRecordedVibe] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeProfileIndex, setActiveProfileIndex] = useState(0);
  const [showSwipeHint, setShowSwipeHint] = useState(true);

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

  const likedProfiles = useMemo(
    () => profiles.filter((p) => likedIds.has(p.id)),
    [profiles, likedIds],
  );

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

  const toggleLike = useCallback(
    (id: string) => {
      const isAdding = !likedIds.has(id);
      const profile = profiles.find((p) => p.id === id);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      if (isAdding && !firstLikeShown.current && profile) {
        firstLikeShown.current = true;
        showToast(COPY.likeToast.firstLike(profile.name));
      }
    },
    [likedIds, profiles, showToast],
  );

  const navigateTo = useCallback((next: AppState) => {
    setAppState(next);
  }, []);

  const dismissSwipeHint = useCallback(() => {
    setShowSwipeHint(false);
  }, []);

  const isDiscover = activeTab === 'discover';

  const activeTheme = profiles[activeProfileIndex]?.theme ?? ColorTheme.Sunset;
  const statusBarStyle = useMemo<'light' | 'dark'>(() => {
    if (!isDiscover || appState !== 'main') return 'dark';
    return isHexLight(THEME_GRADIENTS[activeTheme].colors[0]) ? 'dark' : 'light';
  }, [isDiscover, appState, activeTheme]);

  const togglePlay = useCallback(
    (id: string) => {
      setProfiles((prev) =>
        prev.map((p) => ({
          ...p,
          isPlaying: p.id === id ? !p.isPlaying : false,
        })),
      );
    },
    [],
  );

  const handleTrackFinish = useCallback(
    (finishedId: string) => {
      setProfiles((prev) => prev.map((p) => ({ ...p, isPlaying: false })));
      if (autoplay) {
        const currentIndex = profiles.findIndex((p) => p.id === finishedId);
        if (currentIndex !== -1 && currentIndex < profiles.length - 1) {
          const nextId = profiles[currentIndex + 1].id;
          setTimeout(() => {
            setProfiles((prev) =>
              prev.map((p) => ({ ...p, isPlaying: p.id === nextId })),
            );
            flatListRef.current?.scrollToIndex({
              index: currentIndex + 1,
              animated: true,
            });
          }, 500);
        }
      }
    },
    [autoplay, profiles],
  );

  const handleLoadMore = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    const newProfile = await generateNewProfile();
    if (newProfile) {
      setProfiles((prev) => [...prev, newProfile]);
    }
    setIsGenerating(false);
  }, [isGenerating]);

  const renderProfileCard = useCallback(
    ({ item }: { item: Profile }) => (
      <View style={{ width: windowWidth, height: windowHeight }}>
        <ProfileCard
          profile={item}
          togglePlay={togglePlay}
          onFinish={handleTrackFinish}
          hasRecordedVibe={hasRecordedVibe}
          isLiked={likedIds.has(item.id)}
          onToggleLike={() => toggleLike(item.id)}
          onRecordVibe={() => navigateTo('onboarding_record')}
        />
      </View>
    ),
    [windowWidth, windowHeight, togglePlay, handleTrackFinish, hasRecordedVibe, toggleLike, likedIds, navigateTo],
  );

  const renderMainScreen = () => (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: insets.top + 8,
          paddingBottom: 8,
          backgroundColor: isDiscover ? 'transparent' : 'rgba(255,249,245,0.95)',
          borderBottomWidth: isDiscover ? 0 : 1,
          borderBottomColor: COLORS.borderLight,
        }}
      >
        <Image source={LOGO} style={{ height: 40, width: 100 }} resizeMode="contain" />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isDiscover && (
            <Pressable
              onPress={() => setAutoplay(!autoplay)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                borderRadius: RADIUS.cta,
                borderWidth: 1,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderColor: autoplay ? 'rgba(231,36,171,0.5)' : 'rgba(255,255,255,0.15)',
                backgroundColor: autoplay ? 'rgba(231,36,171,0.15)' : 'rgba(255,255,255,0.08)',
              }}
            >
              <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: 'rgba(255,255,255,0.7)' }}>
                {COPY.feed.autoplay}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: FONT.bold,
                  color: autoplay ? COLORS.primary : 'rgba(255,255,255,0.35)',
                }}
              >
                {autoplay ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => setShowFilters(true)}
            style={{
              borderRadius: RADIUS.cta,
              padding: 8,
              backgroundColor: isDiscover ? 'rgba(255,255,255,0.1)' : 'rgba(45,17,54,0.05)',
            }}
          >
            <SlidersHorizontal
              size={18}
              color={isDiscover ? 'rgba(255,255,255,0.5)' : COLORS.textTertiary}
            />
          </Pressable>

          <Pressable
            onPress={() =>
              hasRecordedVibe
                ? setActiveTab('my-vibes')
                : navigateTo('onboarding_record')
            }
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: isDiscover ? 'rgba(255,255,255,0.3)' : COLORS.border,
              backgroundColor: isDiscover ? 'rgba(255,255,255,0.08)' : 'rgba(45,17,54,0.05)',
            }}
          >
            <User
              size={16}
              strokeWidth={1.8}
              color={isDiscover ? 'rgba(255,255,255,0.6)' : COLORS.textTertiary}
            />
          </Pressable>
        </View>
      </View>

      {/* Feed */}
      {isDiscover && (
        <>
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
              onScrollBeginDrag={dismissSwipeHint}
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
                    onPress={handleLoadMore}
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
        </>
      )}

      {isDiscover && showSwipeHint && profiles.length > 1 && (
        <SwipeHintOverlay
          bottom={windowHeight * 0.44}
          onDone={dismissSwipeHint}
        />
      )}

      {activeTab === 'likes' && (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 112, paddingTop: insets.top + 56 }}>
          <LikesScreen
            likedProfiles={likedProfiles}
            onUnlike={(id) => toggleLike(id)}
          />
        </View>
      )}

      {activeTab === 'my-vibes' && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, backgroundColor: COLORS.background }}>
          <MyVibeScreen
            onBack={() => setActiveTab('discover')}
            onSend={() => setActiveTab('discover')}
            onDeleteVibe={() => {
              setHasRecordedVibe(false);
              navigateTo('onboarding_record');
            }}
            hasRecordedVibe={hasRecordedVibe}
          />
        </View>
      )}

      {activeTab === 'messages' && (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 112, paddingTop: insets.top + 56 }}>
          <MessagesScreen />
        </View>
      )}

      {toastMessage !== null && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: insets.bottom + 12 + 64 + 16,
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

      {activeTab !== 'my-vibes' && (
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
      )}
      {showFilters && <FiltersModal onClose={() => setShowFilters(false)} />}
    </View>
  );

  const renderScreen = () => {
    switch (appState) {
      case 'splash':
        return <SplashScreen onFinish={() => navigateTo('home')} />;
      case 'home':
        return (
          <HomeScreen
            onSignUp={() => navigateTo('onboarding_phone')}
            onLogin={() => navigateTo('login_phone')}
          />
        );
      case 'login_phone':
        return (
          <PhoneScreen
            onNext={() => navigateTo('main')}
            onBack={() => navigateTo('home')}
          />
        );
      case 'onboarding_phone':
        return (
          <PhoneScreen
            onNext={() => navigateTo('onboarding_record')}
            onBack={() => navigateTo('home')}
          />
        );
      case 'onboarding_record':
        return (
          <RecordVibeScreen
            onNext={() => {
              setHasRecordedVibe(true);
              navigateTo('onboarding_profile');
            }}
            onSkip={() => {
              setHasRecordedVibe(false);
              navigateTo('main');
            }}
          />
        );
      case 'onboarding_profile':
        return (
          <MyVibeScreen
            onBack={() => navigateTo('onboarding_record')}
            onSend={() => navigateTo('main')}
            onDeleteVibe={() => {
              setHasRecordedVibe(false);
              navigateTo('onboarding_record');
            }}
            hasRecordedVibe={hasRecordedVibe}
            isOnboarding
          />
        );
      case 'main':
        return renderMainScreen();
      default:
        return null;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar style={statusBarStyle} />
      {renderScreen()}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Outfit_300Light,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_900Black,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
