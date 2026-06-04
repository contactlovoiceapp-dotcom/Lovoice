/* Tests for useForegroundSync: invalidates inbox + likes queries on background → active. */

import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { chatQueryKeys } from '@/features/chat/api/conversationQueries';
import { likeQueryKeys } from '@/features/likes/api/likeQueries';
import { useForegroundSync } from '../useForegroundSync';

function HookConsumer() {
  useForegroundSync();
  return null;
}

describe('useForegroundSync', () => {
  let capturedListener: ((state: AppStateStatus) => void) | null = null;
  const removeMock = jest.fn();
  let queryClient: QueryClient;
  let invalidateSpy: jest.SpyInstance;

  function renderHook() {
    queryClient = new QueryClient();
    invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    return render(
      <QueryClientProvider client={queryClient}>
        <HookConsumer />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    capturedListener = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => {
      capturedListener = cb as (state: AppStateStatus) => void;
      return { remove: removeMock } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('invalidates inbox and likes queries when resuming to active', async () => {
    renderHook();

    await act(async () => {
      capturedListener?.('active');
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: chatQueryKeys.inbox });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: likeQueryKeys.received });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: likeQueryKeys.given });
  });

  it('does not invalidate on background or inactive transitions', async () => {
    renderHook();

    await act(async () => {
      capturedListener?.('background');
      capturedListener?.('inactive');
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('removes the AppState listener on unmount', () => {
    const { unmount } = renderHook();
    unmount();
    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
