/* Terms onboarding step tests — guard CGU acceptance before profile data collection starts. */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import OnboardingTermsRoute from '../terms';
import { COPY } from '../../../../src/copy';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}

describe('OnboardingTermsRoute', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('shows the community values before signup profile setup', () => {
    const { getByText } = render(<OnboardingTermsRoute />, { wrapper: Wrapper });

    expect(getByText(COPY.home.values[0].title)).toBeTruthy();
    expect(getByText(COPY.home.values[1].title)).toBeTruthy();
    expect(getByText(COPY.home.values[2].title)).toBeTruthy();
  });

  it('blocks continuing until the CGU are accepted', () => {
    const { getByRole, getByText } = render(<OnboardingTermsRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('button', { name: COPY.onboarding.terms.cta }));

    expect(mockPush).not.toHaveBeenCalled();
    expect(getByText(COPY.onboarding.terms.errorRequired)).toBeTruthy();
  });

  it('continues to the profile wizard after CGU acceptance', () => {
    const { getByRole } = render(<OnboardingTermsRoute />, { wrapper: Wrapper });

    fireEvent.press(getByRole('checkbox'));
    fireEvent.press(getByRole('button', { name: COPY.onboarding.terms.cta }));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding/name');
  });
});
