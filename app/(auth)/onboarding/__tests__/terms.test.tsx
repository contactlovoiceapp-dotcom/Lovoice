/* Terms onboarding route tests — protects CGU and privacy acceptance before profile collection. */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import TermsRoute from '../terms';
import { useProfileOnboardingState } from '../../../../src/features/profile/hooks/useProfileOnboardingState';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
  }),
}));

jest.mock('expo-linking', () => ({
  openURL: jest.fn(),
}));

describe('TermsRoute', () => {
  beforeEach(() => {
    mockPush.mockClear();
    jest.mocked(Linking.openURL).mockClear();
    useProfileOnboardingState.getState().reset();
  });

  it('blocks navigation until the terms checkbox is accepted', () => {
    const { getByRole, getByText } = render(<TermsRoute />);

    fireEvent.press(getByRole('button', { name: "C'est parti !" }));

    expect(getByText('Tu dois accepter les conditions pour continuer.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('stores acceptance and routes to the name step', () => {
    const { getByRole } = render(<TermsRoute />);

    fireEvent.press(getByRole('checkbox'));
    fireEvent.press(getByRole('button', { name: "C'est parti !" }));

    expect(useProfileOnboardingState.getState().acceptedTerms).toBe(true);
    expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding/name');
  });

  it('opens CGU and privacy links externally', () => {
    const { getByText } = render(<TermsRoute />);

    fireEvent.press(getByText("Conditions d'utilisation"));
    fireEvent.press(getByText('Politique de confidentialité'));

    expect(Linking.openURL).toHaveBeenCalledWith('https://lovoice.app/conditions-utilisation');
    expect(Linking.openURL).toHaveBeenCalledWith('https://lovoice.app/politique-confidentialite');
  });
});
