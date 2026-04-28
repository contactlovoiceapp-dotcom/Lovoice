/* Floating pill bottom nav — custom tab bar for the expo-router Tabs navigator. */

import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Compass, Heart, MessageCircle, User } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { RADIUS } from '../theme';
import { COPY } from '../copy';

const ICON_SIZE = 22;
const PILL_HEIGHT = 64;
const ITEM_WIDTH = 56;

const TAB_CONFIG: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'discover', label: COPY.nav.discover, icon: Compass },
  { key: 'likes', label: COPY.nav.likes, icon: Heart },
  { key: 'messages', label: COPY.nav.messages, icon: MessageCircle },
  { key: 'profile', label: COPY.nav.profile, icon: User },
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

const BottomNav: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
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
        {TAB_CONFIG.map((tab, index) => (
          <TabItem
            key={tab.key}
            label={tab.label}
            icon={tab.icon}
            isActive={state.index === index}
            onPress={() => navigation.navigate(state.routes[index].name)}
          />
        ))}
      </View>
    </View>
  );
};

export default BottomNav;
