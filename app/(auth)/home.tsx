/* Landing route — handles phone OTP request and delegates to HomeScreen for the UI. */

import React, { useState } from 'react';
import { useRouter } from 'expo-router';

import HomeScreen from '../../src/components/onboarding/HomeScreen';
import { COPY } from '../../src/copy';
import {
  getCountryFromE164Phone,
  type SupportedPhoneCountry,
} from '../../src/features/auth/helpers/country';
import { getSupabaseClient } from '../../src/lib/supabase';

export default function HomeRoute() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (phone: string, country: SupportedPhoneCountry) => {
    const detectedCountry = getCountryFromE164Phone(phone);

    if (!detectedCountry || detectedCountry !== country) {
      setErrorMessage(COPY.phone.invalidCountry);
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage(COPY.phone.authUnavailable);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.signInWithOtp({ phone });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.push({
      pathname: '/(auth)/otp',
      params: { phone, country },
    });
  };

  return (
    <HomeScreen
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      errorMessage={errorMessage}
    />
  );
}
