/* Landing screen — merges welcome, values, and community acceptance into one flow. */

import React, { useState } from 'react';
import {
  Image,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS, SHADOW } from '../../theme';

const LOGO = require('../../../assets/logo.png');

const VALUES = [
  {
    emoji: '🎧',
    title: 'La voix avant tout',
    desc: "Ici, on écoute avant de regarder. Ta voix, ton énergie, c'est ce qui compte.",
  },
  {
    emoji: '🛡️',
    title: 'Un espace safe',
    desc: "Bienveillance et respect sont les règles d'or. Zéro tolérance pour les comportements toxiques.",
  },
  {
    emoji: '💜',
    title: "L'authenticité",
    desc: "Pas de photo à perfectionner. Juste ta voix et ce qu'elle dit de toi.",
  },
] as const;

interface Props {
  onSignUp: () => void;
  onLogin: () => void;
}

const HomeScreen: React.FC<Props> = ({ onSignUp, onLogin }) => {
  const [accepted, setAccepted] = useState(false);
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
        <View style={{ position: 'absolute', top: '-20%', left: '-30%', width: 600, height: 600, borderRadius: 300, backgroundColor: COLORS.primary, opacity: 0.15 }} />
        <View style={{ position: 'absolute', bottom: '-10%', right: '-20%', width: 500, height: 500, borderRadius: 250, backgroundColor: COLORS.secondary, opacity: 0.08 }} />
      </View>

      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 8,
          paddingHorizontal: 24,
          justifyContent: 'space-between',
        }}
      >
        {/* Top: logo + tagline */}
        <View style={{ width: '100%', maxWidth, alignSelf: 'center', alignItems: 'center' }}>
          <Image
            source={LOGO}
            accessibilityLabel="LOVoice"
            resizeMode="contain"
            style={{ width: 160, height: 60, marginBottom: 12 }}
          />

          <Text style={{ marginBottom: 4, textAlign: 'center', fontSize: 30, fontFamily: FONT.extrabold, color: COLORS.dark }}>
            Trouve ta{' '}
            <Text style={{ fontFamily: FONT.serifItalic, color: COLORS.primary }}>
              Voix
            </Text>
          </Text>

          <Text style={{ marginBottom: 16, textAlign: 'center', fontSize: 16, fontFamily: FONT.medium, color: COLORS.textTertiary }}>
            Écoute. Rencontre. Vibre.
          </Text>
        </View>

        {/* Middle: values cards */}
        <View style={{ width: '100%', maxWidth, alignSelf: 'center', gap: 8 }}>
          {VALUES.map((v) => (
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

        {/* Bottom: checkbox + CTAs */}
        <View style={{ width: '100%', maxWidth, alignSelf: 'center' }}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            onPress={() => setAccepted((a) => !a)}
            style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceMuted, padding: 14, marginBottom: 16 }}
          >
            <View
              style={{ marginTop: 2, width: 20, height: 20, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 2, borderColor: accepted ? COLORS.primary : COLORS.textTertiary, backgroundColor: accepted ? COLORS.primary : 'transparent' }}
            >
              {accepted && <Check size={14} color="#ffffff" strokeWidth={3} />}
            </View>
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, fontFamily: FONT.regular, color: COLORS.textSecondary }}>
              Je m'engage à respecter les valeurs de bienveillance de la communauté Lovoice et j'accepte les{' '}
              <Text style={{ color: COLORS.dark, textDecorationLine: 'underline' }}>CGU</Text>.
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={!accepted}
            onPress={onSignUp}
            style={{ width: '100%', borderRadius: RADIUS.full, overflow: 'hidden', opacity: accepted ? 1 : 0.3, marginBottom: 10, ...SHADOW.button }}
          >
            <LinearGradient
              colors={[...CTA_GRADIENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15 }}>
                <Text style={{ fontFamily: FONT.bold, color: 'white' }}>Créer un compte</Text>
                <ArrowRight size={20} color="#ffffff" />
              </View>
            </LinearGradient>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onLogin}
            style={{ width: '100%', borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.border, paddingVertical: 15 }}
          >
            <Text style={{ textAlign: 'center', fontFamily: FONT.semibold, color: COLORS.textSecondary }}>Se connecter</Text>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
};

export default HomeScreen;
