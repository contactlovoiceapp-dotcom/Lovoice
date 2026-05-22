/* Unit tests for ReportSheet: submit disabled without reason, enabled after picking; success state on submit. */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ReportSheet from '../ReportSheet';
import { COPY } from '../../../../copy';

jest.mock('@/lib/supabase');

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

const DEFAULT_PROPS = {
  visible: true,
  displayName: 'Léa',
  targetKind: 'voice' as const,
  targetId: 'voice-abc',
  targetUserId: 'user-abc',
  onClose: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('ReportSheet', () => {
  it('renders the title with displayName', () => {
    const queryClient = makeQueryClient();
    const { getByText } = render(
      React.createElement(makeWrapper(queryClient), null,
        React.createElement(ReportSheet, DEFAULT_PROPS),
      ),
    );
    expect(getByText(COPY.reportSheet.title('Léa'))).toBeTruthy();
  });

  it('tapping submit without selecting a reason does not mutate (button has disabled prop set)', () => {
    const queryClient = makeQueryClient();
    const { getByText } = render(
      React.createElement(makeWrapper(queryClient), null,
        React.createElement(ReportSheet, DEFAULT_PROPS),
      ),
    );
    // Walk up until we find a node that carries the disabled prop.
    let node = getByText(COPY.reportSheet.submit);
    let found = false;
    for (let i = 0; i < 5; i++) {
      if (node?.props.disabled !== undefined) { found = true; break; }
      if (!node?.parent) break;
      node = node.parent;
    }
    expect(found).toBe(true);
    expect(node?.props.disabled).toBe(true);
  });

  it('submit button is enabled after selecting a reason (disabled becomes false)', () => {
    const queryClient = makeQueryClient();
    const { getByText } = render(
      React.createElement(makeWrapper(queryClient), null,
        React.createElement(ReportSheet, DEFAULT_PROPS),
      ),
    );

    fireEvent.press(getByText(COPY.reportSheet.reasons.spam));

    let node = getByText(COPY.reportSheet.submit);
    for (let i = 0; i < 5; i++) {
      if (node?.props.disabled !== undefined) break;
      if (!node?.parent) break;
      node = node.parent;
    }
    expect(node?.props.disabled).toBe(false);
  });

  it('shows success state after successful submission', async () => {
    const insertReports = jest.fn().mockResolvedValue({ error: null });
    const insertBlocks = jest.fn().mockResolvedValue({ error: null });
    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'me' } } }),
      },
      from: jest.fn((table: string) => {
        if (table === 'reports') return { insert: insertReports };
        if (table === 'blocks') return { insert: insertBlocks };
        return { insert: jest.fn().mockResolvedValue({ error: null }) };
      }),
    });

    const queryClient = makeQueryClient();
    const { getByText } = render(
      React.createElement(makeWrapper(queryClient), null,
        React.createElement(ReportSheet, DEFAULT_PROPS),
      ),
    );

    fireEvent.press(getByText(COPY.reportSheet.reasons.harassment));
    fireEvent.press(getByText(COPY.reportSheet.submit));

    await waitFor(() => expect(getByText(COPY.reportSheet.successTitle)).toBeTruthy());
    expect(getByText(COPY.reportSheet.successCta)).toBeTruthy();
  });
});
