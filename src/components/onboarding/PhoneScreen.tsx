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

const PLACEHOLDER_TEXT_COLOR = '#4b164c40';
const AMBIENT_GLOW = 'rgba(231, 36, 171, 0.1)';

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
      colors={['#f8f5ff', '#edf2fc', '#f0e8f8']}
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
              width: 400,
              height: 400,
              borderRadius: 200,
              transform: [{ translateX: -200 }, { translateY: -200 }],
              backgroundColor: AMBIENT_GLOW,
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
              borderRadius: 20,
              backgroundColor: 'rgba(75,22,76,0.05)',
            }}
          >
            <ArrowLeft size={22} color="rgba(75,22,76,0.5)" />
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
                backgroundColor: 'rgba(231,36,171,0.1)',
              }}
            >
              <Phone size={28} color="#e724ab" />
            </View>

            {step === 'phone' ? (
              <View>
                <Text className="mb-3 text-center text-3xl font-bold text-dark">
                  Ton numéro
                </Text>
                <Text className="mb-8 text-center text-dark/40">
                  Nous t&apos;enverrons un code pour vérifier ton compte.
                </Text>

                <View style={{ gap: 24 }}>
                  <View
                    style={{
                      width: '100%',
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: 'rgba(75,22,76,0.1)',
                      backgroundColor: 'rgba(255,255,255,0.8)',
                      paddingVertical: 16,
                      paddingHorizontal: 16,
                    }}
                  >
                    <Text className="mr-2 font-medium text-dark/40">+33</Text>
                    <TextInput
                      value={phone}
                      onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
                      placeholder="6 12 34 56 78"
                      placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                      keyboardType="phone-pad"
                      autoFocus
                      style={{ flex: 1, minWidth: 0, fontSize: 18 }}
                      className="text-dark"
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={phone.length < 9}
                    onPress={handlePhoneSubmit}
                    style={{ width: '100%', borderRadius: 999, overflow: 'hidden', opacity: phone.length < 9 ? 0.3 : 1 }}
                  >
                    <LinearGradient
                      colors={['#e724ab', '#d479ec']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}
                    >
                      <Text className="font-bold text-white">Recevoir le code</Text>
                      <ArrowRight size={20} color="#ffffff" />
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View>
                <Text className="mb-3 text-center text-3xl font-bold text-dark">
                  Code de vérification
                </Text>
                <Text className="mb-8 text-center text-dark/40">
                  Saisis le code envoyé au +33 {phone}
                </Text>

                <View style={{ gap: 24 }}>
                  <TextInput
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                    placeholder="0000"
                    placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                    keyboardType="number-pad"
                    maxLength={4}
                    autoFocus
                    style={{
                      width: '100%',
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: 'rgba(75,22,76,0.1)',
                      backgroundColor: 'rgba(255,255,255,0.8)',
                      paddingVertical: 16,
                      paddingHorizontal: 16,
                      textAlign: 'center',
                      fontSize: 24,
                      letterSpacing: 16,
                    }}
                    className="font-mono text-dark"
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={code.length < 4}
                    onPress={handleCodeSubmit}
                    style={{ width: '100%', borderRadius: 999, overflow: 'hidden', opacity: code.length < 4 ? 0.3 : 1 }}
                  >
                    <LinearGradient
                      colors={['#e724ab', '#d479ec']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}
                    >
                      <Text className="font-bold text-white">Vérifier</Text>
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
