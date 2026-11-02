-- Update completeness max to 40 (rubric now 40+40+20=100)
CREATE OR REPLACE FUNCTION public.validate_evaluation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  kst_local TIMESTAMP := (now() AT TIME ZONE 'Asia/Seoul');
  window_start TIMESTAMP := TIMESTAMP '2026-07-14 07:00:00';
  window_end   TIMESTAMP := TIMESTAMP '2026-07-15 00:00:00';
BEGIN
  IF NEW.innovation < 0 OR NEW.innovation > 40 THEN
    RAISE EXCEPTION '혁신성 점수는 0~40 사이여야 합니다.';
  END IF;
  IF NEW.completeness < 0 OR NEW.completeness > 40 THEN
    RAISE EXCEPTION '완성도 점수는 0~40 사이여야 합니다.';
  END IF;
  IF NEW.utilization < 0 OR NEW.utilization > 20 THEN
    RAISE EXCEPTION '활용도 점수는 0~20 사이여야 합니다.';
  END IF;
  -- Once finalized, block further updates (admins can always modify)
  IF TG_OP = 'UPDATE' AND OLD.is_finalized = true AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION '이미 평가완료 처리된 항목은 수정할 수 없습니다.';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    IF kst_local < window_start OR kst_local >= window_end THEN
      RAISE EXCEPTION '평가는 2026-07-14 07:00 ~ 24:00 (KST) 사이에만 가능합니다.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN NOT NULL DEFAULT false;