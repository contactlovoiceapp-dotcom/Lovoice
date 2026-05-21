/* Report modal: 5 reason chips + optional free-text + submit; switches to a success state after submission. */

import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';

import ModalOverlay from '@/components/ModalOverlay';
import { COLORS, FONT, RADIUS } from '@/theme';
import { COPY } from '@/copy';
import { REPORT_REASONS, type ReportReason, type ReportTargetKind } from '../types';
import { useReportContent } from '../api/reportMutations';

interface ReportSheetProps {
  visible: boolean;
  displayName: string;
  targetKind: ReportTargetKind;
  targetId: string;
  targetUserId: string | null;
  onClose: () => void;
}

export default function ReportSheet({
  visible,
  displayName,
  targetKind,
  targetId,
  targetUserId,
  onClose,
}: ReportSheetProps) {
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [freeText, setFreeText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const mutation = useReportContent();

  const handleClose = () => {
    setSelectedReason(null);
    setFreeText('');
    setSubmitted(false);
    onClose();
  };

  const handleSubmit = () => {
    if (!selectedReason) return;

    mutation.mutate(
      { targetKind, targetId, targetUserId, reason: selectedReason, freeText },
      { onSuccess: () => setSubmitted(true) },
    );
  };

  if (submitted) {
    return (
      <ModalOverlay visible={visible} onClose={handleClose} centered>
        <CheckCircle2 size={48} color="#10b981" style={{ marginBottom: 16 }} />
        <Text
          style={{
            fontFamily: FONT.bold,
            fontSize: 20,
            color: COLORS.dark,
            marginBottom: 8,
            textAlign: 'center',
          }}
        >
          {COPY.reportSheet.successTitle}
        </Text>
        <Text
          style={{
            color: COLORS.textSecondary,
            textAlign: 'center',
            marginBottom: 24,
          }}
        >
          {COPY.reportSheet.successBody}
        </Text>
        <Pressable
          onPress={handleClose}
          style={{
            width: '100%',
            backgroundColor: COLORS.primary,
            borderRadius: RADIUS.cta,
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontFamily: FONT.bold, color: 'white', fontSize: 16 }}>
            {COPY.reportSheet.successCta}
          </Text>
        </Pressable>
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay visible={visible} onClose={handleClose}>
      <Text
        style={{
          fontFamily: FONT.bold,
          fontSize: 20,
          color: COLORS.dark,
          marginBottom: 4,
          paddingRight: 32,
        }}
      >
        {COPY.reportSheet.title(displayName)}
      </Text>
      <Text style={{ color: COLORS.textSecondary, marginBottom: 16 }}>
        {COPY.reportSheet.subtitle}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {REPORT_REASONS.map((reason) => {
          const isSelected = selectedReason === reason;
          return (
            <Pressable
              key={reason}
              onPress={() => setSelectedReason(reason)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: RADIUS.full,
                borderWidth: 1,
                backgroundColor: isSelected ? COLORS.primary : 'transparent',
                borderColor: isSelected ? COLORS.primary : COLORS.border,
              }}
            >
              <Text
                style={{
                  fontFamily: FONT.medium,
                  fontSize: 14,
                  color: isSelected ? 'white' : COLORS.dark,
                }}
              >
                {COPY.reportSheet.reasons[reason]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        value={freeText}
        onChangeText={(text) => setFreeText(text.slice(0, 500))}
        placeholder={COPY.reportSheet.freeTextPlaceholder}
        placeholderTextColor={COLORS.textTertiary}
        multiline
        style={{
          width: '100%',
          backgroundColor: COLORS.borderLight,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: RADIUS.input,
          padding: 16,
          color: COLORS.dark,
          marginBottom: 4,
          minHeight: 90,
          textAlignVertical: 'top',
        }}
      />

      <Text
        style={{
          fontSize: 11,
          color: COLORS.textTertiary,
          textAlign: 'right',
          marginBottom: 16,
        }}
      >
        {freeText.length} / 500
      </Text>

      {mutation.isError && (
        <Text style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>
          {COPY.reportSheet.error}
        </Text>
      )}

      <Pressable
        onPress={handleSubmit}
        disabled={selectedReason === null || mutation.isPending}
        style={{
          backgroundColor: '#ef4444',
          borderRadius: RADIUS.cta,
          paddingVertical: 14,
          alignItems: 'center',
          opacity: selectedReason === null ? 0.4 : 1,
        }}
      >
        <Text style={{ fontFamily: FONT.bold, color: 'white', fontSize: 16 }}>
          {mutation.isPending ? COPY.reportSheet.submitting : COPY.reportSheet.submit}
        </Text>
      </Pressable>
    </ModalOverlay>
  );
}
