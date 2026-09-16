import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetRankings } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Trophy, Medal, Download, ChevronDown, Users } from "lucide-react";
import { SCORE_RULE_LABEL } from "@/lib/judging";

export const Route = createFileRoute("/_authenticated/admin/rankings")({
  component: AdminRankings,
});

function AdminRankings() {
  const fn = useServerFn(adminGetRankings);
  const { data = [] } = useQuery({ queryKey: ["admin", "rankings"], queryFn: () => fn() });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-muted-foreground">
          최종점수 = {SCORE_RULE_LABEL}
          <span className="ml-2 font-semibold text-foreground">총 {data.length}개 작품</span>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/selection"><Users className="mr-1.5 h-4 w-4" /> 30명 선발하기</Link>
          </Button>
          <Button onClick={() => exportExcel(data)} disabled={data.length === 0}>
            <Download className="mr-1.5 h-4 w-4" /> 엑셀 다운로드 (순위·총점)
          </Button>
        </div>
      </div>

      {/* 스크롤 가능한 전체 순위 */}
      <div className="overflow-auto rounded-xl border border-border bg-card" style={{ maxHeight: "72vh" }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs">
            <tr>
              <Th className="w-14">순위</Th>
              <Th>지원자</Th>
              <Th>작품</Th>
              <Th className="text-right">심사평균<span className="text-muted-foreground">/100</span></Th>
              <Th className="text-right">심사점수<span className="text-muted-foreground">/80</span></Th>
              <Th className="text-right">좋아요<span className="text-muted-foreground">/20</span></Th>
              <Th className="text-right">총점<span className="text-muted-foreground">/100</span></Th>
              <Th className="w-10"></Th>
            </tr>
          </thead>
          <tbody>
            {data.map((r: any) => {
              const expanded = open.has(r.submissionId);
              return (
                <Fragment key={r.submissionId}>
                  <tr
                    className={`cursor-pointer border-t border-border hover:bg-muted/40 ${r.rank <= 3 ? "bg-amber-50/40" : ""}`}
                    onClick={() => toggle(r.submissionId)}
                  >
                    <Td>
                      <span className="inline-flex items-center gap-1 font-black">
                        {r.rank === 1 && <Trophy className="h-4 w-4 text-yellow-500" />}
                        {r.rank === 2 && <Medal className="h-4 w-4 text-zinc-400" />}
                        {r.rank === 3 && <Medal className="h-4 w-4 text-orange-500" />}
                        {r.rank}
                      </span>
                    </Td>
                    <Td>
                      <div className="font-semibold text-foreground">{r.author?.name} <span className="font-normal text-muted-foreground">{r.author?.position}</span></div>
                      <div className="text-xs text-muted-foreground">{r.author?.team}</div>
                    </Td>
                    <Td className="font-medium">{r.title}</Td>
                    <Td className="text-right tabular-nums">{r.judgeAvg} <span className="text-xs text-muted-foreground">({r.judgeCount}명)</span></Td>
                    <Td className="text-right tabular-nums">{r.judgeScore}</Td>
                    <Td className="text-right tabular-nums">{r.likeScore} <span className="text-xs text-muted-foreground">(♥{r.likeCount})</span></Td>
                    <Td className="text-right"><span className="text-lg font-black text-primary tabular-nums">{r.final}</span></Td>
                    <Td className="text-center">
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </Td>
                  </tr>
                  {expanded && (
                    <tr className="border-t border-border bg-muted/20">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="mb-2 text-[13px] font-bold text-foreground">심사위원별 점수 (누가 몇 점 줬는지)</div>
                        {r.breakdown.length === 0 ? (
                          <div className="text-[13px] text-muted-foreground">아직 심사한 평가자가 없습니다.</div>
                        ) : (
                          <div className="overflow-hidden rounded-lg border border-border">
                            <table className="w-full text-[13px]">
                              <thead className="bg-muted/60 text-xs">
                                <tr>
                                  <Th>심사위원</Th>
                                  <Th className="text-right">혁신성/40</Th>
                                  <Th className="text-right">완성도/40</Th>
                                  <Th className="text-right">활용도/20</Th>
                                  <Th className="text-right">합계/100</Th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.breakdown.map((b: any, i: number) => (
                                  <tr key={i} className="border-t border-border/70">
                                    <Td>{b.judgeTeam ? b.judgeTeam + " · " : ""}{b.judgeName} <span className="text-muted-foreground">{b.judgePosition}</span></Td>
                                    <Td className="text-right tabular-nums">{b.innovation}</Td>
                                    <Td className="text-right tabular-nums">{b.completeness}</Td>
                                    <Td className="text-right tabular-nums">{b.utilization}</Td>
                                    <Td className="text-right font-bold tabular-nums">{b.total}</Td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {data.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">아직 순위가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="text-[12px] text-muted-foreground">행을 클릭하면 심사위원별 점수 내역이 펼쳐집니다.</div>
    </div>
  );
}

/** HTML 표 기반 .xls 다운로드 — 순위·이름·팀·직급·총점만. (라이브러리 불필요, 한글 정상) */
function exportExcel(rows: any[]) {
  const esc = (v: any) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const header = ["순위", "이름", "팀", "직급", "작품", "총점"];
  const body = rows
    .map((r) =>
      `<tr><td>${r.rank}</td><td>${esc(r.author?.name)}</td><td>${esc(r.author?.team)}</td><td>${esc(r.author?.position)}</td><td>${esc(r.title)}</td><td>${r.final}</td></tr>`,
    )
    .join("");
  const html =
    `<html><head><meta charset="utf-8"></head><body><table border="1">` +
    `<thead><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
    `<tbody>${body}</tbody></table></body></html>`;
  const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `TECZEN_최종순위_${ymd}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Th({ children, className }: any) { return <th className={`px-4 py-2.5 text-left font-semibold ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-4 py-2.5 ${className ?? ""}`}>{children}</td>; }
