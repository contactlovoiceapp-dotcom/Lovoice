/* Phone verification flow: collects a mobile number and a short OTP before onboarding continues. */

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
import { ArrowLeft, ArrowRight, Phone } from 'lucide-react-native';
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS } from '../../theme';
import { COPY } from '../../copy';

const AMBIENT_GLOW_SIZE = 280;

interface Props {
  onNext: () => void;
  onBack: () => void;
}

const PhoneScreen: React.FC<Props> = ({ onNext, onBack }) => {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');

  const goToCode = () => {
    setStep('code');
  };

  const goToPhone = () => {
    setStep('phone');
  };

  const handlePhoneSubmit = () => {
    if (phone.length > 8) goToCode();
  };

  const handleCodeSubmit = () => {
    if (code.length >= 4) onNext();
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
              transform: [{ translateX: -(AMBIENT_GLOW_SIZE / 2) }, { translateY: -(AMBIENT_GLOW_SIZE / 2) }],
              backgroundColor: 'rgba(212,121,236,0.08)',
            }}
          />
        </View>

        <View style={{ position: 'relative', zIndex: 10, flex: 1, paddingHorizontal: 24, paddingVertical: 32 }}>
          <Pressable
            accessibilityRole="button"
            onPress={step === 'phone' ? onBack : goToPhone}
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

            {step === 'phone' ? (
              <View>
                <Text style={{ marginBottom: 12, textAlign: 'center', fontSize: 28, fontFamily: FONT.bold, color: COLORS.dark }}>
                  {COPY.phone.title}
                </Text>
                <Text style={{ marginBottom: 32, textAlign: 'center', fontFamily: FONT.regular, color: COLORS.textSecondary }}>
                  {COPY.phone.subtitle}
                </Text>

                <View style={{ gap: 24 }}>
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
                    <Text style={{ marginRight: 8, fontFamily: FONT.medium, color: COLORS.textTertiary }}>{COPY.phone.prefix}</Text>
                    <TextInput
                      value={phone}
                      onChangeText={setPhone}
                      placeholder={COPY.phone.placeholder}
                      placeholderTextColor={COLORS.textTertiary}
                      keyboardType="number-pad"
                      style={{ flex: 1, minWidth: 0, fontSize: 18, fontFamily: FONT.regular, color: COLORS.dark }}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={phone.length < 9}
                    onPress={handlePhoneSubmit}
                    style={{ width: '100%', borderRadius: RADIUS.full, overflow: 'hidden', opacity: phone.length < 9 ? 0.3 : 1 }}
                  >
                    <LinearGradient
                      colors={[...CTA_GRADIENT]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}
                    >
                      <Text style={{ fontFamily: FONT.bold, color: 'white' }}>{COPY.phone.sendCode}</Text>
                      <ArrowRight size={20} color="#ffffff" />
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View>
                <Text style={{ marginBottom: 12, textAlign: 'center', fontSize: 28, fontFamily: FONT.bold, color: COLORS.dark }}>
                  {COPY.phone.codeTitle}
                </Text>
                <Text style={{ marginBottom: 32, textAlign: 'center', fontFamily: FONT.regular, color: COLORS.textSecondary }}>
                  {COPY.phone.codeSubtitle(phone)}
                </Text>

                <View style={{ gap: 24 }}>
                  <TextInput
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                    placeholder={COPY.phone.codePlaceholder}
                    placeholderTextColor={COLORS.textTertiary}
                    keyboardType="number-pad"
                    maxLength={4}
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
                      letterSpacing: 16,
                      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                      color: COLORS.dark,
                    }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={code.length < 4}
                    onPress={handleCodeSubmit}
                    style={{ width: '100%', borderRadius: RADIUS.full, overflow: 'hidden', opacity: code.length < 4 ? 0.3 : 1 }}
                  >
                    <LinearGradient
                      colors={[...CTA_GRADIENT]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}
                    >
                      <Text style={{ fontFamily: FONT.bold, color: 'white' }}>{COPY.phone.verify}</Text>
                      <ArrowRight size={20} color="#ffffff" />
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

export default PhoneScreen;
