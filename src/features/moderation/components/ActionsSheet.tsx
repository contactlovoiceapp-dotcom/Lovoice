/* Bottom-of-card sheet: lets the user signal or block the profile shown on a feed card. */

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ban, Flag } from 'lucide-react-native';

import ModalOverlay from '@/components/ModalOverlay';
import { COLORS, FONT } from '@/theme';
import { COPY } from '@/copy';

interface ActionsSheetProps {
  visible: boolean;
  displayName: string;
  onReport: () => void;
  onBlock: () => void;
  onClose: () => void;
}

export default function ActionsSheet({
  visible,
  displayName,
  onReport,
  onBlock,
  onClose,
}: ActionsSheetProps) {
  return (
    <ModalOverlay visible={visible} onClose={onClose}>
      <Text
        style={{
          fontFamily: FONT.bold,
          fontSize: 20,
          color: COLORS.dark,
          marginBottom: 20,
          paddingRight: 32,
        }}
      >
        {COPY.actionsSheet.title(displayName)}
      </Text>

      <Pressable
        onPress={onReport}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 14,
        }}
      >
        <Flag size={20} color={COLORS.dark} />
        <Text style={{ fontFamily: FONT.medium, fontSize: 16, color: COLORS.dark }}>
          {COPY.actionsSheet.report}
        </Text>
      </Pressable>

      <Pressable
        onPress={onBlock}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 14,
        }}
      >
        <Ban size={20} color={COLORS.dark} />
        <Text style={{ fontFamily: FONT.medium, fontSize: 16, color: COLORS.dark }}>
          {COPY.actionsSheet.block}
        </Text>
      </Pressable>

      <Pressable
        onPress={onClose}
        style={{ paddingVertical: 14, alignItems: 'center', marginTop: 4 }}
      >
        <Text style={{ fontFamily: FONT.medium, fontSize: 16, color: COLORS.textTertiary }}>
          {COPY.common.cancel}
        </Text>
      </Pressable>
    </ModalOverlay>
  );
}
