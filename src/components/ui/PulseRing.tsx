/* Repeating scale + opacity ring used as an idle indicator (e.g. before the user presses play). */

import React, { useEffect } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const PulseRing: React.FC = () => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.2);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.5, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    opacity.value = withRepeat(
      withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={animStyle}
      className="h-24 w-24 rounded-full border-2 border-white/20"
    />
  );
};

export default PulseRing;
