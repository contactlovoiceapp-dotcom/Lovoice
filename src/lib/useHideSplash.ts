/* Hides the native splash screen once the calling component is mounted and laid out.
   Use in every "landing" screen (discover, auth home, onboarding/name) so the native
   splash stays visible until real content is ready. */

import { useCallback, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';

export function useHideSplash() {
  const hidden = useRef(false);

  const onReady = useCallback(() => {
    if (hidden.current) return;
    hidden.current = true;
    void SplashScreen.hideAsync();
  }, []);

  return onReady;
}
