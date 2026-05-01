/* Record route tests — protect voice-gate state updates, navigation, and cancel behaviour. */

import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import RecordRoute from '../record';
import { useFeedState } from '../../../src/features/feed/hooks/useFeedState';
import type RecordVoiceScreen from '../../../src/components/onboarding/RecordVoiceScreen';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockRefreshProfile = jest.fn();
let mockLocalSearchParams: { source?: string } = {};
let mockRecordVoiceScreenProps: React.ComponentProps<typeof RecordVoiceScreen> | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => mockLocalSearchParams,
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
    mockPush.mockClear();
    mockBack.mockClear();
    mockRefreshProfile.mockReset();
    mockRefreshProfile.mockResolvedValue(undefined);
    mockLocalSearchParams = {};
    mockRecordVoiceScreenProps = null;
    useFeedState.getState().setHasRecordedVoice(false);
  });

  describe('onboarding flow (no source param)', () => {
    it('marks the voice as recorded and opens voice profile setup', () => {
      render(<RecordRoute />);

      expect(useFeedState.getState().hasRecordedVoice).toBe(false);
      mockRecordVoiceScreenProps?.onNext?.();

      expect(useFeedState.getState().hasRecordedVoice).toBe(true);
      expect(mockPush).toHaveBeenCalledWith('/(auth)/profile-setup');
      expect(mockBack).not.toHaveBeenCalled();
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

    it('does not expose onCancel or hide onSkip', () => {
      render(<RecordRoute />);

      expect(mockRecordVoiceScreenProps?.onCancel).toBeUndefined();
      expect(mockRecordVoiceScreenProps?.onSkip).toBeDefined();
    });
  });

  describe('profile re-record flow (source=profile)', () => {
    beforeEach(() => {
      mockLocalSearchParams = { source: 'profile' };
    });

    it('marks the voice as recorded and returns to the profile', () => {
      useFeedState.getState().setHasRecordedVoice(false);
      render(<RecordRoute />);

      mockRecordVoiceScreenProps?.onNext?.();

      expect(useFeedState.getState().hasRecordedVoice).toBe(true);
      expect(mockReplace).toHaveBeenCalledWith('/(main)/profile');
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('returns to the profile without changing voice state when cancelled', () => {
      useFeedState.getState().setHasRecordedVoice(true);
      render(<RecordRoute />);

      expect(mockRecordVoiceScreenProps?.onCancel).toBeDefined();
      mockRecordVoiceScreenProps?.onCancel?.();

      expect(useFeedState.getState().hasRecordedVoice).toBe(true);
      expect(mockReplace).toHaveBeenCalledWith('/(main)/profile');
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('does not expose onSkip from the profile', () => {
      render(<RecordRoute />);

      expect(mockRecordVoiceScreenProps?.onSkip).toBeUndefined();
    });
  });
});
