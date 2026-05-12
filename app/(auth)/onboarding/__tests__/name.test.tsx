/* Name onboarding step tests — validation and navigation on the first wizard step. */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import OnboardingNameRoute from '../name';
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

describe('OnboardingNameRoute', () => {
  it('shows too_short error and does not navigate when name is empty', () => {
    const { getByRole, getByText } = render(<OnboardingNameRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(getByText('Ton prénom doit contenir au moins 2 caractères.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows too_short error when name is one character', () => {
    useProfileOnboardingState.getState().setDisplayName('A');

    const { getByRole, getByText } = render(<OnboardingNameRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(getByText('Ton prénom doit contenir au moins 2 caractères.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows too_long error when name exceeds 30 characters', () => {
    useProfileOnboardingState.getState().setDisplayName('A'.repeat(31));

    const { getByRole, getByText } = render(<OnboardingNameRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(getByText('Ton prénom ne peut pas dépasser 30 caractères.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('navigates to birthdate when name is valid', () => {
    useProfileOnboardingState.getState().setDisplayName('Alice');

    const { getByRole } = render(<OnboardingNameRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding/birthdate');
  });

  it('clears error when the user types after a failed attempt', () => {
    const { getByRole, getByPlaceholderText, queryByText } = render(<OnboardingNameRoute />, {
      wrapper: Wrapper,
    });

    fireEvent.press(getByRole('button', { name: 'Continuer' }));
    fireEvent.changeText(getByPlaceholderText('Ton prénom'), 'Al');

    expect(queryByText('Ton prénom doit contenir au moins 2 caractères.')).toBeNull();
  });

  it('calls router.back() when the back button is pressed', () => {
    const { getByRole } = render(<OnboardingNameRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Retour' }));

    expect(mockBack).toHaveBeenCalled();
  });
});
