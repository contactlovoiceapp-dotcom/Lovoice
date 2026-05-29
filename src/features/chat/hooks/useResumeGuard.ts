/* Shared guard that prevents a Hermes heap-corruption crash on foreground resume.
   After a background → active transition, Supabase Realtime reconnects and replays
   queued postgres_changes events while iOS simultaneously runs keyboard and
   navigation animations. Calling queryClient.invalidateQueries immediately in that
   window adds to the native↔JS bridge pressure and can trigger
   GCScope::_newChunkAndPHV (see docs/CHAT_AUDIO.md §13).
   This hook detects the transition and defers React Query invalidations via
   InteractionManager until iOS has finished its foreground transition. */

import { useCallback, useEffect, useRef } from 'react';
import { AppState, InteractionManager } from 'react-native';

// Maximum time to hold the resume window open regardless of interaction state.
// iOS keyboard + navigation parallax transitions typically settle in < 400 ms;
// 500 ms gives a comfortable margin for slower devices.
const RESUME_WINDOW_MS = 500;

export interface ResumeGuard {
  /**
   * Wraps fn in InteractionManager.runAfterInteractions while the resume window
   * is open (first ~500 ms or until interactions settle after background → active).
   * Outside the window fn is called immediately — normal foreground behaviour is
   * unchanged.
   */
  runAfterResume: (fn: () => void) => void;
}

export function useResumeGuard(): ResumeGuard {
  const isResumingRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let interactionHandle: { cancel: () => void } | null = null;

    function closeWindow() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (interactionHandle !== null) {
        interactionHandle.cancel();
        interactionHandle = null;
      }
      isResumingRef.current = false;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Cancel any leftover window from a previous resume cycle.
        closeWindow();
        isResumingRef.current = true;

        // Primary signal: wait for JS-registered interactions (React Navigation
        // transitions register with InteractionManager; this fires once they're done).
        interactionHandle = InteractionManager.runAfterInteractions(() => {
          interactionHandle = null;
          closeWindow();
        });

        // Safety net: close the window after RESUME_WINDOW_MS even if no JS
        // interactions were registered (keyboard hide/show are native-only events
        // invisible to InteractionManager).
        timer = setTimeout(() => {
          timer = null;
          closeWindow();
        }, RESUME_WINDOW_MS);
      } else {
        // Going to background or inactive — close any open window immediately.
        closeWindow();
      }
    });

    return () => {
      subscription.remove();
      closeWindow();
    };
  }, []);

  const runAfterResume = useCallback((fn: () => void) => {
    if (isResumingRef.current) {
      InteractionManager.runAfterInteractions(fn);
    } else {
      fn();
    }
  }, []);

  return { runAfterResume };
}
