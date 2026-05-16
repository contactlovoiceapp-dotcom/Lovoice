/* Index route tests — verify immediate routing based on auth and profile state.
 *
 * The index route is the first decision point after the native splash hides:
 * it reads auth state and navigates to the correct destination without delay.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

import IndexRoute from '../index';
import { useAuth } from '../../src/features/auth/hooks/useAuth';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../../src/features/auth/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

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

describe('IndexRoute', () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it('does not navigate while auth is still loading', () => {
    setAuth({ isLoading: true });
    render(<IndexRoute />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('navigates returning user (session + profile) to discover', () => {
    setAuth({ session: SESSION, profile: PROFILE });
    render(<IndexRoute />);

    expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
  });

  it('navigates incomplete user (session, no profile) to onboarding', () => {
    setAuth({ session: SESSION, profile: null });
    render(<IndexRoute />);

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding/name');
  });

  it('navigates visitor (no session) to auth home', () => {
    setAuth({ session: null, profile: null });
    render(<IndexRoute />);

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/home');
  });

  it('navigates once auth finishes loading after initial render', () => {
    setAuth({ isLoading: true });
    const { rerender } = render(<IndexRoute />);

    expect(mockReplace).not.toHaveBeenCalled();

    setAuth({ session: null, profile: null, isLoading: false });
    rerender(<IndexRoute />);

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/home');
  });
});
