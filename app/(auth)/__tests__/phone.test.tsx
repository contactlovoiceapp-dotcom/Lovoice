/* Phone route tests — verify Supabase OTP requests stay country-gated. */

import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import PhoneRoute from '../phone';
import type PhoneScreen from '../../../src/components/onboarding/PhoneScreen';
import { getSupabaseClient } from '../../../src/lib/supabase';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSignInWithOtp = jest.fn();
let mockPhoneScreenProps: React.ComponentProps<typeof PhoneScreen> | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
  useLocalSearchParams: () => ({ mode: 'signup' }),
}));

jest.mock('../../../src/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

jest.mock('../../../src/components/onboarding/PhoneScreen', () => {
  const MockPhoneScreen = (props: React.ComponentProps<typeof PhoneScreen>) => {
    mockPhoneScreenProps = props;
    return null;
  };

  return {
    __esModule: true,
    default: MockPhoneScreen,
  };
});

describe('PhoneRoute', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockSignInWithOtp.mockReset();
    mockSignInWithOtp.mockResolvedValue({ error: null });
    mockPhoneScreenProps = null;
    jest.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        signInWithOtp: mockSignInWithOtp,
      },
    } as unknown as ReturnType<typeof getSupabaseClient>);
  });

  it('requests an OTP for a supported phone number', async () => {
    render(<PhoneRoute />);

    await act(async () => {
      await mockPhoneScreenProps?.onSubmit('+33612345678', 'FR');
    });

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith({ phone: '+33612345678' });
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(auth)/otp',
        params: {
          phone: '+33612345678',
          country: 'FR',
          mode: 'signup',
        },
      });
    });
  });

  it('blocks a mismatched country before calling Supabase', async () => {
    render(<PhoneRoute />);

    await act(async () => {
      await mockPhoneScreenProps?.onSubmit('+32470123456', 'FR');
    });

    expect(mockSignInWithOtp).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
