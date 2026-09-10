import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axGetOverview, axGetOrgBoard, axGetMyWorks } from "@/lib/ax-lab.functions";
import { AxPipelineStepper } from "@/components/AxPipelineStepper";
import { AxOrgBoard } from "@/components/AxOrgBoard";
import { AX_STAGES, AX_STATUS } from "@/lib/ax-stages";
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
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[12px] font-black uppercase tracking-[0.2em] text-blue-600">AX LAB</div>
          <h1 className="mt-2 text-[30px] font-black leading-tight tracking-tight text-slate-900 sm:text-[36px]">
            104개의 아이디어, 실제 업무의 변화로
          </h1>
          <p className="mt-2 text-[15px] text-slate-500">
            AX협의체와 함께 작품을 고도화하고, 실제 업무 적용과 전사 확산으로 연결합니다.
          </p>
        </div>
        <Link
          to="/ax-lab/request"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#0f2c52] px-5 py-3.5 text-[14px] font-bold text-white transition hover:bg-[#1a4276]"
        >
          내 작품 고도화 신청하기 <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Rocket} tone="slate" label="경진대회 작품" value={overview?.totalContestWorks ?? 0} />
        <StatCard icon={TrendingUp} tone="orange" label="고도화 대상 · 3단계" value={overview?.advancementTargetCount ?? 0} />
        <StatCard icon={Send} tone="blue" label="고도화 신청" value={overview?.requestedCount ?? 0} />
        <StatCard icon={CheckCircle2} tone="emerald" label="SaaS 승인" value={overview?.saasApprovedCount ?? 0} />
      </div>

      <AxPipelineStepper />

      {/* 내 신청 현황 */}
      {myWorkRows.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-[20px] font-black tracking-tight text-slate-900">내 신청 현황</h2>
          <div className="mt-3 space-y-2">
            {myWorkRows.map((w: any) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4">
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
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0f2c52] px-3.5 py-2 text-[13px] font-bold text-white hover:bg-[#1a4276]"
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

function StatCard({ icon: Icon, tone, label, value }: {
  icon: any; tone: "slate" | "orange" | "blue" | "emerald"; label: string; value: number;
}) {
  const tones = {
    slate: { box: "border-slate-200 bg-white", text: "text-slate-500" },
    orange: { box: "border-orange-200 bg-orange-50/70", text: "text-orange-600" },
    blue: { box: "border-blue-200 bg-blue-50/70", text: "text-blue-600" },
    emerald: { box: "border-emerald-200 bg-emerald-50/70", text: "text-emerald-600" },
  }[tone];
  return (
    <div className={`rounded-2xl border p-5 ${tones.box}`}>
      <div className={`flex items-center gap-2 text-[14px] font-bold ${tones.text}`}>
        <Icon className="h-[18px] w-[18px]" /> {label}
      </div>
      <div className="mt-2 text-[34px] font-black leading-none tabular-nums text-slate-900">{value}</div>
    </div>
  );
}
