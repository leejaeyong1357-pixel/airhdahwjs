import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminGetSelectionBoard, adminSetSelectionStatus, adminAutoSelectTopPerTeam,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Wand2, Trophy, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/selection")({
  component: AdminSelection,
});

const TARGET = 30;

function AdminSelection() {
  const boardFn = useServerFn(adminGetSelectionBoard);
  const setFn = useServerFn(adminSetSelectionStatus);
  const autoFn = useServerFn(adminAutoSelectTopPerTeam);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "selection"], queryFn: () => boardFn() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "selection"] });
  const setMut = useMutation({
    mutationFn: (v: { submissionId: string; status: "selected" | "reserve" | "none" }) => setFn({ data: v }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });
  const autoMut = useMutation({
    mutationFn: () => autoFn(),
    onSuccess: (r: any) => { toast.success(`각 팀 1위 ${r.selected}명 본선 · 2위 ${r.reserve}명 예비로 선발했습니다.`); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const teams = data?.teams ?? [];
  const selectedCount = data?.selectedCount ?? 0;
  const reserveCount = data?.reserveCount ?? 0;
  const noPick: string[] = data?.teamsWithoutPick ?? [];

  return (
    <div className="space-y-5">
      {/* 요약 + 액션 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-primary/10 px-3 py-1 font-black text-primary">
            본선 {selectedCount} / {TARGET}명
          </span>
          <span className="rounded-full bg-amber-500/10 px-3 py-1 font-bold text-amber-600">예비 {reserveCount}명</span>
          <span className="text-muted-foreground">· 팀 {teams.length}개</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={autoMut.isPending} onClick={() => { if (confirm("각 팀 1위를 본선, 2위를 예비로 자동 선발합니다.\n기존 선택은 덮어써집니다. 진행할까요?")) autoMut.mutate(); }}>
            <Wand2 className="mr-1.5 h-4 w-4" /> 각 팀 1위 자동 선발
          </Button>
          <Button onClick={() => exportExcel(teams)} disabled={selectedCount + reserveCount === 0}>
            <Download className="mr-1.5 h-4 w-4" /> 엑셀 다운로드
          </Button>
        </div>
      </div>

      {/* 미선발 팀 경고 */}
      {noPick.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/50 bg-amber-50 px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-amber-800">
            <b>아직 본선을 선발하지 않은 팀 ({noPick.length})</b> — 각 팀 최소 1명을 선발하세요:
            <span className="ml-1 font-semibold">{noPick.join(", ")}</span>
          </div>
        </div>
      )}

      {/* 팀별 카드 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {teams.map((t: any) => (
          <div key={t.team} className={`overflow-hidden rounded-xl border bg-card ${t.selectedCount === 0 ? "border-amber-400/60" : "border-border"}`}>
            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-black text-foreground">{t.team}</span>
                <span className="text-xs text-muted-foreground">{t.submissions.length}건 접수</span>
              </div>
              {t.selectedCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                  <Trophy className="h-3 w-3" /> 본선 {t.selectedCount}
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600">미선발</span>
              )}
            </div>
            <div className="divide-y divide-border/70">
              {t.submissions.map((s: any, i: number) => (
                <div key={s.submissionId} className={`flex items-center gap-3 px-4 py-2.5 ${s.status === "selected" ? "bg-primary/[0.06]" : s.status === "reserve" ? "bg-amber-500/[0.06]" : ""}`}>
                  <span className="w-5 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{s.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {s.authorName} {s.authorPosition} · 총점 <b className="text-foreground">{s.final}</b> <span className="text-[11px]">(심사 {s.judgeCount}명 · ♥{s.likeCount})</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 overflow-hidden rounded-lg border border-border text-[12px] font-bold">
                    <Seg active={s.status === "selected"} tone="primary" onClick={() => setMut.mutate({ submissionId: s.submissionId, status: s.status === "selected" ? "none" : "selected" })}>본선</Seg>
                    <Seg active={s.status === "reserve"} tone="amber" onClick={() => setMut.mutate({ submissionId: s.submissionId, status: s.status === "reserve" ? "none" : "reserve" })}>예비</Seg>
                  </div>
                </div>
              ))}
              {t.submissions.length === 0 && <div className="px-4 py-3 text-[13px] text-muted-foreground">접수된 작품이 없습니다.</div>}
            </div>
          </div>
        ))}
        {teams.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground lg:col-span-2">
            아직 접수된 작품이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function Seg({ active, tone, onClick, children }: { active: boolean; tone: "primary" | "amber"; onClick: () => void; children: React.ReactNode }) {
  const on = tone === "primary" ? "bg-primary text-white" : "bg-amber-500 text-white";
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 transition-colors ${active ? on : "bg-background text-muted-foreground hover:bg-muted"}`}>
      {children}
    </button>
  );
}

/** 본선·예비 명단 엑셀(.xls) 다운로드 — 구분·팀·이름·직급·총점. */
function exportExcel(teams: any[]) {
  const esc = (v: any) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows: string[] = [];
  const pick = (status: string, label: string) => {
    for (const t of teams) {
      for (const s of t.submissions) {
        if (s.status === status) rows.push(
          `<tr><td>${label}</td><td>${esc(s.authorTeam)}</td><td>${esc(s.authorName)}</td><td>${esc(s.authorPosition)}</td><td>${esc(s.title)}</td><td>${s.final}</td></tr>`,
        );
      }
    }
  };
  pick("selected", "본선");
  pick("reserve", "예비");
  const html =
    `<html><head><meta charset="utf-8"></head><body><table border="1">` +
    `<thead><tr><th>구분</th><th>팀</th><th>이름</th><th>직급</th><th>작품</th><th>총점</th></tr></thead>` +
    `<tbody>${rows.join("")}</tbody></table></body></html>`;
  const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const a = document.createElement("a");
  a.href = url; a.download = `TECZEN_본선선발_${ymd}.xls`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
