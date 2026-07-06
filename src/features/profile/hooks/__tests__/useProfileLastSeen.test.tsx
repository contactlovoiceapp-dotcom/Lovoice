/* Tests for useProfileLastSeen: throttled profiles.last_seen_at heartbeat. */

import React from 'react';
import { AppState, InteractionManager } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

import { getSupabaseClient } from '@/lib/supabase';
import { useProfileLastSeen } from '../useProfileLastSeen';

function HookConsumer() {
  useProfileLastSeen();
  return null;
}

describe('useProfileLastSeen', () => {
  const mockEq = jest.fn().mockResolvedValue({ error: null });
  const mockUpdate = jest.fn(() => ({ eq: mockEq }));
  const mockGetSession = jest.fn().mockResolvedValue({
    data: { session: { user: { id: 'user-1' } } },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((task) => {
      task();
      return { cancel: jest.fn() };
    });
    (getSupabaseClient as jest.Mock).mockReturnValue({
      auth: { getSession: mockGetSession },
      from: jest.fn(() => ({ update: mockUpdate })),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates profiles.last_seen_at on mount', async () => {
    render(<HookConsumer />);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ last_seen_at: expect.any(String) }),
      );
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('does not ping again immediately on foreground resume', async () => {
    render(<HookConsumer />);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    const handler = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
    handler('active');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
