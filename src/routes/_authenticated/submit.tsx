import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createSubmission } from "@/lib/submissions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, X, Image as ImageIcon, FileText, CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/submit")({
  component: SubmitPage,
});

type Progress = {
  key: string;
  name: string;
  size: number;
  loaded: number;
  done: boolean;
  error?: string;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatEta(sec: number) {
  if (!isFinite(sec) || sec <= 0) return "계산 중…";
  if (sec < 60) return `약 ${Math.ceil(sec)}초 남음`;
  const m = Math.floor(sec / 60);
  const s = Math.ceil(sec % 60);
  return `약 ${m}분 ${s}초 남음`;
}

/** Upload a File to a Supabase Storage bucket with XHR progress events.
 *  Uses signed upload URLs so we can get real upload progress. */
async function uploadWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress: (loaded: number) => void,
): Promise<void> {
  // 1) get a signed upload URL (token is embedded in the URL as ?token=...)
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "signed URL 생성 실패");
  const { signedUrl } = data;

  // 2) PUT raw file with XHR for progress. Do NOT set Authorization —
  // the signed URL carries its own token; adding a bearer breaks it.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("cache-control", "3600");
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(ev.loaded);
    };
    xhr.onerror = () => reject(new Error("네트워크 오류"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size);
        resolve();
      } else {
        reject(new Error(`업로드 실패 (${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
      }
    };
    xhr.send(file);
  });
}

function SubmitPage() {
  const nav = useNavigate();
  const create = useServerFn(createSubmission);
  const [form, setForm] = useState({
    title: "", features: "", description: "", techStack: "", expectedImpact: "",
  });
  const [thumb, setThumb] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress[]>([]);
  const startRef = useRef<number>(0);
  const [now, setNow] = useState(0); // tick to force re-render for ETA
  const tickRef = useRef<number | null>(null);

  const totals = useMemo(() => {
    const total = progress.reduce((a, p) => a + p.size, 0);
    const loaded = progress.reduce((a, p) => a + p.loaded, 0);
    const pct = total ? Math.round((loaded / total) * 100) : 0;
    const elapsed = now && startRef.current ? (now - startRef.current) / 1000 : 0;
    const speed = elapsed > 0 ? loaded / elapsed : 0; // B/s
    const remaining = total - loaded;
    const eta = speed > 0 ? remaining / speed : Infinity;
    return { total, loaded, pct, speed, eta };
  }, [progress, now]);

  function onThumb(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setThumb(f); setThumbPreview(URL.createObjectURL(f));
  }
  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const arr = Array.from(e.target.files ?? []); setFiles((p) => [...p, ...arr]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!thumb) return toast.error("썸네일 이미지를 업로드해 주세요.");
    if (busy) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다.");

      const thumbExt = thumb.name.split(".").pop() || "png";
      const thumbPath = `${user.id}/thumb-${Date.now()}.${thumbExt}`;
      const ts = Date.now();
      const filePlans = files.map((f, i) => ({
        file: f,
        path: `${user.id}/file-${ts}-${i}-${f.name}`,
      }));

      // Seed progress state (thumbnail + all files)
      const initial: Progress[] = [
        { key: "__thumb__", name: `썸네일: ${thumb.name}`, size: thumb.size, loaded: 0, done: false },
        ...filePlans.map((p) => ({
          key: p.path, name: p.file.name, size: p.file.size, loaded: 0, done: false,
        })),
      ];
      setProgress(initial);
      startRef.current = performance.now();
      setNow(performance.now());
      // ticker to update ETA even between progress events
      tickRef.current = window.setInterval(() => setNow(performance.now()), 500);

      const updateOne = (key: string, patch: Partial<Progress>) =>
        setProgress((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

      // Kick off all uploads in parallel with per-file progress
      const jobs: Promise<void>[] = [];
      jobs.push(
        uploadWithProgress("thumbnails", thumbPath, thumb, (loaded) =>
          updateOne("__thumb__", { loaded }),
        )
          .then(() => updateOne("__thumb__", { done: true, loaded: thumb.size }))
          .catch((err) => {
            updateOne("__thumb__", { error: err.message });
            throw new Error(`썸네일 업로드 실패: ${err.message}`);
          }),
      );
      for (const p of filePlans) {
        jobs.push(
          uploadWithProgress("submissions", p.path, p.file, (loaded) =>
            updateOne(p.path, { loaded }),
          )
            .then(() => updateOne(p.path, { done: true, loaded: p.file.size }))
            .catch((err) => {
              updateOne(p.path, { error: err.message });
              throw new Error(`파일 업로드 실패 (${p.file.name}): ${err.message}`);
            }),
        );
      }

      await Promise.all(jobs);

      const uploadedFiles = filePlans.map((p) => ({
        path: p.path, name: p.file.name, mime: p.file.type, size: p.file.size,
      }));

      const { id } = await create({
        data: { ...form, thumbnailPath: thumbPath, files: uploadedFiles },
      });
      toast.success("작품이 등록되었습니다!");
      nav({ to: "/work/$id", params: { id } });
    } catch (err: any) {
      toast.error(err.message ?? "등록 실패");
    } finally {
      if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-accent">SUBMIT YOUR WORK</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">작품 제출</h1>
        <p className="mt-2 text-sm text-muted-foreground">모든 형태의 결과물(HTML, 프로그램, Python 등)을 업로드할 수 있습니다.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-border bg-card p-8">
        <Field label="1. 제목" htmlFor="title">
          <Input id="title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} placeholder="예: AI Vision" />
        </Field>
        <Field label="2. 주요 기능" htmlFor="features">
          <Textarea id="features" required value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} rows={3} maxLength={2000} placeholder="핵심 기능을 요약해 주세요" />
        </Field>
        <Field label="3. 설명" htmlFor="description">
          <Textarea id="description" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={5} maxLength={5000} placeholder="작품에 대한 자세한 설명" />
        </Field>
        <Field label="4. 사용한 AI · 기술 · 스택 · 알고리즘 · 아키텍처" htmlFor="tech">
          <Textarea id="tech" required value={form.techStack} onChange={(e) => setForm({ ...form, techStack: e.target.value })} rows={3} maxLength={2000} placeholder="예: OpenAI GPT-5, LangChain, React, PostgreSQL, Vector DB..." />
        </Field>
        <Field label="5. 기대 효과" htmlFor="impact">
          <Textarea id="impact" required value={form.expectedImpact} onChange={(e) => setForm({ ...form, expectedImpact: e.target.value })} rows={3} maxLength={2000} placeholder="업무·조직·비즈니스에 기대되는 효과" />
        </Field>

        <div>
          <Label className="mb-2 block">썸네일 이미지 <span className="text-destructive">*</span></Label>
          <div className="rounded-xl border-2 border-dashed border-border bg-background p-4">
            {thumbPreview ? (
              <div className="relative aspect-video overflow-hidden rounded-lg">
                <img src={thumbPreview} className="h-full w-full object-cover" alt="thumb preview" />
                <button type="button" onClick={() => { setThumb(null); setThumbPreview(""); }} className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white hover:bg-black">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-lg bg-muted/30 text-sm text-muted-foreground hover:bg-muted/50">
                <ImageIcon className="h-8 w-8" />
                <span>클릭하여 썸네일 업로드</span>
                <input type="file" accept="image/*" onChange={onThumb} className="hidden" />
              </label>
            )}
          </div>
        </div>

        <div>
          <Label className="mb-2 block">작품 파일 (모든 형식 지원, 다중 업로드)</Label>
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            💡 <strong>구현을 위해 설치해야 할 플러그인/런타임이 있다면 반드시 위 설명란에 기재해 주세요.</strong>
            <div className="mt-1 text-amber-800/80">
              예) 프로그램 실행을 위해 <b>Python 3.11</b> 설치가 필수입니다! · <b>Node.js 20</b> 설치가 필요합니다! · <b>Docker</b> 실행 환경 필요 등
            </div>
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background p-6 text-sm text-muted-foreground hover:bg-muted/30">
            <Upload className="h-5 w-5" />
            <span>파일 선택 (HTML, ZIP, py, exe, 폴더 압축 등 · 대용량 지원)</span>
            <input type="file" multiple onChange={onFiles} className="hidden" />
          </label>
          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {busy && progress.length > 0 && (
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <div className="font-semibold">업로드 중… {totals.pct}%</div>
              <div className="text-xs text-muted-foreground">
                {formatBytes(totals.loaded)} / {formatBytes(totals.total)}
                {totals.speed > 0 && <> · {formatBytes(totals.speed)}/s</>}
                {" · "}{formatEta(totals.eta)}
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${totals.pct}%` }}
              />
            </div>
            <ul className="mt-4 space-y-2">
              {progress.map((p) => {
                const pct = p.size ? Math.round((p.loaded / p.size) * 100) : 0;
                return (
                  <li key={p.key} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      {p.done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : p.error ? (
                        <X className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatBytes(p.loaded)} / {formatBytes(p.size)} · {pct}%
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${p.error ? "bg-destructive" : "bg-primary/80"} transition-[width] duration-200`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {p.error && <div className="text-[11px] text-destructive">{p.error}</div>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <Button type="submit" disabled={busy} className="w-full bg-primary hover:bg-primary/90">
          {busy
            ? `제출 중… ${totals.pct}% (${formatEta(totals.eta)})`
            : "작품 제출"}
        </Button>
      </form>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-2 block font-semibold">{label}</Label>
      {children}
    </div>
  );
}
