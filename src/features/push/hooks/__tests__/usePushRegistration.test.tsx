/* Tests for usePushRegistration hook: token registration and Supabase update logic. */
/* eslint-disable import/first -- jest.mock must precede imports under test */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

jest.mock('@/lib/push', () => ({
  registerForPushNotificationsAsync: jest.fn(),
}));

import { useAuth } from '@/features/auth/hooks/useAuth';
import { getSupabaseClient } from '@/lib/supabase';
import { registerForPushNotificationsAsync } from '@/lib/push';
import { usePushRegistration } from '../usePushRegistration';

function createSession(userId: string): Session {
  return {
    access_token: `access-${userId}`,
    refresh_token: `refresh-${userId}`,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-04-30T00:00:00.000Z',
    },
  } as unknown as Session;
}

function createProfile(userId: string, pushToken: string | null = null): Profile {
  return {
    id: userId,
    display_name: 'Test User',
    birthdate: '1995-01-01',
    gender: 'other',
    looking_for: ['other'],
    city: 'Paris',
    location: null,
    country: 'FR',
    bio_emojis: [],
    created_at: '2026-04-30T00:00:00.000Z',
    last_seen_at: null,
    likes_seen_at: null,
    push_token: pushToken,
    is_banned: false,
    deleted_at: null,
  };
}

function HookConsumer() {
  usePushRegistration();
  return null;
}

describe('usePushRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when session is null', async () => {
    jest.mocked(useAuth).mockReturnValue({
      session: null,
      profile: null,
      isLoading: false,
      error: null,
      refreshProfile: jest.fn(),
      signOut: jest.fn(),
    });

    render(<HookConsumer />);

    await waitFor(() => {
      expect(registerForPushNotificationsAsync).not.toHaveBeenCalled();
    });
  });

  it('does nothing when profile is null', async () => {
    jest.mocked(useAuth).mockReturnValue({
      session: createSession('user-1'),
      profile: null,
      isLoading: false,
      error: null,
      refreshProfile: jest.fn(),
      signOut: jest.fn(),
    });

    render(<HookConsumer />);

    await waitFor(() => {
      expect(registerForPushNotificationsAsync).not.toHaveBeenCalled();
    });
  });

  it('calls registerForPushNotificationsAsync when session and profile are present', async () => {
    jest.mocked(useAuth).mockReturnValue({
      session: createSession('user-1'),
      profile: createProfile('user-1'),
      isLoading: false,
      error: null,
      refreshProfile: jest.fn(),
      signOut: jest.fn(),
    });

    jest.mocked(registerForPushNotificationsAsync).mockResolvedValue(null);

    render(<HookConsumer />);

    await waitFor(() => {
      expect(registerForPushNotificationsAsync).toHaveBeenCalledTimes(1);
    });
  });

  it('updates profiles.push_token when a new token is returned', async () => {
    const userId = 'user-1';
    const newToken = 'ExponentPushToken[new]';

    jest.mocked(useAuth).mockReturnValue({
      session: createSession(userId),
      profile: createProfile(userId, null),
      isLoading: false,
      error: null,
      refreshProfile: jest.fn(),
      signOut: jest.fn(),
    });

    jest.mocked(registerForPushNotificationsAsync).mockResolvedValue(newToken);

    const eqMock = jest.fn().mockResolvedValue({ error: null });
    const updateMock = jest.fn(() => ({ eq: eqMock }));
    const fromMock = jest.fn(() => ({ update: updateMock }));

    jest.mocked(getSupabaseClient).mockReturnValue({
      from: fromMock,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    render(<HookConsumer />);

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ push_token: newToken });
      expect(eqMock).toHaveBeenCalledWith('id', userId);
    });
  });

  it('does not update Supabase when token matches the stored push_token', async () => {
    const userId = 'user-1';
    const existingToken = 'ExponentPushToken[existing]';

    jest.mocked(useAuth).mockReturnValue({
      session: createSession(userId),
      profile: createProfile(userId, existingToken),
      isLoading: false,
      error: null,
      refreshProfile: jest.fn(),
      signOut: jest.fn(),
    });

    jest.mocked(registerForPushNotificationsAsync).mockResolvedValue(existingToken);

    const fromMock = jest.fn();
    jest.mocked(getSupabaseClient).mockReturnValue({
      from: fromMock,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    render(<HookConsumer />);

    await waitFor(() => {
      expect(registerForPushNotificationsAsync).toHaveBeenCalledTimes(1);
    });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it('does not update Supabase when registerForPushNotificationsAsync returns null', async () => {
    const userId = 'user-1';

    jest.mocked(useAuth).mockReturnValue({
      session: createSession(userId),
      profile: createProfile(userId, null),
      isLoading: false,
      error: null,
      refreshProfile: jest.fn(),
      signOut: jest.fn(),
    });

    jest.mocked(registerForPushNotificationsAsync).mockResolvedValue(null);

    const fromMock = jest.fn();
    jest.mocked(getSupabaseClient).mockReturnValue({
      from: fromMock,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    render(<HookConsumer />);

    await waitFor(() => {
      expect(registerForPushNotificationsAsync).toHaveBeenCalledTimes(1);
    });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it('does not throw when the Supabase update fails', async () => {
    const userId = 'user-1';
    const newToken = 'ExponentPushToken[new]';

    jest.mocked(useAuth).mockReturnValue({
      session: createSession(userId),
      profile: createProfile(userId, null),
      isLoading: false,
      error: null,
      refreshProfile: jest.fn(),
      signOut: jest.fn(),
    });

    jest.mocked(registerForPushNotificationsAsync).mockResolvedValue(newToken);

    const eqMock = jest.fn().mockResolvedValue({ error: { message: 'Network error' } });
    const updateMock = jest.fn(() => ({ eq: eqMock }));
    const fromMock = jest.fn(() => ({ update: updateMock }));

    jest.mocked(getSupabaseClient).mockReturnValue({
      from: fromMock,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    expect(() => render(<HookConsumer />)).not.toThrow();

    // Component must not crash even after the async error resolves.
    await waitFor(() => {
      expect(eqMock).toHaveBeenCalled();
    });
  });
});
