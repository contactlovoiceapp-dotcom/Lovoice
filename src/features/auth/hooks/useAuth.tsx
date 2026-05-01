/* Provides Supabase session state and profile lookup for auth-aware navigation. */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/lib/supabase';
import type { Database } from '@/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const profileRequestIdRef = useRef(0);

  const loadProfile = useCallback(async (nextSession: Session | null) => {
    const requestId = profileRequestIdRef.current + 1;
    profileRequestIdRef.current = requestId;

    if (!nextSession) {
      setProfile(null);
      setError(null);
      return;
    }

    try {
      const nextProfile = await fetchProfile(nextSession.user.id);

      if (profileRequestIdRef.current !== requestId) {
        return;
      }

      setProfile(nextProfile);
      setError(null);
    } catch (profileError: unknown) {
      if (profileRequestIdRef.current !== requestId) {
        return;
      }

      setProfile(null);
      setError(
        profileError instanceof Error
          ? profileError.message
          : 'Unable to load the authenticated profile.',
      );
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    let nextSession = session;

    if (!nextSession) {
      const supabase = getSupabaseClient();

      if (!supabase) {
        throw new Error('Supabase is not configured.');
      }

      const { data, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(sessionError.message);
      }

      nextSession = data.session;
      setSession(nextSession);
    }

    await loadProfile(nextSession);
  }, [loadProfile, session]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      throw new Error('Supabase is not configured.');
    }

    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      throw new Error(signOutError.message);
    }

    profileRequestIdRef.current += 1;
    setSession(null);
    setProfile(null);
    setError(null);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const supabase = getSupabaseClient();

    if (!supabase) {
      setError('Supabase is not configured.');
      setIsLoading(false);
      return undefined;
    }

    void (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (sessionError) {
        setError(sessionError.message);
        setSession(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      setSession(data.session);
      await loadProfile(data.session);

      if (isMounted) {
        setIsLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      isLoading,
      error,
      refreshProfile,
      signOut,
    }),
    [error, isLoading, profile, refreshProfile, session, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }

  return context;
}
