import { useEffect, useState } from "react";
import { X, Calendar, Users, Trophy, FileText } from "lucide-react";

export function openContestGuide() {
  window.dispatchEvent(new CustomEvent("teczen:open-contest-guide"));
}

export function ContestGuideModal() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onOpen() { setOpen(true); }
    window.addEventListener("teczen:open-contest-guide", onOpen);
    return () => window.removeEventListener("teczen:open-contest-guide", onOpen);
  }, []);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-300">
        <button
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 z-20 rounded-full bg-black/10 p-2 text-slate-800 hover:bg-black/20"
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-8 pt-10 pb-6 bg-gradient-to-br from-[#eaf3ff] to-[#f5f8fd]">
          <div className="text-[11px] font-black tracking-[0.25em] text-primary/60">CONTEST GUIDE</div>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
            제 1회 테크젠 사내 AI 경진대회
          </h2>
          <p className="mt-2 text-sm text-slate-600">대회 안내 · 일정 및 참여 방법</p>
        </div>

        <div className="space-y-5 p-8">
          <Row icon={Calendar} title="일정">
            <div>접수일자 : <b className="text-slate-900">2026. 7. 8 (수) ~ 2026. 7. 15 (수)</b></div>
            <div>결과 발표일 : <b className="text-slate-900">2026. 7. 20 (월)</b></div>
          </Row>
          <Row icon={Users} title="대상">
            <div><b className="text-slate-900">전 관리직</b> (개인 참여)</div>
          </Row>
          <Row icon={Trophy} title="시상">
            <div>대상 · 최우수상 · 우수상</div>
            <div>2차 바이브코딩 교육 수강 자격 부여 <b className="text-slate-900">(Top 30명)</b></div>
            <div>우수작 선정 후 <b className="text-slate-900">발표 기회 부여</b></div>
          </Row>
          <Row icon={FileText} title="제출 방법">
            <div>상단 <b>[작품 제출]</b> 메뉴에서 제목 · 설명 · 파일 · 썸네일을 업로드해 주세요.</div>
            <div><b className="text-slate-900">1인당 1작품</b>만 제출할 수 있습니다.</div>
          </Row>
        </div>

        <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-8 py-4">
          <button
            onClick={() => setOpen(false)}
            className="rounded-full bg-primary px-6 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-black tracking-widest text-primary">{title}</div>
        <div className="mt-1.5 space-y-1 text-sm text-slate-700 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
