/* Terms onboarding route — requires CGU and privacy acceptance before collecting profile data. */

import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { COPY } from '@/copy';
import { COLORS, FONT, RADIUS } from '@/theme';
import { ProfileOnboardingStep } from '@/features/profile/components/ProfileOnboardingStep';
import { useProfileOnboardingState } from '@/features/profile/hooks/useProfileOnboardingState';

const TOTAL_STEPS = 6;
const TERMS_URL = 'https://lovoice.app/conditions-utilisation';
const PRIVACY_URL = 'https://lovoice.app/politique-confidentialite';

export default function OnboardingTermsRoute() {
  const router = useRouter();
  const acceptedTerms = useProfileOnboardingState((state) => state.acceptedTerms);
  const setAcceptedTerms = useProfileOnboardingState((state) => state.setAcceptedTerms);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleNext = () => {
    if (!acceptedTerms) {
      setErrorMessage(COPY.onboarding.terms.errorRequired);
      return;
    }

    setErrorMessage(null);
    router.push('/(auth)/onboarding/name');
  };

  const handleOpenUrl = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <ProfileOnboardingStep
      currentStep={1}
      totalSteps={TOTAL_STEPS}
      title={COPY.onboarding.terms.title}
      subtitle={COPY.onboarding.terms.subtitle}
      ctaLabel={COPY.onboarding.terms.cta}
      errorMessage={errorMessage}
      onBack={() => router.back()}
      onNext={handleNext}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acceptedTerms }}
        onPress={() => {
          setAcceptedTerms(!acceptedTerms);
          setErrorMessage(null);
        }}
        style={{
          width: '100%',
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
          borderRadius: RADIUS.md,
          borderWidth: 1,
          borderColor: acceptedTerms ? COLORS.primary : COLORS.border,
          backgroundColor: acceptedTerms ? COLORS.primaryMuted : COLORS.surfaceMuted,
          padding: 14,
        }}
      >
        <View
          style={{
            marginTop: 2,
            width: 22,
            height: 22,
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 7,
            borderWidth: 2,
            borderColor: acceptedTerms ? COLORS.primary : COLORS.textTertiary,
            backgroundColor: acceptedTerms ? COLORS.primary : 'transparent',
          }}
        >
          {acceptedTerms ? <Check size={15} color="#ffffff" strokeWidth={3} /> : null}
        </View>

        <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, fontFamily: FONT.regular, color: COLORS.textSecondary }}>
          {COPY.onboarding.terms.checkboxLabel}
          <Text
            accessibilityRole="link"
            onPress={() => handleOpenUrl(TERMS_URL)}
            style={{ fontFamily: FONT.semibold, color: COLORS.dark, textDecorationLine: 'underline' }}
          >
            {COPY.onboarding.terms.cguLink}
          </Text>
          {COPY.onboarding.terms.andSeparator}
          <Text
            accessibilityRole="link"
            onPress={() => handleOpenUrl(PRIVACY_URL)}
            style={{ fontFamily: FONT.semibold, color: COLORS.dark, textDecorationLine: 'underline' }}
          >
            {COPY.onboarding.terms.privacyLink}
          </Text>
          .
        </Text>
      </Pressable>
    </ProfileOnboardingStep>
  );
}
