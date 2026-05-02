/* Landing screen — presents Lovoice brand values and leads to the connection flow. */

import React from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS, SHADOW } from '../../theme';
import { COPY } from '../../copy';

const LOGO = require('../../../assets/logo.png');

const CGU_URL = 'https://lovoice.app/conditions-generales';

interface Props {
  onConnect: () => void;
}

const HomeScreen: React.FC<Props> = ({ onConnect }) => {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const maxWidth = Math.min(448, windowWidth - 48);

  return (
    <LinearGradient
      colors={[...ONBOARDING_GRADIENT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: '-20%', left: '-30%', width: 600, height: 600, borderRadius: 300, backgroundColor: COLORS.secondary, opacity: 0.1 }} />
        <View style={{ position: 'absolute', bottom: '-10%', right: '-20%', width: 500, height: 500, borderRadius: 250, backgroundColor: COLORS.secondary, opacity: 0.07 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 8,
          paddingHorizontal: 24,
          justifyContent: 'space-between',
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top: logo + tagline */}
        <View style={{ width: '100%', maxWidth, alignSelf: 'center', alignItems: 'center' }}>
          <Image
            source={LOGO}
            accessibilityLabel={COPY.common.appName}
            resizeMode="contain"
            style={{ width: 160, height: 60, marginBottom: 12 }}
          />

          <Text style={{ marginBottom: 4, textAlign: 'center', fontSize: 30, fontFamily: FONT.extrabold, color: COLORS.dark }}>
            {COPY.home.headline}
            <Text style={{ fontFamily: FONT.serifItalic, color: COLORS.primary }}>
              {COPY.home.headlineAccent}
            </Text>
          </Text>

          <Text style={{ marginBottom: 16, textAlign: 'center', fontSize: 16, fontFamily: FONT.medium, color: COLORS.textTertiary }}>
            {COPY.home.subtitle}
          </Text>
        </View>

        {/* Middle: values cards */}
        <View style={{ width: '100%', maxWidth, alignSelf: 'center', gap: 8 }}>
          {COPY.home.values.map((v) => (
            <View
              key={v.title}
              style={{ flexDirection: 'row', gap: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceMuted, padding: 14 }}
            >
              <View style={{ borderRadius: RADIUS.sm, backgroundColor: COLORS.primaryMuted, padding: 8, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>{v.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ marginBottom: 2, fontSize: 13, fontFamily: FONT.bold, color: COLORS.dark }}>{v.title}</Text>
                <Text style={{ fontSize: 12, lineHeight: 17, fontFamily: FONT.regular, color: COLORS.textSecondary }}>{v.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Bottom: CGU notice + Connexion CTA */}
        <View style={{ width: '100%', maxWidth, alignSelf: 'center' }}>
          <Text style={{ marginBottom: 16, textAlign: 'center', fontSize: 12, lineHeight: 18, fontFamily: FONT.regular, color: COLORS.textTertiary }}>
            {COPY.home.cguNotice}
            <Text
              accessibilityRole="link"
              onPress={() => { void Linking.openURL(CGU_URL); }}
              style={{ fontFamily: FONT.semibold, color: COLORS.dark, textDecorationLine: 'underline' }}
            >
              {COPY.home.cguLink}
            </Text>
            .
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={onConnect}
            style={{ width: '100%', borderRadius: RADIUS.full, overflow: 'hidden', ...SHADOW.button }}
          >
            <LinearGradient
              colors={[...CTA_GRADIENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}>
                <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: 'white' }}>
                  {COPY.home.cta}
                </Text>
                <ArrowRight size={20} color="#ffffff" />
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

export default HomeScreen;
