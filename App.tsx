/* Root application shell — manages navigation state, the Discover feed (FlatList), font loading, and safe-area context. */

import React, { useCallback, useReducer, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  Text,
  useWindowDimensions,
  View,
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
  PlayCircle,
  SlidersHorizontal,
  Sparkles,
  StopCircle,
  User,
} from 'lucide-react-native';

import { Profile, ColorTheme, Tab, AppState } from './src/types';
import { COLORS, CTA_GRADIENT } from './src/theme';
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
    theme: ColorTheme.Solaire,
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
    theme: ColorTheme.Posee,
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
    theme: ColorTheme.Actif,
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
    theme: ColorTheme.Mystere,
    isPlaying: false,
    audioDurationSec: 18,
  },
];

/* ─── Navigation reducer ─────────────────────────────────────────────────── */

interface NavState {
  screen: AppState;
  activeTab: Tab;
  hasRecordedVibe: boolean;
}

type NavAction =
  | { type: 'NAVIGATE'; screen: AppState }
  | { type: 'SET_TAB'; tab: Tab }
  | { type: 'FINISH_RECORDING' }
  | { type: 'SKIP_RECORDING' };

const INITIAL_NAV: NavState = {
  screen: 'splash',
  activeTab: 'discover',
  hasRecordedVibe: false,
};

function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'NAVIGATE':
      return { ...state, screen: action.screen };
    case 'SET_TAB':
      return { ...state, activeTab: action.tab };
    case 'FINISH_RECORDING':
      return { ...state, hasRecordedVibe: true, screen: 'onboarding_profile' };
    case 'SKIP_RECORDING':
      return { ...state, hasRecordedVibe: false, screen: 'main' };
    default:
      return state;
  }
}

/* ─── AppContent ─────────────────────────────────────────────────────────── */

