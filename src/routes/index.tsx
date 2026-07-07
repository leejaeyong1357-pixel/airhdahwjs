import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { PrizePopup, openPrizePopup } from "@/components/PrizePopup";
import { ContestGuideModal } from "@/components/ContestGuideModal";
import { SubmissionCard } from "@/components/SubmissionCard";
import { listSubmissions } from "@/lib/submissions.functions";
import { ExternalLink, ArrowRight } from "lucide-react";
import heroScene from "@/assets/ai-head-v2.png";
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
  { title: "\u201CAI가 알아서 다 해줬어요\u201D…\u2018바이브 코딩\u2019의 두 얼굴", source: "KBS 뉴스", thumb: articleVibe, href: "https://news.kbs.co.kr/news/mobile/view/view.do?ncd=8579734", tag: "트렌드" },
  { title: "7억 연봉의 개발자는 3억원의 토큰을 사용해야 한다\n– 젠슨 황", source: "IT동아", thumb: articleJensen, href: "https://it.donga.com/108912/", tag: "AI 산업" },
  { title: "AI 시대, 독서는 필수", source: "brunch · 동포뉴스", thumb: articleReading, href: "https://brunch.co.kr/@ksd7302/259", tag: "칼럼" },
  { title: "AI 에이전트란?", source: "Google Cloud", thumb: articleAgent, href: "https://cloud.google.com/discover/what-are-ai-agents?hl=ko", tag: "기초" },
  { title: "메타 AI 안경 \u2014 웨어러블 AI의 미래", source: "AI타임스", thumb: articleMeta, href: "https://www.aitimes.com/news/articleView.html?idxno=212449", tag: "디바이스" },
];

const HERO = {
  eyebrow: "제 1회",
  title1: "테크젠 사내",
  title2: "AI 경진대회",
  info: [
    { label: "대회 기간", value: "7. 8 (수) ~ 7. 13 (월)" },
    { label: "참가 대상", value: "전 관리직" },
    { label: "주제", value: "자유주제", sub: "(업무·비업무 모두 허용, 게임은 지양)" },
    { label: "결과 발표일", value: "7. 15 (수)" },
  ],
};

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: Home,
});

