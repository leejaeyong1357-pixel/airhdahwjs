import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListUsers, adminCreateUser, adminDeleteUser, adminResetPassword, adminImportUsers,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, KeyRound, Plus, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsers,
});

function AdminUsers() {
  const listFn = useServerFn(adminListUsers);
  const createFn = useServerFn(adminCreateUser);
  const importFn = useServerFn(adminImportUsers);
  const delFn = useServerFn(adminDeleteUser);
  const resetFn = useServerFn(adminResetPassword);
  const qc = useQueryClient();
  const { data: users = [] } = useQuery({ queryKey: ["admin", "users"], queryFn: () => listFn() });

  const [newUser, setNewUser] = useState({ name: "", employeeNo: "", jumin: "", team: "", position: "", role: "participant" as "participant" | "judge" | "admin" });
  const [resetOpen, setResetOpen] = useState<{ id: string; name: string } | null>(null);
  const [newPw, setNewPw] = useState("");

  const createMut = useMutation({
    mutationFn: () => createFn({ data: newUser }),
    onSuccess: () => {
      toast.success("사용자가 등록되었습니다.");
      setNewUser({ name: "", employeeNo: "", jumin: "", team: "", position: "", role: "participant" });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const importMut = useMutation({
    mutationFn: (rows: any[]) => importFn({ data: { rows } }),
    onSuccess: (r: any) => {
      toast.success(`${r.ok}건 등록${r.failed.length ? ` · ${r.failed.length}건 실패` : ""}`);
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { userId: id } }),
    onSuccess: () => { toast.success("삭제됨"); qc.invalidateQueries({ queryKey: ["admin", "users"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: () => resetFn({ data: { userId: resetOpen!.id, newPassword: newPw } }),
    onSuccess: () => { toast.success("비밀번호가 재설정되었습니다."); setResetOpen(null); setNewPw(""); },
    onError: (e: any) => toast.error(e.message),
  });

  function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const lines = text.split(/\r?\n/).filter(Boolean);
      const header = lines[0].toLowerCase();
      const startIdx = header.includes("name") || header.includes("이름") ? 1 : 0;
      const rows = lines.slice(startIdx).map((line) => {
        const [name, employeeNo, jumin, team, position, role] = line.split(",").map((s) => s.trim());
        return {
          name, employeeNo, jumin, team: team || "", position: position || "",
          role: (role || "participant") as any,
        };
      });
      importMut.mutate(rows);
    };
    reader.readAsText(f);
    e.target.value = "";
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">사용자 등록</div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted">
            <Upload className="h-3 w-3" /> CSV 일괄 등록
            <input type="file" accept=".csv" onChange={handleCsv} className="hidden" />
          </label>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">CSV 형식: 이름, 사번, 주민번호앞자리, 팀, 직급, 역할(participant|judge|admin)</div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          <Input placeholder="이름" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
          <Input placeholder="사번" value={newUser.employeeNo} onChange={(e) => setNewUser({ ...newUser, employeeNo: e.target.value.replace(/\D/g, "") })} />
          <Input placeholder="주민번호 앞 6자리" value={newUser.jumin} onChange={(e) => setNewUser({ ...newUser, jumin: e.target.value.replace(/\D/g, "").slice(0,6) })} />
          <Input placeholder="팀" value={newUser.team} onChange={(e) => setNewUser({ ...newUser, team: e.target.value })} />
          <Input placeholder="직급" value={newUser.position} onChange={(e) => setNewUser({ ...newUser, position: e.target.value })} />
          <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="participant">참여자</SelectItem>
              <SelectItem value="judge">심사위원</SelectItem>
              <SelectItem value="admin">관리자</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button className="mt-4" disabled={createMut.isPending || !newUser.name || !newUser.employeeNo || newUser.jumin.length !== 6} onClick={() => createMut.mutate()}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> 등록
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <Th>이름</Th><Th>사번</Th><Th>팀</Th><Th>직급</Th><Th>권한</Th><Th>비번 변경 필요</Th><Th className="text-right">액션</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id} className="border-t border-border">
                <Td className="font-semibold">{u.name}</Td>
                <Td className="font-mono text-xs">{u.employee_no}</Td>
                <Td>{u.team ?? "—"}</Td>
                <Td>{u.position ?? "—"}</Td>
                <Td><span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{u.role}</span></Td>
                <Td>{u.must_change_password ? <span className="text-amber-600">예</span> : <span className="text-muted-foreground">아니오</span>}</Td>
                <Td className="text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setResetOpen({ id: u.id, name: u.name }); setNewPw(""); }}>
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(`${u.name} 삭제?`)) delMut.mutate(u.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!resetOpen} onOpenChange={(o) => !o && setResetOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{resetOpen?.name} 비밀번호 재설정</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>새 비밀번호 (사용자는 최초 로그인 시 다시 변경)</Label>
            <Input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="6자 이상" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetOpen(null)}>취소</Button>
            <Button disabled={newPw.length < 6 || resetMut.isPending} onClick={() => resetMut.mutate()}>재설정</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Th({ children, className }: any) { return <th className={`px-4 py-2.5 text-left ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-4 py-2.5 ${className ?? ""}`}>{children}</td>; }
