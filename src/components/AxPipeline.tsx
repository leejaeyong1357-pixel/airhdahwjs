import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axGetPipeline, axGetSecurityGuide } from "@/lib/ax-lab.functions";
import { AxSecurityGuideDialog } from "@/components/AxSecurityGuideDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AX_STEPS } from "@/lib/ax-stages";
import {
  Send, Settings, ShieldCheck, Award, ChevronRight, Info, ClipboardCheck, Users, FileText, Database,
} from "lucide-react";

/** 신청 이후 진행 과정 (신청 위저드 사이드 패널용). */
export const AX_AFTER_SUBMIT_STEPS = [
  { title: "AX협의체 승인 검토", desc: "실효성을 검토해 승인 또는 반려합니다. 반려되면 사유를 알려드립니다.", icon: Users },
  { title: "고도화", desc: "1차 보안검증 프롬프트를 넣고 본인이 직접 고도화합니다.", icon: Settings },
  { title: "2차 승인 검토 요청", desc: "고도화가 끝나면 직접 검토를 요청합니다.", icon: FileText },
  { title: "AX협의체 2차 검토", desc: "실효성과 보안을 확인합니다. 반려되면 고도화 단계로 돌아갑니다.", icon: ShieldCheck },
  { title: "SaaS 등록번호 발급", desc: "테크젠 공식 번호와 인증서를 받습니다.", icon: Database },
];

const ICONS = [Send, Settings, ShieldCheck, Award];
const stepOf = (n: number) => AX_STEPS.find((s) => s.n === n)!;

/** 고도화 신청에서 SaaS 등록까지 — 각 단계를 하나씩 분리해 보여준다. */
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
  const [cert, setCert] = useState(false);

  const guideFn = useServerFn(axGetSecurityGuide);
  const { data: guide } = useQuery({
    queryKey: ["ax", "securityGuide"],
    queryFn: () => guideFn(),
    enabled: cert,
  });

  const myStep = data?.myStep ?? null;
  const members = (n: number) => data?.steps?.[n] ?? [];

  return (
    <section className="rounded-2xl border border-[#e9ecf2] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[19px] font-black tracking-tight text-slate-900">고도화 진행 단계</h2>
        <p className="text-[13px] text-slate-400">신청부터 SaaS 등록번호 발급까지</p>
      </div>
      {myStep && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#eef4ff] px-3 py-1.5 text-[13px] font-bold text-blue-600">
          <ClipboardCheck className="h-4 w-4" />
          내 과제는 지금 {myStep}단계 · {stepOf(myStep).label} 입니다.
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-stretch">
        {AX_STEPS.map((s, i) => {
          const Icon = ICONS[i];
          const on = myStep === s.n;
          const count = members(s.n).length;
          return (
            <Fragment key={s.n}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setOpenStep(s.n)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpenStep(s.n); }}
                className={`flex flex-1 cursor-pointer flex-col rounded-xl border p-4 transition hover:shadow-sm active:scale-[0.99] ${
                  on ? "border-blue-300 bg-[#f4f8ff] ring-1 ring-blue-200" : "border-[#eef1f6] bg-white hover:bg-[#fafbfd]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`h-[19px] w-[19px] shrink-0 ${on ? "text-blue-500" : "text-slate-400"}`} />
                  <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[11.5px] font-black ${
                    on ? "bg-blue-600 text-white" : "bg-[#eef1f6] text-slate-500"
                  }`}>
                    {s.n}
                  </span>
                  <span className="break-keep text-[14.5px] font-black text-slate-900">{s.label}</span>
                  <span
                    className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${
                      count > 0 ? "bg-[#eef4ff] text-blue-600" : "bg-[#f1f4f9] text-slate-300"
                    }`}
                  >
                    {count}
                  </span>
                </div>

                <p className="mt-2.5 break-keep text-[12.5px] leading-relaxed text-slate-500">{s.desc}</p>

                <div className="mt-2 flex items-center gap-1.5 text-[11.5px] font-bold text-slate-400">
                  <Users className="h-3 w-3" /> {s.actor}
                </div>

                {/* 2단계 하위 — 1차 보안검증 */}
                {s.key === "developing" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setSecurity(true); }}
                    className="mt-3 inline-flex w-fit items-center gap-1 rounded-md border border-[#dbe5f5] bg-white px-2 py-1 text-[11px] font-bold text-blue-600 transition hover:bg-[#eef4ff]"
                  >
                    <ShieldCheck className="h-3 w-3" /> 1차 보안검증 프롬프트
                  </button>
                )}
                {s.key === "issued" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setCert(true); }}
                    className="mt-3 inline-flex w-fit items-center gap-1 rounded-md border border-[#dbe5f5] bg-white px-2 py-1 text-[11px] font-bold text-blue-600 transition hover:bg-[#eef4ff]"
                  >
                    <Award className="h-3 w-3" /> SaaS 인증서
                  </button>
                )}

                {/* 다음 단계로 가는 관문 */}
                {s.gate && (
                  <div className="mt-auto pt-3">
                    <div className="rounded-lg bg-[#f7f9fc] px-2.5 py-1.5 text-[11px] font-bold leading-snug text-slate-500 break-keep">
                      ↓ {s.gate}
                    </div>
                  </div>
                )}
              </div>
              {i < AX_STEPS.length - 1 && (
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
                    <div className="flex shrink-0 items-center gap-1.5">
                      {m.saasNumber && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-black tabular-nums text-emerald-700">
                          {m.saasNumber}
                        </span>
                      )}
                      {m.mine && (
                        <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-black text-white">내 과제</span>
                      )}
                    </div>
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
          <p className="flex items-start gap-2 rounded-lg bg-[#f4f8ff] p-3 text-[12.5px] leading-relaxed text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            SaaS 등록번호가 발급되면 내 과제 인증서에 번호·작품명·소속·성명이 자동으로 채워집니다.
          </p>
        </DialogContent>
      </Dialog>

      <AxSecurityGuideDialog open={security} onOpenChange={setSecurity} />
    </section>
  );
}
