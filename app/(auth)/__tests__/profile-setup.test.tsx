/* Voice profile setup route tests — protect the final voice review step before the feed. */

import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import ProfileSetupRoute from '../profile-setup';
import { useFeedState } from '../../../src/features/feed/hooks/useFeedState';
import type MyVoiceScreen from '../../../src/components/onboarding/MyVoiceScreen';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockRefreshProfile = jest.fn();
let mockMyVoiceScreenProps: React.ComponentProps<typeof MyVoiceScreen> | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
  }),
}));

jest.mock('../../../src/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    refreshProfile: mockRefreshProfile,
  }),
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

describe('ProfileSetupRoute', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockReplace.mockClear();
    mockRefreshProfile.mockReset();
    mockRefreshProfile.mockResolvedValue(undefined);
    mockMyVoiceScreenProps = null;
    useFeedState.getState().setHasRecordedVoice(false);
  });

  it('shows the onboarding voice editor and enters the feed on send', async () => {
    render(<ProfileSetupRoute />);

    expect(mockMyVoiceScreenProps).toMatchObject({
      hasRecordedVoice: true,
      isOnboarding: true,
    });

    await act(async () => {
      mockMyVoiceScreenProps?.onSend?.();
    });

    expect(useFeedState.getState().hasRecordedVoice).toBe(true);
    await waitFor(() => {
      expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
    });
  });

  it('returns to recording when the user deletes the voice', () => {
    useFeedState.getState().setHasRecordedVoice(true);

    render(<ProfileSetupRoute />);

    mockMyVoiceScreenProps?.onDeleteVoice?.();

    expect(useFeedState.getState().hasRecordedVoice).toBe(false);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/record');
  });
});
