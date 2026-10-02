import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axGetSecurityGuide } from "@/lib/ax-lab.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SAAS_CATEGORY_LABEL } from "@/lib/ax-stages";
import { formatDate } from "@/lib/utils";
import { Award, Printer } from "lucide-react";
import teczenLogo from "@/assets/teczen-logo.png";

export type SaasCertInfo = {
  number: string;
  category: string;
  issuedAt: string;
  title: string;
  authorName: string;
  authorTeam: string;
  authorEmpNo: string;
};

/**
 * 테크젠 공식 SaaS 인증서.
 * 관리자가 등록한 인증서 이미지를 배경으로 쓰고, 그 아래에 발급 정보를 자동으로 채운다.
 * (이름·사번·소속은 사내 명단에서, 작품명은 신청한 작품에서 그대로 가져온다.)
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
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-blue-600" /> 테크젠 공식 SaaS 인증서
          </DialogTitle>
        </DialogHeader>

        {info && (
          <div id="saas-cert" className="overflow-hidden rounded-2xl border border-[#e3e8f0] bg-white">
            {guide?.saasCertImage ? (
              <img src={guide.saasCertImage} alt="테크젠 공식 SaaS 인증서" className="w-full object-contain" />
            ) : (
              <div className="bg-[linear-gradient(140deg,#f7fbff_0%,#eef4ff_100%)] px-8 pb-6 pt-10 text-center">
                <img src={teczenLogo} alt="TECZEN" className="mx-auto h-[26px] w-auto" />
                <div className="mt-5 text-[13px] font-black uppercase tracking-[0.3em] text-blue-600">
                  CERTIFICATE
                </div>
                <div className="mt-2 text-[26px] font-black tracking-tight text-[#12315c]">
                  테크젠 공식 SaaS 인증서
                </div>
                <p className="mt-3 break-keep text-[13px] leading-relaxed text-slate-500">
                  위 서비스는 AX협의체의 실효성 및 보안 검토를 통과하여
                  <br />테크젠 공식 SaaS로 등록되었음을 인증합니다.
                </p>
              </div>
            )}

            {/* 발급 정보 — 자동으로 채워진다 */}
            <div className="border-t border-[#eef1f6] px-7 py-6">
              <div className="text-center">
                <div className="text-[11.5px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  SaaS 등록번호
                </div>
                <div className="mt-1.5 text-[30px] font-black tabular-nums tracking-[0.06em] text-[#12315c]">
                  {info.number}
                </div>
                <div className="mt-1 text-[12px] font-semibold text-slate-400">
                  업무성격 · {SAAS_CATEGORY_LABEL[info.category] ?? info.category}
                </div>
              </div>

              <dl className="mt-6 divide-y divide-[#f1f4f9] border-t border-[#f1f4f9]">
                <Row label="서비스명" value={info.title} strong />
                <Row label="소속" value={info.authorTeam || "미지정"} />
                <Row label="성명" value={info.authorName} />
                <Row label="사번" value={info.authorEmpNo} />
                <Row label="발급일" value={formatDate(info.issuedAt)} />
              </dl>

              <div className="mt-6 text-center">
                <div className="text-[13px] font-black tracking-tight text-[#12315c]">TECZEN AX LAB</div>
                <div className="mt-0.5 text-[11px] font-semibold text-slate-400">AX협의체</div>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => window.print()}
          className="mx-auto inline-flex items-center gap-1.5 rounded-lg border border-[#dbe5f5] bg-white px-3.5 py-2 text-[13px] font-bold text-blue-600 transition hover:bg-[#eef4ff]"
        >
          <Printer className="h-4 w-4" /> 인쇄 · PDF 저장
        </button>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-4 py-2.5">
      <dt className="w-[74px] shrink-0 text-[12.5px] font-bold text-slate-400">{label}</dt>
      <dd className={`min-w-0 break-keep ${strong ? "text-[15px] font-black text-slate-900" : "text-[14px] font-semibold text-slate-700"}`}>
        {value}
      </dd>
    </div>
  );
}
