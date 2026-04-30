/* Profile mutations centralize Supabase writes so onboarding and editing share one server-state path. */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/lib/supabase';
import { getCountryFromE164Phone } from '@/features/auth/helpers/country';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { Database } from '@/types/database';
import type { GenderValue } from '../helpers/validation';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];

export type ProfileCoordinates = {
  latitude: number;
  longitude: number;
};

export type UpsertProfileInput = {
  displayName: string;
  birthdate: string;
  gender: GenderValue;
  lookingFor: GenderValue[];
  city: string;
  coordinates?: ProfileCoordinates | null;
};

export const profileQueryKeys = {
  all: ['profile'] as const,
  detail: (profileId: string) => ['profile', profileId] as const,
};

export function coordinatesToPostgisPoint(
  coordinates: ProfileCoordinates | null | undefined,
): string | null {
  if (!coordinates) return null;

  if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) {
    throw new Error('profile.location_invalid');
  }

  if (coordinates.latitude < -90 || coordinates.latitude > 90) {
    throw new Error('profile.location_invalid');
  }

  if (coordinates.longitude < -180 || coordinates.longitude > 180) {
    throw new Error('profile.location_invalid');
  }

  // PostGIS expects longitude first in WKT POINT values.
  return `POINT(${coordinates.longitude} ${coordinates.latitude})`;
}

export function getProfileCountryFromSession(session: Session): ProfileInsert['country'] {
  const phone = session.user.phone;

  if (!phone) {
    throw new Error('profile.phone_missing');
  }

  const country = getCountryFromE164Phone(phone);

  if (!country) {
    throw new Error('profile.country_unsupported');
  }

  return country;
}

export function buildProfileUpsertPayload(
  input: UpsertProfileInput,
  session: Session,
): ProfileInsert {
  return {
    id: session.user.id,
    display_name: input.displayName.trim(),
    birthdate: input.birthdate,
    gender: input.gender,
    looking_for: input.lookingFor,
    city: input.city.trim(),
    country: getProfileCountryFromSession(session),
    location: coordinatesToPostgisPoint(input.coordinates),
  };
}

export function useUpsertProfile() {
  const queryClient = useQueryClient();
  const { session, refreshProfile } = useAuth();

  return useMutation({
    mutationFn: async (input: UpsertProfileInput): Promise<ProfileRow> => {
      if (!session) {
        throw new Error('profile.session_missing');
      }

      const supabase = getSupabaseClient();

      if (!supabase) {
        throw new Error('Supabase is not configured.');
      }

      const payload = buildProfileUpsertPayload(input, session);
      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    onSuccess: async (profile) => {
      await queryClient.invalidateQueries({ queryKey: profileQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: profileQueryKeys.detail(profile.id) });
      await refreshProfile();
    },
  });
}
