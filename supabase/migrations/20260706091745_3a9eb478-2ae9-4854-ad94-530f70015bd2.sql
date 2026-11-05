
-- Restrict all public reads to authenticated users (app is fully behind login)

-- profiles
DROP POLICY IF EXISTS "profiles read all" ON public.profiles;
CREATE POLICY "profiles read authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- submissions
DROP POLICY IF EXISTS "submissions read all" ON public.submissions;
CREATE POLICY "submissions read authenticated" ON public.submissions
  FOR SELECT TO authenticated USING (true);

-- submission_files
DROP POLICY IF EXISTS "sfiles read all" ON public.submission_files;
CREATE POLICY "sfiles read authenticated" ON public.submission_files
  FOR SELECT TO authenticated USING (true);

-- Revoke anon SELECT (was granted broadly earlier)
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.submissions FROM anon;
REVOKE SELECT ON public.submission_files FROM anon;

-- Lock down SECURITY DEFINER helper: only server-side roles should EXECUTE
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;

REVOKE EXECUTE ON FUNCTION public.current_role_name() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_role_name() TO service_role;
