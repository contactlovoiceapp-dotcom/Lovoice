/* Tests for full-screen routes that must hide the main tab bar. */

import { shouldHideMainTabBar } from '../shouldHideMainTabBar';

describe('shouldHideMainTabBar', () => {
  it('shows the tab bar on primary tab roots', () => {
    expect(shouldHideMainTabBar(['(main)', 'discover'])).toBe(false);
    expect(shouldHideMainTabBar(['(main)', 'likes'])).toBe(false);
    expect(shouldHideMainTabBar(['(main)', 'messages'])).toBe(false);
    expect(shouldHideMainTabBar(['(main)', 'profile'])).toBe(false);
  });

  it('shows the tab bar on the messages inbox', () => {
    expect(shouldHideMainTabBar(['(main)', 'messages', 'index'])).toBe(false);
  });

  it('hides the tab bar on an open conversation', () => {
    expect(shouldHideMainTabBar(['(main)', 'messages', '550e8400-e29b-41d4-a716-446655440000'])).toBe(
      true,
    );
    expect(shouldHideMainTabBar(['(main)', 'messages', '[id]'])).toBe(true);
  });

  it('hides the tab bar on profile voice re-record', () => {
    expect(shouldHideMainTabBar(['(main)', 'profile', 'record'])).toBe(true);
  });
});
