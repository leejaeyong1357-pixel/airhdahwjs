import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { SiteImage } from "@/components/SiteImage";
import prizeClaude from "@/assets/prize-claude.jpg";
import prizeKeyboard from "@/assets/prize-keyboard.jpg";
import prizeMouse from "@/assets/prize-mouse.jpg";

const STORAGE_KEY = "teczen-popup-hide-until";

const prizes = [
  { rank: "1등 대상", name: "Claude AI 1년 구독권", slot: "prize-1", image: prizeClaude, tint: "from-amber-100 to-orange-50" },
  { rank: "2등 최우수상", name: "기계식 키보드 (개발자용)", slot: "prize-2", image: prizeKeyboard, tint: "from-zinc-100 to-slate-50" },
  { rank: "3등 우수상", name: "게이밍 마우스 (개발자용)", slot: "prize-3", image: prizeMouse, tint: "from-blue-100 to-indigo-50" },
];

const LEFT_CHIPS = ["AI Agent", "LangGraph", "Claude Code", "Kubernetes", "LLMOps"];
const RIGHT_CHIPS = ["Dify", "LangSmith", "바이브코딩", "RAG / 자동화", "MVP 개발"];

export function openPrizePopup() {
  window.dispatchEvent(new CustomEvent("teczen:open-prize-popup"));
}

export function PrizePopup() {
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    const hideUntil = localStorage.getItem(STORAGE_KEY);
    const shouldAutoShow = !(hideUntil && Date.now() < Number(hideUntil));
    if (shouldAutoShow) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    function onOpen() { setOpen(true); }
    window.addEventListener("teczen:open-prize-popup", onOpen);
    return () => window.removeEventListener("teczen:open-prize-popup", onOpen);
  }, []);

  function close() {
    if (dontShow) {
      const next = new Date();
      next.setHours(24, 0, 0, 0);
      localStorage.setItem(STORAGE_KEY, String(next.getTime()));
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-300">
        <button
          onClick={close}
          className="absolute right-4 top-4 z-20 rounded-full bg-black/10 p-2 text-slate-800 hover:bg-black/20"
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>

        <div
          className="relative overflow-hidden px-6 pb-8 pt-10 md:px-10"
          style={{
            backgroundImage:
              "linear-gradient(120deg, #eaf3ff 0%, #dfeaf7 55%, #eef2fb 100%)",
          }}
        >
          <div className="pointer-events-none absolute inset-y-0 left-3 hidden flex-col justify-center gap-2.5 md:flex">
            {LEFT_CHIPS.map((t, i) => (
              <div
                key={t}
                className="rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm"
                style={{ transform: `translateX(${(i % 2) * 10}px)` }}
              >
                {t}
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-3 hidden flex-col justify-center gap-2.5 md:flex">
            {RIGHT_CHIPS.map((t, i) => (
              <div
                key={t}
                className="rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm"
                style={{ transform: `translateX(-${(i % 2) * 10}px)` }}
              >
                {t}
              </div>
            ))}
          </div>

          <div className="relative z-10 text-center">
            <h2 className="text-2xl md:text-3xl font-black leading-tight tracking-tight text-slate-900">
              지금 당장 참여하세요!
            </h2>
            <p className="mt-3 text-base md:text-lg font-bold text-[#ff6b35]">
              푸짐한 상품이 기다립니다!
            </p>
          </div>
        </div>

        <div className="space-y-3 p-6">
          {prizes.map((p) => (
            <div key={p.rank} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3">
              <div className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br ${p.tint}`}>
                <SiteImage slot={p.slot} fallback={p.image} alt={p.name} className="h-full w-full object-contain p-1" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-widest text-primary">{p.rank}</div>
                <div className="text-sm font-semibold text-slate-900">{p.name}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(!!v)} />
            오늘 하루 창 열지 않기
          </label>
          <button onClick={close} className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
