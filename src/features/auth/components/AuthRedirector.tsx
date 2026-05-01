/* Keeps users in the correct route group for their current auth/profile state. */

import { useEffect } from 'react';
import { usePathname, useRouter, useSegments } from 'expo-router';

import { useAuth } from '../hooks/useAuth';

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

    if (session && !profile && !isInAuthGroup) {
      router.replace('/(auth)/home');
      return;
    }

    if (session && profile && !isInMainGroup) {
      // Signup finishes inside the auth stack: OTP creates the profile, then record gates the feed.
      if (
        isInAuthGroup &&
        (pathname.endsWith('/otp') ||
          pathname.endsWith('/record') ||
          pathname.endsWith('/profile-setup'))
      ) {
        return;
      }
      router.replace('/(main)/discover');
    }
  }, [isLoading, pathname, profile, router, segments, session]);

  return null;
}
