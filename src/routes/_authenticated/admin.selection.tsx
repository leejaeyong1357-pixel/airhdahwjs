import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminGetSelectionBoard, adminSetSelectionStatus, adminAutoSelectTopPerTeam,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Wand2, Trophy, Check, RotateCcw } from "lucide-react";

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
    mutationFn: (v: { submissionId: string; status: "selected" | "reserve" | "excluded" | "none" }) => setFn({ data: v }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });
  const autoMut = useMutation({
    mutationFn: () => autoFn(),
    onSuccess: (r: any) => { toast.success(`각 팀 1위 ${r.selected}명 본선 · 2위 ${r.reserve}명 예비 선발`); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const teams = data?.teams ?? [];
  const selectedCount = data?.selectedCount ?? 0;
  const reserveCount = data?.reserveCount ?? 0;
  const excludedCount = data?.excludedCount ?? 0;

  // 전체 순위(하나의 리스트) — 총점 내림차순
  const ranking = useMemo(() => {
    const flat = teams.flatMap((t: any) => t.submissions.map((s: any) => ({ ...s, team: t.team })));
    flat.sort((a: any, b: any) => b.final - a.final);
    return flat.map((s: any, i: number) => ({ ...s, rank: i + 1 }));
  }, [teams]);

  // 팀별 선발 인원 (오른쪽 패널)
  const teamTally = useMemo(
    () => teams.map((t: any) => ({ team: t.team, total: t.submissions.length, selected: t.selectedCount, reserve: t.reserveCount })),
    [teams],
  );

  const toggle = (s: any, kind: "selected" | "reserve" | "excluded") =>
    setMut.mutate({ submissionId: s.submissionId, status: s.status === kind ? "none" : kind });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* 왼쪽: 전체 순위에서 클릭 선발 */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] text-muted-foreground">
            전체 순위에서 <b className="text-foreground">본선</b> 또는 <b className="text-foreground">예비</b>를 눌러 선발하세요.
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={autoMut.isPending}
              onClick={() => { if (confirm("각 팀 1위를 본선, 2위를 예비로 자동 선발합니다.\n기존 선택은 덮어써집니다.")) autoMut.mutate(); }}>
              <Wand2 className="mr-1.5 h-3.5 w-3.5" /> 각 팀 1위 자동
            </Button>
          </div>
        </div>

        <div className="overflow-auto rounded-xl border border-border bg-card" style={{ maxHeight: "74vh" }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs">
              <tr>
                <Th className="w-12">순위</Th>
                <Th>지원자 · 작품</Th>
                <Th className="text-right">총점</Th>
                <Th className="w-[190px] text-center">선발 / 제외</Th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((s: any) => {
                const excluded = s.status === "excluded";
                const blur = excluded ? "blur-[1.6px] opacity-40 select-none" : "";
                return (
                  <tr key={s.submissionId}
                    className={`border-t border-border ${s.status === "selected" ? "bg-primary/[0.07]" : s.status === "reserve" ? "bg-amber-500/[0.07]" : excluded ? "bg-muted/40" : ""}`}>
                    <Td className={`font-bold tabular-nums ${blur}`}>{s.rank}</Td>
                    <Td className={blur}>
                      <div className="font-semibold text-foreground">
                        {s.authorName} <span className="font-normal text-muted-foreground">{s.authorPosition}</span>
                        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{s.team}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{s.title}</div>
                    </Td>
                    <Td className={`text-right ${blur}`}><span className="font-black text-primary tabular-nums">{s.final}</span></Td>
                    <Td>
                      <div className="flex justify-center gap-1">
                        <SegBtn active={s.status === "selected"} tone="primary" onClick={() => toggle(s, "selected")}>본선</SegBtn>
                        <SegBtn active={s.status === "reserve"} tone="amber" onClick={() => toggle(s, "reserve")}>예비</SegBtn>
                        <SegBtn active={excluded} tone="slate" onClick={() => toggle(s, "excluded")}>제외</SegBtn>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {ranking.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">아직 접수된 작품이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* 오른쪽: 팀별 선발 현황 (sticky) */}
      <aside className="lg:sticky lg:top-4 h-fit space-y-3">
        <div className="rounded-2xl border-2 border-primary/25 bg-primary/5 p-5 text-center">
          <div className="text-[13px] font-bold text-primary">본선 선발</div>
          <div className="mt-1 text-4xl font-black text-foreground tabular-nums">
            {selectedCount}<span className="text-xl text-muted-foreground"> / {TARGET}</span>
          </div>
          <div className="mt-1 text-[13px] font-semibold text-amber-600">예비 {reserveCount}명 · <span className="text-slate-500">제외 {excludedCount}명</span></div>
          <Button className="mt-3 w-full" size="sm" onClick={() => exportExcel(teams)} disabled={selectedCount + reserveCount === 0}>
            <Download className="mr-1.5 h-4 w-4" /> 엑셀 다운로드
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[14px] font-black text-foreground">팀별 선발 인원</div>
            <button className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
              onClick={() => { if (confirm("모든 선발을 초기화할까요?")) { teams.forEach((t: any) => t.submissions.forEach((s: any) => s.status !== "none" && setMut.mutate({ submissionId: s.submissionId, status: "none" }))); } }}>
              <RotateCcw className="h-3 w-3" /> 초기화
            </button>
          </div>
          <div className="space-y-1">
            {teamTally.map((t: any) => (
              <div key={t.team}
                className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-[13px] ${t.selected === 0 ? "bg-amber-50" : "bg-emerald-50"}`}>
                <span className="font-medium text-foreground">{t.team}</span>
                <span className="flex items-center gap-2">
                  {t.reserve > 0 && <span className="text-[11px] text-amber-600">예비 {t.reserve}</span>}
                  <span className={`inline-flex min-w-[1.6rem] items-center justify-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-black ${t.selected === 0 ? "bg-amber-200 text-amber-800" : "bg-emerald-500 text-white"}`}>
                    {t.selected > 0 && <Check className="h-3 w-3" />}{t.selected}명
                  </span>
                </span>
              </div>
            ))}
            {teamTally.length === 0 && <div className="px-2 py-3 text-center text-[13px] text-muted-foreground">접수된 팀이 없습니다.</div>}
          </div>
        </div>
      </aside>
    </div>
  );
}

function SegBtn({ active, tone, onClick, children }: { active: boolean; tone: "primary" | "amber" | "slate"; onClick: () => void; children: React.ReactNode }) {
  const on =
    tone === "primary" ? "bg-primary text-white border-primary"
    : tone === "amber" ? "bg-amber-500 text-white border-amber-500"
    : "bg-slate-500 text-white border-slate-500";
  return (
    <button type="button" onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-[12px] font-bold transition-colors ${active ? on : "border-border bg-background text-muted-foreground hover:bg-muted"}`}>
      {children}
    </button>
  );
}

/** 본선·예비 명단 엑셀(.xls) 다운로드 — 구분·팀·이름·직급·작품·총점. */
function exportExcel(teams: any[]) {
  const esc = (v: any) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows: string[] = [];
  const pick = (status: string, label: string) => {
    const all = teams.flatMap((t) => t.submissions.filter((s: any) => s.status === status));
    all.sort((a: any, b: any) => b.final - a.final);
    for (const s of all) rows.push(
      `<tr><td>${label}</td><td>${esc(s.authorTeam)}</td><td>${esc(s.authorName)}</td><td>${esc(s.authorPosition)}</td><td>${esc(s.title)}</td><td>${s.final}</td></tr>`,
    );
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

function Th({ children, className }: any) { return <th className={`px-4 py-2.5 text-left font-semibold ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-4 py-2.5 ${className ?? ""}`}>{children}</td>; }
