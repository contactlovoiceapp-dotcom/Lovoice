/* OTP verification route — validates the SMS code through Supabase Auth. */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { COPY } from '../../src/copy';
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS } from '../../src/theme';
import {
  getCountryFromE164Phone,
  type SupportedPhoneCountry,
} from '../../src/features/auth/helpers/country';
import { getSupabaseClient } from '../../src/lib/supabase';

const OTP_LENGTH = 6;

function getParamValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default function OtpRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    phone?: string | string[];
    country?: SupportedPhoneCountry | SupportedPhoneCountry[];
  }>();
  const phone = getParamValue(params.phone);
  const country = getParamValue(params.country);
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canVerify = code.length === OTP_LENGTH && !isSubmitting && !!phone;

  const handleVerify = async () => {
    if (!phone || !country || getCountryFromE164Phone(phone) !== country) {
      setErrorMessage(COPY.phone.missingOtpParams);
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage(COPY.phone.authUnavailable);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: 'sms',
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    // Land on the first signup step. AuthRedirector will reroute returning users
    // (whose profile already exists) straight to the feed once the profile finishes loading,
    // avoiding a redundant splash flash on the way back through `/`.
    router.replace('/(auth)/onboarding/name');
  };

  const handleResend = async () => {
    if (!phone || !country || getCountryFromE164Phone(phone) !== country) {
      setErrorMessage(COPY.phone.missingOtpParams);
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage(COPY.phone.authUnavailable);
      return;
    }

    setIsResending(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.signInWithOtp({ phone });

    setIsResending(false);

    if (error) {
      setErrorMessage(error.message);
    }
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
        <View style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 32 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.common.back}
            onPress={() => router.back()}
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
              <ShieldCheck size={30} color={COLORS.primary} />
            </View>

            <Text style={{ marginBottom: 12, textAlign: 'center', fontSize: 28, fontFamily: FONT.bold, color: COLORS.dark }}>
              {COPY.phone.codeTitle}
            </Text>
            <Text style={{ marginBottom: 32, textAlign: 'center', fontFamily: FONT.regular, color: COLORS.textSecondary }}>
              {phone ? COPY.phone.codeSubtitle(phone) : COPY.phone.missingOtpParams}
            </Text>

            <View style={{ gap: 20 }}>
              <TextInput
                value={code}
                onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                placeholder={COPY.phone.codePlaceholder}
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={OTP_LENGTH}
                autoFocus
                style={{
                  width: '100%',
                  borderRadius: RADIUS.lg,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.surfaceMuted,
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  textAlign: 'center',
                  fontSize: 24,
                  letterSpacing: 12,
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  color: COLORS.dark,
                }}
              />

              {errorMessage ? (
                <Text style={{ textAlign: 'center', fontFamily: FONT.medium, color: COLORS.primary }}>
                  {errorMessage}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={!canVerify}
                onPress={handleVerify}
                style={{ width: '100%', borderRadius: RADIUS.full, overflow: 'hidden', opacity: canVerify ? 1 : 0.3 }}
              >
                <LinearGradient
                  colors={[...CTA_GRADIENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}
                >
                  <Text style={{ fontFamily: FONT.bold, color: 'white' }}>
                    {isSubmitting ? COPY.phone.verifying : COPY.phone.verify}
                  </Text>
                  <ArrowRight size={20} color="#ffffff" />
                </LinearGradient>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={isResending || !phone}
                onPress={handleResend}
                style={{ alignSelf: 'center', padding: 8, opacity: isResending ? 0.4 : 1 }}
              >
                <Text style={{ fontFamily: FONT.semibold, color: COLORS.primary }}>
                  {isResending ? COPY.phone.sendingCode : COPY.phone.resendCode}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
