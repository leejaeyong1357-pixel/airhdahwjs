import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { axGetOverview, axGetOrgBoard, axGetMyWorks, axRequestSecondReview } from "@/lib/ax-lab.functions";
import { AxSecurityGuideDialog } from "@/components/AxSecurityGuideDialog";
import { AxSaasCertificate } from "@/components/AxSaasCertificate";
import { AxPipeline } from "@/components/AxPipeline";
import { AxOrgBoard } from "@/components/AxOrgBoard";
import { AxVideoSpotlight } from "@/components/AxVideoSpotlight";
import { SiteImage } from "@/components/SiteImage";
import { AX_STAGES, AX_STATUS } from "@/lib/ax-stages";
import axlabHero from "@/assets/axlab-hero.png";
import {
  FileText, TrendingUp, Send, CheckCircle2, ArrowRight, ArrowUpRight,
  ShieldCheck, Award, AlertCircle,
} from "lucide-react";

/** AX 플랫폼 대시보드 — 메인페이지(/)와 /ax-lab 이 함께 쓴다. */
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
    <div className="mx-auto max-w-[1180px] space-y-5">
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
          <p className="text-[15px] font-semibold leading-relaxed text-slate-500">
            AI로
            <br />더 스마트한
            <br />오늘, 더 큰 내일
          </p>
          <div className="ml-auto mt-2.5 h-px w-14 bg-slate-300" />
          <div className="mt-2 text-[11px] font-bold uppercase leading-relaxed tracking-[0.2em] text-slate-400">
            TECZEN
            <br />AX LAB
          </div>
        </div>
      </section>

      {/* 통계 */}
      <section className="rounded-2xl border border-[#e9ecf2] bg-white px-2 py-5">
        <div className="grid grid-cols-2 gap-y-6 lg:grid-cols-4">
          <Stat icon={FileText} tone="blue" label="경진대회 작품" value={overview?.totalContestWorks ?? 0} />
          <Stat icon={TrendingUp} tone="rose" label="고도화 대상" value={overview?.advancementTargetCount ?? 0} divider />
          <Stat icon={Send} tone="blue" label="고도화 신청" value={overview?.requestedCount ?? 0} divider />
          <Stat icon={CheckCircle2} tone="emerald" label="SaaS 승인" value={overview?.saasApprovedCount ?? 0} divider />
        </div>
      </section>

      {/* 현황 표 + 핵심 단계 */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <AxOrgBoard board={board} />

        <AxVideoSpotlight />
      </div>

      {/* 내 신청 현황 */}
      {myWorkRows.length > 0 && (
        <section className="rounded-2xl border border-[#e9ecf2] bg-white p-5 sm:p-6">
          <h2 className="text-[19px] font-black tracking-tight text-slate-900">내 신청 현황</h2>
          <div className="mt-3 space-y-2">
            {myWorkRows.map((w: any) => (
              <MyWorkRow
                key={w.id}
                work={w}
                me={{
                  name: myWorks?.authorName ?? "",
                  team: myWorks?.authorTeam ?? "",
                  empNo: myWorks?.authorEmpNo ?? "",
                }}
              />
            ))}
          </div>
        </section>
      )}

      <AxPipeline />
    </div>
  );
}

/**
 * 내 작품 한 줄 — 단계에 따라 할 수 있는 일이 다르다.
 *   반려 → 사유를 보여주고 다시 신청
 *   고도화 진행 → 1차 보안검증 안내 + 2차 승인 검토 요청
 *   발급 완료 → SaaS 번호와 인증서
 */
