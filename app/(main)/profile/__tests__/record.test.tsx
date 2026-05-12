/* Profile voice re-record route tests — navigation and voice-gate updates match the legacy profile source flow. */

import React from 'react';
import { render } from '@testing-library/react-native';

import ProfileRecordRoute from '../record';
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
  });

  it('returns to the profile after a successful upload', () => {
    render(<ProfileRecordRoute />);

    mockRecordVoiceScreenProps?.onNext?.();

    expect(mockReplace).toHaveBeenCalledWith('/(main)/profile');
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('returns to the profile when the user cancels', () => {
    render(<ProfileRecordRoute />);

    expect(mockRecordVoiceScreenProps?.onCancel).toBeDefined();
    mockRecordVoiceScreenProps?.onCancel?.();

    expect(mockReplace).toHaveBeenCalledWith('/(main)/profile');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('does not expose onSkip', () => {
    render(<ProfileRecordRoute />);

    expect(mockRecordVoiceScreenProps?.onSkip).toBeUndefined();
  });
});
