/* Index (splash) route tests — verify routing based on auth and profile state after splash.
 *
 * The splash screen is the first decision point: it waits for auth to load, then
 * routes to the correct destination. A regression here breaks cold-start navigation.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';

import SplashRoute from '../index';
import { useAuth } from '../../src/features/auth/hooks/useAuth';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../../src/features/auth/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../src/components/onboarding/SplashScreen', () => {
  return {
    __esModule: true,
    default: () => null,
  };
});

type AuthState = ReturnType<typeof useAuth>;

const SESSION = { user: { id: 'u1' } } as never;
const PROFILE = { id: 'u1' } as never;

function setAuth(state: Partial<AuthState>) {
  jest.mocked(useAuth).mockReturnValue({
    session: null,
    profile: null,
    isLoading: false,
    error: null,
    refreshProfile: jest.fn(),
    signOut: jest.fn(),
    ...state,
  } as AuthState);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SplashRoute', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not navigate while auth is still loading', () => {
    setAuth({ isLoading: true });
    render(<SplashRoute />);

    act(() => { jest.advanceTimersByTime(5000); });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('navigates returning user (session + profile) to discover after splash', () => {
    setAuth({ session: SESSION, profile: PROFILE });
    render(<SplashRoute />);

    act(() => { jest.advanceTimersByTime(3000); });

    expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
  });

  it('navigates incomplete user (session, no profile) to onboarding', () => {
    setAuth({ session: SESSION, profile: null });
    render(<SplashRoute />);

    act(() => { jest.advanceTimersByTime(3000); });

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding/name');
  });

  it('navigates visitor (no session) to auth home', () => {
    setAuth({ session: null, profile: null });
    render(<SplashRoute />);

    act(() => { jest.advanceTimersByTime(3000); });

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/home');
  });

  it('does not navigate before splash duration elapses', () => {
    setAuth({ session: SESSION, profile: PROFILE });
    render(<SplashRoute />);

    act(() => { jest.advanceTimersByTime(2000); });

    expect(mockReplace).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(1000); });

    expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
  });

  it('navigates correctly when auth finishes loading after initial render', () => {
    setAuth({ isLoading: true });
    const { rerender } = render(<SplashRoute />);

    act(() => { jest.advanceTimersByTime(5000); });
    expect(mockReplace).not.toHaveBeenCalled();

    setAuth({ session: null, profile: null, isLoading: false });
    rerender(<SplashRoute />);

    act(() => { jest.advanceTimersByTime(3000); });

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/home');
  });
});
