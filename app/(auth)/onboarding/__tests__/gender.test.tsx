/* Gender onboarding step tests — single-select validation and navigation on the third wizard step. */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import OnboardingGenderRoute from '../gender';
import { useProfileOnboardingState } from '@/features/profile/hooks/useProfileOnboardingState';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  useProfileOnboardingState.getState().reset();
});

describe('OnboardingGenderRoute', () => {
  it('shows invalid error and does not navigate when no gender is selected', () => {
    const { getByRole, getByText } = render(<OnboardingGenderRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(getByText('Sélectionne un genre pour continuer.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('navigates to looking-for after selecting Femme', () => {
    const { getByRole } = render(<OnboardingGenderRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Femme' }));
    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding/looking-for');
  });

  it('navigates to looking-for after selecting Homme', () => {
    const { getByRole } = render(<OnboardingGenderRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Homme' }));
    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding/looking-for');
  });

  it('navigates to looking-for after selecting Non-binaire', () => {
    const { getByRole } = render(<OnboardingGenderRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Non-binaire' }));
    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding/looking-for');
  });

  it('navigates to looking-for after selecting Autre', () => {
    const { getByRole } = render(<OnboardingGenderRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Autre' }));
    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding/looking-for');
  });

  it('clears error when a gender option is selected after a failed attempt', () => {
    const { getByRole, queryByText } = render(<OnboardingGenderRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Continuer' }));
    fireEvent.press(getByRole('button', { name: 'Femme' }));

    expect(queryByText('Sélectionne un genre pour continuer.')).toBeNull();
  });

  it('calls router.back() when the back button is pressed', () => {
    const { getByRole } = render(<OnboardingGenderRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Retour' }));

    expect(mockBack).toHaveBeenCalled();
  });
});
