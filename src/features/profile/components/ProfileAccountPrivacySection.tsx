/* Profile footer — account privacy: legal links, RGPD data-export request, and account deletion. */

import React, { useCallback } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';

import { COPY } from '@/copy';
import { useDeleteAccount } from '@/features/auth/api/accountMutations';
import { useRequestDataExport } from '@/features/profile/api/dataExportMutations';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { COLORS, FONT } from '@/theme';

function SectionTitle({ label }: { label: string }) {
  return (
    <Text
      style={{
        marginBottom: 12,
        fontSize: 13,
        fontFamily: FONT.bold,
        color: COLORS.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      {label}
    </Text>
  );
}

function LegalLinkRow({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => {
        void Linking.openURL(url);
      }}
      style={{ paddingVertical: 10 }}
    >
      <Text
        style={{
          fontFamily: FONT.medium,
          fontSize: 14,
          color: COLORS.dark,
          textDecorationLine: 'underline',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ProfileAccountPrivacySection() {
  const deleteAccount = useDeleteAccount();
  const requestDataExport = useRequestDataExport();

  const handleDeleteAccount = useCallback(() => {
    if (deleteAccount.isPending) return;

    // Two-step confirmation for an irreversible, RGPD-grade destructive action.
    Alert.alert(
      COPY.profile.deleteAccountConfirmTitle,
      COPY.profile.deleteAccountConfirmBody,
      [
        { text: COPY.common.cancel, style: 'cancel' },
        {
          text: COPY.profile.deleteAccountConfirmCta,
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              COPY.profile.deleteAccountFinalTitle,
              COPY.profile.deleteAccountFinalBody,
              [
                { text: COPY.common.cancel, style: 'cancel' },
                {
                  text: COPY.profile.deleteAccountFinalCta,
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      // On success the hook clears the session; AuthRedirector navigates away.
                      await deleteAccount.mutateAsync();
                    } catch {
                      Alert.alert(
                        COPY.profile.deleteAccountConfirmTitle,
                        COPY.profile.deleteAccountError,
                      );
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [deleteAccount]);

  const handleRequestDataExport = useCallback(() => {
    if (requestDataExport.isPending) return;

    Alert.alert(
      COPY.profile.exportDataConfirmTitle,
      COPY.profile.exportDataConfirmBody,
      [
        { text: COPY.common.cancel, style: 'cancel' },
        {
          text: COPY.profile.exportDataConfirmCta,
          onPress: () => {
            void (async () => {
              try {
                await requestDataExport.mutateAsync();
                Alert.alert(
                  COPY.profile.exportDataSuccessTitle,
                  COPY.profile.exportDataSuccessBody,
                );
              } catch (err) {
                const code = err instanceof Error ? err.message : 'export.request_failed';
                if (code === 'export.already_pending') {
                  Alert.alert(
                    COPY.profile.exportDataConfirmTitle,
                    COPY.profile.exportDataAlreadyPending,
                  );
                  return;
                }
                Alert.alert(
                  COPY.profile.exportDataConfirmTitle,
                  COPY.profile.exportDataError,
                );
              }
            })();
          },
        },
      ],
    );
  }, [requestDataExport]);

  return (
    <View style={{ marginTop: 32, width: '100%' }}>
      <SectionTitle label={COPY.profile.legalSectionTitle} />

      <LegalLinkRow label={COPY.profile.termsLink} url={TERMS_URL} />
      <LegalLinkRow label={COPY.profile.privacyLink} url={PRIVACY_URL} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={COPY.profile.exportDataCta}
        disabled={requestDataExport.isPending}
        onPress={handleRequestDataExport}
        style={{
          paddingVertical: 10,
          opacity: requestDataExport.isPending ? 0.4 : 1,
        }}
      >
        {requestDataExport.isPending ? (
          <ActivityIndicator size="small" color={COLORS.dark} />
        ) : (
          <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.dark }}>
            {COPY.profile.exportDataCta}
          </Text>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={COPY.profile.deleteAccountCta}
        disabled={deleteAccount.isPending}
        onPress={handleDeleteAccount}
        style={{
          alignSelf: 'center',
          marginTop: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 10,
          paddingHorizontal: 16,
          opacity: deleteAccount.isPending ? 0.4 : 1,
        }}
      >
        {deleteAccount.isPending ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <Trash2 size={14} color={COLORS.primary} />
        )}
        <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: COLORS.primary }}>
          {COPY.profile.deleteAccountCta}
        </Text>
      </Pressable>
    </View>
  );
}
