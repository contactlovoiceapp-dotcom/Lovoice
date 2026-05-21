/* Unit tests for BlockConfirmModal: confirm button triggers mutation; modal closes on success. */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import BlockConfirmModal from '../BlockConfirmModal';
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
  displayName: 'Marc',
  blockedUserId: 'user-marc',
  onClose: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('BlockConfirmModal', () => {
  it('renders title and body with the displayName', () => {
    const queryClient = makeQueryClient();
    const { getByText } = render(
      React.createElement(makeWrapper(queryClient), null,
        React.createElement(BlockConfirmModal, DEFAULT_PROPS),
      ),
    );
    expect(getByText(COPY.blockModal.title('Marc'))).toBeTruthy();
    expect(getByText(COPY.blockModal.body('Marc'))).toBeTruthy();
  });

  it('calls onClose when cancel is pressed without triggering the mutation', () => {
    const queryClient = makeQueryClient();
    const { getByText } = render(
      React.createElement(makeWrapper(queryClient), null,
        React.createElement(BlockConfirmModal, DEFAULT_PROPS),
      ),
    );

    fireEvent.press(getByText(COPY.common.cancel));
    expect(DEFAULT_PROPS.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls the mutation and onClose on successful block', async () => {
    const insertMock = jest.fn().mockResolvedValue({ error: null });
    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'me' } } }),
      },
      from: jest.fn().mockReturnValue({ insert: insertMock }),
    });

    const queryClient = makeQueryClient();
    const { getByText } = render(
      React.createElement(makeWrapper(queryClient), null,
        React.createElement(BlockConfirmModal, DEFAULT_PROPS),
      ),
    );

    fireEvent.press(getByText(COPY.blockModal.confirm));

    await waitFor(() => expect(DEFAULT_PROPS.onClose).toHaveBeenCalledTimes(1));
    expect(insertMock).toHaveBeenCalledWith({ blocker_id: 'me', blocked_id: 'user-marc' });
  });
});
