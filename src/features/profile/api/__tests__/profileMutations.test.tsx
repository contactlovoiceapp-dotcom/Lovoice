/* Tests for profile upsert helpers and mutation side effects. */

import React, { type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { Database } from '@/types/database';
import {
  buildProfileUpsertPayload,
  coordinatesToPostgisPoint,
  getProfileCountryFromSession,
  useUpsertProfile,
  type UpsertProfileInput,
} from '../profileMutations';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

const mockRefreshProfile = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

function createSession(phone = '+33612345678'): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-123',
      phone,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-05-01T00:00:00.000Z',
    },
  } as unknown as Session;
}

function createSessionWithoutPhone(): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-123',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-05-01T00:00:00.000Z',
    },
  } as unknown as Session;
}

function createProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'user-123',
    display_name: 'Alice',
    birthdate: '1995-01-01',
    gender: 'female',
    looking_for: ['male'],
    city: 'Paris',
    country: 'FR',
    location: 'POINT(2.3522 48.8566)',
    bio_emojis: [],
    created_at: '2026-05-01T00:00:00.000Z',
    deleted_at: null,
    is_banned: false,
    last_seen_at: null,
    push_token: null,
    ...overrides,
  };
}

const validInput: UpsertProfileInput = {
  displayName: ' Alice ',
  birthdate: '1995-01-01',
  gender: 'female',
  lookingFor: ['male', 'nonbinary'],
  city: ' Paris ',
  coordinates: {
    latitude: 48.8566,
    longitude: 2.3522,
  },
};

function createWrapper(): React.ComponentType<{ children: ReactNode }> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('coordinatesToPostgisPoint', () => {
  it('formats coordinates as a PostGIS WKT point with longitude first', () => {
    expect(coordinatesToPostgisPoint({ latitude: 48.8566, longitude: 2.3522 })).toBe(
      'POINT(2.3522 48.8566)',
    );
  });

  it('returns undefined when coordinates are omitted', () => {
    expect(coordinatesToPostgisPoint(null)).toBeUndefined();
    expect(coordinatesToPostgisPoint(undefined)).toBeUndefined();
  });

  it('rejects impossible latitude values', () => {
    expect(() => coordinatesToPostgisPoint({ latitude: 91, longitude: 2 })).toThrow(
      'profile.location_invalid',
    );
  });

  it('rejects impossible longitude values', () => {
    expect(() => coordinatesToPostgisPoint({ latitude: 48, longitude: 181 })).toThrow(
      'profile.location_invalid',
    );
  });
});

describe('getProfileCountryFromSession', () => {
  it.each([
    ['+33612345678', 'FR'],
    ['+32470123456', 'BE'],
    ['+41781234567', 'CH'],
  ])('derives %s as %s', (phone, country) => {
    expect(getProfileCountryFromSession(createSession(phone))).toBe(country);
  });

  it('throws when the session has no phone', () => {
    expect(() => getProfileCountryFromSession(createSessionWithoutPhone())).toThrow(
      'profile.phone_missing',
    );
  });

  it('throws when the phone prefix is unsupported', () => {
    expect(() => getProfileCountryFromSession(createSession('+14155550123'))).toThrow(
      'profile.country_unsupported',
    );
  });
});

describe('buildProfileUpsertPayload', () => {
  it('trims display fields and derives country from the session phone', () => {
    expect(buildProfileUpsertPayload(validInput, createSession())).toEqual({
      id: 'user-123',
      display_name: 'Alice',
      birthdate: '1995-01-01',
      gender: 'female',
      looking_for: ['male', 'nonbinary'],
      city: 'Paris',
      country: 'FR',
      location: 'POINT(2.3522 48.8566)',
    });
  });
});

describe('useUpsertProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefreshProfile.mockResolvedValue(undefined);
    jest.mocked(useAuth).mockReturnValue({
      session: createSession(),
      profile: null,
      isLoading: false,
      error: null,
      refreshProfile: mockRefreshProfile,
      signOut: jest.fn(),
    });
  });

  it('upserts the profile, invalidates query state, and refreshes auth profile', async () => {
    const returnedProfile = createProfile();
    const single = jest.fn().mockResolvedValue({ data: returnedProfile, error: null });
    const select = jest.fn(() => ({ single }));
    const upsert = jest.fn(() => ({ select }));
    const from = jest.fn(() => ({ upsert }));

    jest.mocked(getSupabaseClient).mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result, unmount } = renderHook(() => useUpsertProfile(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync(validInput);
    });

    expect(from).toHaveBeenCalledWith('profiles');
    expect(upsert).toHaveBeenCalledWith(
      {
        id: 'user-123',
        display_name: 'Alice',
        birthdate: '1995-01-01',
        gender: 'female',
        looking_for: ['male', 'nonbinary'],
        city: 'Paris',
        country: 'FR',
        location: 'POINT(2.3522 48.8566)',
      },
      { onConflict: 'id' },
    );
    expect(select).toHaveBeenCalledWith('*');
    expect(single).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
    });

    unmount();
  });

  it('throws a clear error when there is no active session', async () => {
    jest.mocked(useAuth).mockReturnValue({
      session: null,
      profile: null,
      isLoading: false,
      error: null,
      refreshProfile: mockRefreshProfile,
      signOut: jest.fn(),
    });

    const { result, unmount } = renderHook(() => useUpsertProfile(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.mutateAsync(validInput)).rejects.toThrow('profile.session_missing');
    });
    expect(getSupabaseClient).not.toHaveBeenCalled();

    unmount();
  });

  it('surfaces Supabase mutation errors', async () => {
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'profile.birthdate_age_minimum' },
    });
    const select = jest.fn(() => ({ single }));
    const upsert = jest.fn(() => ({ select }));
    const from = jest.fn(() => ({ upsert }));

    jest.mocked(getSupabaseClient).mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result, unmount } = renderHook(() => useUpsertProfile(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.mutateAsync(validInput)).rejects.toThrow(
        'profile.birthdate_age_minimum',
      );
    });
    expect(mockRefreshProfile).not.toHaveBeenCalled();

    unmount();
  });
});
