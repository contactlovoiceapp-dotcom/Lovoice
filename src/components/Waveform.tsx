/* Animated audio waveform — decorative bar animation during playback (Reanimated, Expo / React Native). */

import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ColorTheme } from '../types';
import { RADIUS } from '../theme';

const BAR_COUNT = 50;

const MIN_HEIGHT = 0.15;
const TARGET_HEIGHT = 0.85;
const OSCILLATION_DURATION_MS = 600;

interface WaveformProps {
  isPlaying: boolean;
  theme: ColorTheme;
  height?: number;
}

interface WaveformBarProps {
  height: number;
  color: string;
  isPlaying: boolean;
  delay: number;
}

function getBarColor(theme: ColorTheme): string {
  switch (theme) {
    case ColorTheme.Sunset:
      return '#fbbf24';
    case ColorTheme.Chill:
      return '#a78bfa';
    case ColorTheme.Electric:
      return '#e724ab';
    case ColorTheme.Midnight:
      return '#9ca3af';
    default:
      return 'rgba(255,255,255,0.5)';
  }
}

function WaveformBar({ height: staticHeight, color, isPlaying, delay }: WaveformBarProps) {
  const animatedHeight = useSharedValue(staticHeight);

  useEffect(() => {
    if (isPlaying) {
      cancelAnimation(animatedHeight);
      animatedHeight.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(TARGET_HEIGHT, {
              duration: OSCILLATION_DURATION_MS,
              easing: Easing.inOut(Easing.sin),
            }),
            withTiming(MIN_HEIGHT, {
              duration: OSCILLATION_DURATION_MS,
              easing: Easing.inOut(Easing.sin),
            }),
          ),
          -1,
          false,
        ),
      );
    } else {
      cancelAnimation(animatedHeight);
      animatedHeight.value = withTiming(staticHeight, { duration: 300 });
    }
  }, [isPlaying, delay, staticHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: `${animatedHeight.value * 100}%`,
  }));

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          minWidth: 1.5,
          borderRadius: RADIUS.cta,
          backgroundColor: color,
          opacity: isPlaying ? 0.8 : 0.35,
        },
        animatedStyle,
      ]}
    />
  );
}

const Waveform: React.FC<WaveformProps> = ({ isPlaying, theme, height = 80 }) => {
  const bars = useMemo(
    () => Array.from({ length: BAR_COUNT }, () => 0.15 + Math.random() * 0.85),
    [],
  );

  const barColor = getBarColor(theme);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 1.5,
        height,
        width: '100%',
      }}
    >
      {bars.map((h, i) => (
        <WaveformBar
          key={i}
          height={h}
          color={barColor}
          isPlaying={isPlaying}
          delay={i * 40}
        />
      ))}
    </View>
  );
};

export default Waveform;
