/* Terms onboarding route — collects community values and CGU acceptance before profile setup starts. */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COPY } from '@/copy';
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS, SHADOW } from '@/theme';

const TERMS_URL = 'https://lovoice.app/conditions-utilisation';
const PRIVACY_URL = 'https://lovoice.app/politique-confidentialite';

export default function OnboardingTermsRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    if (!acceptedTerms) {
      setError(COPY.onboarding.terms.errorRequired);
      return;
    }

    setError(null);
    router.push('/(auth)/onboarding/name');
  };

  return (
    <LinearGradient
      colors={[...ONBOARDING_GRADIENT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 24,
          }}
        >
          <View style={{ width: '100%', maxWidth: 448, alignSelf: 'center' }}>
            <Text
              style={{
                marginBottom: 12,
                textAlign: 'center',
                fontSize: 30,
                lineHeight: 36,
                fontFamily: FONT.extrabold,
                color: COLORS.dark,
              }}
            >
              {COPY.onboarding.terms.title}
            </Text>

            <Text
              style={{
                marginBottom: 24,
                textAlign: 'center',
                fontSize: 15,
                lineHeight: 22,
                fontFamily: FONT.regular,
                color: COLORS.textSecondary,
              }}
            >
              {COPY.onboarding.terms.subtitle}
            </Text>

            <View style={{ gap: 10, marginBottom: 24 }}>
              {COPY.home.values.map((value) => (
                <View
                  key={value.title}
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    borderRadius: RADIUS.md,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.surfaceMuted,
                    padding: 14,
                  }}
                >
                  <View
                    style={{
                      borderRadius: RADIUS.sm,
                      backgroundColor: COLORS.primaryMuted,
                      padding: 8,
                      flexShrink: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 22 }}>{value.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ marginBottom: 2, fontSize: 13, fontFamily: FONT.bold, color: COLORS.dark }}>
                      {value.title}
                    </Text>
                    <Text style={{ fontSize: 12, lineHeight: 17, fontFamily: FONT.regular, color: COLORS.textSecondary }}>
                      {value.desc}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedTerms }}
              onPress={() => {
                setAcceptedTerms((current) => !current);
                setError(null);
              }}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}
            >
              <View
                style={{
                  marginTop: 1,
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: acceptedTerms ? COLORS.primary : COLORS.textTertiary,
                  backgroundColor: acceptedTerms ? COLORS.primary : 'transparent',
                }}
              >
                {acceptedTerms ? <Check size={14} color={COLORS.surface} strokeWidth={3} /> : null}
              </View>
              <Text style={{ flex: 1, fontFamily: FONT.regular, fontSize: 13, lineHeight: 19, color: COLORS.textSecondary }}>
                {COPY.onboarding.terms.checkboxLabel}
                <Text
                  accessibilityRole="link"
                  onPress={() => { void Linking.openURL(TERMS_URL); }}
                  style={{ fontFamily: FONT.semibold, color: COLORS.dark, textDecorationLine: 'underline' }}
                >
                  {COPY.onboarding.terms.cguLink}
                </Text>
                {COPY.onboarding.terms.andSeparator}
                <Text
                  accessibilityRole="link"
                  onPress={() => { void Linking.openURL(PRIVACY_URL); }}
                  style={{ fontFamily: FONT.semibold, color: COLORS.dark, textDecorationLine: 'underline' }}
                >
                  {COPY.onboarding.terms.privacyLink}
                </Text>
                .
              </Text>
            </Pressable>

            {error ? (
              <Text style={{ marginBottom: 12, textAlign: 'center', fontFamily: FONT.medium, color: COLORS.primary }}>
                {error}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={handleNext}
              style={{ width: '100%', borderRadius: RADIUS.full, overflow: 'hidden', ...SHADOW.button }}
            >
              <LinearGradient
                colors={[...CTA_GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}>
                  <Text style={{ fontFamily: FONT.bold, color: '#ffffff' }}>
                    {COPY.onboarding.terms.cta}
                  </Text>
                  <ArrowRight size={20} color="#ffffff" />
                </View>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
