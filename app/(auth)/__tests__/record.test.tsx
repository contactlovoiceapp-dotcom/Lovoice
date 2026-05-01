/* Record route tests — protect voice-gate state updates and navigation to the feed. */

import React from 'react';
import { render } from '@testing-library/react-native';

import RecordRoute from '../record';
import { useFeedState } from '../../../src/features/feed/hooks/useFeedState';
import type RecordVoiceScreen from '../../../src/components/onboarding/RecordVoiceScreen';

const mockReplace = jest.fn();
let mockRecordVoiceScreenProps: React.ComponentProps<typeof RecordVoiceScreen> | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({
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
    mockReplace.mockClear();
    mockRecordVoiceScreenProps = null;
    useFeedState.getState().setHasRecordedVoice(false);
  });

  it('marks the voice as recorded and navigates to the feed', () => {
    render(<RecordRoute />);

    expect(useFeedState.getState().hasRecordedVoice).toBe(false);
    mockRecordVoiceScreenProps?.onNext?.();

    expect(useFeedState.getState().hasRecordedVoice).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
  });

  it('keeps voices locked when the user skips recording', () => {
    render(<RecordRoute />);

    mockRecordVoiceScreenProps?.onSkip?.();

    expect(useFeedState.getState().hasRecordedVoice).toBe(false);
    expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
  });
});
