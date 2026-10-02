CREATE OR REPLACE FUNCTION public.validate_evaluation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.innovation < 0 OR NEW.innovation > 40 THEN
    RAISE EXCEPTION '혁신성 점수는 0-40 사이여야 합니다.';
  END IF;
  IF NEW.completeness < 0 OR NEW.completeness > 30 THEN
    RAISE EXCEPTION '완성도 점수는 0-30 사이여야 합니다.';
  END IF;
  IF NEW.utilization < 0 OR NEW.utilization > 20 THEN
    RAISE EXCEPTION '활용도 점수는 0-20 사이여야 합니다.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_finalized = TRUE THEN
    RAISE EXCEPTION '평가완료된 항목은 수정할 수 없습니다.';
  END IF;
  RETURN NEW;
END; $$;