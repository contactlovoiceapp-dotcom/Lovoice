/* Floating pill bottom nav — stable icon tabs over the main app content. */

import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Compass, Heart, MessageCircle } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import type { Tab } from '../types';
import { RADIUS } from '../theme';
import { COPY } from '../copy';

const ICON_SIZE = 22;
const PILL_HEIGHT = 64;
const ITEM_WIDTH = 56;

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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      hitSlop={12}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        width: ITEM_WIDTH,
        borderRadius: RADIUS.cta,
        backgroundColor: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
      }}
    >
      <Icon
        size={ICON_SIZE}
        strokeWidth={isActive ? 2.4 : 1.8}
        color={isActive ? '#ffffff' : 'rgba(255,255,255,0.65)'}
      />
    </Pressable>
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
