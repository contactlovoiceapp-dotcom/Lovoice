/* Block confirmation modal: final guard before muting a user across feed/chat. */

import React from 'react';
import { Pressable, Text, View } from 'react-native';

import ModalOverlay from '@/components/ModalOverlay';
import { COLORS, FONT, RADIUS } from '@/theme';
import { COPY } from '@/copy';
import { useBlockUser } from '../api/blockMutations';
import type { BlockInput } from '../types';

interface BlockConfirmModalProps {
  visible: boolean;
  displayName: string;
  blockedUserId: string;
  onClose: () => void;
}

export default function BlockConfirmModal({
  visible,
  displayName,
  blockedUserId,
  onClose,
}: BlockConfirmModalProps) {
  const mutation = useBlockUser();

  const handleBlock = () => {
    const input: BlockInput = { blockedUserId };
    mutation.mutate(input, { onSuccess: onClose });
  };

  return (
    <ModalOverlay visible={visible} onClose={onClose}>
      <Text
        style={{
          fontFamily: FONT.bold,
          fontSize: 20,
          color: COLORS.dark,
          marginBottom: 12,
          paddingRight: 32,
        }}
      >
        {COPY.blockModal.title(displayName)}
      </Text>
      <Text style={{ color: COLORS.textSecondary, marginBottom: 24 }}>
        {COPY.blockModal.body(displayName)}
      </Text>

      {mutation.isError && (
        <Text style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>
          {COPY.blockModal.error}
        </Text>
      )}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable
          onPress={onClose}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: RADIUS.cta,
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontFamily: FONT.medium, color: COLORS.dark, fontSize: 16 }}>
            {COPY.common.cancel}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleBlock}
          disabled={mutation.isPending}
          style={{
            flex: 1,
            backgroundColor: '#ef4444',
            borderRadius: RADIUS.cta,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: mutation.isPending ? 0.6 : 1,
          }}
        >
          <Text style={{ fontFamily: FONT.bold, color: 'white', fontSize: 16 }}>
            {mutation.isPending ? COPY.blockModal.blocking : COPY.blockModal.confirm}
          </Text>
        </Pressable>
      </View>
    </ModalOverlay>
  );
}
