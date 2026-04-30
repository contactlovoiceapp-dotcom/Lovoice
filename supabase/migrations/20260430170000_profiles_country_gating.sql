-- Enforces profile country gating and allows authenticated users to create their own profile.

CREATE OR REPLACE FUNCTION public.profiles_enforce_allowed_country()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country NOT IN ('FR', 'BE', 'CH') THEN
    RAISE EXCEPTION 'country must be one of FR, BE, CH'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_enforce_allowed_country_trg ON public.profiles;

CREATE TRIGGER profiles_enforce_allowed_country_trg
  BEFORE INSERT OR UPDATE OF country ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_enforce_allowed_country();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'insert_own_profile'
  ) THEN
    CREATE POLICY insert_own_profile ON public.profiles
      FOR INSERT TO authenticated
      WITH CHECK (id = auth.uid());
  END IF;
END;
$$;
