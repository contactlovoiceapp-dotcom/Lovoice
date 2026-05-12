/* Looking-for onboarding step tests — multi-select validation and navigation on the fourth wizard step. */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import OnboardingLookingForRoute from '../looking-for';
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

describe('OnboardingLookingForRoute', () => {
  it('shows empty error and does not navigate when nothing is selected', () => {
    const { getByRole, getByText } = render(<OnboardingLookingForRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(getByText('Choisis au moins une option.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('navigates to city after selecting a single option', () => {
    const { getByRole } = render(<OnboardingLookingForRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('checkbox', { name: 'Femme' }));
    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding/city');
  });

  it('navigates to city after selecting multiple options', () => {
    const { getByRole } = render(<OnboardingLookingForRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('checkbox', { name: 'Homme' }));
    fireEvent.press(getByRole('checkbox', { name: 'Non-binaire' }));
    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding/city');
    expect(useProfileOnboardingState.getState().lookingFor).toEqual(
      expect.arrayContaining(['male', 'nonbinary']),
    );
  });

  it('deselects an option when pressed a second time', () => {
    const { getByRole } = render(<OnboardingLookingForRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('checkbox', { name: 'Femme' }));
    fireEvent.press(getByRole('checkbox', { name: 'Femme' }));
    fireEvent.press(getByRole('button', { name: 'Continuer' }));

    expect(getByRole('button', { name: 'Continuer' })).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('clears error when an option is selected after a failed attempt', () => {
    const { getByRole, queryByText } = render(<OnboardingLookingForRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Continuer' }));
    fireEvent.press(getByRole('checkbox', { name: 'Autre' }));

    expect(queryByText('Choisis au moins une option.')).toBeNull();
  });

  it('calls router.back() when the back button is pressed', () => {
    const { getByRole } = render(<OnboardingLookingForRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: 'Retour' }));

    expect(mockBack).toHaveBeenCalled();
  });
});
