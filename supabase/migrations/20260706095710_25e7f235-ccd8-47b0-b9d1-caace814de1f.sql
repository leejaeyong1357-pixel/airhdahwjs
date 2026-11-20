-- Restore EXECUTE on has_role so RLS policies (storage & tables) that call it work for signed-in users.
-- Function is SECURITY DEFINER and only reads user_roles — safe for authenticated to execute.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_role_name() TO authenticated;