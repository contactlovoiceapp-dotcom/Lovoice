/* Brand splash shown on app launch: logo, tagline, and ambient glow before navigation continues. */

import React, { useEffect } from 'react';
import { Image, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, FONT } from '../../theme';
import { COPY } from '../../copy';

const LOGO = require('../../../assets/logo.png');

const GLOW_SIZE = 400;
const GLOW_BACKGROUND = 'rgba(212,121,236,0.15)';

interface Props {
  onFinish: () => void;
}

/** Decorative pulsing glow — invisible if animation fails, no impact on usability. */
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
    <View
      pointerEvents="none"
      style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
    >
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

function TaglineFade() {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    opacity.value = withDelay(600, withTiming(1, { duration: 700, easing: Easing.out(Easing.ease) }));
    translateY.value = withDelay(600, withTiming(0, { duration: 700, easing: Easing.out(Easing.ease) }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[{ zIndex: 10, alignItems: 'center', marginTop: 20 }, animStyle]}>
      <Text style={{ fontFamily: FONT.serifItalic, fontSize: 18, color: COLORS.textSecondary, letterSpacing: 0.2 }}>
        {COPY.splash.tagline}
      </Text>
    </Animated.View>
  );
}

const SplashScreen: React.FC<Props> = ({ onFinish }) => {
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    const timer = setTimeout(onFinish, 2800);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <View
      style={{
        width,
        height,
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: COLORS.background,
      }}
    >
      <AmbientGlow />

      <View style={{ zIndex: 10 }}>
        <Image
          source={LOGO}
          accessibilityLabel={COPY.common.appName}
          resizeMode="contain"
          style={{ width: 200, height: 96 }}
        />
      </View>

      <TaglineFade />
    </View>
  );
};

export default SplashScreen;
