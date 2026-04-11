/* Animated entrance wrapper — fades + slides in on mount with optional scale spring. */

import React, { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

interface EntranceViewProps {
  children: React.ReactNode;
  delay?: number;
  fromY?: number;
  fromScale?: number;
  style?: ViewStyle;
}

const EntranceView: React.FC<EntranceViewProps> = ({
  children,
  delay = 0,
  fromY = 0,
  fromScale,
  style,
}) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(fromY);
  const scale = useSharedValue(fromScale !== undefined ? fromScale : 1);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 600 }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 600 }));
    if (fromScale !== undefined) {
      scale.value = withDelay(
        delay,
        withSpring(1, { stiffness: 200, damping: 15 }),
      );
    }
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return <Animated.View style={[animStyle, style]}>{children}</Animated.View>;
};

export default EntranceView;
