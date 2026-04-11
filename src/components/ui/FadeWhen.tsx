/* Conditional opacity wrapper — smoothly fades children in/out based on the `visible` prop. */

import React, { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface FadeWhenProps {
  visible: boolean;
  children: React.ReactNode;
}

const FadeWhen: React.FC<FadeWhenProps> = ({ visible, children }) => {
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 250 });
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={animStyle}>{children}</Animated.View>;
};

export default FadeWhen;
