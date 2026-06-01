/* Profile route tests — protect the sign-out flow and edit form from regressions. */

import React, { type ReactNode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ProfileRoute from '..';
import { useAuth } from '../../../../src/features/auth/hooks/useAuth';
import type { Database } from '../../../../src/types/database';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

const mockReplace = jest.fn();
const mockSignOut = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    navigate: jest.fn(),
  }),
  useFocusEffect: (cb: () => void) => cb(),
}));

jest.mock('../../../../src/features/auth/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../../src/features/profile/api/profileMutations', () => ({
  useUpsertProfile: () => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}));

jest.mock('../../../../src/features/profile/api/citySearch', () => ({
  searchCities: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../../src/features/voices/api/voiceQueries', () => ({
  useActiveVoice: () => ({ data: null, isLoading: false, isFetching: false, isError: false }),
  useVoiceSignedUrl: () => ({ data: null, isLoading: false, isError: false }),
}));

jest.mock('../../../../src/features/voices/api/voiceMutations', () => ({
  useUpdateVoice: () => ({ mutateAsync: jest.fn().mockResolvedValue(undefined), isPending: false }),
  useDeleteVoice: () => ({ mutateAsync: jest.fn().mockResolvedValue(undefined), isPending: false }),
}));

jest.mock('../../../../src/features/voices/hooks/useVoicePlayer', () => ({
  useVoicePlayer: () => ({
    isPlaying: false,
    durationMs: 0,
    positionMs: 0,
    play: jest.fn(),
    pause: jest.fn(),
    seek: jest.fn(),
    stop: jest.fn(),
    unload: jest.fn(),
  }),
}));

jest.mock('../../../../src/features/profile/components/ProfileAccountPrivacySection', () => ({
  ProfileAccountPrivacySection: () => null,
}));

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}

function makeProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
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
    ...overrides,
  };
}

describe('ProfileRoute', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue(undefined);
    jest.mocked(useAuth).mockReturnValue({
      session: null,
      profile: makeProfile(),
      isLoading: false,
      error: null,
      refreshProfile: jest.fn(),
      signOut: mockSignOut,
    });
  });

  it('signs out and returns to auth home', async () => {
    const { getByRole } = render(<ProfileRoute />, { wrapper: Wrapper });
    const signOutButton = getByRole('button', { name: 'Se déconnecter' });

    await act(async () => {
      fireEvent.press(signOutButton);
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the user on profile when sign out fails', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('Network error'));

    const { getByRole } = render(<ProfileRoute />, { wrapper: Wrapper });
    const signOutButton = getByRole('button', { name: 'Se déconnecter' });

    await act(async () => {
      fireEvent.press(signOutButton);
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
