
-- Thumbnails: any authenticated user can view; only uploader/admin can write
CREATE POLICY "thumbnails read auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'thumbnails');
CREATE POLICY "thumbnails read anon" ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'thumbnails');
CREATE POLICY "thumbnails insert self" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'thumbnails' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "thumbnails delete self" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'thumbnails' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));

-- Submissions files: any authenticated user can view; only uploader/admin can write
CREATE POLICY "submissions read auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'submissions');
CREATE POLICY "submissions insert self" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'submissions' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "submissions delete self" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'submissions' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));
