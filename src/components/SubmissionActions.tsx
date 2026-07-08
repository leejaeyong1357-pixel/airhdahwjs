import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { getSubmission, updateSubmission, deleteSubmission } from "@/lib/submissions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
      setEditOpen(true);
    } catch (err: any) {
      toast.error(err.message ?? "불러오기 실패");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await update({ data: { id, ...form } });
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
