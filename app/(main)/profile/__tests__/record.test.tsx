/* Profile voice re-record route tests — navigation and voice-gate updates match the legacy profile source flow. */

import React from 'react';
import { render } from '@testing-library/react-native';

import ProfileRecordRoute from '../record';
import { useFeedState } from '../../../../src/features/feed/hooks/useFeedState';
import type RecordVoiceScreen from '../../../../src/components/onboarding/RecordVoiceScreen';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockRecordVoiceScreenProps: React.ComponentProps<typeof RecordVoiceScreen> | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    navigate: jest.fn(),
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

describe('ProfileRecordRoute', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
    mockBack.mockClear();
    mockRecordVoiceScreenProps = null;
    useFeedState.getState().setHasRecordedVoice(false);
  });

  it('marks the voice as recorded and returns to the profile', () => {
    useFeedState.getState().setHasRecordedVoice(false);
    render(<ProfileRecordRoute />);

    mockRecordVoiceScreenProps?.onNext?.();

    expect(useFeedState.getState().hasRecordedVoice).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/(main)/profile');
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('returns to the profile without changing voice state when cancelled', () => {
    useFeedState.getState().setHasRecordedVoice(true);
    render(<ProfileRecordRoute />);

    expect(mockRecordVoiceScreenProps?.onCancel).toBeDefined();
    mockRecordVoiceScreenProps?.onCancel?.();

    expect(useFeedState.getState().hasRecordedVoice).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/(main)/profile');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('does not expose onSkip', () => {
    render(<ProfileRecordRoute />);

    expect(mockRecordVoiceScreenProps?.onSkip).toBeUndefined();
  });
});
