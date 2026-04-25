/* Floating pill bottom nav — semi-transparent dark capsule with active label only.
   Sits above the content instead of consuming layout space, scales to 4-5 items. */

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { Compass, Heart, MessageCircle } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import type { Tab } from '../types';
import { COLORS, FONT, RADIUS } from '../theme';
import { COPY } from '../copy';

const ICON_SIZE = 22;
const PILL_HEIGHT = 64;
const ITEM_TIMING = 220;

interface BottomNavProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'discover', label: COPY.nav.discover, icon: Compass },
  { id: 'likes', label: COPY.nav.likes, icon: Heart },
  { id: 'messages', label: COPY.nav.messages, icon: MessageCircle },
];

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
  return (
    <Animated.View layout={LinearTransition.duration(ITEM_TIMING)}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        onPress={onPress}
        hitSlop={12}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          height: 48,
          minWidth: 48,
          paddingHorizontal: isActive ? 20 : 16,
          borderRadius: RADIUS.cta,
          backgroundColor: isActive ? 'rgba(255,255,255,0.18)' : 'transparent',
        }}
      >
        <Icon
          size={ICON_SIZE}
          strokeWidth={isActive ? 2.4 : 1.8}
          color={isActive ? '#ffffff' : 'rgba(255,255,255,0.65)'}
        />
        {isActive && (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 13,
              fontFamily: FONT.semibold,
              color: '#ffffff',
            }}
          >
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: insets.bottom + 12,
        left: 0,
        right: 0,
        zIndex: 50,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: PILL_HEIGHT,
          paddingHorizontal: 8,
          gap: 2,
          borderRadius: RADIUS.cta,
          backgroundColor: 'rgba(45,17,54,0.85)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 20,
          elevation: 12,
        }}
      >
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
  );
};

export default BottomNav;
