
-- 1. Comments: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "comments read all" ON public.comments;
CREATE POLICY "comments read authenticated" ON public.comments
  FOR SELECT TO authenticated USING (true);

-- 2. Profiles: restrict SELECT to self + admin
DROP POLICY IF EXISTS "profiles read authenticated" ON public.profiles;
CREATE POLICY "profiles read self or admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Prevent authenticated users from directly updating must_change_password
REVOKE UPDATE (must_change_password) ON public.profiles FROM authenticated;

-- 4. Add UPDATE policy on user_roles for admin (close gap noted in scan)
DROP POLICY IF EXISTS "user_roles admin update" ON public.user_roles;
CREATE POLICY "user_roles admin update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Convert helper functions from SECURITY DEFINER to SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$function$;

CREATE OR REPLACE FUNCTION public.current_role_name()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT role::text FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$function$;
