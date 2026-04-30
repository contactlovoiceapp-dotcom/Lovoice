/* Profile route tests — protect the Phase 2 logout flow from regressing. */

import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import ProfileRoute from '../profile';
import type MyVoiceScreen from '../../../src/components/onboarding/MyVoiceScreen';
import { useFeedState } from '../../../src/features/feed/hooks/useFeedState';
import { useAuth } from '../../../src/features/auth/hooks/useAuth';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn();
let mockMyVoiceScreenProps: React.ComponentProps<typeof MyVoiceScreen> | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    navigate: jest.fn(),
  }),
}));

jest.mock('../../../src/features/auth/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../src/components/onboarding/MyVoiceScreen', () => {
  const MockMyVoiceScreen = (props: React.ComponentProps<typeof MyVoiceScreen>) => {
    mockMyVoiceScreenProps = props;
    return null;
  };

  return {
    __esModule: true,
    default: MockMyVoiceScreen,
  };
});

describe('ProfileRoute', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue(undefined);
    mockMyVoiceScreenProps = null;
    useFeedState.getState().setHasRecordedVoice(true);
    jest.mocked(useAuth).mockReturnValue({
      session: null,
      profile: null,
      isLoading: false,
      error: null,
      refreshProfile: jest.fn(),
      signOut: mockSignOut,
    });
  });

  it('signs out and returns to auth home', async () => {
    render(<ProfileRoute />);

    await act(async () => {
      mockMyVoiceScreenProps?.onSignOut?.();
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(useFeedState.getState().hasRecordedVoice).toBe(false);
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/home');
    });
  });

  it('keeps the user on profile when sign out fails', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('Network error'));

    render(<ProfileRoute />);

    await act(async () => {
      mockMyVoiceScreenProps?.onSignOut?.();
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