function Home() {
  const nav = useNavigate();
  const fn = useServerFn(listSubmissions);
  const { data: subs = [] } = useQuery({
    queryKey: ["submissions", "public"],
    queryFn: () => fn(),
  });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") nav({ to: "/auth", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [nav]);

  return (
    <div className="pb-32" style={{ background: "#FAF6F2" }}>
      <PrizePopup />
      <ContestGuideModal />

      {/* HERO — Hyundai navy + cream */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "radial-gradient(1100px 700px at 78% 45%, #E4ECF7 0%, rgba(228,236,247,0) 60%), linear-gradient(180deg, #FAF6F2 0%, #F2EDE6 100%)",
        }}
      >
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 pt-16 pb-20 min-h-[640px]">
          <div className="grid grid-cols-1 md:grid-cols-[1.05fr_1fr] gap-10 items-center">
            {/* Left copy */}
            <div className="relative z-10 animate-[fadeUp_0.7s_ease-out_both]">
              <div className="text-[18px] md:text-[20px] font-semibold text-[#1A1A1A]/85">
                {HERO.eyebrow}
              </div>
              <h1
                className="mt-4 font-extrabold text-[#1A1A1A] leading-[1.1]"
                style={{ fontSize: "clamp(44px, 6.2vw, 72px)", letterSpacing: "-0.02em" }}
              >
                {HERO.title1}
              </h1>
              <h2
                className="mt-1 font-extrabold leading-[1.1] inline-block"
                style={{
                  fontSize: "clamp(44px, 6.2vw, 72px)",
                  letterSpacing: "-0.02em",
                  color: "#002C5F",
                  background: "linear-gradient(transparent 68%, #FFE27A 68%, #FFE27A 96%, transparent 96%)",
                  padding: "0 0.15em",
                }}
              >
                {HERO.title2}
              </h2>

              {/* Info grid */}
              <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-8 max-w-2xl">
                {HERO.info.map((it, i) => (
                  <div
                    key={it.label}
                    className="pl-5 animate-[fadeUp_0.7s_ease-out_both]"
                    style={{
                      borderLeft: "3px solid #002C5F",
                      animationDelay: `${0.15 + i * 0.08}s`,
                    }}
                  >
                    <div className="text-[15px] font-semibold" style={{ color: "#002C5F" }}>
                      {it.label}
                    </div>
                    <div className="mt-1.5 text-[18px] md:text-[19px] font-bold text-[#1A1A1A] leading-snug whitespace-nowrap">
                      {it.value}
                    </div>
                    {(it as any).sub && (
                      <div className="mt-0.5 text-[12px] md:text-[13px] font-medium text-[#4a4a4a] whitespace-nowrap">
                        {(it as any).sub}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="mt-12">
                <Link
                  to="/submit"
                  className="group inline-flex items-center gap-2 rounded-xl bg-[#002C5F] px-7 py-4 text-[15px] font-bold text-white transition-colors hover:bg-[#1A4A8A]"
                >
                  참가 신청하기
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>

            {/* Right visual */}
            <div className="relative h-80 md:h-[600px] flex items-center justify-center animate-[fadeUp_0.9s_ease-out_both]">
              <img
                src={heroScene}
                alt="TECZEN AI"
                className="h-full w-auto object-contain"
                style={{
                  animation: "bob 4s ease-in-out infinite",
                  mixBlendMode: "multiply",
                  maskImage: "radial-gradient(ellipse 70% 70% at 55% 50%, #000 55%, transparent 100%)",
                  WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 55% 50%, #000 55%, transparent 100%)",
                }}
              />
            </div>
          </div>
        </div>
      </section>


      {/* INTRO — big statement copy */}
      <section className="mx-auto max-w-5xl px-6 py-24 md:py-32 text-center">
        <div
          className="font-bold tracking-[0.25em] mb-6"
          style={{ color: "#002C5F", fontSize: "clamp(13px, 1.1vw, 15px)" }}
        >
          TECZEN AI CONTEST
        </div>
        <h2
          className="font-extrabold text-[#1A1A1A] leading-[1.2]"
          style={{ fontSize: "clamp(32px, 5vw, 60px)", letterSpacing: "-0.02em" }}
        >
          구성원의 <span style={{ color: "#002C5F" }}>AI 활용 역량</span>을 높이고,<br />
          실제 업무에 적용 가능한<br />
          <span style={{ color: "#002C5F" }}>우수 아이디어</span>를 발굴합니다
        </h2>
        <p className="mt-10 text-[17px] md:text-[19px] leading-[1.9] text-[#4a4a4a] max-w-3xl mx-auto">
          이번 <b className="text-[#1A1A1A]">제 1회 테크젠 AI 경진대회</b>는 구성원 여러분이<br className="hidden md:block" />
          AI를 실제 업무에 적용해볼 수 있도록 마련된 자리입니다.
        </p>
      </section>


      {/* GALLERY */}
      <section id="gallery" className="mx-auto max-w-6xl px-6 pb-12 scroll-mt-28">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight">
              모두의 <span className="text-primary">AI 작품</span>
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              작품을 클릭해 세부 정보를 확인하고 좋아요를 남기세요. (인당 최대 3개)
            </p>
          </div>
          <div className="hidden md:block text-right text-sm text-muted-foreground">
            총 <span className="font-black text-foreground">{subs.length}</span>개 작품
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground">전체</button>
          <button className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground">최신순</button>
          <button className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground">인기순</button>
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
                <img src={a.thumb} alt={a.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
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

      <footer className="mt-10 border-t border-border bg-muted/30 py-10">
        <div className="mx-auto max-w-7xl px-6 text-center text-xs text-muted-foreground">
          문의사항: 미래성장팀 이재용 매니저 · 055-280-1741
        </div>
      </footer>

      {/* Sticky bottom banner — 지금 당장 접수하기 */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-white/90">
              접수 마감 임박
            </div>
            <div className="truncate text-sm md:text-base font-bold text-white">
              제 1회 테크젠 사내 AI 경진대회 · 지금 참여하고 상품 받아가세요!
            </div>
          </div>
          <Link
            to="/submit"
            className="ml-4 inline-flex shrink-0 items-center gap-2 rounded-full bg-[#e85d3a] px-4 md:px-6 py-2 md:py-2.5 text-xs md:text-sm font-black text-white hover:bg-[#d94e2b] transition shadow-lg"
          >
            지금 당장 접수하기! <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

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
