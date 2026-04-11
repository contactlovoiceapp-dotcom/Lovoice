/* Landing screen — merges welcome, values, and community acceptance into one flow (Expo / NativeWind). */

import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Check, Headphones, Heart, Shield } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LOGO = require('../../../assets/logo.png');

const BLOB_PRIMARY = 'rgba(231, 36, 171, 0.15)';
const BLOB_SECONDARY = 'rgba(212, 121, 236, 0.15)';

const VALUES = [
  {
    Icon: Headphones,
    title: 'La voix avant tout',
    desc: "Ici, on écoute avant de regarder. Ta voix, ton énergie, c'est ce qui compte.",
  },
  {
    Icon: Shield,
    title: 'Un espace safe',
    desc: "Bienveillance et respect sont les règles d'or. Zéro tolérance pour les comportements toxiques.",
  },
  {
    Icon: Heart,
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
  const maxWidth = Math.min(448, windowWidth - 48);

  return (
    <LinearGradient
      colors={['#f8f5ff', '#edf2fc', '#f0e8f8']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: '-20%', left: '-30%', width: 600, height: 600, borderRadius: 300, backgroundColor: BLOB_PRIMARY, opacity: 0.25 }} />
        <View style={{ position: 'absolute', bottom: '-10%', right: '-20%', width: 500, height: 500, borderRadius: 250, backgroundColor: BLOB_SECONDARY, opacity: 0.15 }} />
      </View>

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: '100%', maxWidth, alignSelf: 'center', alignItems: 'center' }}>
            <Image
              source={LOGO}
              accessibilityLabel="LOVoice"
              resizeMode="contain"
              style={{ width: 200, height: 80, marginBottom: 24 }}
            />

            <Text className="mb-3 text-center text-4xl font-bold text-dark">
              Trouve ta <Text className="font-serif italic text-primary">Voix</Text>
            </Text>

            <Text className="mb-10 text-center text-lg font-medium text-dark/40">
              Écoute. Rencontre. Vibre.
            </Text>

            <View style={{ width: '100%', gap: 12, marginBottom: 32 }}>
              {VALUES.map((v) => {
                const Icon = v.Icon;
                return (
                  <View
                    key={v.title}
                    style={{ flexDirection: 'row', gap: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(75,22,76,0.05)', backgroundColor: 'rgba(255,255,255,0.7)', padding: 16 }}
                  >
                    <View style={{ borderRadius: 12, backgroundColor: 'rgba(231,36,171,0.1)', padding: 8, flexShrink: 0 }}>
                      <Icon size={22} color="#e724ab" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text className="mb-0.5 text-sm font-bold text-dark">{v.title}</Text>
                      <Text className="text-xs leading-relaxed text-dark/45">{v.desc}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted }}
              onPress={() => setAccepted((a) => !a)}
              style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(75,22,76,0.05)', backgroundColor: 'rgba(255,255,255,0.7)', padding: 16, marginBottom: 32 }}
            >
              <View
                style={{ marginTop: 2, width: 20, height: 20, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 2, borderColor: accepted ? '#e724ab' : 'rgba(75,22,76,0.2)', backgroundColor: accepted ? '#e724ab' : 'transparent' }}
              >
                {accepted && <Check size={14} color="#ffffff" strokeWidth={3} />}
              </View>
              <Text className="flex-1 text-sm leading-relaxed text-dark/50">
                Je m'engage à respecter les valeurs de bienveillance de la communauté Lovoice et j'accepte les{' '}
                <Text className="text-dark/70 underline">CGU</Text>.
              </Text>
            </Pressable>
          </View>

          <View style={{ width: '100%', maxWidth, alignSelf: 'center', gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              disabled={!accepted}
              onPress={onSignUp}
              style={{ width: '100%', borderRadius: 999, overflow: 'hidden', opacity: accepted ? 1 : 0.3 }}
            >
              <LinearGradient
                colors={['#e724ab', '#d479ec']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}>
                  <Text className="font-bold text-white">Créer un compte</Text>
                  <ArrowRight size={20} color="#ffffff" />
                </View>
              </LinearGradient>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={onLogin}
              style={{ width: '100%', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(75,22,76,0.05)', backgroundColor: 'rgba(75,22,76,0.05)', paddingVertical: 16 }}
            >
              <Text className="text-center font-semibold text-dark/50">Se connecter</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default HomeScreen;
