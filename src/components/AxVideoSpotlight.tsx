import { useRef } from "react";
import { ArrowUpRight, PlayCircle } from "lucide-react";

/** 대시보드 우측 칸에 붙는 참고 영상 — 음소거 자동재생, 마우스를 올리면 멈춘다. */
const VIDEOS = [
  {
    id: "5WFbSPFbTPA",
    title: "현대자동차그룹 AX 성과 발표회",
    href: "https://youtu.be/5WFbSPFbTPA",
  },
  {
    id: "IQ_AHmKVg-Q",
    title: "현대자동차그룹 AX사업 간담회",
    href: "https://www.youtube.com/live/IQ_AHmKVg-Q",
  },
];

export function AxVideoSpotlight() {
  return (
    <section className="rounded-2xl border border-[#dbe5f5] bg-[#f4f8ff] p-5">
      <div className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1 text-[12.5px] font-black text-blue-600">
        <PlayCircle className="h-3.5 w-3.5" /> 참고 영상
      </div>
      <h2 className="mt-2.5 break-keep text-[19px] font-black leading-snug tracking-tight text-[#12315c]">
        현대자동차그룹 AX 혁신
      </h2>
      <div className="mt-3.5 space-y-3.5">
        {VIDEOS.map((v) => (
          <VideoCard key={v.id} {...v} />
        ))}
      </div>
    </section>
  );
}

function VideoCard({ id, title, href }: { id: string; title: string; href: string }) {
  const ref = useRef<HTMLIFrameElement>(null);

  // YouTube IFrame API 명령 — enablejsapi=1 로 embed 했을 때만 동작한다.
  const send = (func: "playVideo" | "pauseVideo") => {
    ref.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args: [] }),
      "*",
    );
  };

  const src =
    `https://www.youtube.com/embed/${id}` +
    `?autoplay=1&mute=1&loop=1&playlist=${id}` +
    `&controls=0&playsinline=1&rel=0&modestbranding=1&enablejsapi=1`;

  return (
    <div>
      <div
        className="relative aspect-video overflow-hidden rounded-xl border border-[#eef1f6] bg-slate-900"
        onMouseEnter={() => send("pauseVideo")}
        onMouseLeave={() => send("playVideo")}
      >
        {/* iframe 이 마우스 이벤트를 삼키면 hover 감지가 안 된다 — 부모가 받도록 비활성화 */}
        <iframe
          ref={ref}
          src={src}
          title={title}
          loading="lazy"
          className="pointer-events-none absolute inset-0 h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="mt-2 break-keep text-[13.5px] font-bold leading-snug text-slate-800">
        {title}
      </div>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-bold text-blue-600 underline-offset-4 hover:underline"
      >
        자세히 보러가기 <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
