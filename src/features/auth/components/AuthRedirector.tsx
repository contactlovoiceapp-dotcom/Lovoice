/* Keeps users in the correct route group for their current auth/profile state. */

import { useEffect } from 'react';
import { usePathname, useRouter, useSegments } from 'expo-router';

import { useAuth } from '../hooks/useAuth';

// Auth-group routes that legitimately host a session without a complete profile yet.
// Reaching any of them must NOT trigger a redirect to the wizard.
const SIGNUP_FLOW_PATH_SUFFIXES = ['/onboarding', '/record', '/profile-setup'];

function isOnSignupFlow(pathname: string): boolean {
  return SIGNUP_FLOW_PATH_SUFFIXES.some((suffix) => pathname.includes(suffix));
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

    // Authenticated but no profile yet: push to CGU + values, even when the user is still
    // inside the auth group (e.g. just landed here from OTP verification on a fresh account).
    // The signup-flow paths are excluded so the user can complete name/birthdate/.../record/setup.
    if (session && !profile && !isOnSignupFlow(pathname)) {
      router.replace('/(auth)/onboarding/name');
      return;
    }

    if (session && profile && !isInMainGroup) {
      // Let the user finish the full signup flow (onboarding → record → profile-setup)
      // before redirecting to the main feed.
      if (isInAuthGroup && isOnSignupFlow(pathname)) {
        return;
      }
      router.replace('/(main)/discover');
    }
  }, [isLoading, pathname, profile, router, segments, session]);

  return null;
}
