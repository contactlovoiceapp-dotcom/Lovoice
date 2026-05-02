/* AuthRedirector tests — exhaustive table-driven coverage of every auth×profile×route combination.
 *
 * These tests are the safety net against routing regressions. Every redirect rule in
 * AuthRedirector must have an explicit test case here. If you add or change a rule,
 * add a matching row to the table below.
 *
 * KEY INVARIANT: AuthRedirector never redirects while isLoading is true. This prevents
 * flashes caused by stale profile state during auth transitions (e.g. after OTP verification).
 */

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

function renderWithRoute(pathname: string, segments: string[]) {
  mockPathname = pathname;
  mockSegments = segments;
  render(<AuthRedirector />);
}

beforeEach(() => {
  mockReplace.mockClear();
});

// ---------------------------------------------------------------------------
// Guard: loading & splash — AuthRedirector must NEVER act while state is stale
// ---------------------------------------------------------------------------
describe('guard states', () => {
  it('does nothing while auth state is loading (initial boot)', () => {
    setAuth({ isLoading: true });
    renderWithRoute('/(main)/discover', ['(main)']);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does nothing while auth state is loading (post-OTP profile fetch)', () => {
    setAuth({ isLoading: true, session: SESSION, profile: null });
    renderWithRoute('/(auth)/otp', ['(auth)']);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does nothing on the splash route (index.tsx handles it)', () => {
    setAuth({ session: null });
    renderWithRoute('/', []);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Visitor: no session
// ---------------------------------------------------------------------------
describe('visitor (no session)', () => {
  beforeEach(() => setAuth({ session: null }));

  it('does not redirect when already in the auth group', () => {
    renderWithRoute('/(auth)/home', ['(auth)']);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect from auth phone screen', () => {
    renderWithRoute('/(auth)/phone', ['(auth)']);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to auth home when on a main-group page', () => {
    renderWithRoute('/(main)/discover', ['(main)']);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/home');
  });

  it('redirects to auth home when on main profile page', () => {
    renderWithRoute('/(main)/profile', ['(main)']);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/home');
  });
});

// ---------------------------------------------------------------------------
// New user: session exists, profile does NOT
// ---------------------------------------------------------------------------
describe('new user (session, no profile)', () => {
  beforeEach(() => setAuth({ session: SESSION, profile: null }));

  it('redirects from auth home to onboarding', () => {
    renderWithRoute('/(auth)/home', ['(auth)']);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding/name');
  });

  it('redirects from auth phone to onboarding', () => {
    renderWithRoute('/(auth)/phone', ['(auth)']);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding/name');
  });

  it('redirects from auth OTP to onboarding', () => {
    renderWithRoute('/(auth)/otp', ['(auth)']);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding/name');
  });

  it('redirects from main group to onboarding (e.g. profile deleted server-side)', () => {
    renderWithRoute('/(main)/discover', ['(main)']);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding/name');
  });

  const signupFlowPaths: [string, string[]][] = [
    ['/(auth)/onboarding/name', ['(auth)', 'onboarding', 'name']],
    ['/(auth)/onboarding/birthdate', ['(auth)', 'onboarding', 'birthdate']],
    ['/(auth)/onboarding/gender', ['(auth)', 'onboarding', 'gender']],
    ['/(auth)/onboarding/looking-for', ['(auth)', 'onboarding', 'looking-for']],
    ['/(auth)/onboarding/city', ['(auth)', 'onboarding', 'city']],
    ['/(auth)/record', ['(auth)', 'record']],
    ['/(auth)/profile-setup', ['(auth)', 'profile-setup']],
  ];

  it.each(signupFlowPaths)(
    'does NOT redirect from signup flow path %s',
    (pathname, segments) => {
      renderWithRoute(pathname, segments);
      expect(mockReplace).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// Returning user: session + profile
// ---------------------------------------------------------------------------
describe('returning user (session + profile)', () => {
  beforeEach(() => setAuth({ session: SESSION, profile: PROFILE }));

  it('redirects from auth home to discover', () => {
    renderWithRoute('/(auth)/home', ['(auth)']);
    expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
  });

  it('redirects from auth phone to discover', () => {
    renderWithRoute('/(auth)/phone', ['(auth)']);
    expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
  });

  it('redirects from auth OTP to discover', () => {
    renderWithRoute('/(auth)/otp', ['(auth)']);
    expect(mockReplace).toHaveBeenCalledWith('/(main)/discover');
  });

  // After profile creation in city.tsx, the user must reach record and profile-setup
  // without AuthRedirector stealing them away to discover.
  const postCreationPaths: [string, string[]][] = [
    ['/(auth)/onboarding/city', ['(auth)', 'onboarding', 'city']],
    ['/(auth)/record', ['(auth)', 'record']],
    ['/(auth)/profile-setup', ['(auth)', 'profile-setup']],
  ];

  it.each(postCreationPaths)(
    'does NOT redirect away from post-creation path %s',
    (pathname, segments) => {
      renderWithRoute(pathname, segments);
      expect(mockReplace).not.toHaveBeenCalled();
    },
  );

  it('does not redirect when already on the discover page', () => {
    renderWithRoute('/(main)/discover', ['(main)']);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect when on main profile page', () => {
    renderWithRoute('/(main)/profile', ['(main)']);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
