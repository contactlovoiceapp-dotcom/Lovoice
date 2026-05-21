/* Reusable overlay wrapper for in-app modals: dark scrim + centred white card with a dismiss X. */

import React from 'react';
import { Pressable, View } from 'react-native';
import { X } from 'lucide-react-native';

import { COLORS, RADIUS } from '../theme';

interface ModalOverlayProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  centered?: boolean;
}

export default function ModalOverlay({
  visible,
  onClose,
  children,
  centered = false,
}: ModalOverlayProps) {
  if (!visible) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 50,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: 'rgba(45, 17, 54, 0.45)',
      }}
    >
      <View
        style={{
          backgroundColor: 'white',
          borderRadius: RADIUS.modal,
          padding: 24,
          width: '100%',
          maxWidth: 384,
          position: 'relative',
          alignItems: centered ? 'center' : undefined,
        }}
      >
        <Pressable
          onPress={onClose}
          style={{ position: 'absolute', top: 16, right: 16, padding: 8, zIndex: 10 }}
        >
          <X size={22} color={COLORS.textTertiary} />
        </Pressable>
        {children}
      </View>
    </View>
  );
}
