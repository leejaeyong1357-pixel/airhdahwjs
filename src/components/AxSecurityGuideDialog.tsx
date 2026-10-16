import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axGetSecurityGuide } from "@/lib/ax-lab.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Check, ShieldCheck, ListChecks, DoorOpen, Lightbulb } from "lucide-react";

/** 1차 보안검증(본인) 안내 — 프롬프트 복사 + 우측 배너 2종. */
export function AxSecurityGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const fn = useServerFn(axGetSecurityGuide);
  const { data } = useQuery({ queryKey: ["ax", "securityGuide"], queryFn: () => fn(), enabled: open });
  const [copied, setCopied] = useState(false);
  const [banner, setBanner] = useState<{ title: string; src: string } | null>(null);

  async function copyPrompt() {
    const text = data?.prompt ?? "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 클립보드 권한이 없는 환경 — 임시 textarea 로 복사
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    toast.success("프롬프트를 복사했습니다.");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" /> 1차 보안검증 (본인)
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              <div className="flex items-start gap-2 rounded-xl bg-[#f4f8ff] px-4 py-3">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <p className="break-keep text-[13.5px] leading-relaxed text-slate-700">
                  아래 프롬프트를 복사해서 <b className="text-slate-900">개발 중인 과제에 그대로 넣어</b> 실행해 보세요.
                  스스로 1차 보안 점검을 마친 뒤, 2차 보안검증은 AX협의체가 진행합니다.
                </p>
              </div>

              <div className="mt-3 rounded-xl border border-[#e3e8f0] bg-[#fbfcfe]">
                <pre className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap break-keep px-4 py-3.5 text-[13px] leading-relaxed text-slate-700">
                  {data?.prompt ?? "불러오는 중…"}
                </pre>
                <div className="border-t border-[#eef1f6] p-2.5">
                  <button
                    onClick={copyPrompt}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-blue-700"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "복사 완료" : "프롬프트 복사"}
                  </button>
                </div>
              </div>
            </div>

            {/* 우측 배너 */}
            <div className="space-y-3">
              <BannerCard
                icon={ListChecks}
                title="주요 점검 항목"
                desc="무엇을 봐야 하는지 한눈에"
                src={data?.checklistImage ?? ""}
                onClick={() => data?.checklistImage && setBanner({ title: "주요 점검 항목", src: data.checklistImage })}
              />
              <BannerCard
                icon={DoorOpen}
                title="시스템 오픈 기준"
                desc="열기 전에 충족해야 할 기준"
                src={data?.openCriteriaImage ?? ""}
                onClick={() => data?.openCriteriaImage && setBanner({ title: "시스템 오픈 기준", src: data.openCriteriaImage })}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 배너 원본 보기 */}
      <Dialog open={!!banner} onOpenChange={(o) => !o && setBanner(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-0">
          {banner && (
            <>
              <DialogHeader className="px-6 pt-6">
                <DialogTitle>{banner.title}</DialogTitle>
              </DialogHeader>
              <img src={banner.src} alt={banner.title} className="w-full object-contain p-4" />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BannerCard({ icon: Icon, title, desc, src, onClick }: {
  icon: any; title: string; desc: string; src: string; onClick: () => void;
}) {
  const ready = !!src;
  return (
    <button
      onClick={onClick}
      disabled={!ready}
      className={`w-full overflow-hidden rounded-xl border text-left transition ${
        ready ? "border-[#dbe5f5] bg-white hover:border-blue-300 hover:shadow-sm" : "border-dashed border-[#e3e8f0] bg-[#fbfcfe]"
      }`}
    >
      <div className="flex items-center gap-2.5 px-4 py-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${ready ? "bg-[#eef4ff] text-blue-600" : "bg-[#f1f4f9] text-slate-300"}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <div className={`text-[13.5px] font-black ${ready ? "text-slate-900" : "text-slate-400"}`}>{title}</div>
          <div className="truncate text-[11.5px] text-slate-400">{ready ? desc : "관리자 등록 전"}</div>
        </div>
      </div>
      {ready && (
        <div className="border-t border-[#eef1f6] bg-[#fbfcfe]">
          <img src={src} alt={title} className="h-28 w-full object-cover" />
        </div>
      )}
    </button>
  );
}
