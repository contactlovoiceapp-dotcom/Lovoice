/* Root layout — loads custom fonts, provides safe-area context, and renders the router slot. */

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Slot } from 'expo-router';
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
import { getSupabaseClient, getSupabaseConfig } from '../src/lib/supabase';
import '../global.css';

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

  // TODO(phase-2): remove this temporary smoke test once auth gating is in place at the root layout.
  useEffect(() => {
    void (async () => {
      const supabase = getSupabaseClient();

      if (!supabase) {
        const configResult = getSupabaseConfig();
        console.log(
          '[Supabase smoke test]',
          configResult.ok
            ? 'ERROR: Client unavailable.'
            : `ERROR: ${configResult.error}`,
        );
        return;
      }

      try {
        const { data, error } = await supabase.from('prompts').select('id');
        console.log(
          '[Supabase smoke test]',
          error ? `ERROR: ${error.message}` : `OK - ${data?.length} prompts`,
        );
      } catch (error: unknown) {
        console.log(
          '[Supabase smoke test]',
          error instanceof Error
            ? `ERROR: ${error.message}`
            : 'ERROR: Unknown failure.',
        );
      }
    })();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <Slot />
        </View>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
