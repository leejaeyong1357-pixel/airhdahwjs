import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listCouncilWorks, setCouncilPick, removeCouncilPick, getCouncilIdentity, saveCouncilIdentity,
} from "@/lib/council.functions";
import { getLocalUser } from "@/integrations/supabase/demo";
import { isCouncil, COUNCIL_MAX_PICKS } from "@/lib/council";
import { AlertCircle, Star, Heart, Sparkles, CheckCircle2, Maximize2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/council")({ component: CouncilPage });

function CouncilPage() {
  const user = getLocalUser();
  const allowed = isCouncil(user?.empNo);

  const worksFn = useServerFn(listCouncilWorks);
  const idFn = useServerFn(getCouncilIdentity);
  const setPickFn = useServerFn(setCouncilPick);
  const removePickFn = useServerFn(removeCouncilPick);
  const saveIdFn = useServerFn(saveCouncilIdentity);
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["council", "works"], queryFn: () => worksFn(), enabled: allowed });
  const { data: identity } = useQuery({ queryKey: ["council", "identity"], queryFn: () => idFn(), enabled: allowed });

  const works = data?.works ?? [];
  const maxPicks = data?.maxPicks ?? COUNCIL_MAX_PICKS;
  const pickedCount = data?.pickedCount ?? 0;

  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [modalWork, setModalWork] = useState<any | null>(null);
  useEffect(() => {
    // 서버의 기존 선정 이유를 로컬 편집 상태에 반영
    const init: Record<string, string> = {};
    for (const w of works) if (w.picked) init[w.id] = w.reason;
    setReasons((prev) => ({ ...init, ...prev }));
  }, [data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["council", "works"] });
  const pickMut = useMutation({
    mutationFn: (v: { submissionId: string; reason: string }) => setPickFn({ data: v }),
    onSuccess: () => { toast.success("선정되었습니다."); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const unpickMut = useMutation({
    mutationFn: (submissionId: string) => removePickFn({ data: { submissionId } }),
    onSuccess: () => { toast.success("선정을 취소했습니다."); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!allowed) {
    return (
      <div className="mx-auto max-w-2xl p-16 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <div className="mt-4 text-lg font-semibold">AI 협의체 위원 전용 페이지입니다.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="text-[11px] font-black uppercase tracking-widest text-accent">AI 협의체</div>
      <h1 className="mt-2 text-3xl font-black tracking-tight">혁신과제 선정</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        담당: <b className="text-foreground">{data?.scope}</b>
        <span className="text-muted-foreground"> ({(data?.teams ?? []).join(" · ")})</span>
        {" · "}담당 실/팀의 작품 중 <b className="text-foreground">최대 {maxPicks}개</b>의 혁신과제를 선정해 주세요.
      </p>

      {/* 선정 현황 */}
      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3">
        <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
        <span className="text-[15px] font-black text-foreground">선정 {pickedCount} / {maxPicks}</span>
        <span className="text-[13px] text-muted-foreground">· 선정한 작품에는 반드시 선정 이유를 적어주세요.</span>
      </div>

      {/* 작품 목록 */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {works.map((w: any, idx: number) => {
          const reason = reasons[w.id] ?? "";
          return (
            <div key={w.id} className={`overflow-hidden rounded-2xl border bg-card ${w.picked ? "border-amber-400 ring-2 ring-amber-300/60" : "border-border"}`}>
              {/* 큰 썸네일 (클릭하면 팝업으로 더 크게) */}
              <button onClick={() => setModalWork(w)} className="group relative block w-full overflow-hidden bg-muted">
                <div className="aspect-video w-full overflow-hidden">
                  {w.thumbnailUrl
                    ? <img src={w.thumbnailUrl} alt={w.title} className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                    : <div className="grid h-full w-full place-items-center bg-hyundai-gradient text-sm text-white/70">이미지 없음</div>}
                </div>
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
                  <Maximize2 className="h-3 w-3" /> 크게 보기
                </span>
                {idx < 3 && (
                  <span className="absolute left-2 top-2 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-black text-white">인기 {idx + 1}위</span>
                )}
              </button>
              <div className="px-4 pt-3">
                <div className="text-[16px] font-black leading-snug text-foreground">{w.title}</div>
                <div className="mt-1 text-[13px] text-muted-foreground">{w.author.team} · {w.author.name} {w.author.position}</div>
                <div className="mt-1.5 flex items-center gap-3 text-[12px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" /> {w.likeCount}</span>
                  <button onClick={() => setModalWork(w)} className="font-semibold text-primary">작품 설명 · 썸네일 크게 보기</button>
                </div>
              </div>

              <div className="mt-3 border-t border-border p-4">
                {w.picked ? (
                  <div className="space-y-2">
                    <label className="block text-[13px] font-bold text-foreground">선정 이유</label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReasons((r) => ({ ...r, [w.id]: e.target.value }))}
                      rows={2}
                      placeholder="이 작품을 혁신과제로 선정한 이유를 적어주세요."
                      className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-[14px] outline-none focus:border-primary"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => pickMut.mutate({ submissionId: w.id, reason })}
                        disabled={pickMut.isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-black text-white hover:brightness-110"
                      >
                        <CheckCircle2 className="h-4 w-4" /> 이유 저장
                      </button>
                      <button
                        onClick={() => unpickMut.mutate(w.id)}
                        disabled={unpickMut.isPending}
                        className="rounded-lg border border-border px-4 py-2 text-[13px] font-bold text-muted-foreground hover:bg-muted"
                      >
                        선정 취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => pickMut.mutate({ submissionId: w.id, reason: reasons[w.id] ?? "" })}
                    disabled={pickMut.isPending || pickedCount >= maxPicks}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-2.5 text-[14px] font-black text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <Star className="h-4 w-4 text-amber-400" />
                    {pickedCount >= maxPicks ? `최대 ${maxPicks}개까지 선정` : "혁신과제로 선정"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {works.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground md:col-span-2">
            담당 실/팀에 접수된 작품이 없습니다.
          </div>
        )}
      </div>

      {/* AI 협의체 정체성 */}
      <IdentitySection identity={identity} onSave={(v) => saveIdFn({ data: v }).then(() => { toast.success("저장되었습니다."); qc.invalidateQueries({ queryKey: ["council", "identity"] }); }).catch((e) => toast.error(e.message))} />

      {/* 작품 상세 팝업 — 썸네일 크게 + 전체 설명 */}
      <Dialog open={!!modalWork} onOpenChange={(o) => !o && setModalWork(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
          {modalWork && (
            <div>
              <div className="w-full overflow-hidden rounded-t-lg bg-black">
                {modalWork.thumbnailUrl
                  ? <img src={modalWork.thumbnailUrl} alt={modalWork.title} className="max-h-[60vh] w-full object-contain" />
                  : <div className="grid aspect-video w-full place-items-center bg-hyundai-gradient text-white/70">이미지 없음</div>}
              </div>
              <div className="p-6">
                <h3 className="text-2xl font-black tracking-tight text-foreground">{modalWork.title}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[14px] text-muted-foreground">
                  <span>{modalWork.author.team} · {modalWork.author.name} {modalWork.author.position}</span>
                  <span className="inline-flex items-center gap-1"><Heart className="h-4 w-4 fill-rose-500 text-rose-500" /> {modalWork.likeCount}</span>
                </div>
                <div className="mt-5 space-y-4">
                  <Detail label="주요 기능">{modalWork.features}</Detail>
                  <Detail label="작품 설명">{modalWork.description}</Detail>
                  <Detail label="사용 AI · 기술 · 스택">{modalWork.techStack}</Detail>
                  <Detail label="기대 효과">{modalWork.expectedImpact}</Detail>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IdentitySection({ identity, onSave }: { identity: any; onSave: (v: any) => void }) {
  const [councilName, setCouncilName] = useState("");
  const [mission, setMission] = useState("");
  const [slogan, setSlogan] = useState("");
  const [hope, setHope] = useState("");
  useEffect(() => {
    if (identity) { setCouncilName(identity.councilName ?? ""); setMission(identity.mission ?? ""); setSlogan(identity.slogan ?? ""); setHope(identity.hope ?? ""); }
  }, [identity]);

  return (
    <div className="mt-12 overflow-hidden rounded-3xl border-2 border-primary/25 bg-gradient-to-br from-primary/5 to-transparent">
      <div className="flex items-center gap-2 border-b border-primary/15 bg-primary/10 px-7 py-4">
        <Sparkles className="h-6 w-6 text-primary" />
        <h2 className="text-[22px] font-black tracking-tight text-primary">우리 AI 협의체를 만들어요</h2>
      </div>
      <div className="px-7 py-6">
        <p className="text-[15.5px] leading-relaxed text-foreground/85">
          이 협의체는 <b>여러분이 직접 만들어가는 모임</b>입니다. 각자 생각하는 자기만의 바램과 방향성을 자유롭게 적어주세요.
          <br />
          <b className="text-primary">목요일 13시</b>에 함께 모여 이야기 나누겠습니다. 🙌
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4">
          <Field label="AI 협의체 명" value={councilName} onChange={setCouncilName} placeholder="예: TECZEN AI 혁신 협의체" />
          <Field label="슬로건" value={slogan} onChange={setSlogan} placeholder="한 줄 슬로건" />
          <Area label="미션" value={mission} onChange={setMission} placeholder="우리 협의체가 이루고자 하는 것" rows={3} />
          <Area label="나만의 바램 · 방향성 (자유롭게)" value={hope} onChange={setHope} placeholder="협의체를 통해 이루고 싶은 자기만의 바램, 방향성을 자유롭게 적어주세요." rows={4} />
        </div>
        <button
          onClick={() => onSave({ councilName, mission, slogan, hope })}
          className="mt-5 rounded-xl bg-primary px-6 py-3 text-[15px] font-black text-white hover:brightness-110"
        >
          저장
        </button>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90">{children || "—"}</p>
    </div>
  );
}
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-bold text-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-[15px] outline-none focus:border-primary" />
    </label>
  );
}
function Area({ label, value, onChange, placeholder, rows }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-bold text-foreground">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="w-full resize-y rounded-xl border border-border bg-background px-4 py-2.5 text-[15px] leading-relaxed outline-none focus:border-primary" />
    </label>
  );
}
