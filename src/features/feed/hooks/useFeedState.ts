/* Zustand store for the Discover feed — keeps local simulated feed and voice-gate state. */

import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { Profile } from '../../../types';
import { ColorTheme } from '../../../types';
import { generateNewProfile } from '../../../services/mockProfilesService';

const secureStoreStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

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

interface FeedState {
  profiles: Profile[];
  likedIds: Set<string>;
  autoplay: boolean;
  activeProfileIndex: number;
  isGenerating: boolean;
  hasRecordedVoice: boolean;

  setActiveProfileIndex: (index: number) => void;
  setAutoplay: (value: boolean) => void;
  setHasRecordedVoice: (value: boolean) => void;

  toggleLike: (id: string) => void;
  togglePlay: (id: string) => void;
  handleTrackFinish: (finishedId: string) => void;
  loadMore: () => Promise<void>;

  likedProfiles: () => Profile[];
  receivedLikeProfiles: () => Profile[];
}

export const useFeedState = create<FeedState>()(
  persist(
    (set, get) => ({
      profiles: INITIAL_PROFILES,
      likedIds: new Set<string>(),
      autoplay: false,
      activeProfileIndex: 0,
      isGenerating: false,
      hasRecordedVoice: false,

      setActiveProfileIndex: (index) => set({ activeProfileIndex: index }),
      setAutoplay: (value) => set({ autoplay: value }),
      setHasRecordedVoice: (value) => set({ hasRecordedVoice: value }),

      toggleLike: (id) =>
        set((state) => {
          const next = new Set(state.likedIds);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return { likedIds: next };
        }),

      togglePlay: (id) =>
        set((state) => ({
          profiles: state.profiles.map((p) => ({
            ...p,
            isPlaying: p.id === id ? !p.isPlaying : false,
          })),
        })),

      handleTrackFinish: (finishedId) => {
        const { autoplay, profiles } = get();
        set({
          profiles: profiles.map((p) => ({ ...p, isPlaying: false })),
        });
        if (autoplay) {
          const currentIndex = profiles.findIndex((p) => p.id === finishedId);
          if (currentIndex !== -1 && currentIndex < profiles.length - 1) {
            const nextId = profiles[currentIndex + 1].id;
            setTimeout(() => {
              set((state) => ({
                profiles: state.profiles.map((p) => ({
                  ...p,
                  isPlaying: p.id === nextId,
                })),
                activeProfileIndex: currentIndex + 1,
              }));
            }, 500);
          }
        }
      },

      loadMore: async () => {
        const { isGenerating } = get();
        if (isGenerating) return;
        set({ isGenerating: true });
        const newProfile = await generateNewProfile();
        if (newProfile) {
          set((state) => ({
            profiles: [...state.profiles, newProfile],
          }));
        }
        set({ isGenerating: false });
      },

      likedProfiles: () => {
        const { profiles, likedIds } = get();
        return profiles.filter((p) => likedIds.has(p.id));
      },

      receivedLikeProfiles: () => {
        const { profiles } = get();
        return profiles.slice(0, 2);
      },
    }),
    {
      name: 'lovoice-feed-state',
      storage: createJSONStorage(() => secureStoreStorage),
      partialize: (state) => ({ hasRecordedVoice: state.hasRecordedVoice }),
    },
  ),
);
