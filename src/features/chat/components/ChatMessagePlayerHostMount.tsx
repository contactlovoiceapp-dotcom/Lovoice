/* Conditionally mounts the chat audio host so it can be released during recording.
   See docs/CHAT_AUDIO.md §9bis — the silent-M4A mitigation requires the native
   AVAudioPlayer instance to be torn down before the recorder configures the
   iOS AVAudioSession for capture. The inner component owns the single
   `useAudioPlayer` for the conversation and is unmounted while
   `isHostSuspended` is true. */

import React from 'react';

import {
  useChatMessagePlayerHost,
  useIsHostSuspended,
} from '../lib/chatMessagePlayer';

// Split into an inner component so the `useAudioPlayer` invocation inside
// `useChatMessagePlayerHost` only runs while the host is mounted. Calling the
// hook conditionally at the top level would violate the rules of hooks.
function ChatMessagePlayerHostInner(): null {
  useChatMessagePlayerHost();
  return null;
}

export default function ChatMessagePlayerHostMount(): React.ReactElement | null {
  const isHostSuspended = useIsHostSuspended();
  if (isHostSuspended) return null;
  return <ChatMessagePlayerHostInner />;
}
