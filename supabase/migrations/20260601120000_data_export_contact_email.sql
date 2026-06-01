-- Store the delivery email the user provides when requesting a RGPD data export.

ALTER TABLE public.data_export_requests
  ADD COLUMN IF NOT EXISTS contact_email text;

UPDATE public.data_export_requests
SET contact_email = ''
WHERE contact_email IS NULL;

ALTER TABLE public.data_export_requests
  ALTER COLUMN contact_email SET NOT NULL;

COMMENT ON COLUMN public.data_export_requests.contact_email IS
  'Email address where the operator sends the export archive.';
