
-- Recreate view as security_invoker (uses caller's privileges)
DROP VIEW IF EXISTS public.submission_like_counts;
CREATE VIEW public.submission_like_counts
  WITH (security_invoker = true)
AS
  SELECT submission_id, COUNT(*)::int AS like_count
  FROM public.likes
  GROUP BY submission_id;
GRANT SELECT ON public.submission_like_counts TO anon, authenticated;

-- Restrict internal helpers/triggers
REVOKE EXECUTE ON FUNCTION public.enforce_max_likes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_evaluation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_role_name() FROM PUBLIC, anon;
-- has_role is used by RLS policies executed as SQL, but should not be callable by anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
