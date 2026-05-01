/* Voice profile setup route tests — guard the CGU gate before entering the feed. */

import React, { type ReactNode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ProfileSetupRoute from '../profile-setup';
import { COPY } from '../../../src/copy';
import { useFeedState } from '../../../src/features/feed/hooks/useFeedState';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockRefreshProfile = jest.fn();

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

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}

describe('ProfileSetupRoute', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockReplace.mockClear();
    mockRefreshProfile.mockReset();
    mockRefreshProfile.mockResolvedValue(undefined);
    useFeedState.getState().setHasRecordedVoice(false);
  });

  it('keeps the user on the screen when CGU is not accepted', async () => {
    const { getByRole } = render(<ProfileSetupRoute />, { wrapper: Wrapper });
    const cta = getByRole('button', { name: COPY.profile.submitOnboarding });

    expect(cta.props.accessibilityState?.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(cta);
    });

    expect(useFeedState.getState().hasRecordedVoice).toBe(false);
    expect(mockRefreshProfile).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('navigates to discover after the user accepts the CGU and submits', async () => {
    const { getByRole } = render(<ProfileSetupRoute />, { wrapper: Wrapper });

    const checkbox = getByRole('checkbox');
    fireEvent.press(checkbox);

    const cta = getByRole('button', { name: COPY.profile.submitOnboarding });
    expect(cta.props.accessibilityState?.disabled).toBe(false);

    await act(async () => {
      fireEvent.press(cta);
    });

    expect(useFeedState.getState().hasRecordedVoice).toBe(true);
    await waitFor(() => {
      expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
    });
  });

  it('returns to recording when the user deletes the voice', () => {
    useFeedState.getState().setHasRecordedVoice(true);

    const { getByLabelText } = render(<ProfileSetupRoute />, { wrapper: Wrapper });

    fireEvent.press(getByLabelText(COPY.a11y.deleteVoice));

    expect(useFeedState.getState().hasRecordedVoice).toBe(false);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/record');
  });
});
