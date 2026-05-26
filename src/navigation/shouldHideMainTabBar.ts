/* Determines when the floating main tab bar must be hidden for full-screen nested routes. */

/**
 * Returns true on routes that should take the full screen (conversation, voice re-record).
 * Uses expo-router segments instead of getFocusedRouteNameFromRoute, which can return
 * undefined while nested stack state is still syncing (tab bar then overlaps the composer).
 */
export function shouldHideMainTabBar(segments: readonly string[]): boolean {
  const normalized = segments.filter((segment) => !segment.startsWith('('));

  if (normalized[0] === 'profile' && normalized[1] === 'record') {
    return true;
  }

  const messagesSegment = normalized[0] === 'messages' ? normalized[1] : undefined;
  if (messagesSegment != null && messagesSegment !== 'index') {
    return true;
  }

  return false;
}
