/* Tests for voice queries: active voice fetch and signed URL resolution. */

import React, { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import type { VoiceRow } from '../../types';
import { useActiveVoice, useVoiceSignedUrl, voiceQueryKeys } from '../voiceQueries';

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

function makeVoice(overrides: Partial<VoiceRow> = {}): VoiceRow {
  return {
    id: 'voice-1',
    user_id: 'user-1',
    storage_path: 'user-1/voice-1.m4a',
    duration_ms: 30_000,
    prompt_id: null,
    title: null,
    theme: null,
    transcript: null,
    status: 'approved',
    moderation_reason: null,
    is_active: true,
    created_at: '2026-05-12T12:00:00.000Z',
    ...overrides,
  };
}

function createWrapper(): React.ComponentType<{ children: ReactNode }> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('voiceQueryKeys', () => {
  it('namespaces all keys under "voices"', () => {
    expect(voiceQueryKeys.all).toEqual(['voices']);
    expect(voiceQueryKeys.active('user-1')).toEqual(['voices', 'active', 'user-1']);
    expect(voiceQueryKeys.signedUrl('path')).toEqual(['voices', 'signed-url', 'path']);
  });
});

describe('useActiveVoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips fetching when userId is null', () => {
    const { result } = renderHook(() => useActiveVoice(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });

  it('fetches the user\'s active voice', async () => {
    const voice = makeVoice();
    const maybeSingle = jest.fn().mockResolvedValue({ data: voice, error: null });
    const eqActive = jest.fn(() => ({ maybeSingle }));
    const eqUser = jest.fn(() => ({ eq: eqActive }));
    const select = jest.fn(() => ({ eq: eqUser }));
    const from = jest.fn(() => ({ select }));

    jest.mocked(getSupabaseClient).mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useActiveVoice('user-1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.data).toEqual(voice);
    });

    expect(from).toHaveBeenCalledWith('voices');
    expect(select).toHaveBeenCalledWith('*');
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(eqActive).toHaveBeenCalledWith('is_active', true);
  });

  it('surfaces Supabase errors as React Query errors', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'voice.network_error' },
    });
    const eqActive = jest.fn(() => ({ maybeSingle }));
    const eqUser = jest.fn(() => ({ eq: eqActive }));
    const select = jest.fn(() => ({ eq: eqUser }));
    const from = jest.fn(() => ({ select }));

    jest.mocked(getSupabaseClient).mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useActiveVoice('user-1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('voice.network_error');
  });
});

describe('useVoiceSignedUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips fetching when storagePath is null', () => {
    const { result } = renderHook(() => useVoiceSignedUrl(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('returns the signed URL', async () => {
    const createSignedUrl = jest
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://signed.example/voice.m4a' }, error: null });
    const fromStorage = jest.fn(() => ({ createSignedUrl }));

    jest.mocked(getSupabaseClient).mockReturnValue({
      storage: { from: fromStorage },
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useVoiceSignedUrl('user-1/voice-1.m4a'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBe('https://signed.example/voice.m4a');
    });

    expect(fromStorage).toHaveBeenCalledWith('voices');
    expect(createSignedUrl).toHaveBeenCalledWith('user-1/voice-1.m4a', 3600);
  });
});
