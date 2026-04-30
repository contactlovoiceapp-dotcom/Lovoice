/* Phone entry screen for Supabase OTP authentication in supported countries. */

import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ArrowRight, Phone } from 'lucide-react-native';

import { COPY } from '../../copy';
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS } from '../../theme';
import {
  formatPhoneAsE164,
  SUPPORTED_PHONE_COUNTRIES,
  type SupportedPhoneCountryConfig,
} from '../../features/auth/helpers/country';

const AMBIENT_GLOW_SIZE = 280;

type Props = {
  onSubmit: (phone: string, country: SupportedPhoneCountryConfig['country']) => void;
  onBack: () => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
};

export default function PhoneScreen({
  onSubmit,
  onBack,
  isSubmitting = false,
  errorMessage,
}: Props) {
  const [selectedCountry, setSelectedCountry] = useState<SupportedPhoneCountryConfig>(
    SUPPORTED_PHONE_COUNTRIES[0],
  );
  const [phone, setPhone] = useState('');

  const formattedPhone = useMemo(
    () => formatPhoneAsE164(phone, selectedCountry.callingCode),
    [phone, selectedCountry.callingCode],
  );
  const canSubmit = formattedPhone !== null && !isSubmitting;

  const handleSubmit = () => {
    if (!formattedPhone) {
      return;
    }

    onSubmit(formattedPhone, selectedCountry.country);
  };

  return (
    <LinearGradient
      colors={[...ONBOARDING_GRADIENT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
        >
          <View
            style={{
              position: 'absolute',
              left: '50%',
              top: '33%',
              width: AMBIENT_GLOW_SIZE,
              height: AMBIENT_GLOW_SIZE,
              borderRadius: AMBIENT_GLOW_SIZE / 2,
              transform: [
                { translateX: -(AMBIENT_GLOW_SIZE / 2) },
                { translateY: -(AMBIENT_GLOW_SIZE / 2) },
              ],
              backgroundColor: 'rgba(212,121,236,0.08)',
            }}
          />
        </View>

        <View style={{ position: 'relative', zIndex: 10, flex: 1, paddingHorizontal: 24, paddingVertical: 32 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.common.back}
            onPress={onBack}
            style={{
              marginBottom: 32,
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: RADIUS.lg,
              backgroundColor: COLORS.border,
            }}
          >
            <ArrowLeft size={22} color={COLORS.textSecondary} />
          </Pressable>

          <View style={{ marginLeft: 'auto', marginRight: 'auto', width: '100%', maxWidth: 384, flex: 1, justifyContent: 'center' }}>
            <View
              style={{
                alignSelf: 'center',
                marginBottom: 32,
                width: 64,
                height: 64,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 32,
                backgroundColor: COLORS.primaryMuted,
              }}
            >
              <Phone size={28} color={COLORS.primary} />
            </View>

            <Text style={{ marginBottom: 12, textAlign: 'center', fontSize: 28, fontFamily: FONT.bold, color: COLORS.dark }}>
              {COPY.phone.title}
            </Text>
            <Text style={{ marginBottom: 32, textAlign: 'center', fontFamily: FONT.regular, color: COLORS.textSecondary }}>
              {COPY.phone.subtitle}
            </Text>

            <View style={{ gap: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
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
                  style={{ flex: 1, minWidth: 0, fontSize: 18, fontFamily: FONT.regular, color: COLORS.dark }}
                />
              </View>

              {errorMessage ? (
                <Text style={{ textAlign: 'center', fontFamily: FONT.medium, color: COLORS.primary }}>
                  {errorMessage}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={handleSubmit}
                style={{ width: '100%', borderRadius: RADIUS.full, overflow: 'hidden', opacity: canSubmit ? 1 : 0.3 }}
              >
                <LinearGradient
                  colors={[...CTA_GRADIENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}
                >
                  <Text style={{ fontFamily: FONT.bold, color: 'white' }}>
                    {isSubmitting ? COPY.phone.sendingCode : COPY.phone.sendCode}
                  </Text>
                  <ArrowRight size={20} color="#ffffff" />
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
