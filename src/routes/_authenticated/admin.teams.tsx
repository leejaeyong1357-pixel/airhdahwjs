import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListTeams, adminCreateTeam, adminDeleteTeam } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/teams")({
  component: AdminTeams,
});

function AdminTeams() {
  const listFn = useServerFn(adminListTeams);
  const createFn = useServerFn(adminCreateTeam);
  const delFn = useServerFn(adminDeleteTeam);
  const qc = useQueryClient();
  const { data: teams = [] } = useQuery({ queryKey: ["teams"], queryFn: () => listFn() });
  const [name, setName] = useState("");

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { name } }),
    onSuccess: () => { toast.success("추가됨"); setName(""); qc.invalidateQueries({ queryKey: ["teams"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["teams"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="max-w-xl space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="text-sm font-semibold">실/팀 추가</div>
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMut.mutate(); }} className="mt-3 flex gap-2">
          <Input placeholder="예: 미래성장실" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={createMut.isPending || !name.trim()}>
            <Plus className="mr-1 h-4 w-4" /> 추가
          </Button>
        </form>
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {teams.map((t: any) => (
          <li key={t.id} className="flex items-center justify-between px-5 py-3">
            <span className="text-sm font-medium">{t.name}</span>
            <Button size="sm" variant="ghost" onClick={() => { if (confirm(`${t.name} 삭제?`)) delMut.mutate(t.id); }}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </li>
        ))}
        {teams.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">등록된 실/팀이 없습니다.</li>}
      </ul>
    </div>
  );
}
