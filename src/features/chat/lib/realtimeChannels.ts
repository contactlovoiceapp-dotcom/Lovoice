/* Full teardown of Supabase Realtime channels by name before (re)subscribing.

   Supabase caches channels by topic. When a passive effect re-runs without its cleanup
   (React's recursivelyTraverseReconnectPassiveEffects), `supabase.channel(name)` returns
   the SAME already-subscribed channel, so adding `.on(...)` handlers throws
   "cannot add 'postgres_changes' callbacks ... after subscribe()" and crashes the screen.
   Removing the channel held in a single ref is not enough — `removeChannel` is async and
   Supabase may still hold an orphan instance. Removing ALL channels matching the name
   guarantees the next `supabase.channel(name)` returns a fresh, unsubscribed instance.
   See docs/REALTIME_STABILITY.md §4.1. */

import type { RealtimeChannel } from '@supabase/supabase-js';

// Minimal surface of the Supabase client this helper needs. Keeping it structural avoids
// threading the `SupabaseClient<Database>` generic through every call site.
interface RealtimeChannelRegistry {
  getChannels: () => RealtimeChannel[];
  removeChannel: (channel: RealtimeChannel) => unknown;
}

// Supabase exposes channels with a `realtime:` topic prefix over the name passed to
// `supabase.channel(name)`. Match both forms to stay robust across client versions.
function matchesName(topic: string, name: string): boolean {
  return topic === name || topic === `realtime:${name}`;
}

export function removeChannelsByName(client: RealtimeChannelRegistry, name: string): void {
  for (const channel of client.getChannels()) {
    if (matchesName(channel.topic, name)) {
      void client.removeChannel(channel);
    }
  }
}
