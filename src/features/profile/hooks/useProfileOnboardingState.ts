/* Ephemeral profile onboarding state keeps multi-step form data in memory until Supabase persistence. */

import { create } from 'zustand';

import type { ProfileCoordinates } from '../api/profileMutations';
import type { GenderValue } from '../helpers/validation';

type ProfileOnboardingState = {
  displayName: string;
  birthdate: string;
  gender: GenderValue | null;
  lookingFor: GenderValue[];
  city: string;
  coordinates: ProfileCoordinates | null;
  setDisplayName: (displayName: string) => void;
  setBirthdate: (birthdate: string) => void;
  setGender: (gender: GenderValue) => void;
  toggleLookingFor: (gender: GenderValue) => void;
  setCitySelection: (city: string, coordinates: ProfileCoordinates) => void;
  clearCitySelection: () => void;
  reset: () => void;
};

const initialState = {
  displayName: '',
  birthdate: '',
  gender: null,
  lookingFor: [],
  city: '',
  coordinates: null,
} satisfies Pick<
  ProfileOnboardingState,
  'displayName' | 'birthdate' | 'gender' | 'lookingFor' | 'city' | 'coordinates'
>;

export const useProfileOnboardingState = create<ProfileOnboardingState>()((set) => ({
  ...initialState,
  setDisplayName: (displayName) => set({ displayName }),
  setBirthdate: (birthdate) => set({ birthdate }),
  setGender: (gender) => set({ gender }),
  toggleLookingFor: (gender) =>
    set((state) => ({
      lookingFor: state.lookingFor.includes(gender)
        ? state.lookingFor.filter((value) => value !== gender)
        : [...state.lookingFor, gender],
    })),
  setCitySelection: (city, coordinates) => set({ city, coordinates }),
  clearCitySelection: () => set({ city: '', coordinates: null }),
  reset: () => set(initialState),
}));
