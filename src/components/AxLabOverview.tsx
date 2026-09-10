import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axGetOverview, axGetOrgBoard, axGetMyWorks } from "@/lib/ax-lab.functions";
import { AxPipelineStepper } from "@/components/AxPipelineStepper";
import { AxOrgBoard } from "@/components/AxOrgBoard";
import { SiteImage } from "@/components/SiteImage";
import { AX_STAGES, AX_STATUS } from "@/lib/ax-stages";
import axlabHero from "@/assets/axlab-hero.png";
import { Rocket, TrendingUp, Send, CheckCircle2, ArrowUpRight, ArrowRight } from "lucide-react";

/** AX LAB 메인 화면 — 메인페이지(/)와 /ax-lab 이 함께 쓴다. */
export function AxLabOverview() {
  const overviewFn = useServerFn(axGetOverview);
  const boardFn = useServerFn(axGetOrgBoard);
  const myWorksFn = useServerFn(axGetMyWorks);

  const { data: overview } = useQuery({ queryKey: ["ax", "overview"], queryFn: () => overviewFn() });
  const { data: board = [] } = useQuery({ queryKey: ["ax", "board"], queryFn: () => boardFn() });
  const { data: myWorks } = useQuery({ queryKey: ["ax", "myWorks"], queryFn: () => myWorksFn() });

  const myWorkRows = [
    ...(myWorks?.contestWork ? [{ ...myWorks.contestWork, badge: "경진대회 출품작" }] : []),
    ...(myWorks?.newWorks ?? []).map((w: any) => ({ ...w, badge: "신규 등록" })),
  ];

  return (
    <div className="space-y-5">
      {/* 히어로 */}
      <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(115deg,#ffffff_0%,#f6fafe_46%,#eff6fd_100%)] px-6 py-8 sm:px-10 sm:py-10 xl:pr-32">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="relative z-10">
            <div className="text-[13px] font-black uppercase tracking-[0.25em] text-blue-600">AX LAB</div>
            <h1 className="mt-3 text-[38px] font-black leading-[1.15] tracking-tight text-[#12315c] sm:text-[46px]">
              104개의 아이디어,
              <br />
              실제 <span className="text-blue-600">업무의 변화로</span>
            </h1>
            <p className="mt-4 text-[16px] leading-relaxed text-slate-600">
              AX협의체와 함께 아이디어를 고도화하고
              <br />
              실제 업무 적용과 전사 확산으로 연결합니다.
            </p>
            <Link
              to="/ax-lab/request"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-[15px] font-bold text-white transition hover:bg-blue-700"
            >
              내 작품 고도화 신청하기 <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div>
            <SiteImage
              slot="axlab-hero"
              fallback={axlabHero}
              alt="AX LAB"
              className="ml-auto h-auto w-full max-w-[560px] object-contain"
            />
          </div>
        </div>

        {/* 우측 상단 문구 */}
        <div className="pointer-events-none absolute right-6 top-8 hidden text-right xl:block">
          <p className="text-[16px] italic leading-relaxed text-slate-500" style={{ fontFamily: "cursive, ui-serif" }}>
            AI로
            <br />더 스마트한
            <br />오늘, 더 큰 내일
          </p>
          <div className="ml-auto mt-2.5 h-px w-14 bg-slate-300" />
          <div className="mt-2 text-[11px] font-bold uppercase leading-relaxed tracking-[0.2em] text-slate-400">
            TECHZEN
            <br />AX LAB
          </div>
        </div>
      </section>

      {/* 통계 — 한 줄 카드 */}
      <section className="rounded-2xl border border-slate-200 bg-white px-2 py-5 sm:px-4">
        <div className="grid grid-cols-2 gap-y-6 lg:grid-cols-4">
          <Stat icon={Rocket} tone="blue" label="경진대회 작품" value={overview?.totalContestWorks ?? 0} />
          <Stat icon={TrendingUp} tone="orange" label="고도화 대상 · 3단계" value={overview?.advancementTargetCount ?? 0} divider />
          <Stat icon={Send} tone="blue" label="고도화 신청" value={overview?.requestedCount ?? 0} divider />
          <Stat icon={CheckCircle2} tone="emerald" label="SaaS 승인" value={overview?.saasApprovedCount ?? 0} divider />
        </div>
      </section>

      <AxPipelineStepper />

      {/* 내 신청 현황 */}
      {myWorkRows.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-[19px] font-black tracking-tight text-slate-900">내 신청 현황</h2>
          <div className="mt-3 space-y-2">
            {myWorkRows.map((w: any) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{w.badge}</span>
                    {w.stage && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${AX_STAGES[w.stage as 1].soft}`}>
                        {AX_STAGES[w.stage as 1].label}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[15px] font-black text-slate-900">{w.title}</div>
                </div>
                {w.request ? (
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold ${AX_STATUS[w.request.status].tone}`}>
                    <CheckCircle2 className="h-4 w-4" /> {AX_STATUS[w.request.status].label}
                  </span>
                ) : (
                  <Link
                    to="/ax-lab/request"
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-blue-700"
                  >
                    고도화 신청하기 <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <AxOrgBoard board={board} />
    </div>
  );
}

function Stat({ icon: Icon, tone, label, value, divider }: {
  icon: any; tone: "blue" | "orange" | "emerald"; label: string; value: number; divider?: boolean;
}) {
  const tones = {
    blue: { circle: "bg-blue-50 text-blue-600", label: "text-slate-500" },
    orange: { circle: "bg-orange-50 text-orange-500", label: "text-orange-500" },
    emerald: { circle: "bg-emerald-50 text-emerald-500", label: "text-slate-500" },
  }[tone];
  return (
    <div className={`flex items-center gap-4 px-5 ${divider ? "lg:border-l lg:border-slate-200" : ""}`}>
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${tones.circle}`}>
        <Icon className="h-[22px] w-[22px]" />
      </span>
      <div>
        <div className={`text-[14px] font-bold ${tones.label}`}>{label}</div>
        <div className="mt-0.5 text-[32px] font-black leading-none tabular-nums text-slate-900">{value}</div>
      </div>
    </div>
  );
}
