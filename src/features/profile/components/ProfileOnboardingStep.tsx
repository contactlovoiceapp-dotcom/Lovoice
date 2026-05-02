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

function StepProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const isActive = step <= current;
        return (
          <View
            key={step}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: isActive ? COLORS.primary : COLORS.border,
            }}
          />
        );
      })}
    </View>
  );
}

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
      {/* Decorative orbs — same visual language as HomeScreen */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: '-20%', left: '-30%', width: 600, height: 600, borderRadius: 300, backgroundColor: COLORS.secondary, opacity: 0.08 }} />
        <View style={{ position: 'absolute', bottom: '-10%', right: '-20%', width: 500, height: 500, borderRadius: 250, backgroundColor: COLORS.secondary, opacity: 0.05 }} />
      </View>

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
            {/* Header row: back button + step label */}
            <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {onBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={COPY.common.back}
                  onPress={onBack}
                  style={({ pressed }) => ({
                    width: 40,
                    height: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: RADIUS.full,
                    backgroundColor: COLORS.surface,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    opacity: pressed ? 0.7 : 1,
                    ...SHADOW.card,
                  })}
                >
                  <ArrowLeft size={20} color={COLORS.dark} />
                </Pressable>
              ) : (
                <View style={{ width: 40, height: 40 }} />
              )}

              <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: COLORS.textTertiary }}>
                {COPY.onboarding.step(currentStep, totalSteps)}
              </Text>
            </View>

            {/* Progress bar */}
            <View style={{ marginTop: 12 }}>
              <StepProgressBar current={currentStep} total={totalSteps} />
            </View>

            {/* Content area */}
            <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 36 }}>
              <Text
                style={{
                  marginBottom: 10,
                  textAlign: 'center',
                  fontSize: 32,
                  lineHeight: 38,
                  fontFamily: FONT.extrabold,
                  color: COLORS.dark,
                }}
              >
                {title}
              </Text>
              <Text
                style={{
                  marginBottom: 32,
                  textAlign: 'center',
                  fontSize: 15,
                  lineHeight: 22,
                  fontFamily: FONT.regular,
                  color: COLORS.textSecondary,
                }}
              >
                {subtitle}
              </Text>

              <View style={{ gap: 12 }}>{children}</View>
            </View>

            {errorMessage ? (
              <Text style={{ marginBottom: 14, textAlign: 'center', fontFamily: FONT.medium, fontSize: 14, color: COLORS.primary }}>
                {errorMessage}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={onNext}
              style={({ pressed }) => ({
                width: '100%',
                borderRadius: RADIUS.cta,
                overflow: 'hidden',
                opacity: canSubmit ? (pressed ? 0.9 : 1) : 0.3,
                transform: [{ scale: pressed && canSubmit ? 0.98 : 1 }],
                ...SHADOW.button,
              })}
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
                  <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: '#ffffff' }}>{ctaLabel}</Text>
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
          backgroundColor: COLORS.surface,
          paddingVertical: 16,
          paddingHorizontal: 18,
          fontSize: 17,
          fontFamily: FONT.medium,
          color: COLORS.dark,
          // Prevents iOS from applying extra letter-spacing with custom fonts
          letterSpacing: 0,
          ...SHADOW.card,
        },
        props.style,
      ]}
    />
  );
}

/** Single-select card — radio circle indicator. Used for gender. */
export function SelectableOption({ label, selected, onPress }: SelectableOptionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        overflow: 'hidden',
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: RADIUS.lg,
        borderWidth: 1.5,
        borderColor: selected ? COLORS.primary : COLORS.border,
        backgroundColor: selected ? COLORS.primaryMuted : COLORS.surface,
        paddingHorizontal: 20,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
        ...SHADOW.card,
      })}
    >
      <Text style={{ flex: 1, fontFamily: FONT.semibold, fontSize: 17, color: COLORS.dark }}>
        {label}
      </Text>
      {/* Radio circle */}
      <View
        style={{
          width: 22,
          height: 22,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? COLORS.primary : COLORS.textTertiary,
          backgroundColor: 'transparent',
        }}
      >
        {selected ? (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: COLORS.primary,
            }}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

type MultiSelectOptionProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

/** Multi-select card — square checkbox indicator. Used for looking-for. */
export function MultiSelectOption({ label, selected, onPress }: MultiSelectOptionProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        overflow: 'hidden',
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: RADIUS.lg,
        borderWidth: 1.5,
        borderColor: selected ? COLORS.secondary : COLORS.border,
        backgroundColor: selected ? 'rgba(212,121,236,0.1)' : COLORS.surface,
        paddingHorizontal: 20,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
        ...SHADOW.card,
      })}
    >
      <Text style={{ flex: 1, fontFamily: FONT.semibold, fontSize: 17, color: COLORS.dark }}>
        {label}
      </Text>
      {/* Square checkbox */}
      <View
        style={{
          width: 22,
          height: 22,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 6,
          borderWidth: 2,
          borderColor: selected ? COLORS.secondary : COLORS.textTertiary,
          backgroundColor: selected ? COLORS.secondary : 'transparent',
        }}
      >
        {selected ? <Check size={13} color="#ffffff" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}
