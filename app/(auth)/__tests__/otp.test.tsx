/* OTP route tests — verify post-OTP routing: returning users → discover, new users → onboarding.
 *
 * These tests guard the critical sign-in vs sign-up branching that happens after OTP
 * verification. A regression here means existing users re-do the full onboarding.
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
const mockMaybeSingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock('../../../src/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      verifyOtp: mockVerifyOtp,
      signInWithOtp: mockSignInWithOtp,
    },
    from: mockFrom,
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

describe('OtpRoute — post-verification routing', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockBack.mockClear();
    mockVerifyOtp.mockReset();
    mockSignInWithOtp.mockReset();
    mockFrom.mockClear();
    mockSelect.mockClear();
    mockEq.mockClear();
    mockMaybeSingle.mockReset();
  });

  it('sends a RETURNING user (profile exists) to /(main)/discover', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: 'user-42' }, session: {} },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: { id: 'user-42' }, error: null });

    render(<OtpRoute />);
    enterCodeAndSubmit();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
    });

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockEq).toHaveBeenCalledWith('id', 'user-42');
    expect(mockReplace).not.toHaveBeenCalledWith('/(auth)/onboarding/name');
  });

  it('sends a NEW user (no profile) to /(auth)/onboarding/name', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: 'user-new' }, session: {} },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    render(<OtpRoute />);
    enterCodeAndSubmit();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding/name');
    });

    expect(mockReplace).not.toHaveBeenCalledWith('/(main)/discover');
  });

  it('shows an error and does NOT navigate when OTP verification fails', async () => {
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
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('still navigates to onboarding when verifyOtp returns no user id', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: null, session: {} },
      error: null,
    });

    render(<OtpRoute />);
    enterCodeAndSubmit();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding/name');
    });
  });

  it('navigates to onboarding when profile query errors (fail-open for new users)', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: { id: 'user-err' }, session: {} },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'RLS' } });

    render(<OtpRoute />);
    enterCodeAndSubmit();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding/name');
    });
  });
});
