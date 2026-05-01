/* Record route tests — protect voice-gate state updates and navigation to the feed. */

import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import RecordRoute from '../record';
import { useFeedState } from '../../../src/features/feed/hooks/useFeedState';
import type RecordVoiceScreen from '../../../src/components/onboarding/RecordVoiceScreen';

const mockReplace = jest.fn();
const mockRefreshProfile = jest.fn();
let mockRecordVoiceScreenProps: React.ComponentProps<typeof RecordVoiceScreen> | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: jest.fn(),
    navigate: jest.fn(),
  }),
}));

jest.mock('../../../src/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    refreshProfile: mockRefreshProfile,
  }),
}));

jest.mock('../../../src/components/onboarding/RecordVoiceScreen', () => {
  const MockRecordVoiceScreen = (props: React.ComponentProps<typeof RecordVoiceScreen>) => {
    mockRecordVoiceScreenProps = props;
    return null;
  };

  return {
    __esModule: true,
    default: MockRecordVoiceScreen,
  };
});

describe('RecordRoute', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockRefreshProfile.mockReset();
    mockRefreshProfile.mockResolvedValue(undefined);
    mockRecordVoiceScreenProps = null;
    useFeedState.getState().setHasRecordedVoice(false);
  });

  it('marks the voice as recorded and navigates to the feed', async () => {
    render(<RecordRoute />);

    expect(useFeedState.getState().hasRecordedVoice).toBe(false);
    await act(async () => {
      mockRecordVoiceScreenProps?.onNext?.();
    });

    expect(useFeedState.getState().hasRecordedVoice).toBe(true);
    await waitFor(() => {
      expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
    });
  });

  it('keeps voices locked when the user skips recording', async () => {
    render(<RecordRoute />);

    await act(async () => {
      mockRecordVoiceScreenProps?.onSkip?.();
    });

    expect(useFeedState.getState().hasRecordedVoice).toBe(false);
    await waitFor(() => {
      expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
    });
  });
});
