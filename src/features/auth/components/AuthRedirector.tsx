/* Keeps users in the correct route group for their current auth/profile state.
 *
 * This is the SINGLE source of truth for auth-based navigation. Screens should
 * never call router.replace() in response to auth state changes — they update
 * state and let this component react. Screens only navigate for in-flow user
 * actions (next onboarding step, skip recording, etc.).
 */

import { useEffect } from 'react';
import { usePathname, useRouter, useSegments } from 'expo-router';

import { useAuth } from '../hooks/useAuth';

// Auth-group routes that legitimately host a session without a complete profile yet.
// Reaching any of them must NOT trigger a redirect to the wizard.
const SIGNUP_FLOW_PATH_SUFFIXES = ['/onboarding', '/record', '/profile-setup'];

// After profile creation (city step), the user proceeds through record → profile-setup
// before reaching (main). Only these specific paths must not redirect to discover.
// Early wizard steps (name, birthdate, gender, looking-for) are intentionally excluded
// so a returning user cannot accidentally land back on the wizard.
const POST_CREATION_PATH_SUFFIXES = ['/onboarding/city', '/record', '/profile-setup'];

function isOnSignupFlow(pathname: string): boolean {
  return SIGNUP_FLOW_PATH_SUFFIXES.some((suffix) => pathname.includes(suffix));
}

function isOnPostCreationFlow(pathname: string): boolean {
  return POST_CREATION_PATH_SUFFIXES.some((suffix) => pathname.includes(suffix));
}

export default function AuthRedirector() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const { session, profile, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || pathname === '/') {
      return;
    }

    const routeGroup = segments[0];
    const isInAuthGroup = routeGroup === '(auth)';
    const isInMainGroup = routeGroup === '(main)';

    if (!session && !isInAuthGroup) {
      router.replace('/(auth)/home');
      return;
    }

    if (session && !profile && !isOnSignupFlow(pathname)) {
      router.replace('/(auth)/onboarding/name');
      return;
    }

    if (session && profile && !isInMainGroup) {
      if (isInAuthGroup && isOnPostCreationFlow(pathname)) {
        return;
      }
      router.replace('/(main)/discover');
    }
  }, [isLoading, pathname, profile, router, segments, session]);

  return null;
}
