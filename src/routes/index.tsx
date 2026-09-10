import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { PrizePopup, openPrizePopup } from "@/components/PrizePopup";
import { ContestGuideModal } from "@/components/ContestGuideModal";
import { SubmissionCard } from "@/components/SubmissionCard";
import { AxLabOverview } from "@/components/AxLabOverview";
import { listSubmissions } from "@/lib/submissions.functions";
import { ExternalLink, Heart } from "lucide-react";
import { SiteImage } from "@/components/SiteImage";
import { getLocalUser } from "@/integrations/supabase/demo";
import video1 from "@/assets/video-1.jpg";
import video2 from "@/assets/video-2.jpg";
import video3 from "@/assets/video-3.jpg";
import video4 from "@/assets/video-4.jpg";
import video5 from "@/assets/video-5.jpg";
import mascotPrize from "@/assets/mascot-prize.png";
import prizeClaudeImg from "@/assets/prize-claude.jpg";
import prizeKeyboardImg from "@/assets/prize-keyboard.jpg";
import prizeMouseImg from "@/assets/prize-mouse.jpg";
import articleVibe from "@/assets/article-vibe-coding.png";
import articleJensen from "@/assets/article-jensen.png";
import articleAgent from "@/assets/article-agent-table.png";
import articleReading from "@/assets/article-reading.png";
import articleMeta from "@/assets/article-meta-glasses.png";

const ARTICLES = [
  { title: "\u201CAI가 알아서 다 해줬어요\u201D…\u2018바이브 코딩\u2019의 두 얼굴", source: "KBS 뉴스", slot: "news-1", thumb: articleVibe, href: "https://news.kbs.co.kr/news/mobile/view/view.do?ncd=8579734", tag: "트렌드" },
  { title: "7억 연봉의 개발자는 3억원의 토큰을 사용해야 한다\n– 젠슨 황", source: "IT동아", slot: "news-2", thumb: articleJensen, href: "https://it.donga.com/108912/", tag: "AI 산업" },
  { title: "AI 시대, 독서는 필수", source: "brunch · 동포뉴스", slot: "news-3", thumb: articleReading, href: "https://brunch.co.kr/@ksd7302/259", tag: "칼럼" },
  { title: "AI 에이전트란?", source: "Databricks", slot: "news-4", thumb: articleAgent, href: "https://www.databricks.com/kr/blog/what-are-ai-agents", tag: "기초" },
  { title: "메타 AI 안경 \u2014 웨어러블 AI의 미래", source: "AI타임스", slot: "news-5", thumb: articleMeta, href: "https://www.aitimes.com/news/articleView.html?idxno=212449", tag: "디바이스" },
];

const VIDEOS = [
  { title: "남들 모르는 VS Code 세팅법!", slot: "video-1", thumb: video1, href: "https://youtu.be/2mBbZG9vVtE?si=AWtNhHTUWP961zwm" },
  { title: "클로드 코드 완벽 정복!", slot: "video-2", thumb: video2, href: "https://youtu.be/DGolK4QzmZY?si=Jgaiv3lNF3K3d3dY" },
  { title: "홈페이지 30분 자동 완성!", slot: "video-3", thumb: video3, href: "https://youtu.be/CDTEtw90G04?si=ITHolZ331AD1lMD1" },
  { title: "AI 시대 세상을 지배 충격적인 기술", slot: "video-4", thumb: video4, href: "https://youtu.be/QpBy2MZlvZw?si=kJ1EL1qRQLeWoop7" },
  { title: "학벌보다 무서운 \u201C진짜 지능\u201D", slot: "video-5", thumb: video5, href: "https://youtu.be/mVaAeGCLQdA?si=eGB5SeY74WsVuvSf" },
];


export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    const lu = getLocalUser();
    if (lu?.mustChangePassword || lu?.needsConsent) throw redirect({ to: "/change-password" });
  },
  component: Home,
});

