/* Reusable animated modal overlay with backdrop blur, fade+scale entrance, and close button. */

import React, { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';

interface ModalOverlayProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  centered?: boolean;
}

const ModalOverlay: React.FC<ModalOverlayProps> = ({
  visible,
  onClose,
  children,
  centered = false,
}) => {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 200 });
    scale.value = withTiming(visible ? 1 : 0.9, { duration: 200 });
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        backdropStyle,
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          backgroundColor: 'rgba(75, 22, 76, 0.45)',
        },
      ]}
    >
      <Animated.View
        style={[
          contentStyle,
          {
            backgroundColor: 'white',
            borderRadius: 24,
            padding: 24,
            width: '100%',
            maxWidth: 384,
            position: 'relative',
            alignItems: centered ? 'center' : undefined,
          },
        ]}
      >
        <Pressable
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            padding: 8,
            zIndex: 10,
          }}
        >
          <X size={22} color="rgba(75, 22, 76, 0.3)" />
        </Pressable>
        {children}
      </Animated.View>
    </Animated.View>
  );
};

export default ModalOverlay;
