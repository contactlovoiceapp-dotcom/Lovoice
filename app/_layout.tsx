/* Root layout — loads fonts, wires providers, and delegates splash hiding to screens.
   No React splash overlay is used. The native splash screen stays visible until the
   destination screen explicitly calls hideAsync() upon mounting. */

import React, { useState } from 'react';
import { View } from 'react-native';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts,
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_900Black,
} from '@expo-google-fonts/playfair-display';

import { COLORS } from '../src/theme';
import AuthRedirector from '../src/features/auth/components/AuthRedirector';
import { AuthProvider } from '../src/features/auth/hooks/useAuth';
import { setupNotificationHandler } from '../src/lib/push';
import '../global.css';

// Register the foreground notification handler once at module load — idempotent
// per Expo docs, so calling it here (before any component mounts) is safe.
setupNotificationHandler();

// Keep native splash visible indefinitely
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60,
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const [fontsLoaded] = useFonts({
    Outfit_300Light,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_900Black,
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SafeAreaProvider>
          <View style={{ flex: 1, backgroundColor: COLORS.background }}>
            <AuthRedirector />
            {fontsLoaded ? <Slot /> : null}
          </View>
        </SafeAreaProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
