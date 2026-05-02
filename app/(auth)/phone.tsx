/* Phone auth route — collects the phone number with country picker and sends OTP. */

import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COPY } from '../../src/copy';
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS, SHADOW } from '../../src/theme';
import {
  formatPhoneAsE164,
  SUPPORTED_PHONE_COUNTRIES,
  type SupportedPhoneCountryConfig,
} from '../../src/features/auth/helpers/country';
import { getSupabaseClient } from '../../src/lib/supabase';

const COUNTRY_FLAGS: Record<SupportedPhoneCountryConfig['country'], string> = {
  FR: '🇫🇷',
  BE: '🇧🇪',
  CH: '🇨🇭',
};

export default function PhoneRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedCountry, setSelectedCountry] = useState<SupportedPhoneCountryConfig>(
    SUPPORTED_PHONE_COUNTRIES[0],
  );
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formattedPhone = useMemo(
    () => formatPhoneAsE164(phone, selectedCountry.callingCode),
    [phone, selectedCountry.callingCode],
  );
  const canSubmit = formattedPhone !== null && !isSubmitting;

  const handleSubmit = async () => {
    if (!formattedPhone) return;

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage(COPY.phone.authUnavailable);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.signInWithOtp({ phone: formattedPhone });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.push({
      pathname: '/(auth)/otp',
      params: { phone: formattedPhone, country: selectedCountry.country },
    });
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
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 16,
            paddingHorizontal: 24,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.common.back}
            onPress={() => router.back()}
            style={{
              marginBottom: 24,
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

          {/* Title */}
          <View style={{ flex: 1, justifyContent: 'center', maxWidth: 384, alignSelf: 'center', width: '100%' }}>
            <Text style={{ marginBottom: 8, textAlign: 'center', fontSize: 28, fontFamily: FONT.bold, color: COLORS.dark }}>
              {COPY.phone.title}
            </Text>
            <Text style={{ marginBottom: 32, textAlign: 'center', fontFamily: FONT.regular, color: COLORS.textSecondary }}>
              {COPY.phone.subtitle}
            </Text>

            {/* Country picker with flags */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
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
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      borderRadius: RADIUS.full,
                      borderWidth: 1,
                      borderColor: isSelected ? COLORS.primary : COLORS.border,
                      backgroundColor: isSelected ? COLORS.primaryMuted : COLORS.surfaceMuted,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>{COUNTRY_FLAGS[country.country]}</Text>
                    <Text style={{ fontFamily: FONT.bold, fontSize: 13, color: isSelected ? COLORS.primary : COLORS.textSecondary }}>
                      {country.callingCode}
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
                marginBottom: 12,
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
                autoFocus
                onSubmitEditing={canSubmit ? () => { void handleSubmit(); } : undefined}
                style={{ flex: 1, minWidth: 0, fontSize: 18, fontFamily: FONT.regular, color: COLORS.dark }}
              />
            </View>

            {errorMessage ? (
              <Text style={{ marginBottom: 12, textAlign: 'center', fontFamily: FONT.medium, color: COLORS.primary }}>
                {errorMessage}
              </Text>
            ) : null}

            {/* Submit */}
            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={() => { void handleSubmit(); }}
              style={{ width: '100%', borderRadius: RADIUS.full, overflow: 'hidden', opacity: canSubmit ? 1 : 0.3, ...SHADOW.button }}
            >
              <LinearGradient
                colors={[...CTA_GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}>
                  <Text style={{ fontFamily: FONT.bold, color: 'white' }}>
                    {isSubmitting ? COPY.phone.sendingCode : COPY.phone.sendCode}
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
