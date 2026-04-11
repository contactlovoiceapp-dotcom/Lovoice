/* Brief brand moment on app launch: full-screen splash with a pulsing ambient glow, logo spring-in, and welcome line before navigation continues. */

import React, { useEffect } from 'react';
import { Image, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const LOGO = require('../../../assets/logo.png');

const GLOW_SIZE = 400;
/** Primary (#e724ab) at 15% opacity — matches Tailwind `bg-primary/15` without blur on native. */
const GLOW_BACKGROUND = 'rgba(231, 36, 171, 0.15)';

interface Props {
  onFinish: () => void;
}

function AmbientGlow() {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.4, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    scale.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View className="pointer-events-none absolute inset-0 items-center justify-center overflow-hidden">
      <Animated.View
        style={[
          {
            width: GLOW_SIZE,
            height: GLOW_SIZE,
            borderRadius: GLOW_SIZE / 2,
            backgroundColor: GLOW_BACKGROUND,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

const SplashScreen: React.FC<Props> = ({ onFinish }) => {
  const { width, height } = useWindowDimensions();

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.5);
  const textOpacity = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withSpring(1, { damping: 14, stiffness: 220, mass: 0.65 });
    logoScale.value = withSpring(1, { damping: 14, stiffness: 220, mass: 0.65 });
    textOpacity.value = withDelay(600, withTiming(1, { duration: 800 }));

    const timer = setTimeout(onFinish, 2500);
    return () => clearTimeout(timer);
  }, [onFinish]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <View
      style={{ width, height }}
      className="relative flex-col items-center justify-center overflow-hidden bg-background"
    >
      <AmbientGlow />

      <Animated.View style={[logoStyle, { zIndex: 10, marginBottom: 16 }]}>
        <Image
          source={LOGO}
          accessibilityLabel="LOVoice"
          resizeMode="contain"
          style={{ width: 200, height: 96 }}
        />
      </Animated.View>

      <Animated.View style={[textStyle, { zIndex: 10 }]}>
        <Text className="font-medium text-dark/40">Bienvenue</Text>
      </Animated.View>
    </View>
  );
};

export default SplashScreen;