function AppContent() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [nav, dispatch] = useReducer(navReducer, INITIAL_NAV);
  const { screen: appState, activeTab, hasRecordedVibe } = nav;

  const [profiles, setProfiles] = useState<Profile[]>(INITIAL_PROFILES);
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const flatListRef = useRef<FlatList<Profile>>(null);

  const navigateTo = useCallback((next: AppState) => {
    dispatch({ type: 'NAVIGATE', screen: next });
  }, []);

  const setActiveTab = useCallback((tab: Tab) => {
    dispatch({ type: 'SET_TAB', tab });
  }, []);

  const isDiscover = activeTab === 'discover';

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

  const handleLike = useCallback((id: string) => {
    setTimeout(() => {
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    }, 800);
  }, []);

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
          onLike={() => handleLike(item.id)}
          onRecordVibe={() => navigateTo('onboarding_record')}
        />
      </View>
    ),
    [windowWidth, windowHeight, togglePlay, handleTrackFinish, hasRecordedVibe, handleLike, navigateTo],
  );

  const renderMainScreen = () => (
    <View className="flex-1 bg-background">
      <View
        className="absolute left-0 right-0 top-0 z-40 flex-row items-center justify-between px-4"
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 8,
          backgroundColor: isDiscover ? 'transparent' : 'rgba(248,245,255,0.95)',
          borderBottomWidth: isDiscover ? 0 : 1,
          borderBottomColor: 'rgba(75,22,76,0.05)',
        }}
      >
        <Image source={LOGO} style={{ height: 40, width: 100 }} resizeMode="contain" />

        <View className="flex-row items-center gap-2">
          {isDiscover && (
            <Pressable
              onPress={() => setAutoplay(!autoplay)}
              className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                autoplay
                  ? 'border-primary/50 bg-primary/20'
                  : 'border-white/10 bg-white/10'
              }`}
            >
              {autoplay ? (
                <PlayCircle size={14} color={COLORS.primary} />
              ) : (
                <StopCircle size={14} color="rgba(255,255,255,0.4)" />
              )}
              <Text
                className={`text-xs font-semibold ${
                  autoplay ? 'text-primary' : 'text-white/40'
                }`}
              >
                Auto {autoplay ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => setShowFilters(true)}
            className={`rounded-full p-2 ${
              isDiscover ? 'bg-white/10' : 'bg-dark/5'
            }`}
          >
            <SlidersHorizontal
              size={18}
              color={isDiscover ? 'rgba(255,255,255,0.5)' : 'rgba(75,22,76,0.4)'}
            />
          </Pressable>

          <Pressable
            onPress={() =>
              hasRecordedVibe
                ? setActiveTab('my-vibes')
                : navigateTo('onboarding_record')
            }
            className={`rounded-full p-2 ${
              isDiscover ? 'bg-white/10' : 'bg-dark/5'
            }`}
          >
            <User
              size={18}
              color={isDiscover ? 'rgba(255,255,255,0.5)' : 'rgba(75,22,76,0.4)'}
            />
          </Pressable>
        </View>
      </View>

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
              getItemLayout={(_, index) => ({
                length: windowHeight,
                offset: windowHeight * index,
                index,
              })}
              ListFooterComponent={
                <View
                  style={{ height: windowHeight * 0.4 }}
                  className="items-center justify-center bg-background"
                >
                  <Pressable
                    onPress={handleLoadMore}
                    disabled={isGenerating}
                    className="flex-row items-center gap-2 rounded-full border border-dark/10 bg-dark/5 px-6 py-3"
                    style={{ opacity: isGenerating ? 0.4 : 1 }}
                  >
                    {isGenerating ? (
                      <Text className="text-sm font-medium text-dark/50">
                        Recherche de vibes...
                      </Text>
                    ) : (
                      <>
                        <Sparkles size={16} color={COLORS.secondary} />
                        <Text className="text-sm font-medium text-dark/50">
                          Découvrir plus de vibes
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              }
            />
          ) : (
            <View className="flex-1 items-center justify-center px-6">
              <View className="mb-6 h-24 w-24 items-center justify-center rounded-full bg-primary/10">
                <Sparkles size={40} color={COLORS.primary} />
              </View>
              <Text className="mb-2 text-center text-2xl font-bold text-dark">
                Plus de vibes !
              </Text>
              <Text className="mb-8 max-w-[250px] text-center text-dark/40">
                Tu as écouté toutes les Vibes du coin. Élargis tes filtres ou
                reviens plus tard.
              </Text>
              <Pressable onPress={() => setShowFilters(true)}>
                <LinearGradient
                  colors={[...CTA_GRADIENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  className="rounded-full px-8 py-3"
                >
                  <Text className="text-center font-bold text-white">
                    Modifier mes filtres
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}
        </>
      )}

      {activeTab === 'likes' && (
        <View
          className="flex-1 px-4 pb-28"
          style={{ paddingTop: insets.top + 56 }}
        >
          <LikesScreen />
        </View>
      )}

      {activeTab === 'my-vibes' && (
        <View className="absolute inset-0 z-50 bg-background">
          <MyVibeScreen
            onBack={() => setActiveTab('discover')}
            onSend={() => setActiveTab('discover')}
            hasRecordedVibe={hasRecordedVibe}
          />
        </View>
      )}

      {activeTab === 'messages' && (
        <View
          className="flex-1 px-4 pb-28"
          style={{ paddingTop: insets.top + 56 }}
        >
          <MessagesScreen />
        </View>
      )}

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
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
            onNext={() => dispatch({ type: 'FINISH_RECORDING' })}
            onSkip={() => dispatch({ type: 'SKIP_RECORDING' })}
          />
        );
      case 'onboarding_profile':
        return (
          <MyVibeScreen
            onBack={() => navigateTo('onboarding_record')}
            onSend={() => navigateTo('main')}
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
    <View className="flex-1 bg-background">
      <StatusBar style={isDiscover && appState === 'main' ? 'light' : 'dark'} />
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
