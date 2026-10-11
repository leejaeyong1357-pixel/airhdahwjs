import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axGetSecurityGuide } from "@/lib/ax-lab.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Award, Printer } from "lucide-react";
import teczenLogo from "@/assets/teczen-logo.png";

export type SaasCertInfo = {
  number: string;
  category: string;
  issuedAt: string;
  title: string;
  authorName: string;
  authorTeam: string;
  authorPosition: string;
  authorEmpNo?: string;
};

/**
 * 테크젠 공식 SaaS 인증서.
 * 번호·작품명·성명·부서·직급은 발급 기록과 사내 명단에서 그대로 채워진다.
 * 관리자가 인증서 이미지를 따로 올려두면 그 이미지를 위에 함께 보여준다.
 */
export function AxSaasCertificate({ info, open, onOpenChange }: {
  info: SaasCertInfo | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const guideFn = useServerFn(axGetSecurityGuide);
  const { data: guide } = useQuery({
    queryKey: ["ax", "securityGuide"],
    queryFn: () => guideFn(),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2 text-[16px]">
            <Award className="h-5 w-5 text-blue-600" /> 테크젠 공식 SaaS 인증서
          </DialogTitle>
        </DialogHeader>

        {info && <CertificateSheet info={info} />}

        {guide?.saasCertImage && (
          <div className="px-6">
            <div className="mb-2 text-[12.5px] font-bold text-slate-400">첨부 인증서</div>
            <img
              src={guide.saasCertImage}
              alt="테크젠 공식 SaaS 인증서"
              className="w-full rounded-xl border border-[#eef1f6] object-contain"
            />
          </div>
        )}

        <div className="px-6 pb-6">
          <button
            onClick={() => window.print()}
            className="mx-auto flex items-center gap-1.5 rounded-lg border border-[#dbe5f5] bg-white px-3.5 py-2 text-[13px] font-bold text-blue-600 transition hover:bg-[#eef4ff]"
          >
            <Printer className="h-4 w-4" /> 인쇄 · PDF 저장
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 인증서 본문 — 인쇄했을 때 이 영역만 나오도록 print:* 클래스를 둔다. */
export function CertificateSheet({ info }: { info: SaasCertInfo }) {
  return (
    <div className="px-6">
      <div className="relative overflow-hidden bg-white px-10 py-11 ring-1 ring-[#e6eaf0]">
        {/* 좌우 2중 세로선 */}
        <Edge side="left" />
        <Edge side="right" />

        <div className="relative text-center">
          <img src={teczenLogo} alt="TECZEN" className="mx-auto h-[30px] w-auto" />

          <h2 className="mt-9 font-serif text-[30px] font-bold leading-none tracking-[-0.01em] text-[#13213a]">
            공식 SaaS 인증서
          </h2>
          <div className="mt-3 font-serif text-[12px] uppercase tracking-[0.38em] text-[#6b7a90]">
            TECZEN SaaS Certificate
          </div>

          <div className="mx-auto mt-7 h-px w-full max-w-[420px] bg-[#1f3b66]/25" />

          <div className="mt-6 flex items-center justify-center gap-4 text-[15px]">
            <span className="font-bold tracking-[0.06em] text-[#13213a]">인증번호</span>
            <span className="font-serif font-bold tabular-nums tracking-[0.04em] text-[#13213a]">
              {info.number}
            </span>
          </div>

          {/* 항목 표 */}
          <div className="mx-auto mt-6 w-full max-w-[430px] bg-[#f3f4f6] px-8 py-2 text-left">
            <Row label="작품명" value={info.title} />
            <Row label="성명" value={info.authorName} />
            <Row label="부서" value={info.authorTeam || "미지정"} />
            <Row label="직급" value={info.authorPosition || "-"} last />
          </div>

          <p className="mt-8 break-keep text-[14.5px] leading-[1.95] text-[#2a3447]">
            위 작품은 테크젠 AX 협의체의 검토와 보안 검증 및
            <br />현장 업무 적용 확인을 거쳐 공식 SaaS로 인증되었으며,
            <br />이에 고유 일련번호를 부여합니다.
          </p>

          <div className="mx-auto mt-8 h-px w-full max-w-[420px] bg-[#1f3b66]/25" />

          <div className="mt-5 flex items-center justify-center gap-4 text-[13.5px]">
            <span className="font-bold tracking-[0.06em] text-[#13213a]">인증 범위</span>
            <span className="text-[#2a3447]">사내 업무 활용 및 전사 확산</span>
          </div>

          <div className="mt-9">
            <div className="text-[19px] font-black tracking-[-0.01em] text-[#13213a]">
              테크젠 AX 협의체
            </div>
            <div className="mt-1.5 font-serif text-[11.5px] uppercase tracking-[0.3em] text-[#6b7a90]">
              TECZEN AX Council
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Edge({ side }: { side: "left" | "right" }) {
  const pos = side === "left" ? "left-0" : "right-0";
  const inner = side === "left" ? "left-[7px]" : "right-[7px]";
  return (
    <>
      <span className={`pointer-events-none absolute ${pos} top-0 h-full w-[3px] bg-[#1f3b66]`} />
      <span className={`pointer-events-none absolute ${inner} top-0 h-full w-px bg-[#1f3b66]/55`} />
    </>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-baseline gap-7 py-3.5 ${last ? "" : "border-b border-[#d8dbe0]"}`}>
      <dt className="w-[56px] shrink-0 text-[14px] font-bold text-[#13213a]">{label}</dt>
      <dd className="min-w-0 break-keep font-serif text-[16px] font-semibold text-[#13213a]">
        {value}
      </dd>
    </div>
  );
}
