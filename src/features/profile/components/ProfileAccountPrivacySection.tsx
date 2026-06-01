/* Profile footer — account privacy: legal links, RGPD data-export request, and account deletion. */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Trash2 } from 'lucide-react-native';

import ModalOverlay from '@/components/ModalOverlay';
import { COPY } from '@/copy';
import { useDeleteAccount } from '@/features/auth/api/accountMutations';
import { useRequestDataExport } from '@/features/profile/api/dataExportMutations';
import { isValidContactEmail } from '@/features/profile/helpers/contactEmail';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { COLORS, FONT, RADIUS } from '@/theme';

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
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

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

  const openExportModal = useCallback(() => {
    if (requestDataExport.isPending) return;
    setContactEmail('');
    setEmailError(null);
    setExportModalVisible(true);
  }, [requestDataExport.isPending]);

  const closeExportModal = useCallback(() => {
    if (requestDataExport.isPending) return;
    setExportModalVisible(false);
    setEmailError(null);
  }, [requestDataExport.isPending]);

  const submitDataExport = useCallback(async () => {
    if (!isValidContactEmail(contactEmail)) {
      setEmailError(COPY.profile.exportDataEmailInvalid);
      return;
    }

    setEmailError(null);

    try {
      await requestDataExport.mutateAsync({ contactEmail });
      setExportModalVisible(false);
      setContactEmail('');
      Alert.alert(
        COPY.profile.exportDataSuccessTitle,
        COPY.profile.exportDataSuccessBody,
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : 'export.request_failed';
      if (code === 'export.already_pending') {
        setExportModalVisible(false);
        Alert.alert(
          COPY.profile.exportDataConfirmTitle,
          COPY.profile.exportDataAlreadyPending,
        );
        return;
      }
      if (code === 'export.email_invalid') {
        setEmailError(COPY.profile.exportDataEmailInvalid);
        return;
      }
      Alert.alert(COPY.profile.exportDataConfirmTitle, COPY.profile.exportDataError);
    }
  }, [contactEmail, requestDataExport]);

  return (
    <View style={{ marginTop: 32, width: '100%' }}>
      <SectionTitle label={COPY.profile.legalSectionTitle} />

      <LegalLinkRow label={COPY.profile.termsLink} url={TERMS_URL} />
      <LegalLinkRow label={COPY.profile.privacyLink} url={PRIVACY_URL} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={COPY.profile.exportDataCta}
        disabled={requestDataExport.isPending}
        onPress={openExportModal}
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

      <ModalOverlay visible={exportModalVisible} onClose={closeExportModal} centered>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Text
            style={{
              marginBottom: 8,
              fontFamily: FONT.bold,
              fontSize: 18,
              color: COLORS.dark,
              textAlign: 'center',
            }}
          >
            {COPY.profile.exportDataConfirmTitle}
          </Text>
          <Text
            style={{
              marginBottom: 16,
              fontFamily: FONT.regular,
              fontSize: 14,
              lineHeight: 20,
              color: COLORS.textSecondary,
              textAlign: 'center',
            }}
          >
            {COPY.profile.exportDataConfirmBody}
          </Text>

          <Text style={{ marginBottom: 6, fontFamily: FONT.semibold, fontSize: 13, color: COLORS.dark }}>
            {COPY.profile.exportDataEmailLabel}
          </Text>
          <TextInput
            accessibilityLabel={COPY.profile.exportDataEmailLabel}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder={COPY.profile.exportDataEmailPlaceholder}
            placeholderTextColor={COLORS.textTertiary}
            value={contactEmail}
            onChangeText={(text) => {
              setContactEmail(text);
              if (emailError) setEmailError(null);
            }}
            style={{
              borderWidth: 1,
              borderColor: emailError ? COLORS.primary : COLORS.border,
              borderRadius: RADIUS.md,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontFamily: FONT.regular,
              fontSize: 16,
              color: COLORS.dark,
            }}
          />
          {emailError ? (
            <Text style={{ marginTop: 6, fontFamily: FONT.medium, fontSize: 12, color: COLORS.primary }}>
              {emailError}
            </Text>
          ) : null}

          <View style={{ marginTop: 20, flexDirection: 'row', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              onPress={closeExportModal}
              disabled={requestDataExport.isPending}
              style={{
                flex: 1,
                borderRadius: RADIUS.full,
                borderWidth: 1,
                borderColor: COLORS.border,
                paddingVertical: 14,
                alignItems: 'center',
                opacity: requestDataExport.isPending ? 0.5 : 1,
              }}
            >
              <Text style={{ fontFamily: FONT.semibold, color: COLORS.dark }}>{COPY.common.cancel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void submitDataExport();
              }}
              disabled={requestDataExport.isPending}
              style={{
                flex: 1,
                borderRadius: RADIUS.full,
                backgroundColor: COLORS.primary,
                paddingVertical: 14,
                alignItems: 'center',
                opacity: requestDataExport.isPending ? 0.5 : 1,
              }}
            >
              {requestDataExport.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ fontFamily: FONT.bold, color: '#fff' }}>
                  {COPY.profile.exportDataConfirmCta}
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </ModalOverlay>

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