function MyWorkRow({ work: w, me }: { work: any; me: { name: string; team: string; empNo: string } }) {
  const qc = useQueryClient();
  const reviewFn = useServerFn(axRequestSecondReview);
  const [security, setSecurity] = useState(false);
  const [cert, setCert] = useState(false);

  const reviewMut = useMutation({
    mutationFn: () => reviewFn({ data: { requestId: w.request.id } }),
    onSuccess: () => {
      toast.success("2차 승인 검토를 요청했습니다. AX협의체가 검토합니다.");
      qc.invalidateQueries({ queryKey: ["ax"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const r = w.request;
  const status = r?.status as string | undefined;

  return (
    <div className="rounded-xl border border-[#eef1f6] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#f1f4f9] px-2 py-0.5 text-[11px] font-bold text-slate-500">{w.badge}</span>
            {w.stage && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${AX_STAGES[w.stage as 1].soft}`}>
                {AX_STAGES[w.stage as 1].label}
              </span>
            )}
            {r?.saas?.number && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-black tabular-nums text-emerald-700">
                {r.saas.number}
              </span>
            )}
          </div>
          <div className="mt-1 text-[15px] font-black text-slate-900">{w.title}</div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {status && (
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold ${AX_STATUS[status]?.tone ?? ""}`}>
              <CheckCircle2 className="h-4 w-4" /> {AX_STATUS[status]?.label ?? status}
            </span>
          )}

          {/* 2단계 고도화 — 보안검증 안내 + 검토 요청 */}
          {status === "developing" && (
            <>
              <button
                onClick={() => setSecurity(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#dbe5f5] px-3 py-2 text-[13px] font-bold text-blue-600 transition hover:bg-[#eef4ff]"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> 1차 보안검증
              </button>
              <button
                disabled={reviewMut.isPending}
                onClick={() => reviewMut.mutate()}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                2차 승인 검토 요청 <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {/* 발급 완료 */}
          {status === "issued" && r?.saas?.number && (
            <button
              onClick={() => setCert(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#dbe5f5] px-3 py-2 text-[13px] font-bold text-blue-600 transition hover:bg-[#eef4ff]"
            >
              <Award className="h-3.5 w-3.5" /> 인증서 보기
            </button>
          )}

          {/* 아직 신청 전이거나 반려됨 */}
          {(!r || status === "rejected") && (
            <Link
              to="/ax-lab/request"
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-blue-700"
            >
              {status === "rejected" ? "보완해서 다시 신청" : "고도화 신청하기"} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* 반려 사유 — 신청자에게만 보인다 */}
      {r?.rejectReason && (
        <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3.5">
          <div className="flex items-center gap-1.5 text-[12.5px] font-black text-destructive">
            <AlertCircle className="h-4 w-4" />
            {r.rejectedFrom === "review" ? "2차 승인 검토 반려" : "고도화 신청 반려"}
          </div>
          <p className="mt-1.5 whitespace-pre-wrap break-keep text-[13px] leading-relaxed text-slate-700">
            {r.rejectReason}
          </p>
          {r.rejectedFrom === "review" && (
            <p className="mt-2 text-[12px] font-semibold text-slate-500">
              보완 후 다시 [2차 승인 검토 요청]을 눌러주세요.
            </p>
          )}
        </div>
      )}

      <AxSecurityGuideDialog open={security} onOpenChange={setSecurity} />
      <AxSaasCertificate
        open={cert}
        onOpenChange={setCert}
        info={
          r?.saas?.number
            ? {
                number: r.saas.number, category: r.saas.category, issuedAt: r.saas.issuedAt,
                title: w.title, authorName: me.name, authorTeam: me.team, authorEmpNo: me.empNo,
              }
            : null
        }
      />
    </div>
  );
}

function Stat({ icon: Icon, tone, label, value, divider }: {
  icon: any; tone: "blue" | "rose" | "emerald"; label: string; value: number; divider?: boolean;
}) {
  const tones = {
    blue: "bg-[#eef4ff] text-blue-600",
    rose: "bg-[#fdeef0] text-rose-500",
    emerald: "bg-[#e9f8f0] text-emerald-500",
  }[tone];
  return (
    <div className={`flex items-center gap-3.5 px-6 ${divider ? "lg:border-l lg:border-[#eef1f6]" : ""}`}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones}`}>
        <Icon className="h-[20px] w-[20px]" />
      </span>
      <div>
        <div className="text-[13.5px] font-bold text-slate-500">{label}</div>
        <div className="mt-0.5 flex items-baseline gap-1">
          <span className="text-[30px] font-black leading-none tabular-nums text-slate-900">{value}</span>
          <span className="text-[13px] font-semibold text-slate-400">건</span>
        </div>
      </div>
    </div>
  );
}
