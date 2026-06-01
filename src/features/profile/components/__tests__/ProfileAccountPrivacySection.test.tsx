/* Tests for ProfileAccountPrivacySection — legal links, export CTA, and delete account. */

import React from 'react';
import { Alert, Linking } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { COPY } from '@/copy';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { ProfileAccountPrivacySection } from '../ProfileAccountPrivacySection';

jest.mock('@/lib/supabase');
jest.mock('@/features/auth/api/accountMutations', () => ({
  useDeleteAccount: jest.fn(),
}));
jest.mock('@/features/profile/api/dataExportMutations', () => ({
  useRequestDataExport: jest.fn(),
}));

const mockMutateAsync = jest.fn();
const mockDeleteMutateAsync = jest.fn();

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileAccountPrivacySection />
    </QueryClientProvider>,
  );
}

describe('ProfileAccountPrivacySection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { useRequestDataExport } = jest.requireMock(
      '@/features/profile/api/dataExportMutations',
    ) as { useRequestDataExport: jest.Mock };
    useRequestDataExport.mockReturnValue({
      isPending: false,
      mutateAsync: mockMutateAsync,
    });

    const { useDeleteAccount } = jest.requireMock('@/features/auth/api/accountMutations') as {
      useDeleteAccount: jest.Mock;
    };
    useDeleteAccount.mockReturnValue({
      isPending: false,
      mutateAsync: mockDeleteMutateAsync,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders section title, legal links, export CTA, and delete account', () => {
    const { getByText } = renderSection();

    expect(getByText(COPY.profile.legalSectionTitle)).toBeTruthy();
    expect(getByText(COPY.profile.termsLink)).toBeTruthy();
    expect(getByText(COPY.profile.privacyLink)).toBeTruthy();
    expect(getByText(COPY.profile.exportDataCta)).toBeTruthy();
    expect(getByText(COPY.profile.deleteAccountCta)).toBeTruthy();
  });

  it('opens terms URL when terms link is pressed', () => {
    const { getByText } = renderSection();
    fireEvent.press(getByText(COPY.profile.termsLink));
    expect(Linking.openURL).toHaveBeenCalledWith(TERMS_URL);
  });

  it('opens privacy URL when privacy link is pressed', () => {
    const { getByText } = renderSection();
    fireEvent.press(getByText(COPY.profile.privacyLink));
    expect(Linking.openURL).toHaveBeenCalledWith(PRIVACY_URL);
  });

  it('shows success alert after export mutation succeeds', async () => {
    mockMutateAsync.mockResolvedValue(undefined);

    const { getByText } = renderSection();
    fireEvent.press(getByText(COPY.profile.exportDataCta));

    expect(Alert.alert).toHaveBeenCalledWith(
      COPY.profile.exportDataConfirmTitle,
      COPY.profile.exportDataConfirmBody,
      expect.any(Array),
    );

    const confirmButtons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    const confirm = confirmButtons.find((b) => b.text === COPY.profile.exportDataConfirmCta);
    confirm?.onPress?.();

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        COPY.profile.exportDataSuccessTitle,
        COPY.profile.exportDataSuccessBody,
      );
    });
  });

  it('shows already-pending message when export mutation fails with that code', async () => {
    mockMutateAsync.mockRejectedValue(new Error('export.already_pending'));

    const { getByText } = renderSection();
    fireEvent.press(getByText(COPY.profile.exportDataCta));

    const confirmButtons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    const confirm = confirmButtons.find((b) => b.text === COPY.profile.exportDataConfirmCta);
    confirm?.onPress?.();

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        COPY.profile.exportDataConfirmTitle,
        COPY.profile.exportDataAlreadyPending,
      );
    });
  });
});
