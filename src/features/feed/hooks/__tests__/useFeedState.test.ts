/* Feed store tests — protect persisted local state used by the simulated onboarding flow. */

import * as SecureStore from 'expo-secure-store';

import { useFeedState } from '../useFeedState';

describe('useFeedState', () => {
  beforeEach(() => {
    useFeedState.getState().setHasRecordedVoice(false);
    jest.clearAllMocks();
  });

  it('persists the recorded voice flag without serializing transient feed data', () => {
    useFeedState.getState().setHasRecordedVoice(true);

    const setItemAsync = jest.mocked(SecureStore.setItemAsync);
    expect(setItemAsync).toHaveBeenCalledWith(
      'lovoice-feed-state',
      expect.stringContaining('"hasRecordedVoice":true'),
    );
    expect(setItemAsync.mock.calls[0][1]).not.toContain('profiles');
    expect(setItemAsync.mock.calls[0][1]).not.toContain('likedIds');
  });
});
