/* Animated audio waveform visualization — full-width bar columns with Reanimated height oscillation (Expo / React Native). */

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
      return '#FFB347';
    case ColorTheme.Chill:
      return '#8B9CF7';
    case ColorTheme.Electric:
      return '#FF7A85';
    case ColorTheme.Dream:
      return '#A8DFFF';
    case ColorTheme.Midnight:
      return '#6C63FF';
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
          borderRadius: 999,
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
