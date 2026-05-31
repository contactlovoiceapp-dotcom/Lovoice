/* Chat feature constants — tombstone sentinel shared with the purge_account SQL migration. */

/** Profile id substituted for a purged correspondent (legacy shared sentinel). */
export const TOMBSTONE_USER_ID = 'deadface-0000-0000-0000-000000000000';

/** True when the other participant's profile is gone or marked deleted. */
export function isDeletedOtherAccount(
  otherUserId: string,
  otherProfile: { deleted_at: string | null } | null,
): boolean {
  if (otherUserId === TOMBSTONE_USER_ID) return true;
  if (otherProfile?.deleted_at) return true;
  // Join blocked by RLS — treat as deleted when we already know the display label.
  return otherProfile === null;
}