function Home() {
  const nav = useNavigate();
  const fn = useServerFn(listSubmissions);
  const { data: rawSubs = [] } = useQuery({
    queryKey: ["submissions", "public"],
    queryFn: () => fn(),
  });
  // 좋아요 많은 순으로 정렬 + 순위 부여 (동점은 최신순)
  const subs = [...rawSubs]
    .sort((a: any, b: any) => (b.likeCount ?? 0) - (a.likeCount ?? 0) || (a.createdAt < b.createdAt ? 1 : -1))
    .map((s: any, i: number) => ({ ...s, rank: (s.likeCount ?? 0) > 0 ? i + 1 : undefined }));

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") nav({ to: "/auth", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [nav]);

  return (
    <div className="pb-10 bg-white">
      <PrizePopup />
      <ContestGuideModal />

      {/* AX LAB — 메인 화면 */}
      <section className="mx-auto max-w-6xl px-6 pt-10">
        <AxLabOverview />
      </section>

      {/* GALLERY */}
      <section id="gallery" className="mx-auto max-w-6xl px-6 pt-16 pb-12 scroll-mt-28">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight">
              모두의 <span className="text-primary">AI 작품</span>
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              작품을 클릭해 세부 정보를 확인하고 좋아요를 남겨주세요.
            </p>
          </div>
          <div className="hidden md:block text-right text-sm text-muted-foreground">
            총 <span className="font-black text-foreground">{subs.length}</span>개 작품
          </div>
        </div>

        {/* 좋아요 = 평가요소 강조 배너 */}
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border-2 border-rose-200 bg-gradient-to-r from-rose-50 to-primary/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Heart className="h-6 w-6 shrink-0 fill-rose-500 text-rose-500" />
            <div>
              <div className="text-[15px] font-black text-foreground">
                여러분의 <span className="text-rose-500">좋아요</span>는 <span className="text-primary">평가 점수</span>에 반영됩니다!
              </div>
              <div className="mt-0.5 text-xs font-medium text-muted-foreground">
                최종 100점 = 심사위원 평가 80점 + <b className="text-foreground">좋아요 20점(1개당 1점)</b> · 마음에 드는 작품에 꼭 좋아요를 눌러주세요.
              </div>
            </div>
          </div>
          <div className="shrink-0 rounded-full bg-rose-500 px-4 py-1.5 text-center text-xs font-black text-white">
            인당 좋아요 최대 3개
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span className="rounded-full bg-primary px-4 py-1.5 text-primary-foreground">🔥 좋아요 많은 순</span>
        </div>

        {subs.length === 0 ? (
          <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-24 text-center">
            <div className="text-4xl mb-3">🚀</div>
            <div className="text-lg font-semibold">아직 등록된 작품이 없어요</div>
            <div className="mt-2 text-sm text-muted-foreground">첫 번째 참가자가 되어보세요!</div>
            <Link to="/submit" className="mt-6 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              작품 제출하기
            </Link>
          </div>
        ) : (
          <div id="gallery-grid" className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {subs.map((s: any) => (
              <div key={s.id} data-card data-search={`${s.title} ${s.author?.name ?? ""} ${s.author?.team ?? ""}`}>
                <SubmissionCard {...s} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI NEWS */}
      <section id="news" className="mx-auto max-w-6xl px-6 pb-14 pt-6 scroll-mt-28">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight">
              읽어볼 만한 <span className="text-primary">AI 뉴스</span>
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              최신 AI 트렌드와 인사이트 · 카드를 클릭하면 원문으로 이동합니다.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {ARTICLES.map((a) => (
            <a key={a.title} href={a.href} target="_blank" rel="noopener noreferrer" className="group block">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
                <SiteImage slot={a.slot} fallback={a.thumb} alt={a.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                  {a.tag}
                </div>
              </div>
              <h3 className="mt-3 line-clamp-3 whitespace-pre-line text-[14px] font-bold leading-snug text-foreground group-hover:text-primary transition-colors">
                {a.title}
              </h3>
              <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                <span>{a.source}</span>
                <ExternalLink className="h-3 w-3" />
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* 추천 AI 영상 */}
      <section id="videos" className="mx-auto max-w-6xl px-6 pb-14 pt-6 scroll-mt-28">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight">
              추천 <span className="text-primary">AI 영상</span>
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              보면 실력이 늘어나는 영상들 · 카드를 클릭하면 새 창에서 열립니다.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {VIDEOS.map((v) => (
            <a key={v.slot} href={v.href} target="_blank" rel="noopener noreferrer" className="group block">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
                <SiteImage slot={v.slot} fallback={v.thumb} alt={v.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-black/55 backdrop-blur transition group-hover:bg-red-600">
                    <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-white"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                </div>
              </div>
              <h3 className="mt-3 line-clamp-2 text-[14px] font-bold leading-snug text-foreground group-hover:text-primary transition-colors">
                {v.title}
              </h3>
              <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                <span>YouTube</span>
                <ExternalLink className="h-3 w-3" />
              </div>
            </a>
          ))}
        </div>
      </section>

      <footer className="mt-10 border-t border-border bg-muted/30 py-10">
        <div className="mx-auto max-w-7xl px-6 text-center text-xs text-muted-foreground">
          문의사항: 미래성장팀 이재용 매니저 · 055-280-1741
        </div>
      </footer>

      <style>{`
        @keyframes bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function Benefit({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-white to-slate-50 p-5 text-center hover:border-primary/40 transition">
      <div className="text-3xl">{icon}</div>
      <div className="mt-2 text-sm font-black text-slate-900">{title}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

function PrizeCard({ rank, name, img }: { rank: string; name: string; img: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-white p-3 shadow-sm">
      <div className="aspect-square w-full overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 grid place-items-center p-2">
        <img src={img} alt={name} className="max-h-full max-w-full object-contain" />
      </div>
      <div className="mt-2 text-[10px] font-black tracking-widest text-primary">{rank}</div>
      <div className="text-xs font-bold text-slate-900 truncate">{name}</div>
    </div>
  );
}
