/* AuthRedirector tests — guard the routing rules between session, profile, and route group. */

import React from 'react';
import { render } from '@testing-library/react-native';

import AuthRedirector from '../AuthRedirector';
import { useAuth } from '../../hooks/useAuth';

const mockReplace = jest.fn();
let mockPathname = '/(auth)/home';
let mockSegments: string[] = ['(auth)'];

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname,
  useSegments: () => mockSegments,
}));

jest.mock('../../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

type AuthState = ReturnType<typeof useAuth>;

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

beforeEach(() => {
  mockReplace.mockClear();
  mockPathname = '/(auth)/home';
  mockSegments = ['(auth)'];
});

describe('AuthRedirector', () => {
  it('does nothing while auth state is still loading', () => {
    setAuth({ isLoading: true });
    mockPathname = '/(main)/discover';
    mockSegments = ['(main)'];

    render(<AuthRedirector />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does nothing on the splash route (handled by index.tsx)', () => {
    setAuth({ session: null });
    mockPathname = '/';
    mockSegments = [];

    render(<AuthRedirector />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('pushes unauthenticated users in main group back to auth home', () => {
    setAuth({ session: null });
    mockPathname = '/(main)/discover';
    mockSegments = ['(main)'];

    render(<AuthRedirector />);

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/home');
  });

  it('pushes authenticated users without profile to the signup wizard, even from auth home', () => {
    setAuth({ session: { user: { id: 'u1' } } as never, profile: null });
    mockPathname = '/(auth)/home';
    mockSegments = ['(auth)'];

    render(<AuthRedirector />);

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding/name');
  });

  it('does not redirect users without profile while inside the wizard', () => {
    setAuth({ session: { user: { id: 'u1' } } as never, profile: null });
    mockPathname = '/(auth)/onboarding/birthdate';
    mockSegments = ['(auth)', 'onboarding', 'birthdate'];

    render(<AuthRedirector />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect users without profile while on record or profile-setup', () => {
    setAuth({ session: { user: { id: 'u1' } } as never, profile: null });
    mockPathname = '/(auth)/record';
    mockSegments = ['(auth)', 'record'];

    render(<AuthRedirector />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps fully onboarded users on the post-auth voice steps without bouncing them away', () => {
    setAuth({
      session: { user: { id: 'u1' } } as never,
      profile: { id: 'u1' } as never,
    });
    mockPathname = '/(auth)/profile-setup';
    mockSegments = ['(auth)', 'profile-setup'];

    render(<AuthRedirector />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('pushes fully onboarded users away from auth home into the feed', () => {
    setAuth({
      session: { user: { id: 'u1' } } as never,
      profile: { id: 'u1' } as never,
    });
    mockPathname = '/(auth)/home';
    mockSegments = ['(auth)'];

    render(<AuthRedirector />);

    expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
  });
});
