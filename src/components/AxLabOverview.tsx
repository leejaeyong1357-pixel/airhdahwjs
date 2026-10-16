import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axGetOverview, axGetOrgBoard, axGetMyWorks } from "@/lib/ax-lab.functions";
import { AxSecurityGuideDialog } from "@/components/AxSecurityGuideDialog";
import { AxSaasCertificate, type SaasCertInfo } from "@/components/AxSaasCertificate";
import { AxProcessFlow } from "@/components/AxProcessFlow";
import { AxMyProgress } from "@/components/AxMyProgress";
import { AxOrgBoard } from "@/components/AxOrgBoard";
import { AxVideoSpotlight } from "@/components/AxVideoSpotlight";
import { AxWorksListDialog, AX_STAT_PICKS, type AxWorksPick } from "@/components/AxWorkDetailDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SiteImage } from "@/components/SiteImage";
import axlabHero from "@/assets/axlab-hero.png";
import { FileText, TrendingUp, Send, CheckCircle2, ArrowUpRight, Award, Info } from "lucide-react";

/** AX 플랫폼 대시보드 — 메인페이지(/)와 /ax-lab 이 함께 쓴다. */
export function AxLabOverview() {
  const overviewFn = useServerFn(axGetOverview);
  const boardFn = useServerFn(axGetOrgBoard);
  const myWorksFn = useServerFn(axGetMyWorks);

  const { data: overview } = useQuery({ queryKey: ["ax", "overview"], queryFn: () => overviewFn() });
  const { data: board = [] } = useQuery({ queryKey: ["ax", "board"], queryFn: () => boardFn() });
  const { data: myWorks } = useQuery({ queryKey: ["ax", "myWorks"], queryFn: () => myWorksFn() });

  const [pick, setPick] = useState<AxWorksPick | null>(null);
  const [security, setSecurity] = useState(false);
  const [cert, setCert] = useState(false);

  const myWorkRows = [
    ...(myWorks?.contestWork ? [myWorks.contestWork] : []),
    ...(myWorks?.newWorks ?? []),
  ];
  const me = {
    name: myWorks?.authorName ?? "",
    team: myWorks?.authorTeam ?? "",
    position: myWorks?.authorPosition ?? "",
    empNo: myWorks?.authorEmpNo ?? "",
  };
  // 흐름도의 [SaaS 인증 부여] 칸 — 내 인증서가 있으면 그걸 연다 (예시 이미지는 보여주지 않는다)
  const certWork = myWorkRows.find((w: any) => w.request?.saas?.number);
  const myCert: SaasCertInfo | null = certWork
    ? {
        number: certWork.request.saas.number, category: certWork.request.saas.category,
        issuedAt: certWork.request.saas.issuedAt, title: certWork.title,
        authorName: me.name, authorTeam: me.team, authorPosition: me.position, authorEmpNo: me.empNo,
      }
    : null;

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

      {/* 통계 — 숫자를 누르면 목록 */}
      <section className="rounded-2xl border border-[#e9ecf2] bg-white px-2 py-3">
        <div className="grid grid-cols-2 gap-y-2 lg:grid-cols-4">
          <Stat icon={FileText} tone="blue" label="AX 작품" value={overview?.totalWorks ?? 0} onClick={() => setPick(AX_STAT_PICKS.total)} />
          <Stat icon={TrendingUp} tone="rose" label="고도화 대상" value={overview?.advancementTargetCount ?? 0} divider onClick={() => setPick(AX_STAT_PICKS.target)} />
          <Stat icon={Send} tone="blue" label="고도화 신청" value={overview?.requestedCount ?? 0} divider onClick={() => setPick(AX_STAT_PICKS.requested)} />
          <Stat icon={CheckCircle2} tone="emerald" label="SaaS 승인" value={overview?.saasApprovedCount ?? 0} divider onClick={() => setPick(AX_STAT_PICKS.approved)} />
        </div>
      </section>

      {/* 현황 표 + 영상 */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <AxOrgBoard board={board} />

        <AxVideoSpotlight />
      </div>

      {/* 절차 + 내 신청 현황 */}
      <AxProcessFlow onSecurity={() => setSecurity(true)} onCert={() => setCert(true)} />
      <AxMyProgress works={myWorkRows} me={me} />

      <AxWorksListDialog pick={pick} onClose={() => setPick(null)} />
      <AxSecurityGuideDialog open={security} onOpenChange={setSecurity} />
      {myCert ? (
        <AxSaasCertificate info={myCert} open={cert} onOpenChange={setCert} />
      ) : (
        <Dialog open={cert} onOpenChange={setCert}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-600" /> 테크젠 공식 SaaS 인증서
              </DialogTitle>
            </DialogHeader>
            <p className="flex items-start gap-2 rounded-lg bg-[#f4f8ff] p-4 text-[13.5px] leading-relaxed text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              SaaS 승인 협의를 통과해 인증번호를 받으면, 번호 · 작품명 · 소속 · 성명이
              자동으로 채워진 인증서가 여기에 나옵니다.
            </p>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Stat({ icon: Icon, tone, label, value, divider, onClick }: {
  icon: any; tone: "blue" | "rose" | "emerald"; label: string; value: number; divider?: boolean; onClick?: () => void;
}) {
  const tones = {
    blue: "bg-[#eef4ff] text-blue-600",
    rose: "bg-[#fdeef0] text-rose-500",
    emerald: "bg-[#e9f8f0] text-emerald-500",
  }[tone];
  return (
    <div className={`px-2 ${divider ? "lg:border-l lg:border-[#eef1f6]" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        title={`${label} 목록 보기`}
        className="flex w-full items-center gap-3.5 rounded-xl px-4 py-2 text-left transition hover:bg-[#f5f8fc]"
      >
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
      </button>
    </div>
  );
}
