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

  const activeColor = '#e724ab';
  const inactiveColor = 'rgba(75,22,76,0.3)';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ flex: 1, flexDirection: 'column', alignItems: 'center', gap: 2, paddingHorizontal: 20, paddingVertical: 6 }}
    >
      <Animated.View style={iconStyle}>
        <Icon
          size={ICON_SIZE}
          strokeWidth={isActive ? 2.5 : 1.8}
          color={isActive ? activeColor : inactiveColor}
        />
      </Animated.View>
      <Text
        style={{
          fontSize: 10,
          fontWeight: '500',
          letterSpacing: 0.5,
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
    translateX.value = withSpring(indicatorOffsetX(activeTab, contentWidth), INDICATOR_SPRING);
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
        borderTopColor: 'rgba(75,22,76,0.05)',
        backgroundColor: 'rgba(255,255,255,0.9)',
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
                backgroundColor: '#e724ab',
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
