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

const BAR_COUNT = 40;

/** Low / high bar height as a fraction of the container (15% / 85%) when playing. */
const MIN_HEIGHT = 0.15;
const TARGET_HEIGHT = 0.85;
const OSCILLATION_DURATION_MS = 600;

interface WaveformProps {
  isPlaying: boolean;
  theme: ColorTheme;
}

interface WaveformBarProps {
  /** Static height fraction (0–1) when not playing. */
  height: number;
  color: string;
  isPlaying: boolean;
  /** Stagger offset in ms so bars read as a travelling wave. */
  delay: number;
}

function getBarColor(theme: ColorTheme): string {
  switch (theme) {
    case ColorTheme.Solaire:
      return '#fcd34d';
    case ColorTheme.Posee:
      return '#c4b5fd';
    case ColorTheme.Actif:
      return '#f9a8d4';
    case ColorTheme.Mystere:
      return '#ffffff';
    default:
      return 'rgba(255,255,255,0.5)';
  }
}

function WaveformBar({ height: staticHeight, color, isPlaying, delay }: WaveformBarProps) {
  const animatedHeight = useSharedValue(staticHeight);

  useEffect(() => {
    if (isPlaying) {
      cancelAnimation(animatedHeight);
      // Per-bar index delay staggers the wave once; the repeated part is only the high→low segment.
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

const Waveform: React.FC<WaveformProps> = ({ isPlaying, theme }) => {
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
        height: 80,
        width: '100%',
      }}
    >
      {bars.map((height, i) => (
        <WaveformBar
          key={i}
          height={height}
          color={barColor}
          isPlaying={isPlaying}
          delay={i * 40}
        />
      ))}
    </View>
  );
};

export default Waveform;
