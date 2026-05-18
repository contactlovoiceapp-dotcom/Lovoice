/* Zustand store for transient Discover feed UI state.
   Filters are session-only (reset on cold start) per Phase 5 decision. */

import { create } from 'zustand';

export interface FeedFilters {
  /** Inclusive lower age bound. */
  minAge: number;
  /** Inclusive upper age bound. */
  maxAge: number;
  /** Max distance in metres. null = unlimited. */
  maxDistanceMeters: number | null;
}

export const DEFAULT_FILTERS: FeedFilters = {
  minAge: 18,
  maxAge: 80,
  maxDistanceMeters: null,
};

interface FeedState {
  autoplay: boolean;
  filters: FeedFilters;
  setAutoplay: (value: boolean) => void;
  setFilters: (filters: FeedFilters) => void;
  resetFilters: () => void;
}

export const useFeedState = create<FeedState>((set) => ({
  autoplay: false,
  filters: DEFAULT_FILTERS,
  setAutoplay: (value) => set({ autoplay: value }),
  setFilters: (filters) => set({ filters }),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}));
