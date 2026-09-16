import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axGetSecurityGuide, axAdminSetSecurityGuide } from "@/lib/ax-lab.functions";
import { AxSecurityGuideDialog } from "@/components/AxSecurityGuideDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ShieldCheck, Upload, Eye, Trash2 } from "lucide-react";

/** 관리자 — 1차 보안검증 안내(프롬프트 + 배너 2종) 편집. */
export function AxSecurityGuideAdmin() {
  const qc = useQueryClient();
  const getFn = useServerFn(axGetSecurityGuide);
  const setFn = useServerFn(axAdminSetSecurityGuide);

  const { data } = useQuery({ queryKey: ["ax", "securityGuide"], queryFn: () => getFn() });
  const [prompt, setPrompt] = useState("");
  const [checklistImage, setChecklistImage] = useState("");
  const [openCriteriaImage, setOpenCriteriaImage] = useState("");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!data) return;
    setPrompt(data.prompt);
    setChecklistImage(data.checklistImage);
    setOpenCriteriaImage(data.openCriteriaImage);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => setFn({ data: { prompt, checklistImage, openCriteriaImage } }),
    onSuccess: () => {
      toast.success("보안검증 안내를 저장했습니다.");
      qc.invalidateQueries({ queryKey: ["ax", "securityGuide"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function upload(file: File, set: (v: string) => void) {
    try {
      const path = `security/${crypto.randomUUID()}-${file.name}`;
      const res = await fetch(`/api/media?path=${encodeURIComponent(path)}`, { method: "POST", body: file });
      if (!res.ok) throw new Error("업로드 실패");
      set(`/media/${path}`);
      toast.success("이미지를 올렸습니다. [저장]을 눌러 반영하세요.");
    } catch {
      toast.error("이미지 업로드에 실패했습니다.");
    }
  }

  return (
    <section className="rounded-2xl border border-[#e9ecf2] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          <h2 className="text-[19px] font-black tracking-tight text-slate-900">1차 보안검증 안내 설정</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPreview(true)}>
            <Eye className="mr-1.5 h-4 w-4" /> 미리보기
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>저장</Button>
        </div>
      </div>
      <p className="mt-1 text-[13px] text-slate-400">
        구성원이 [1차 보안검증 안내] 버튼을 눌렀을 때 보이는 프롬프트와 우측 배너 이미지를 여기서 바꿉니다.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <div className="text-[12.5px] font-bold text-slate-500">보안 점검 프롬프트</div>
          <Textarea
            rows={16}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="mt-1.5 font-mono text-[12.5px] leading-relaxed"
            placeholder="개발 중인 과제에 넣어 실행할 보안 점검 프롬프트를 적어주세요."
          />
        </div>

        <div className="space-y-3">
          <BannerUpload
            label="주요 점검 항목"
            src={checklistImage}
            onPick={(f) => upload(f, setChecklistImage)}
            onClear={() => setChecklistImage("")}
          />
          <BannerUpload
            label="시스템 오픈 기준"
            src={openCriteriaImage}
            onPick={(f) => upload(f, setOpenCriteriaImage)}
            onClear={() => setOpenCriteriaImage("")}
          />
        </div>
      </div>

      <AxSecurityGuideDialog open={preview} onOpenChange={setPreview} />
    </section>
  );
}

function BannerUpload({ label, src, onPick, onClear }: {
  label: string; src: string; onPick: (f: File) => void; onClear: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#e3e8f0] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-bold text-slate-600">{label}</span>
        {src && (
          <button onClick={onClear} className="text-slate-300 hover:text-rose-500" aria-label={`${label} 이미지 비우기`}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mt-2 overflow-hidden rounded-lg border border-[#eef1f6] bg-[#fbfcfe]">
        {src ? (
          <img src={src} alt={label} className="h-28 w-full object-cover" />
        ) : (
          <div className="grid h-28 w-full place-items-center text-[12px] text-slate-300">등록된 이미지 없음</div>
        )}
      </div>
      <label className="mt-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#dbe5f5] py-2 text-[12.5px] font-bold text-blue-600 hover:bg-[#f4f8ff]">
        <Upload className="h-3.5 w-3.5" /> 이미지 올리기
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }}
        />
      </label>
    </div>
  );
}
