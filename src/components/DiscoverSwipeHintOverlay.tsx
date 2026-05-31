/* First-visit Discover overlay — dark scrim + centred white card with chevron, hint text, and dismiss CTA. */

import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, CTA_GRADIENT, FONT, RADIUS } from '../theme';
import { COPY } from '../copy';

interface DiscoverSwipeHintOverlayProps {
  onDismiss: () => void;
}

export default function DiscoverSwipeHintOverlay({ onDismiss }: DiscoverSwipeHintOverlayProps) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(10, { duration: 650, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 650, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [translateY]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: 'rgba(45, 17, 54, 0.68)',
      }}
    >
      <View
        style={{
          backgroundColor: 'white',
          borderRadius: RADIUS.modal,
          padding: 24,
          width: '100%',
          maxWidth: 384,
          alignItems: 'center',
        }}
      >
        <Animated.View style={chevronStyle}>
          <ChevronDown size={36} color={COLORS.primary} strokeWidth={2.5} />
        </Animated.View>

        <Text
          style={{
            marginTop: 16,
            marginBottom: 24,
            textAlign: 'center',
            fontSize: 20,
            fontFamily: FONT.bold,
            color: COLORS.dark,
          }}
        >
          {COPY.feed.swipeHint}
        </Text>

        <Pressable onPress={onDismiss} style={{ width: '100%' }}>
          <LinearGradient
            colors={[...CTA_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: RADIUS.cta, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: FONT.bold, color: 'white', fontSize: 16 }}>
              {COPY.feed.swipeHintGotIt}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}
