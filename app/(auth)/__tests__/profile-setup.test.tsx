/* Voice profile setup route tests — save the shared profile setup before entering the feed. */

import React, { type ReactNode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ProfileSetupRoute from '../profile-setup';
import { COPY } from '../../../src/copy';
import { useFeedState } from '../../../src/features/feed/hooks/useFeedState';
import { useAuth } from '../../../src/features/auth/hooks/useAuth';

const mockReplace = jest.fn();
const mockRefreshProfile = jest.fn();
const mockSignOut = jest.fn();
const mockMutateAsync = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    navigate: jest.fn(),
  }),
}));

jest.mock('../../../src/features/auth/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../src/features/profile/api/profileMutations', () => ({
  useUpsertProfile: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

jest.mock('../../../src/features/profile/api/citySearch', () => ({
  searchCities: jest.fn().mockResolvedValue([]),
}));

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}

describe('ProfileSetupRoute', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockRefreshProfile.mockReset();
    mockRefreshProfile.mockResolvedValue(undefined);
    mockSignOut.mockReset();
    mockMutateAsync.mockReset();
    mockMutateAsync.mockResolvedValue(undefined);
    useFeedState.getState().setHasRecordedVoice(false);
    jest.mocked(useAuth).mockReturnValue({
      session: null,
      profile: {
        id: 'user-1',
        display_name: 'Alice',
        birthdate: '1995-01-01',
        gender: 'female',
        looking_for: ['male'],
        city: 'Paris',
        country: 'FR',
        location: 'POINT(2.3522 48.8566)',
        bio_emojis: [],
        created_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
        is_banned: false,
        last_seen_at: null,
        push_token: null,
      },
      isLoading: false,
      error: null,
      refreshProfile: mockRefreshProfile,
      signOut: mockSignOut,
    });
  });

  it('does not show CGU acceptance on profile setup', () => {
    const { getByRole, queryByRole } = render(<ProfileSetupRoute />, { wrapper: Wrapper });
    const cta = getByRole('button', { name: COPY.profile.submitOnboarding });

    expect(cta.props.accessibilityState?.disabled).toBeFalsy();
    expect(queryByRole('checkbox')).toBeNull();
  });

  it('does not show the sign-out button during onboarding', () => {
    const { queryByLabelText } = render(<ProfileSetupRoute />, { wrapper: Wrapper });

    expect(queryByLabelText(COPY.profile.signOutCta)).toBeNull();
  });

  it('navigates to discover after saving the profile setup', async () => {
    const { getByRole } = render(<ProfileSetupRoute />, { wrapper: Wrapper });

    const cta = getByRole('button', { name: COPY.profile.submitOnboarding });

    await act(async () => {
      fireEvent.press(cta);
    });

    expect(useFeedState.getState().hasRecordedVoice).toBe(true);
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
    });
  });
});
