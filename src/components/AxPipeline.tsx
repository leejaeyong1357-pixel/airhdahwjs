import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axGetPipeline, axGetSecurityGuide } from "@/lib/ax-lab.functions";
import { AxSecurityGuideDialog } from "@/components/AxSecurityGuideDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AX_STEPS } from "@/lib/ax-stages";
import {
  Send, ShieldCheck, FileSearch, Award, ChevronRight, Info, User, Users,
  ClipboardList, MessageSquare, FileBadge, ArrowRight,
} from "lucide-react";

/** 신청 이후 진행 과정 (신청 위저드 사이드 패널용). */
export const AX_AFTER_SUBMIT_STEPS = [
  { title: "AX협의체 승인 검토", desc: "실효성을 검토해 승인 또는 반려합니다. 반려되면 사유를 알려드립니다.", icon: Users },
  { title: "고도화", desc: "1차 보안검증 프롬프트를 넣고 본인이 직접 고도화합니다.", icon: ShieldCheck },
  { title: "2차 승인 검토 요청", desc: "고도화가 끝나면 직접 검토를 요청합니다.", icon: FileSearch },
  { title: "AX협의체 2차 검토", desc: "실효성과 보안을 확인합니다. 반려되면 고도화 단계로 돌아갑니다.", icon: ShieldCheck },
  { title: "SaaS 등록번호 발급", desc: "테크젠 공식 번호와 인증서를 받습니다.", icon: Award },
];

/** 단계마다 쓰는 큰 아이콘과 아래 칸 아이콘 */
const STEP_ICON = [Send, ShieldCheck, FileSearch, Award];
const FOOT_ICON = [ClipboardList, ShieldCheck, MessageSquare, FileBadge];

const stepOf = (n: number) => AX_STEPS.find((s) => s.n === n)!;

/** 고도화 신청에서 SaaS 등록까지 — 4단계를 카드로 나눠 보여준다. */
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
    <section className="rounded-2xl border border-[#e9ecf2] bg-white p-6 sm:p-7">
      {/* 머리말 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-[26px] font-black tracking-tight text-[#12315c]">고도화 진행 단계</h2>
        <p className="text-[14.5px] text-slate-500">
          신청부터 공식 SaaS 등록까지, 4단계로 진행됩니다.
        </p>
        <span className="ml-auto shrink-0 rounded-xl border-[1.5px] border-blue-400 px-4 py-2 text-[14px] font-bold text-blue-600">
          AX 고도화 프로세스
        </span>
      </div>

      {myStep && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#eef4ff] px-3 py-1.5 text-[13px] font-bold text-blue-600">
          <Info className="h-4 w-4" />
          내 과제는 지금 {myStep}단계 · {stepOf(myStep).label} 입니다.
        </p>
      )}

      {/* 4단계 카드 */}
      <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-stretch">
        {AX_STEPS.map((s, i) => {
          const Icon = STEP_ICON[i];
          const FootIcon = FOOT_ICON[i];
          const on = myStep === s.n;
          const count = members(s.n).length;
          const isAction = !!s.action;

          return (
            <Fragment key={s.n}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setOpenStep(s.n)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpenStep(s.n); }}
                className={`flex flex-1 cursor-pointer flex-col rounded-2xl border p-6 transition hover:shadow-md active:scale-[0.99] ${
                  on ? "border-blue-200 bg-[#f2f7fe]" : "border-[#eef1f6] bg-white shadow-sm"
                }`}
              >
                {/* 번호 + 인원 */}
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-[#e8f0fd] px-3 py-1 text-[13.5px] font-black tabular-nums text-blue-600">
                    {String(s.n).padStart(2, "0")}
                  </span>
                  <span
                    className={`ml-auto rounded-full px-2.5 py-1 text-[12px] font-black tabular-nums ${
                      count > 0 ? "bg-[#eef4ff] text-blue-600" : "bg-[#f4f6fa] text-slate-300"
                    }`}
                  >
                    {count}건
                  </span>
                </div>

                <Icon
                  className={`mt-5 h-[30px] w-[30px] ${on ? "text-blue-600" : "text-[#12315c]"}`}
                  strokeWidth={1.7}
                />

                <h3 className="mt-4 break-keep text-[21px] font-black leading-tight tracking-tight text-[#0f1f38]">
                  {s.label}
                </h3>
                <p className="mt-2.5 whitespace-pre-line break-keep text-[14px] leading-relaxed text-slate-500">
                  {s.desc}
                </p>

                {/* 담당자 */}
                <div className="mt-5 flex items-center gap-2 border-t border-[#eef1f6] pt-4">
                  {s.actor === "신청자" ? (
                    <User className="h-[17px] w-[17px] shrink-0 text-slate-400" strokeWidth={1.8} />
                  ) : (
                    <Users className="h-[17px] w-[17px] shrink-0 text-slate-400" strokeWidth={1.8} />
                  )}
                  <span className="text-[13.5px] font-semibold text-slate-400">담당자</span>
                  <span className="rounded-full bg-[#f1f4f9] px-3 py-1 text-[13px] font-bold text-slate-600">
                    {s.actor}
                  </span>
                </div>

                {/* 아래 칸 — 버튼이거나 안내 문구 */}
                <div className="mt-auto pt-4">
                  {isAction ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (s.action === "security") setSecurity(true);
                        else setCert(true);
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-blue-400 bg-white px-3 py-3 text-[14px] font-bold text-blue-600 transition hover:bg-[#eef4ff]"
                    >
                      <FootIcon className="h-[17px] w-[17px]" strokeWidth={1.9} /> {s.foot}
                    </button>
                  ) : (
                    <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f4f6fa] px-3 py-3 text-[14px] font-bold text-slate-500">
                      <FootIcon className="h-[17px] w-[17px]" strokeWidth={1.9} /> {s.foot}
                    </div>
                  )}
                </div>
              </div>

              {i < AX_STEPS.length - 1 && (
                <ChevronRight className="hidden h-5 w-5 shrink-0 self-center text-slate-300 xl:block" />
              )}
            </Fragment>
          );
        })}
      </div>

      {/* 진행 안내 */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-[#f5f7fa] px-5 py-3.5">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-600">
          <Info className="h-3 w-3 text-white" strokeWidth={2.6} />
        </span>
        <span className="text-[14px] font-black text-[#12315c]">진행 안내</span>
        <span className="h-4 w-px bg-slate-300" />
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 break-keep text-[13.5px] text-slate-500">
          개발 완료 후 승인 검토 요청
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          승인 시 공식 등록
          <span className="text-slate-300">·</span>
          보완 필요 시 고도화 재진행
        </span>
      </div>

      {/* 단계별 참여 현황 */}
      <Dialog open={!!openStep} onOpenChange={(o) => !o && setOpenStep(null)}>
        <DialogContent className="max-h-[75vh] max-w-lg overflow-y-auto">
          {openStep && (
            <>
              <DialogHeader>
                <DialogTitle>{openStep}단계 · {stepOf(openStep).label}</DialogTitle>
              </DialogHeader>
              <p className="-mt-1 whitespace-pre-line text-[13px] text-slate-500">
                {stepOf(openStep).desc.replace(/\n/g, " ")}
              </p>
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
