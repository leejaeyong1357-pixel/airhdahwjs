import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axGetPipeline, axGetSecurityGuide } from "@/lib/ax-lab.functions";
import { AxSecurityGuideDialog } from "@/components/AxSecurityGuideDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AX_STEPS } from "@/lib/ax-stages";
import { FileText, Settings, ShieldCheck, Database, Users, ChevronRight, Info, ClipboardCheck, Award } from "lucide-react";

/** 신청 이후 진행 과정 (신청 위저드 사이드 패널용). */
export const AX_AFTER_SUBMIT_STEPS = [
  { title: "AX협의체 검토", desc: "신청 내용을 바탕으로 고도화 방향과 지원 범위를 검토합니다.", icon: Users },
  { title: "고도화 개발", desc: "검토 결과를 바탕으로 본인이 직접 기능을 고도화합니다.", icon: Settings },
  { title: "현장 검증 · 업무 적용", desc: "실제 업무에 적용해 효과를 확인합니다.", icon: FileText },
  { title: "보안 검증 · SaaS 승인", desc: "1차(본인)·2차(AX협의체) 보안검증 후 서비스 전환을 승인합니다.", icon: ShieldCheck },
  { title: "SaaS 등록 · 전사 확산", desc: "공식 일련번호를 발급받아 등록하고, 전사에 확산합니다.", icon: Database },
];

const PHASES = [
  { n: 1, title: "제안·검토", icon: FileText, steps: [1, 2, 3] },
  { n: 2, title: "개발·적용", icon: Settings, steps: [4, 5] },
  { n: 3, title: "검증·승인", icon: ShieldCheck, steps: [6, 7] },
  { n: 4, title: "공식 등록", icon: Database, steps: [8, 9] },
  { n: 5, title: "전사 확산", icon: Users, steps: [10] },
];

const stepOf = (n: number) => AX_STEPS.find((s) => s.n === n)!;

