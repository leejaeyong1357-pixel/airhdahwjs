import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Minimize2, Maximize2, X, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const YOUTUBE_ID = "q0OJCyW9w1Q";
const STORAGE_KEY = "teczen-floating-video-hidden";
const HIDDEN_ROUTES = ["/auth", "/change-password"];

export function FloatingVideo() {
  const [minimized, setMinimized] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const stored = typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setHidden(true);
    const t = setTimeout(() => setMounted(true), 1200);
    return () => clearTimeout(t);
  }, []);

  function close() {
    setHidden(true);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
  }
  function reopen() {
    setHidden(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  if (!mounted) return null;
  if (HIDDEN_ROUTES.some((p) => pathname.startsWith(p))) return null;

  if (hidden) {
    return (
      <button
        onClick={reopen}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-[0_10px_30px_-5px_rgba(0,44,95,0.5)] hover:bg-primary/90 transition"
        aria-label="영상 다시 열기"
      >
        <Play className="h-3.5 w-3.5 fill-white" />
        영상 다시 보기
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-30 overflow-hidden rounded-xl border border-white/10 bg-black shadow-[0_20px_60px_-10px_rgba(0,44,95,0.55)] transition-all duration-500",
        minimized ? "h-9 w-64" : "h-44 w-72 md:h-52 md:w-80",
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-primary px-3 py-1.5">
        <span className="truncate text-[11px] font-semibold text-white/90">현대자동차 부산 모빌리티쇼</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized((s) => !s)}
            className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Toggle"
          >
            {minimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
          </button>
          <button
            onClick={close}
            className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="닫기"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      {!minimized && (
        <iframe
          className="h-[calc(100%-1.75rem)] w-full"
          src={`https://www.youtube.com/embed/${YOUTUBE_ID}?autoplay=1&mute=1&loop=1&playlist=${YOUTUBE_ID}&controls=0&modestbranding=1&rel=0&playsinline=1`}
          title="현대자동차 부산 모빌리티쇼"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      )}
    </div>
  );
}
