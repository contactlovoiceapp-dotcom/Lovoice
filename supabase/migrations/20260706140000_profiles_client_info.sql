-- Client device and app metadata reported by the mobile app (best-effort, nullable).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS device_platform text,
  ADD COLUMN IF NOT EXISTS device_model text,
  ADD COLUMN IF NOT EXISTS device_os_version text,
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS client_info_updated_at timestamptz;

COMMENT ON COLUMN public.profiles.device_platform IS
  'Last reported mobile OS identifier (e.g. ios, android).';
COMMENT ON COLUMN public.profiles.device_model IS
  'Last reported device model name from the client.';
COMMENT ON COLUMN public.profiles.device_os_version IS
  'Last reported OS version string from the client.';
COMMENT ON COLUMN public.profiles.app_version IS
  'Last reported Lovoice app version from the client.';
COMMENT ON COLUMN public.profiles.client_info_updated_at IS
  'When device/app metadata was last synced from the client.';