/** 아이디어에서 전사 확산까지 — 10단계를 5개 구간으로 묶어 보여준다. */
export function AxPipeline() {
  const pipelineFn = useServerFn(axGetPipeline);
  const { data } = useQuery({
    queryKey: ["ax", "pipeline"],
    queryFn: () => pipelineFn(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const [openStep, setOpenStep] = useState<number | null>(null);
  const [security, setSecurity] = useState(false);
  const [saasInfo, setSaasInfo] = useState(false);
  const [cert, setCert] = useState(false);

  const guideFn = useServerFn(axGetSecurityGuide);
  const { data: guide } = useQuery({
    queryKey: ["ax", "securityGuide"],
    queryFn: () => guideFn(),
    enabled: cert,
  });

  const myStep = data?.myStep ?? null;
  const members = (n: number) => data?.steps?.[n] ?? [];
  const countOf = (n: number) => (n === 1 ? (data?.totalWorks ?? 0) : members(n).length);

  // 내 신청이 있는 구간을 강조한다.
  const activePhase = myStep ? PHASES.find((p) => p.steps.includes(myStep))?.n : 2;

  return (
    <section className="rounded-2xl border border-[#e9ecf2] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[19px] font-black tracking-tight text-slate-900">아이디어에서 전사 확산까지</h2>
        <p className="text-[13px] text-slate-400">현장 적용을 확인한 과제를 공식 SaaS로 연결합니다.</p>
      </div>
      {myStep && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#eef4ff] px-3 py-1.5 text-[13px] font-bold text-blue-600">
          <ClipboardCheck className="h-4 w-4" />
          내 과제는 지금 {myStep}단계 · {stepOf(myStep).label} 입니다.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-stretch">
        {PHASES.map((p, i) => {
          const on = activePhase === p.n;
          return (
            <Fragment key={p.n}>
              <div
                className={`flex-1 rounded-xl border p-4 ${
                  on ? "border-blue-200 bg-[#f4f8ff]" : "border-[#eef1f6] bg-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <p.icon className={`h-[19px] w-[19px] shrink-0 ${on ? "text-blue-500" : "text-slate-400"}`} />
                  <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[11.5px] font-black ${
                    on ? "bg-blue-600 text-white" : "bg-[#eef1f6] text-slate-500"
                  }`}>
                    {p.n}
                  </span>
                  <span className="break-keep text-[14.5px] font-black text-slate-900">{p.title}</span>
                </div>

                <div className="mt-2.5 space-y-1">
                  {p.steps.map((n) => (
                    <StepRow
                      key={n}
                      n={n}
                      count={countOf(n)}
                      mine={myStep === n}
                      onOpen={n === 1 ? undefined : () => setOpenStep(n)}
                      extra={
                        n === 6 ? { label: "1차 보안검증 안내", onClick: () => setSecurity(true) }
                        : n === 8 ? { label: "SaaS란?", onClick: () => setSaasInfo(true) }
                        : n === 9 ? { label: "SaaS 인증서", onClick: () => setCert(true) }
                        : undefined
                      }
                    />
                  ))}
                </div>
              </div>
              {i < PHASES.length - 1 && (
                <ChevronRight className="hidden h-4 w-4 shrink-0 self-center text-slate-300 xl:block" />
              )}
            </Fragment>
          );
        })}
      </div>

      {/* 단계별 참여 현황 */}
      <Dialog open={!!openStep} onOpenChange={(o) => !o && setOpenStep(null)}>
        <DialogContent className="max-h-[75vh] max-w-lg overflow-y-auto">
          {openStep && (
            <>
              <DialogHeader>
                <DialogTitle>{openStep}단계 · {stepOf(openStep).label}</DialogTitle>
              </DialogHeader>
              <p className="-mt-1 text-[13px] text-slate-500">{stepOf(openStep).desc}</p>
              <div className="mt-2 space-y-2">
                {members(openStep).map((m: any) => (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                      m.mine ? "border-blue-300 bg-[#f4f8ff]" : "border-[#eef1f6]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-bold text-slate-800">{m.title}</div>
                      <div className="text-[12px] text-slate-400">{m.authorTeam} · {m.authorName}</div>
                    </div>
                    {m.mine && (
                      <span className="shrink-0 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-black text-white">내 과제</span>
                    )}
                  </div>
                ))}
                {members(openStep).length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#e3e8f0] p-8 text-center text-sm text-slate-400">
                    아직 이 단계에 있는 과제가 없습니다.
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* SaaS 설명 */}
      <Dialog open={saasInfo} onOpenChange={setSaasInfo}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>SaaS란?</DialogTitle></DialogHeader>
          <div className="flex items-start gap-3 rounded-xl bg-[#f4f8ff] p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
            <p className="text-[15px] leading-relaxed text-slate-700">
              <b className="text-slate-900">S</b>oftware <b className="text-slate-900">a</b>s <b className="text-slate-900">a</b> <b className="text-slate-900">S</b>ervice 의 약자로,
              <br />
              <b className="text-slate-900">직접 만든 소프트웨어 서비스</b>를 말합니다.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* SaaS 인증서 */}
      <Dialog open={cert} onOpenChange={setCert}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-blue-600" /> 테크젠 공식 SaaS 인증서
            </DialogTitle>
          </DialogHeader>
          {guide?.saasCertImage ? (
            <img
              src={guide.saasCertImage}
              alt="테크젠 공식 SaaS 인증서"
              className="w-full rounded-xl border border-[#eef1f6] object-contain"
            />
          ) : (
            <div className="rounded-xl border border-dashed border-[#e3e8f0] bg-[#fbfcfe] p-12 text-center text-sm text-slate-400">
              아직 등록된 인증서가 없습니다. 관리자가 [과제 관리 &gt; 안내 자료 설정] 에서 등록합니다.
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AxSecurityGuideDialog open={security} onOpenChange={setSecurity} />
    </section>
  );
}

function StepRow({ n, count, mine, onOpen, extra }: {
  n: number; count: number; mine: boolean;
  onOpen?: () => void;
  extra?: { label: string; onClick: () => void };
}) {
  const s = stepOf(n);
  const clickable = !!onOpen;
  return (
    <div>
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={onOpen}
        onKeyDown={(e) => { if (clickable && (e.key === "Enter" || e.key === " ")) onOpen!(); }}
        className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[12.5px] transition ${
          mine ? "bg-blue-600/10 ring-1 ring-blue-300" : ""
        } ${clickable ? "cursor-pointer hover:bg-[#eef4ff] hover:shadow-sm active:scale-[0.98]" : ""}`}
      >
        <span className={`break-keep ${mine ? "font-black text-blue-700" : "font-semibold text-slate-500"}`}>
          {n}. {s.label}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${
            count > 0 ? "bg-[#eef4ff] text-blue-600" : "bg-[#f1f4f9] text-slate-300"
          }`}
        >
          {n === 1 ? `${count}개` : count}
        </span>
      </div>
      {n === 1 && <div className="px-2 pb-1 text-[11px] text-slate-400">경진대회</div>}
      {n === 6 && (
        <div className="px-2 pb-1 text-[11px] leading-snug text-slate-400">1차 본인 · 2차 AX협의체</div>
      )}
      {extra && (
        <button
          onClick={extra.onClick}
          className="ml-2 mb-1 inline-flex items-center gap-1 rounded-md border border-[#dbe5f5] bg-white px-2 py-1 text-[11px] font-bold text-blue-600 transition hover:bg-[#eef4ff]"
        >
          <Info className="h-3 w-3" /> {extra.label}
        </button>
      )}
    </div>
  );
}
