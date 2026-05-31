/* First-visit coach mark for the Discover feed — persisted via SecureStore so it shows only once. */

import { useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORAGE_KEY = 'discover_swipe_hint_dismissed';
const DISMISSED_VALUE = '1';

interface DiscoverSwipeHintState {
  dismissed: boolean;
  hydrated: boolean;
  hydrate: () => void;
  dismiss: () => void;
}

export const useDiscoverSwipeHintStore = create<DiscoverSwipeHintState>((set) => ({
  dismissed: false,
  hydrated: false,

  hydrate: () => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((value) => {
        set({ dismissed: value === DISMISSED_VALUE, hydrated: true });
      })
      .catch(() => {
        set({ hydrated: true });
      });
  },

  dismiss: () => {
    set({ dismissed: true });
    SecureStore.setItemAsync(STORAGE_KEY, DISMISSED_VALUE).catch(() => {
      // Best-effort persistence.
    });
  },
}));

export function useDiscoverSwipeHint(): {
  visible: boolean;
  dismiss: () => void;
} {
  const { dismissed, hydrated, hydrate, dismiss } = useDiscoverSwipeHintStore();

  useEffect(() => {
    if (!hydrated) {
      hydrate();
    }
  }, [hydrated, hydrate]);

  return {
    visible: hydrated && !dismissed,
    dismiss,
  };
}
