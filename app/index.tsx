/* App entry route — navigates to the correct screen once auth state is known.
   Renders nothing: the native splash stays visible until the destination
   screen calls useHideSplash, so this route is never visible to the user. */

import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { useAuth } from '../src/features/auth/hooks/useAuth';

export default function IndexRoute() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (session && profile) {
      router.replace('/(main)/discover');
      return;
    }

    if (session && !profile) {
      router.replace('/(auth)/onboarding/name');
      return;
    }

    router.replace('/(auth)/home');
  }, [isLoading, profile, router, session]);

  return null;
}
