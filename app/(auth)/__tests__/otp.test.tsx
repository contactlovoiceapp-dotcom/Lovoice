/* OTP route tests — verify that the OTP screen delegates navigation to AuthRedirector.
 *
 * After successful verification, otp.tsx must NOT navigate. It stays in loading state
 * and lets the auth state change propagate through useAuth → AuthRedirector.
 * This is the key invariant that prevents the onboarding flash for returning users.
 */

import React from 'react';
import { fireEvent, render, waitFor, screen } from '@testing-library/react-native';

import OtpRoute from '../otp';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => ({ phone: '+33612345678', country: 'FR' }),
}));

jest.mock('lucide-react-native', () => ({
  ArrowLeft: () => null,
  ArrowRight: () => null,
  ShieldCheck: () => null,
}));

const mockVerifyOtp = jest.fn();
const mockSignInWithOtp = jest.fn();

jest.mock('../../../src/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      verifyOtp: mockVerifyOtp,
      signInWithOtp: mockSignInWithOtp,
    },
  }),
}));

jest.mock('../../../src/copy', () => ({
  COPY: {
    common: { back: 'Retour' },
    phone: {
      codeTitle: 'Code',
      codeSubtitle: (p: string) => `Code envoyé au ${p}`,
      codePlaceholder: '000000',
      verify: 'Vérifier',
      verifying: 'Vérification...',
      resendCode: 'Renvoyer',
      sendingCode: 'Envoi...',
      missingOtpParams: 'Numéro manquant',
      authUnavailable: 'Service indisponible',
    },
  },
}));

jest.mock('../../../src/theme', () => ({
  COLORS: {
    dark: '#000',
    primary: '#f00',
    primaryMuted: '#fee',
    textSecondary: '#666',
    textTertiary: '#999',
    border: '#eee',
    surfaceMuted: '#fafafa',
  },
  CTA_GRADIENT: ['#ff0000', '#ff6600'],
  FONT: {
    regular: 'System',
    medium: 'System',
    semibold: 'System',
    bold: 'System',
  },
  ONBOARDING_GRADIENT: ['#fff', '#eee'],
  RADIUS: { lg: 12, full: 999 },
}));

jest.mock('../../../src/features/auth/helpers/country', () => ({
  getCountryFromE164Phone: (phone: string) => {
    if (phone.startsWith('+33')) return 'FR';
    if (phone.startsWith('+32')) return 'BE';
    if (phone.startsWith('+41')) return 'CH';
    return null;
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enterCodeAndSubmit(code = '123456') {
  const input = screen.getByPlaceholderText('000000');
  fireEvent.changeText(input, code);

  const button = screen.getByText('Vérifier');
  fireEvent.press(button);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OtpRoute — post-verification behaviour', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockBack.mockClear();
    mockVerifyOtp.mockReset();
    mockSignInWithOtp.mockReset();
  });

  it('does NOT navigate after successful verification (AuthRedirector handles it)', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: 'user-42' }, session: {} },
      error: null,
    });

    render(<OtpRoute />);
    enterCodeAndSubmit();

    // Give any pending promises time to resolve.
    await waitFor(() => {
      expect(mockVerifyOtp).toHaveBeenCalled();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('stays in loading state after successful verification', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: 'user-42' }, session: {} },
      error: null,
    });

    render(<OtpRoute />);
    enterCodeAndSubmit();

    await waitFor(() => {
      expect(screen.getByText('Vérification...')).toBeTruthy();
    });
  });

  it('shows an error and resets loading when OTP verification fails', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid token' },
    });

    render(<OtpRoute />);
    enterCodeAndSubmit();

    await waitFor(() => {
      expect(screen.getByText('Invalid token')).toBeTruthy();
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('Vérifier')).toBeTruthy();
  });
});
