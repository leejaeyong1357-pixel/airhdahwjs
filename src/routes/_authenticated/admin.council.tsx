import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetCouncil } from "@/lib/council.functions";
import { formatDate } from "@/lib/utils";
import { Star, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/council")({ component: AdminCouncil });

function AdminCouncil() {
  const fn = useServerFn(adminGetCouncil);
  const { data } = useQuery({ queryKey: ["admin", "council"], queryFn: () => fn() });
  const picks = data?.picks ?? [];
  const members = data?.members ?? [];

  return (
    <div className="space-y-10">
      {/* 혁신과제 선정 내역 */}
      <section>
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
          <h2 className="text-lg font-black tracking-tight">혁신과제 선정 내역</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[13px] font-bold text-primary">총 {picks.length}건</span>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">누가 · 무슨 작품을 · 왜 선정했는지, 그리고 누가 올린 작품인지 확인합니다.</p>
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr><Th>협의체 위원</Th><Th>선정한 작품</Th><Th>작품 제출자</Th><Th>선정 이유</Th><Th>일시</Th></tr>
            </thead>
            <tbody>
              {picks.map((p: any, i: number) => (
                <tr key={i} className="border-t border-border align-top">
                  <Td className="font-bold">{p.councilName}</Td>
                  <Td className="font-semibold">{p.submissionTitle}</Td>
                  <Td className="text-xs text-muted-foreground">{p.authorTeam}<br />{p.authorName}</Td>
                  <Td className="max-w-[320px] whitespace-pre-wrap text-[13px] text-foreground/90">{p.reason || "—"}</Td>
                  <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(p.createdAt)}</Td>
                </tr>
              ))}
              {picks.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">아직 선정 내역이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* AI 협의체 정체성 */}
      <section>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-black tracking-tight">AI 협의체 — 명 · 미션 · 슬로건 · 바램</h2>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {members.map((m: any) => (
            <div key={m.empNo} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="font-black text-foreground">{m.name} <span className="text-xs font-normal text-muted-foreground">{m.scope}</span></div>
                <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-600">선정 {m.pickCount}건</span>
              </div>
              <dl className="mt-3 space-y-2 text-[13.5px]">
                <Row label="협의체 명">{m.councilName}</Row>
                <Row label="슬로건">{m.slogan}</Row>
                <Row label="미션">{m.mission}</Row>
                <Row label="바램 · 방향성">{m.hope}</Row>
              </dl>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2">
      <dt className="text-[12px] font-bold text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-foreground/90">{children || <span className="text-muted-foreground/60">—</span>}</dd>
    </div>
  );
}
function Th({ children }: any) { return <th className="px-4 py-2.5 text-left font-semibold">{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>; }
