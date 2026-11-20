
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('participant', 'judge', 'admin');

-- ============ TEAMS ============
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.teams TO anon, authenticated;
GRANT ALL ON public.teams TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.teams TO authenticated;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  team TEXT,
  position TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER_ROLES ============
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Role check helper (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_role_name()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ============ SUBMISSIONS ============
CREATE TABLE public.submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  features TEXT NOT NULL,
  description TEXT NOT NULL,
  tech_stack TEXT NOT NULL,
  expected_impact TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.submissions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.submissions TO authenticated;
GRANT ALL ON public.submissions TO service_role;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.submission_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.submission_files TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.submission_files TO authenticated;
GRANT ALL ON public.submission_files TO service_role;
ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;

-- ============ LIKES ============
CREATE TABLE public.likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.likes TO authenticated;
GRANT ALL ON public.likes TO service_role;
-- anon can read count via a public view only, not the table
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

-- Enforce max 3 likes per user
CREATE OR REPLACE FUNCTION public.enforce_max_likes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.likes WHERE user_id = NEW.user_id) >= 3 THEN
    RAISE EXCEPTION '좋아요는 인당 최대 3개까지만 가능합니다.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_enforce_max_likes
  BEFORE INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_likes();

-- Public view: aggregated like counts (no user identity leaked)
CREATE VIEW public.submission_like_counts AS
  SELECT submission_id, COUNT(*)::int AS like_count
  FROM public.likes
  GROUP BY submission_id;
GRANT SELECT ON public.submission_like_counts TO anon, authenticated;

-- ============ COMMENTS ============
CREATE TABLE public.comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.comments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- ============ EVALUATIONS ============
CREATE TABLE public.evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  judge_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  innovation INT NOT NULL,     -- 0-40
  completeness INT NOT NULL,   -- 0-30
  utilization INT NOT NULL,    -- 0-20
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, judge_id)
);
GRANT SELECT ON public.evaluations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.evaluations TO authenticated;
GRANT ALL ON public.evaluations TO service_role;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- Validate score ranges + judging window via trigger (avoids immutable CHECK)
CREATE OR REPLACE FUNCTION public.validate_evaluation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  kst_now TIMESTAMPTZ := now();
  kst_local TIMESTAMP := (now() AT TIME ZONE 'Asia/Seoul');
  window_start TIMESTAMP := TIMESTAMP '2026-07-14 07:00:00';
  window_end   TIMESTAMP := TIMESTAMP '2026-07-15 00:00:00';
BEGIN
  IF NEW.innovation < 0 OR NEW.innovation > 40 THEN
    RAISE EXCEPTION '혁신성 점수는 0~40 사이여야 합니다.';
  END IF;
  IF NEW.completeness < 0 OR NEW.completeness > 30 THEN
    RAISE EXCEPTION '완성도 점수는 0~30 사이여야 합니다.';
  END IF;
  IF NEW.utilization < 0 OR NEW.utilization > 20 THEN
    RAISE EXCEPTION '활용도 점수는 0~20 사이여야 합니다.';
  END IF;
  -- Admins can insert/update any time; judges only within window
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    IF kst_local < window_start OR kst_local >= window_end THEN
      RAISE EXCEPTION '평가는 2026-07-14 07:00 ~ 24:00 (KST) 사이에만 가능합니다.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_evaluation
  BEFORE INSERT OR UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.validate_evaluation();

-- ============ RLS POLICIES ============

-- teams
CREATE POLICY "teams read all" ON public.teams FOR SELECT USING (true);
CREATE POLICY "teams admin write" ON public.teams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- profiles
CREATE POLICY "profiles read all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles admin all" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- user_roles (users can see their own; admins see all)
CREATE POLICY "user_roles self read" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles admin write" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- submissions
CREATE POLICY "submissions read all" ON public.submissions FOR SELECT USING (true);
CREATE POLICY "submissions insert own" ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "submissions update own" ON public.submissions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "submissions delete own" ON public.submissions FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- submission_files
CREATE POLICY "sfiles read all" ON public.submission_files FOR SELECT USING (true);
CREATE POLICY "sfiles insert own" ON public.submission_files FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "sfiles delete own" ON public.submission_files FOR DELETE TO authenticated
  USING (EXISTS(SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- likes (anonymous voting — each user only sees their own likes)
CREATE POLICY "likes self read" ON public.likes FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "likes insert self" ON public.likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes delete self" ON public.likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- comments
CREATE POLICY "comments read all" ON public.comments FOR SELECT USING (true);
CREATE POLICY "comments insert self" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments delete self" ON public.comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- evaluations (judge sees own; admin sees all)
CREATE POLICY "evaluations self read" ON public.evaluations FOR SELECT TO authenticated
  USING (auth.uid() = judge_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "evaluations insert self" ON public.evaluations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = judge_id AND (public.has_role(auth.uid(), 'judge') OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "evaluations update self" ON public.evaluations FOR UPDATE TO authenticated
  USING (auth.uid() = judge_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = judge_id OR public.has_role(auth.uid(), 'admin'));
