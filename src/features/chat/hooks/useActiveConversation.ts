/* Screen-side binding to the session-scoped conversation Realtime service. The
   conversation route declares itself active on focus (idempotent — re-focusing the
   same conversation does not re-subscribe) and reads the other participant's typing/
   recording indicators from the service store. The channel lifecycle itself lives in
   conversationRealtimeService, decoupled from this screen's mount/unmount so a
   notification tap no longer churns the subscription (docs/REALTIME_STABILITY.md §5). */

import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  useConversationRealtimeStore,
  setActiveConversationId,
  setConversationScreenFocused,
  emitTyping,
  emitRecording,
} from '../lib/conversationRealtimeService';

export interface ActiveConversation {
  otherIsTyping: boolean;
  otherIsRecording: boolean;
  emitTyping: (value: boolean) => void;
  emitRecording: (value: boolean) => void;
}

export function useActiveConversation(conversationId: string | null): ActiveConversation {
  useFocusEffect(
    useCallback(() => {
      if (conversationId) {
        setActiveConversationId(conversationId);
      }
      setConversationScreenFocused(true);
      return () => {
        setConversationScreenFocused(false);
        // Clear our own typing/recording state on the other side when leaving the
        // screen. The channel itself is intentionally NOT torn down here — that is
        // what avoids the re-subscribe churn; it is switched when another
        // conversation becomes active or on logout.
        emitTyping(false);
        emitRecording(false);
      };
    }, [conversationId]),
  );

  const otherIsTyping = useConversationRealtimeStore((s) => s.otherIsTyping);
  const otherIsRecording = useConversationRealtimeStore((s) => s.otherIsRecording);

  return { otherIsTyping, otherIsRecording, emitTyping, emitRecording };
}
