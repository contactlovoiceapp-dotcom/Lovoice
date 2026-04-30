/* Tests for auth session/profile state coordination. */

import React, { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/lib/supabase';
import type { Database } from '@/types/database';
import { AuthProvider, useAuth } from '../useAuth';

type Profile = Database['public']['Tables']['profiles']['Row'];

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolveDeferred: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve;
  });

  if (!resolveDeferred) {
    throw new Error('Failed to create deferred promise.');
  }

  return {
    promise,
    resolve: resolveDeferred,
  };
}

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

function createProfile(userId: string): Profile {
  return {
    id: userId,
    display_name: `Profile ${userId}`,
    birthdate: '1995-01-01',
    gender: 'other',
    looking_for: ['other'],
    city: 'Paris',
    location: null,
    country: 'FR',
    bio_emojis: [],
    created_at: '2026-04-30T00:00:00.000Z',
    last_seen_at: null,
    push_token: null,
    is_banned: false,
    deleted_at: null,
  };
}

function AuthProbe({
  onChange,
}: {
  onChange: (value: ReturnType<typeof useAuth>) => void;
}) {
  const auth = useAuth();

  useEffect(() => {
    onChange(auth);
  }, [auth, onChange]);

  return null;
}

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

describe('AuthProvider', () => {
  it('ignores stale profile responses when the session changes mid-load', async () => {
    const initialSession = createSession('user-a');
    const nextSession = createSession('user-b');
    const initialProfileRequest = createDeferred<{ data: Profile; error: null }>();
    const nextProfileRequest = createDeferred<{ data: Profile; error: null }>();
    let authStateCallback:
      | ((_event: string, nextSession: Session | null) => void)
      | null = null;
    let latestAuth: ReturnType<typeof useAuth> | null = null;
    const getLatestAuth = () => {
      if (!latestAuth) {
        throw new Error('Auth state was not captured.');
      }

      return latestAuth;
    };

    jest.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: initialSession },
          error: null,
        }),
        onAuthStateChange: jest.fn((callback) => {
          authStateCallback = callback;
          return {
            data: {
              subscription: {
                unsubscribe: jest.fn(),
              },
            },
          };
        }),
        signOut: jest.fn(),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn((_column: string, userId: string) => ({
            maybeSingle: jest.fn(() =>
              userId === 'user-a'
                ? initialProfileRequest.promise
                : nextProfileRequest.promise,
            ),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof getSupabaseClient>);

    render(
      <AuthProvider>
        <AuthProbe
          onChange={(value) => {
            latestAuth = value;
          }}
        />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getLatestAuth().session?.user.id).toBe('user-a');
    });

    act(() => {
      authStateCallback?.('SIGNED_IN', nextSession);
    });

    await waitFor(() => {
      expect(getLatestAuth().session?.user.id).toBe('user-b');
    });

    await act(async () => {
      nextProfileRequest.resolve({
        data: createProfile('user-b'),
        error: null,
      });
    });

    await waitFor(() => {
      expect(getLatestAuth().profile?.id).toBe('user-b');
    });

    await act(async () => {
      initialProfileRequest.resolve({
        data: createProfile('user-a'),
        error: null,
      });
    });

    expect(getLatestAuth().session?.user.id).toBe('user-b');
    expect(getLatestAuth().profile?.id).toBe('user-b');
  });
});
