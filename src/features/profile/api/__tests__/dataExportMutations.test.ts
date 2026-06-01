/* Tests for data-export request mutation: error mapping and insert behaviour. */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { mapDataExportError, useRequestDataExport } from '../dataExportMutations';

jest.mock('@/lib/supabase');

const MOCK_UID = 'user-export-1';

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function buildSupabaseMock(insertError: { code?: string; message?: string } | null = null) {
  const insert = jest.fn().mockResolvedValue({ error: insertError });
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: MOCK_UID } },
        error: null,
      }),
    },
    from: jest.fn((table: string) => {
      if (table === 'data_export_requests') {
        return { insert };
      }
      return { insert: jest.fn() };
    }),
    insert,
  };
}

describe('mapDataExportError', () => {
  it('maps unique violation to export.already_pending', () => {
    expect(mapDataExportError({ code: '23505', message: 'duplicate key' })).toBe(
      'export.already_pending',
    );
  });

  it('maps other errors to export.request_failed', () => {
    expect(mapDataExportError({ code: '42501', message: 'permission denied' })).toBe(
      'export.request_failed',
    );
    expect(mapDataExportError(null)).toBe('export.request_failed');
  });
});

describe('useRequestDataExport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts a pending export row for the authenticated user', async () => {
    const supabaseMock = buildSupabaseMock();
    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useRequestDataExport(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabaseMock.insert).toHaveBeenCalledWith({ user_id: MOCK_UID });
  });

  it('rejects with export.already_pending on duplicate pending request', async () => {
    const supabaseMock = buildSupabaseMock({ code: '23505', message: 'duplicate' });
    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useRequestDataExport(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('export.already_pending');
  });

  it('rejects with export.request_failed on other insert errors', async () => {
    const supabaseMock = buildSupabaseMock({ code: 'XX000', message: 'boom' });
    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useRequestDataExport(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('export.request_failed');
  });
});
