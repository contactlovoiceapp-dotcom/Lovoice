/* Shared onboarding step primitives keep the profile wizard visually consistent across routes. */

import React, { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COPY } from '@/copy';
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS, SHADOW } from '@/theme';

type ProfileOnboardingStepProps = {
  currentStep: number;
  totalSteps: number;
  title: string;
  subtitle: string;
  children: ReactNode;
  ctaLabel?: string;
  isCtaDisabled?: boolean;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onBack?: () => void;
  onNext: () => void;
};

type SelectableOptionProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function ProfileOnboardingStep({
  currentStep,
  totalSteps,
  title,
  subtitle,
  children,
  ctaLabel = COPY.common.continue,
  isCtaDisabled = false,
  isSubmitting = false,
  errorMessage,
  onBack,
  onNext,
}: ProfileOnboardingStepProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const maxWidth = Math.min(448, width - 48);
  const canSubmit = !isCtaDisabled && !isSubmitting;

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
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 24,
          }}
        >
          <View style={{ width: '100%', maxWidth, alignSelf: 'center', flex: 1 }}>
            <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {onBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={COPY.common.back}
                  onPress={onBack}
                  style={{
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
              ) : (
                <View style={{ width: 40, height: 40 }} />
              )}

              <Text style={{ fontFamily: FONT.semibold, color: COLORS.textSecondary }}>
                {COPY.onboarding.step(currentStep, totalSteps)}
              </Text>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 32 }}>
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
                {title}
              </Text>
              <Text
                style={{
                  marginBottom: 28,
                  textAlign: 'center',
                  fontSize: 15,
                  lineHeight: 22,
                  fontFamily: FONT.regular,
                  color: COLORS.textSecondary,
                }}
              >
                {subtitle}
              </Text>

              <View style={{ gap: 14 }}>{children}</View>
            </View>

            {errorMessage ? (
              <Text style={{ marginBottom: 12, textAlign: 'center', fontFamily: FONT.medium, color: COLORS.primary }}>
                {errorMessage}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={onNext}
              style={{
                width: '100%',
                borderRadius: RADIUS.full,
                overflow: 'hidden',
                opacity: canSubmit ? 1 : 0.3,
                ...SHADOW.button,
              }}
            >
              <LinearGradient colors={[...CTA_GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 16,
                  }}
                >
                  <Text style={{ fontFamily: FONT.bold, color: '#ffffff' }}>{ctaLabel}</Text>
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

export function OnboardingTextInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={COLORS.textTertiary}
      {...props}
      style={[
        {
          width: '100%',
          borderRadius: RADIUS.input,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.surfaceMuted,
          paddingVertical: 16,
          paddingHorizontal: 16,
          fontSize: 17,
          fontFamily: FONT.medium,
          color: COLORS.dark,
        },
        props.style,
      ]}
    />
  );
}

export function SelectableOption({ label, selected, onPress }: SelectableOptionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 54,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: selected ? COLORS.primary : COLORS.border,
        backgroundColor: selected ? COLORS.primaryMuted : COLORS.surfaceMuted,
        paddingHorizontal: 16,
      }}
    >
      <Text style={{ flex: 1, fontFamily: FONT.semibold, color: COLORS.dark }}>{label}</Text>
      <View
        style={{
          width: 24,
          height: 24,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          borderWidth: 2,
          borderColor: selected ? COLORS.primary : COLORS.textTertiary,
          backgroundColor: selected ? COLORS.primary : 'transparent',
        }}
      >
        {selected ? <Check size={14} color="#ffffff" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}
