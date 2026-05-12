/* Birthdate onboarding step tests — age gate and navigation on the second wizard step. */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import OnboardingBirthdateRoute from '../birthdate';
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

describe('OnboardingBirthdateRoute', () => {
  it('shows invalid_date error and does not navigate when birthdate is empty', () => {
    const { getByRole, getByText } = render(<OnboardingBirthdateRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(getByText('Entre une date valide.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows invalid_date error for a malformed date string', () => {
    useProfileOnboardingState.getState().setBirthdate('99 / 99 / 9999');

    const { getByRole, getByText } = render(<OnboardingBirthdateRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(getByText('Entre une date valide.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows underage error for a user born less than 18 years ago', () => {
    const recentYear = new Date().getFullYear() - 10;
    useProfileOnboardingState.getState().setBirthdate(`01 / 01 / ${recentYear}`);

    const { getByRole, getAllByText } = render(<OnboardingBirthdateRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    // The underage message appears both in the subtitle and as the error — both must be present.
    expect(getAllByText('Tu dois avoir au moins 18 ans pour rejoindre Lovoice.').length).toBeGreaterThanOrEqual(2);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('navigates to gender when birthdate is valid and user is 18+', () => {
    useProfileOnboardingState.getState().setBirthdate('01 / 01 / 1995');

    const { getByRole } = render(<OnboardingBirthdateRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding/gender');
  });

  it('calls router.back() when the back button is pressed', () => {
    const { getByRole } = render(<OnboardingBirthdateRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Retour' }));

    expect(mockBack).toHaveBeenCalled();
  });
});
