-- Phase 9: RGPD data-export request queue (manual fulfillment by operators via lovoice-admin).
--
-- Back-office spec (lovoice-admin, sibling repo): page `/data-exports` listing rows WHERE
-- status = 'pending' ORDER BY created_at ASC (columns: date, user_id → /users/[id], display_name
-- via profiles join). Action "Marquer comme traité" sets status = 'completed', completed_at = now(),
-- completed_by = admin auth uid. Operators export user data manually from Supabase Studio/scripts
-- until that page ships.

CREATE TABLE public.data_export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  completed_by uuid NULL REFERENCES public.admin_users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.data_export_requests IS
  'User-initiated RGPD portability requests; fulfilled manually by admins (no instant export API).';

CREATE UNIQUE INDEX data_export_requests_one_pending_per_user
  ON public.data_export_requests (user_id)
  WHERE status = 'pending';

ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY insert_own_data_export_requests ON public.data_export_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY select_own_data_export_requests ON public.data_export_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY admins_read_data_export_requests ON public.data_export_requests
  FOR SELECT TO authenticated
  USING (public.is_admin());
