/* Landing screen — merges welcome, values, community acceptance, and phone entry into one flow. */

import React, { useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS, SHADOW } from '../../theme';
import { COPY } from '../../copy';
import {
  formatPhoneAsE164,
  SUPPORTED_PHONE_COUNTRIES,
  type SupportedPhoneCountryConfig,
} from '../../features/auth/helpers/country';

const LOGO = require('../../../assets/logo.png');

interface Props {
  onSubmit: (phone: string, country: SupportedPhoneCountryConfig['country']) => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
}

const HomeScreen: React.FC<Props> = ({ onSubmit, isSubmitting = false, errorMessage }) => {
  const [selectedCountry, setSelectedCountry] = useState<SupportedPhoneCountryConfig>(
    SUPPORTED_PHONE_COUNTRIES[0],
  );
  const [phone, setPhone] = useState('');
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const maxWidth = Math.min(448, windowWidth - 48);

  const formattedPhone = useMemo(
    () => formatPhoneAsE164(phone, selectedCountry.callingCode),
    [phone, selectedCountry.callingCode],
  );
  // CGU acceptance is now collected at the very end of signup (profile-setup), not on landing.
  const canSubmit = formattedPhone !== null && !isSubmitting;

  const handleSubmit = () => {
    if (!formattedPhone) return;
    onSubmit(formattedPhone, selectedCountry.country);
  };

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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 8,
            paddingHorizontal: 24,
            justifyContent: 'space-between',
          }}
          keyboardShouldPersistTaps="handled"
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

          {/* Bottom: phone input + CTA */}
          <View style={{ width: '100%', maxWidth, alignSelf: 'center' }}>
            {/* Country picker */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {SUPPORTED_PHONE_COUNTRIES.map((country) => {
                const isSelected = country.country === selectedCountry.country;

                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={country.label}
                    key={country.country}
                    onPress={() => setSelectedCountry(country)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      borderRadius: RADIUS.full,
                      borderWidth: 1,
                      borderColor: isSelected ? COLORS.primary : COLORS.border,
                      backgroundColor: isSelected ? COLORS.primaryMuted : COLORS.surfaceMuted,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ fontFamily: FONT.bold, color: isSelected ? COLORS.primary : COLORS.textSecondary }}>
                      {country.country} {country.callingCode}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Phone input */}
            <View
              style={{
                width: '100%',
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: RADIUS.lg,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.surfaceMuted,
                paddingVertical: 16,
                paddingHorizontal: 16,
                marginBottom: 10,
              }}
            >
              <Text style={{ marginRight: 8, fontFamily: FONT.medium, color: COLORS.textTertiary }}>
                {selectedCountry.callingCode}
              </Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder={selectedCountry.example}
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                returnKeyType="go"
                onSubmitEditing={canSubmit ? handleSubmit : undefined}
                style={{ flex: 1, minWidth: 0, fontSize: 18, fontFamily: FONT.regular, color: COLORS.dark }}
              />
            </View>

            {errorMessage ? (
              <Text style={{ marginBottom: 10, textAlign: 'center', fontFamily: FONT.medium, color: COLORS.primary }}>
                {errorMessage}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={handleSubmit}
              style={{ width: '100%', borderRadius: RADIUS.full, overflow: 'hidden', opacity: canSubmit ? 1 : 0.3, marginBottom: 10, ...SHADOW.button }}
            >
              <LinearGradient
                colors={[...CTA_GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15 }}>
                  <Text style={{ fontFamily: FONT.bold, color: 'white' }}>
                    {isSubmitting ? COPY.home.sending : COPY.home.cta}
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
};

export default HomeScreen;
