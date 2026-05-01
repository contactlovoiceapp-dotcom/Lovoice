/* City onboarding step tests — guard the profile upsert and routing on signup completion. */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import OnboardingCityRoute from '../city';
import { useProfileOnboardingState } from '@/features/profile/hooks/useProfileOnboardingState';
import { useUpsertProfile } from '@/features/profile/api/profileMutations';
import { searchCities } from '@/features/profile/api/citySearch';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('@/features/profile/api/profileMutations', () => ({
  useUpsertProfile: jest.fn(),
}));

jest.mock('@/features/profile/api/citySearch', () => ({
  searchCities: jest.fn(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}

function seedCompleteWizard() {
  const state = useProfileOnboardingState.getState();
  state.setDisplayName('Alice');
  state.setBirthdate('01 / 01 / 1995');
  state.setGender('female');
  state.toggleLookingFor('male');
  state.setCitySelection('Paris', { latitude: 48.8566, longitude: 2.3522 });
}

const mutateAsync = jest.fn();

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({ id: 'u1' });
  jest.mocked(useUpsertProfile).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as never);
  jest.mocked(searchCities).mockResolvedValue([]);
  useProfileOnboardingState.getState().reset();
});

describe('OnboardingCityRoute', () => {
  it('upserts the profile and routes to record when all wizard data is valid', async () => {
    seedCompleteWizard();

    const { getByRole } = render(<OnboardingCityRoute />, { wrapper: Wrapper });
    const cta = getByRole('button', { name: 'Continuer' });

    await act(async () => {
      fireEvent.press(cta);
    });

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        displayName: 'Alice',
        birthdate: '1995-01-01',
        gender: 'female',
        lookingFor: ['male'],
        city: 'Paris',
        coordinates: { latitude: 48.8566, longitude: 2.3522 },
      });
      expect(mockPush).toHaveBeenCalledWith('/(auth)/record');
    });
  });

  it('blocks submission and shows wizard_incomplete when an upstream field is missing', async () => {
    seedCompleteWizard();
    useProfileOnboardingState.getState().setDisplayName('');

    const { getByRole, findByText } = render(<OnboardingCityRoute />, { wrapper: Wrapper });

    await act(async () => {
      fireEvent.press(getByRole('button', { name: 'Continuer' }));
    });

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    await findByText("Une étape précédente est manquante. Reprends l'onboarding depuis le début.");
  });

  it('shows save_failed and stays on the screen when the upsert rejects', async () => {
    seedCompleteWizard();
    mutateAsync.mockRejectedValueOnce(new Error('network'));

    const { getByRole, findByText } = render(<OnboardingCityRoute />, { wrapper: Wrapper });

    await act(async () => {
      fireEvent.press(getByRole('button', { name: 'Continuer' }));
    });

    await findByText("Impossible d'enregistrer ton profil. Réessaie dans quelques instants.");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('blocks submission with select_result when no city has been confirmed', async () => {
    seedCompleteWizard();
    useProfileOnboardingState.getState().clearCitySelection();

    const { getByRole, findByText } = render(<OnboardingCityRoute />, { wrapper: Wrapper });

    await act(async () => {
      fireEvent.press(getByRole('button', { name: 'Continuer' }));
    });

    expect(mutateAsync).not.toHaveBeenCalled();
    await findByText('Indique ta ville pour continuer.');
  });
});
