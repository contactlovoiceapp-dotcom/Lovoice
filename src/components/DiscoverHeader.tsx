/* Header bar for the Discover feed — logo, autoplay toggle, filters and profile shortcuts. */

import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SlidersHorizontal } from 'lucide-react-native';

import { COLORS, FONT, RADIUS } from '../theme';
import { COPY } from '../copy';

const LOGO = require('../../assets/logo.png');

interface DiscoverHeaderProps {
  autoplay: boolean;
  onToggleAutoplay: () => void;
  onOpenFilters: () => void;
}

const DiscoverHeader: React.FC<DiscoverHeaderProps> = ({
  autoplay,
  onToggleAutoplay,
  onOpenFilters,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: insets.top + 8,
        paddingBottom: 8,
        backgroundColor: 'transparent',
      }}
    >
      <Image source={LOGO} style={{ height: 40, width: 100 }} resizeMode="contain" />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          onPress={onToggleAutoplay}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            borderRadius: RADIUS.cta,
            borderWidth: 1,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderColor: autoplay ? 'rgba(231,36,171,0.5)' : 'rgba(255,255,255,0.15)',
            backgroundColor: autoplay ? 'rgba(231,36,171,0.15)' : 'rgba(255,255,255,0.08)',
          }}
        >
          <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: 'rgba(255,255,255,0.7)' }}>
            {COPY.feed.autoplay}
          </Text>
          <Text
            style={{
              fontSize: 12,
              fontFamily: FONT.bold,
              color: autoplay ? COLORS.primary : 'rgba(255,255,255,0.35)',
            }}
          >
            {autoplay ? 'ON' : 'OFF'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onOpenFilters}
          style={{
            borderRadius: RADIUS.cta,
            padding: 8,
            backgroundColor: 'rgba(255,255,255,0.1)',
          }}
        >
          <SlidersHorizontal size={18} color="rgba(255,255,255,0.5)" />
        </Pressable>
      </View>
    </View>
  );
};

export default DiscoverHeader;
