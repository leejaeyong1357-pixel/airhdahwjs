import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminGetLiveBoard, adminSetPhase, adminReorder, adminUpdateWork, adminResetLiveEvals,
} from "@/lib/live.functions";
import { getLocalUser } from "@/integrations/supabase/demo";
import { toast } from "sonner";
import {
  Megaphone, Play, Square, ChevronUp, ChevronDown, Pencil, Trophy, Medal, RotateCcw, Radio, Check,
} from "lucide-react";

export const Route = createFileRoute("/control")({ component: Control });

function Control() {
  const nav = useNavigate();
  useEffect(() => {
    const u = getLocalUser();
    if (!u || !u.roles?.includes("admin")) nav({ to: "/auth", replace: true });
  }, [nav]);

  const boardFn = useServerFn(adminGetLiveBoard);
  const phaseFn = useServerFn(adminSetPhase);
  const reorderFn = useServerFn(adminReorder);
  const updateFn = useServerFn(adminUpdateWork);
  const resetFn = useServerFn(adminResetLiveEvals);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["liveBoard"], queryFn: () => boardFn(), refetchInterval: 1500 });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["liveBoard"] });

  const phaseMut = useMutation({
    mutationFn: (v: { workId: string | null; phase: "idle" | "intro" | "presenting" }) => phaseFn({ data: v }),
    onSuccess: invalidate, onError: (e: any) => toast.error(e.message),
  });
  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) => reorderFn({ data: { orderedIds } }),
    onSuccess: invalidate, onError: (e: any) => toast.error(e.message),
  });
  const resetMut = useMutation({
    mutationFn: () => resetFn(),
    onSuccess: () => { toast.success("현장 발표평가를 초기화했습니다."); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const works = data?.works ?? [];
  const ranking = data?.ranking ?? [];
  const live = data?.live ?? { workId: null, phase: "idle" };
  const [editId, setEditId] = useState<string | null>(null);

  const move = (i: number, dir: -1 | 1) => {
    const ids = works.map((w: any) => w.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderMut.mutate(ids);
  };

  const curName = works.find((w: any) => w.id === live.workId)?.name;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      {/* 현재 상태 배너 */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <Radio className={`h-6 w-6 ${live.phase === "presenting" ? "text-rose-500" : live.phase === "intro" ? "text-amber-500" : "text-muted-foreground"}`} />
          <div>
            <div className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">현재 상태</div>
            <div className="text-lg font-black text-foreground">
              {live.phase === "idle" && "대기 중"}
              {live.phase === "intro" && `발표 예고 — ${curName} 님`}
              {live.phase === "presenting" && `발표/평가 진행 중 — ${curName} 님`}
            </div>
          </div>
        </div>
        <button
          onClick={() => phaseMut.mutate({ workId: null, phase: "idle" })}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-[14px] font-bold text-muted-foreground hover:bg-muted"
        >
          <Square className="h-4 w-4" /> 대기 화면으로
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 발표 진행 제어 */}
        <section>
          <h2 className="mb-3 text-lg font-black tracking-tight">발표 진행 · 순서</h2>
          <div className="space-y-2">
            {works.map((w: any, i: number) => {
              const isCur = live.workId === w.id;
              return (
                <div key={w.id} className={`rounded-xl border bg-card ${isCur ? "border-primary ring-1 ring-primary/30" : "border-border"}`}>
                  <div className="flex items-center gap-2 p-3">
                    <div className="flex flex-col">
                      <button onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0}><ChevronUp className="h-4 w-4" /></button>
                      <button onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === works.length - 1}><ChevronDown className="h-4 w-4" /></button>
                    </div>
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-sm font-black">{w.order}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-foreground">{w.name} <span className="text-xs font-normal text-muted-foreground">{w.team}</span></div>
                      <div className="truncate text-xs text-muted-foreground">{w.title} · 1차 {w.base} · 발표평가 {w.liveCount}명</div>
                    </div>
                    <button onClick={() => setEditId(editId === w.id ? null : w.id)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="flex gap-1.5 border-t border-border p-2">
                    <CtrlBtn tone="amber" active={isCur && live.phase === "intro"} onClick={() => phaseMut.mutate({ workId: w.id, phase: "intro" })}>
                      <Megaphone className="h-3.5 w-3.5" /> 발표 예고
                    </CtrlBtn>
                    <CtrlBtn tone="rose" active={isCur && live.phase === "presenting"} onClick={() => phaseMut.mutate({ workId: w.id, phase: "presenting" })}>
                      <Play className="h-3.5 w-3.5" /> 발표/평가 시작
                    </CtrlBtn>
                  </div>
                  {editId === w.id && <EditForm work={w} onSave={(patch) => { updateFn({ data: { id: w.id, ...patch } }).then(() => { toast.success("저장됨"); invalidate(); setEditId(null); }).catch((e) => toast.error(e.message)); }} />}
                </div>
              );
            })}
          </div>
        </section>

        {/* 실시간 순위 */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight">실시간 순위</h2>
            <button
              onClick={() => { if (confirm("현장 발표평가를 전부 초기화할까요? (1차 점수·작품은 유지)")) resetMut.mutate(); }}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-destructive"
            >
              <RotateCcw className="h-3 w-3" /> 발표평가 초기화
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs">
                <tr>
                  <Th className="w-12">순위</Th><Th>발표자</Th>
                  <Th className="text-right">1차<span className="text-muted-foreground">70%</span></Th>
                  <Th className="text-right">발표<span className="text-muted-foreground">30%</span></Th>
                  <Th className="text-right">총점</Th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r: any) => (
                  <tr key={r.id} className={`border-t border-border ${r.rank <= 3 ? "bg-amber-50/40" : ""} ${live.workId === r.id ? "bg-primary/[0.05]" : ""}`}>
                    <Td>
                      <span className="inline-flex items-center gap-1 font-black tabular-nums">
                        {r.rank === 1 && <Trophy className="h-4 w-4 text-yellow-500" />}
                        {r.rank === 2 && <Medal className="h-4 w-4 text-zinc-400" />}
                        {r.rank === 3 && <Medal className="h-4 w-4 text-orange-500" />}
                        {r.rank}
                      </span>
                    </Td>
                    <Td>
                      <div className="font-bold text-foreground">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.team}</div>
                    </Td>
                    <Td className="text-right tabular-nums text-muted-foreground">{r.base}</Td>
                    <Td className="text-right tabular-nums">{r.liveAvg} <span className="text-[11px] text-muted-foreground">({r.liveCount})</span></Td>
                    <Td className="text-right"><span className="text-lg font-black text-primary tabular-nums">{r.total}</span></Td>
                  </tr>
                ))}
                {ranking.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">데이터 없음</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">최종 = 1차 점수 × 70% + 현장 발표평가 평균 × 30% · 1.5초마다 자동 갱신</p>
        </section>
      </div>
    </div>
  );
}

