/* Edge-to-edge bottom tab bar with spring-animated selection indicator, tap feedback, and safe-area padding. */

import React, { useEffect } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Compass, Heart, MessageCircle } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import type { Tab } from '../types';

const MAX_NAV_WIDTH = 512;
const INDICATOR_WIDTH = 32;
const INDICATOR_HEIGHT = 3;
const ICON_SIZE = 22;

const INDICATOR_SPRING = { stiffness: 400, damping: 30 } as const;
const TAP_SPRING = { stiffness: 400, damping: 30 } as const;

interface BottomNavProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'discover', label: 'Écoute', icon: Compass },
  { id: 'likes', label: 'Likes', icon: Heart },
  { id: 'messages', label: 'Messages', icon: MessageCircle },
];

function indicatorOffsetX(active: Tab, contentWidth: number): number {
  const idx = TABS.findIndex((t) => t.id === active);
  const safeIdx = idx >= 0 ? idx : 0;
  const tabW = contentWidth / TABS.length;
  return safeIdx * tabW + tabW / 2 - INDICATOR_WIDTH / 2;
}

function TabItem({
  label,
  icon: Icon,
  isActive,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.85, TAP_SPRING);
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, TAP_SPRING);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      className="flex-1 flex-col items-center gap-0.5 px-5 py-1.5"
    >
      <Animated.View style={iconStyle}>
        <Icon
          size={ICON_SIZE}
          strokeWidth={isActive ? 2.5 : 1.8}
          className={isActive ? 'text-primary' : 'text-dark/30'}
        />
      </Animated.View>
      <Text
        className={`text-[10px] font-medium tracking-wide ${isActive ? 'text-primary' : 'text-dark/30'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentWidth = Math.min(windowWidth, MAX_NAV_WIDTH);
  const translateX = useSharedValue(indicatorOffsetX(activeTab, contentWidth));

  useEffect(() => {
    translateX.value = withSpring(indicatorOffsetX(activeTab, contentWidth), INDICATOR_SPRING);
  }, [activeTab, contentWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      className="absolute bottom-0 left-0 right-0 z-50 border-t border-dark/5 bg-white/90"
      style={{ paddingBottom: insets.bottom }}
    >
      <View className="w-full max-w-lg self-center" style={{ width: contentWidth }}>
        <View className="relative h-14 flex-row items-center justify-around">
          <Animated.View
            pointerEvents="none"
            className="absolute -top-px rounded-full bg-primary"
            style={[
              { width: INDICATOR_WIDTH, height: INDICATOR_HEIGHT, left: 0 },
              indicatorStyle,
            ]}
          />
          {TABS.map((tab) => (
            <TabItem
              key={tab.id}
              label={tab.label}
              icon={tab.icon}
              isActive={activeTab === tab.id}
              onPress={() => setActiveTab(tab.id)}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

export default BottomNav;
