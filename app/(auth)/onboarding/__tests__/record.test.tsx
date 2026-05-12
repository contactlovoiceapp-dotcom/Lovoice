/* Record route tests — protect voice-gate state updates, navigation, and skip behaviour during onboarding. */

import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import RecordRoute from '../record';
import type RecordVoiceScreen from '../../../../src/components/onboarding/RecordVoiceScreen';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockRefreshProfile = jest.fn();
let mockRecordVoiceScreenProps: React.ComponentProps<typeof RecordVoiceScreen> | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    navigate: jest.fn(),
  }),
}));

jest.mock('../../../../src/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    refreshProfile: mockRefreshProfile,
  }),
}));

jest.mock('../../../../src/components/onboarding/RecordVoiceScreen', () => {
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
    mockRecordVoiceScreenProps = null;
  });

  it('opens voice profile setup after a successful upload', () => {
    render(<RecordRoute />);

    mockRecordVoiceScreenProps?.onNext?.();

    expect(mockPush).toHaveBeenCalledWith('/(auth)/profile-setup');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('refreshes the profile and lands on discover when the user skips', async () => {
    render(<RecordRoute />);

    await act(async () => {
      mockRecordVoiceScreenProps?.onSkip?.();
    });

    await waitFor(() => {
      expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
    });
  });

  it('does not expose onCancel', () => {
    render(<RecordRoute />);

    expect(mockRecordVoiceScreenProps?.onCancel).toBeUndefined();
    expect(mockRecordVoiceScreenProps?.onSkip).toBeDefined();
  });
});