function CtrlBtn({ tone, active, onClick, children }: { tone: "amber" | "rose"; active: boolean; onClick: () => void; children: React.ReactNode }) {
  const on = tone === "amber" ? "bg-amber-500 text-white border-amber-500" : "bg-rose-500 text-white border-rose-500";
  return (
    <button onClick={onClick} className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-[13px] font-bold transition ${active ? on : "border-border bg-background text-foreground hover:bg-muted"}`}>
      {children}{active && <Check className="h-3.5 w-3.5" />}
    </button>
  );
}

function EditForm({ work, onSave }: { work: any; onSave: (patch: any) => void }) {
  const [title, setTitle] = useState(work.title ?? "");
  const [tech, setTech] = useState(work.tech ?? "");
  const [content, setContent] = useState(work.content ?? "");
  const [thumbnail, setThumbnail] = useState(work.thumbnail ?? "");
  const [base, setBase] = useState(String(work.base ?? 0));
  return (
    <div className="space-y-2 border-t border-border bg-muted/30 p-3">
      <Inp label="작품명" value={title} onChange={setTitle} />
      <Inp label="썸네일 이미지 URL" value={thumbnail} onChange={setThumbnail} placeholder="https://…" />
      <Area label="기술 구현" value={tech} onChange={setTech} />
      <Area label="작품 설명" value={content} onChange={setContent} />
      <Inp label="1차 점수 (0-100)" value={base} onChange={(v) => setBase(v.replace(/[^0-9.]/g, ""))} />
      <button
        onClick={() => onSave({ title, tech, content, thumbnail, base: Number(base) || 0 })}
        className="w-full rounded-lg bg-primary py-2 text-[13px] font-black text-white hover:brightness-110"
      >
        저장
      </button>
    </div>
  );
}

function Inp({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[12px] font-semibold text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] outline-none focus:border-primary" />
    </label>
  );
}
function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[12px] font-semibold text-muted-foreground">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full resize-y rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] outline-none focus:border-primary" />
    </label>
  );
}

function Th({ children, className }: any) { return <th className={`px-3 py-2 text-left font-semibold ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-3 py-2.5 ${className ?? ""}`}>{children}</td>; }
