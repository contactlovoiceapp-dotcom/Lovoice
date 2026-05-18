-- Removes PostgREST exposure of PostGIS system tables.
-- spatial_ref_sys is owned by supabase_admin (cannot ALTER), but revoking
-- SELECT from anon/authenticated achieves the same security goal: the table
-- is no longer reachable via the REST API. Internal PostGIS functions
-- (ST_Distance, ST_Within, etc.) run as the function owner and are unaffected.
--
-- Originally applied via Supabase Studio on 2026-05-13; recovered into git on
-- 2026-05-18 to align the local migration history with the remote.
REVOKE ALL ON public.spatial_ref_sys FROM anon, authenticated;
