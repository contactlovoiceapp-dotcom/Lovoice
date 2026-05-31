/* Unit tests for deleted-account detection in chat. */

import { TOMBSTONE_USER_ID, isDeletedOtherAccount } from '../constants';

describe('isDeletedOtherAccount', () => {
  it('returns true for the legacy shared tombstone id', () => {
    expect(isDeletedOtherAccount(TOMBSTONE_USER_ID, null)).toBe(true);
  });

  it('returns true when the profile has deleted_at set', () => {
    expect(
      isDeletedOtherAccount('user-b', {
        deleted_at: '2026-05-31T10:00:00Z',
      }),
    ).toBe(true);
  });

  it('returns false for an active correspondent', () => {
    expect(
      isDeletedOtherAccount('user-b', {
        deleted_at: null,
      }),
    ).toBe(false);
  });

  it('returns true when the profile join is missing', () => {
    expect(isDeletedOtherAccount('user-b', null)).toBe(true);
  });
});
