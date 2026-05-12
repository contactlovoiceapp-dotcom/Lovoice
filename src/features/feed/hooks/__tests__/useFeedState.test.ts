/* Feed store tests — protect the persistence boundary so transient feed data never leaks to disk. */

import * as SecureStore from 'expo-secure-store';

import { useFeedState } from '../useFeedState';

describe('useFeedState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes feed gestures and never persists transient feed data', async () => {
    // Triggering any setter forces zustand to flush the persisted slice through SecureStore.
    useFeedState.getState().setAutoplay(true);

    const setItemAsync = jest.mocked(SecureStore.setItemAsync);

    // Wait one microtask so the persist middleware can flush asynchronously.
    await Promise.resolve();

    expect(setItemAsync).toHaveBeenCalled();
    const lastSerialized = setItemAsync.mock.calls.at(-1)?.[1] ?? '';
    expect(lastSerialized).not.toContain('profiles');
    expect(lastSerialized).not.toContain('likedIds');
    expect(lastSerialized).not.toContain('hasRecordedVoice');
  });
});
