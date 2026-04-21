/* Edge-to-edge bottom tab bar with spring-animated selection indicator, tap feedback, and safe-area padding. */

import React, { useEffect } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Compass, Heart, MessageCircle } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import type { Tab } from '../types';
import { COLORS, FONT } from '../theme';
import { COPY } from '../copy';

const MAX_NAV_WIDTH = 512;
const INDICATOR_WIDTH = 32;
const INDICATOR_HEIGHT = 3;
const ICON_SIZE = 22;

const INDICATOR_TIMING = { duration: 200, easing: Easing.out(Easing.quad) } as const;

interface BottomNavProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'discover', label: COPY.nav.discover, icon: Compass },
  { id: 'likes', label: COPY.nav.likes, icon: Heart },
  { id: 'messages', label: COPY.nav.messages, icon: MessageCircle },
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
  const activeColor = COLORS.primary;
  const inactiveColor = COLORS.textTertiary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      style={{ flex: 1, flexDirection: 'column', alignItems: 'center', gap: 2, paddingHorizontal: 20, paddingVertical: 6 }}
    >
      <Icon
        size={ICON_SIZE}
        strokeWidth={isActive ? 2.5 : 1.8}
        color={isActive ? activeColor : inactiveColor}
      />
      <Text
        style={{
          fontSize: 10,
          fontFamily: FONT.medium,
          color: isActive ? activeColor : inactiveColor,
        }}
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
    translateX.value = withTiming(indicatorOffsetX(activeTab, contentWidth), INDICATOR_TIMING);
  }, [activeTab, contentWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        borderTopWidth: 1,
        borderTopColor: COLORS.borderLight,
        backgroundColor: 'rgba(255,255,255,0.92)',
        paddingBottom: insets.bottom,
      }}
    >
      <View style={{ width: contentWidth, alignSelf: 'center' }}>
        <View style={{ position: 'relative', height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: -1,
                left: 0,
                width: INDICATOR_WIDTH,
                height: INDICATOR_HEIGHT,
                borderRadius: 999,
                backgroundColor: COLORS.primary,
              },
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
