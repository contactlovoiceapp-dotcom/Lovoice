/* Phone verification flow: French copy for collecting a mobile number and a short OTP before onboarding continues. */

import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ArrowLeft, ArrowRight, Phone } from 'lucide-react-native';
import { CTA_GRADIENT, ONBOARDING_GRADIENT } from '../../theme';

const PLACEHOLDER_TEXT_COLOR = '#4b164c40';
/** Primary (#e724ab) at 10% opacity — matches Tailwind `bg-primary/10` without blur on native. */
const AMBIENT_GLOW = 'rgba(231, 36, 171, 0.1)';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

const PhoneScreen: React.FC<Props> = ({ onNext, onBack }) => {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');

  const iconScale = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentX = useSharedValue(-20);

  useEffect(() => {
    iconScale.value = withSpring(1, { stiffness: 260, damping: 20 });
    contentOpacity.value = withTiming(1, { duration: 300 });
    contentX.value = withTiming(0, { duration: 300 });
  }, [step]);

  // Reset animation values when step changes.
  const goToCode = () => {
    contentOpacity.value = 0;
    contentX.value = -20;
    setStep('code');
  };

  const goToPhone = () => {
    contentOpacity.value = 0;
    contentX.value = 20;
    setStep('phone');
  };

  const handlePhoneSubmit = () => {
    if (phone.length > 8) goToCode();
  };

  const handleCodeSubmit = () => {
    if (code.length >= 4) onNext();
  };

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateX: contentX.value }],
  }));

  return (
    <LinearGradient
      colors={[...ONBOARDING_GRADIENT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      className="flex-1"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="pointer-events-none absolute inset-0 overflow-hidden">
          <View
            className="absolute left-1/2 top-[33%] h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: AMBIENT_GLOW }}
          />
        </View>

        <View className="relative z-10 flex-1 px-6 py-8">
          <Pressable
            accessibilityRole="button"
            onPress={step === 'phone' ? onBack : goToPhone}
            className="mb-8 h-10 w-10 items-center justify-center rounded-full bg-dark/5"
          >
            <ArrowLeft size={22} className="text-dark/50" />
          </Pressable>

          <View className="mx-auto w-full max-w-sm flex-1 justify-center">
            <Animated.View
              style={[iconStyle, { alignSelf: 'center', marginBottom: 32 }]}
              className="h-16 w-16 items-center justify-center rounded-full bg-primary/10"
            >
              <Phone size={28} className="text-primary" />
            </Animated.View>

            <Animated.View style={contentStyle}>
              {step === 'phone' ? (
                <View>
                  <Text className="mb-3 text-center text-3xl font-bold text-dark">
                    Ton numéro
                  </Text>
                  <Text className="mb-8 text-center text-dark/40">
                    Nous t&apos;enverrons un code pour vérifier ton compte.
                  </Text>

                  <View className="gap-6">
                    <View className="w-full flex-row items-center rounded-2xl border border-dark/10 bg-white/80 py-4 pl-4 pr-4">
                      <Text className="mr-2 font-medium text-dark/40">+33</Text>
                      <TextInput
                        value={phone}
                        onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
                        placeholder="6 12 34 56 78"
                        placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                        keyboardType="phone-pad"
                        autoFocus
                        className="min-w-0 flex-1 text-lg text-dark"
                      />
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={phone.length < 9}
                      onPress={handlePhoneSubmit}
                      className="w-full overflow-hidden rounded-full disabled:opacity-30"
                    >
                      <LinearGradient
                        colors={[...CTA_GRADIENT]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        className="flex-row items-center justify-center gap-2 py-4 shadow-lg shadow-primary/30"
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

                  <View className="gap-6">
                    <TextInput
                      value={code}
                      onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                      placeholder="0000"
                      placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                      keyboardType="number-pad"
                      maxLength={4}
                      autoFocus
                      className="w-full rounded-2xl border border-dark/10 bg-white/80 py-4 px-4 text-center font-mono text-2xl text-dark"
                      style={{ letterSpacing: 16 }}
                    />
                    <Pressable
                      accessibilityRole="button"
                      disabled={code.length < 4}
                      onPress={handleCodeSubmit}
                      className="w-full overflow-hidden rounded-full disabled:opacity-30"
                    >
                      <LinearGradient
                        colors={[...CTA_GRADIENT]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        className="flex-row items-center justify-center gap-2 py-4 shadow-lg shadow-primary/30"
                      >
                        <Text className="font-bold text-white">Vérifier</Text>
                        <ArrowRight size={20} color="#ffffff" />
                      </LinearGradient>
                    </Pressable>
                  </View>
                </View>
              )}
            </Animated.View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

export default PhoneScreen;
