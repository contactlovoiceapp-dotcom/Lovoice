/* Record route tests — protect onboarding state updates before entering the feed. */

import React from 'react';
import { render } from '@testing-library/react-native';

import RecordRoute from '../record';
import { useFeedState } from '../../../src/features/feed/hooks/useFeedState';
import type RecordVoiceScreen from '../../../src/components/onboarding/RecordVoiceScreen';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockRecordVoiceScreenProps: React.ComponentProps<typeof RecordVoiceScreen> | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    navigate: jest.fn(),
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
    mockPush.mockClear();
    mockReplace.mockClear();
    mockRecordVoiceScreenProps = null;
    useFeedState.getState().setHasRecordedVoice(false);
  });

  it('unlocks the feed before continuing to profile setup', () => {
    render(<RecordRoute />);

    expect(useFeedState.getState().hasRecordedVoice).toBe(false);
    mockRecordVoiceScreenProps?.onNext?.();

    expect(useFeedState.getState().hasRecordedVoice).toBe(true);
    expect(mockPush).toHaveBeenCalledWith('/(auth)/profile-setup');
  });

  it('keeps voices locked when the user skips recording', () => {
    render(<RecordRoute />);

    mockRecordVoiceScreenProps?.onSkip?.();

    expect(useFeedState.getState().hasRecordedVoice).toBe(false);
    expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
  });
});
