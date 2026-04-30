-- Adds server-side profile validators that mirror the Phase 3 onboarding rules.
-- Client mapping: Supabase returns SQLSTATE 23514 with these stable messages:
-- - profile.display_name_length
-- - profile.birthdate_age_minimum
-- - profile.looking_for_required
-- - profile.looking_for_invalid

CREATE OR REPLACE FUNCTION public.profiles_validate_required_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.display_name IS NULL
     OR char_length(btrim(NEW.display_name)) < 2
     OR char_length(btrim(NEW.display_name)) > 30 THEN
    RAISE EXCEPTION 'profile.display_name_length'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.birthdate IS NULL
     OR NEW.birthdate > (CURRENT_DATE - INTERVAL '18 years')::date THEN
    RAISE EXCEPTION 'profile.birthdate_age_minimum'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.looking_for IS NULL OR cardinality(NEW.looking_for) = 0 THEN
    RAISE EXCEPTION 'profile.looking_for_required'
      USING ERRCODE = '23514';
  END IF;

  IF NOT NEW.looking_for <@ ARRAY['male', 'female', 'nonbinary', 'other']::text[] THEN
    RAISE EXCEPTION 'profile.looking_for_invalid'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.profiles_validate_required_fields() IS
  'Validates profile onboarding fields; raises SQLSTATE 23514 with stable profile.* messages for client error mapping.';

DROP TRIGGER IF EXISTS profiles_validate_required_fields_trg ON public.profiles;

CREATE TRIGGER profiles_validate_required_fields_trg
  BEFORE INSERT OR UPDATE OF display_name, birthdate, looking_for ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_validate_required_fields();
