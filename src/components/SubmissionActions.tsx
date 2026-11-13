import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Trash2, ImagePlus, Paperclip, X, Plus } from "lucide-react";
import { getSubmission, updateSubmission, deleteSubmission } from "@/lib/submissions.functions";
import { getLocalUser } from "@/integrations/supabase/demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** 파일을 /api/media 로 업로드하고 저장 경로를 돌려준다. */
async function uploadMedia(bucket: string, empNo: string, prefix: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[\\/\0]/g, "_");
  const path = `${empNo}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName}`;
  const res = await fetch(`/api/media?path=${encodeURIComponent(`${bucket}/${path}`)}`, {
    method: "POST",
    headers: file.type ? { "Content-Type": file.type } : undefined,
    body: file,
  });
  if (!res.ok) throw new Error(`업로드 실패 (${res.status})`);
  return path;
}

type AttachFile = { path: string; name: string; mime?: string; size?: number };
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

// 본인 작품 수정·삭제 버튼 (작품 상세 · 마이페이지 공용)
export function SubmissionActions({
  id,
  onChanged,
  afterDelete,
}: {
  id: string;
  onChanged?: () => void;
  afterDelete?: () => void;
}) {
  const get = useServerFn(getSubmission);
  const update = useServerFn(updateSubmission);
  const remove = useServerFn(deleteSubmission);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "", features: "", description: "", techStack: "", expectedImpact: "",
  });
  const [currentThumb, setCurrentThumb] = useState<string>("");
  const [newThumb, setNewThumb] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string>("");
  const thumbRef = useRef<HTMLInputElement>(null);
  // 첨부파일: 유지할 기존 파일 목록 + 새로 추가한 File 목록
  const [keptFiles, setKeptFiles] = useState<AttachFile[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function openEdit() {
    setBusy(true);
    try {
      const data = await get({ data: { id } });
      const s: any = data.submission;
      setForm({
        title: s.title ?? "",
        features: s.features ?? "",
        description: s.description ?? "",
        techStack: s.tech_stack ?? "",
        expectedImpact: s.expected_impact ?? "",
      });
      setCurrentThumb(s.thumbnailSignedUrl ?? "");
      setNewThumb(null);
      setThumbPreview("");
      setKeptFiles((data.files ?? []).map((f: any) => ({
        path: f.file_path, name: f.file_name, mime: f.mime_type ?? undefined, size: f.size_bytes ?? undefined,
      })));
      setNewFiles([]);
      setEditOpen(true);
    } catch (err: any) {
      toast.error(err.message ?? "불러오기 실패");
    } finally {
      setBusy(false);
    }
  }

  function onPickThumb(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    setNewThumb(f);
    setThumbPreview(URL.createObjectURL(f));
  }

  function onAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const arr = Array.from(e.target.files ?? []);
    if (keptFiles.length + newFiles.length + arr.length > 20) {
      toast.error("첨부파일은 최대 20개까지 가능합니다.");
      return;
    }
    setNewFiles((prev) => [...prev, ...arr]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const user = getLocalUser();
      const empNo = user?.empNo ?? "unknown";
      let thumbnailPath: string | undefined;
      if (newThumb) {
        thumbnailPath = await uploadMedia("thumbnails", empNo, "thumb", newThumb);
      }
      // 새로 추가한 첨부파일 업로드
      const uploaded: AttachFile[] = [];
      for (const f of newFiles) {
        const path = await uploadMedia("submissions", empNo, "file", f);
        uploaded.push({ path, name: f.name, mime: f.type, size: f.size });
      }
      const files = [...keptFiles, ...uploaded];
      await update({
        data: {
          id,
          ...form,
          ...(thumbnailPath ? { thumbnailPath } : {}),
          files,
        },
      });
      toast.success("작품이 수정되었습니다.");
      setEditOpen(false);
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message ?? "수정 실패");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await remove({ data: { id } });
      toast.success("작품이 삭제되었습니다.");
      setDelOpen(false);
      afterDelete?.();
    } catch (err: any) {
      toast.error(err.message ?? "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={openEdit}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> 수정
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => setDelOpen(true)}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> 삭제
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>작품 수정</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>썸네일</Label>
              <div className="flex items-center gap-4">
                <div className="h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                  {(thumbPreview || currentThumb) ? (
                    <img src={thumbPreview || currentThumb} alt="썸네일" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">없음</div>
                  )}
                </div>
                <div>
                  <input ref={thumbRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/*" className="hidden" onChange={onPickThumb} />
                  <Button type="button" variant="outline" size="sm" onClick={() => thumbRef.current?.click()}>
                    <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> 썸네일 변경
                  </Button>
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    {newThumb ? newThumb.name : "PNG · JPG · WEBP · GIF 등 이미지 파일"}
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>제목</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label>주요 기능</Label>
              <Textarea rows={3} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} required maxLength={2000} />
            </div>
            <div className="space-y-1.5">
              <Label>설명</Label>
              <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required maxLength={5000} />
            </div>
            <div className="space-y-1.5">
              <Label>사용 AI · 기술 · 스택</Label>
              <Textarea rows={2} value={form.techStack} onChange={(e) => setForm({ ...form, techStack: e.target.value })} required maxLength={2000} />
            </div>
            <div className="space-y-1.5">
              <Label>기대 효과</Label>
              <Textarea rows={2} value={form.expectedImpact} onChange={(e) => setForm({ ...form, expectedImpact: e.target.value })} required maxLength={2000} />
            </div>

            <div className="space-y-1.5">
              <Label>첨부파일</Label>
              <div className="space-y-2">
                {keptFiles.length === 0 && newFiles.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                    첨부파일이 없습니다.
                  </div>
                )}
                {keptFiles.map((f) => (
                  <div key={f.path} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setKeptFiles((prev) => prev.filter((x) => x.path !== f.path))}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="첨부 삭제"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {newFiles.map((f, i) => (
                  <div key={`new-${i}`} className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                    <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-[10px] font-semibold text-primary">추가됨</span>
                    <button
                      type="button"
                      onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="첨부 취소"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <input ref={fileRef} type="file" multiple className="hidden" onChange={onAddFiles} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Paperclip className="mr-1.5 h-3.5 w-3.5" /> 파일 추가
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>취소</Button>
              <Button type="submit" disabled={busy}>{busy ? "저장 중…" : "저장"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>작품을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              작품과 첨부파일, 받은 좋아요·댓글이 모두 삭제되며 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={busy} className="bg-destructive text-white hover:bg-destructive/90">
              {busy ? "삭제 중…" : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
