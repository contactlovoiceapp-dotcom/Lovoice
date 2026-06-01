-- Allows authenticated admins to mark data-export requests as completed from lovoice-admin.

CREATE POLICY admins_update_data_export_requests ON public.data_export_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
