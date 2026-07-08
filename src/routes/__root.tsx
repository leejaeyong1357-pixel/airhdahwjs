import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Header } from "@/components/Header";
import { FloatingVideo } from "@/components/FloatingVideo";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TECZEN 2026 · 제 1회 AI 경진대회" },
      { name: "description", content: "TECZEN 2026 제 1회 AI 경진대회 — 여러분의 AI 작품으로 도전하고, 경품의 주인공이 되세요." },
      { property: "og:title", content: "TECZEN 2026 · 제 1회 AI 경진대회" },
      { property: "og:description", content: "TECZEN 2026 제 1회 AI 경진대회 — 여러분의 AI 작품으로 도전하고, 경품의 주인공이 되세요." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "TECZEN 2026 · 제 1회 AI 경진대회" },
      { name: "twitter:description", content: "TECZEN 2026 제 1회 AI 경진대회 — 여러분의 AI 작품으로 도전하고, 경품의 주인공이 되세요." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorPage,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isAuth = path.startsWith("/auth");
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col">
        {!isAuth && <Header />}
        <main className="flex-1"><Outlet /></main>
        {!isAuth && <FloatingVideo />}
        <Toaster position="top-center" richColors />
        <CursorGlow />
      </div>
    </QueryClientProvider>
  );
}

// 커스텀 마우스 포인터 — 파란 글로우 점 + 따라오는 링 (터치 기기에서는 비활성)
function CursorGlow() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    document.documentElement.classList.add("custom-cursor");
    let tx = -100, ty = -100, rx = -100, ry = -100, scale = 1, raf = 0;

    function onMove(e: MouseEvent) {
      tx = e.clientX; ty = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.opacity = "1";
        dotRef.current.style.transform = `translate(${tx}px, ${ty}px)`;
      }
      if (ringRef.current) ringRef.current.style.opacity = "1";
      const el = (e.target as HTMLElement)?.closest?.("a,button,[role=button],input,textarea,select,label,[data-slot=checkbox]");
      scale = el ? 1.9 : 1;
    }
    function onLeave() {
      if (dotRef.current) dotRef.current.style.opacity = "0";
      if (ringRef.current) ringRef.current.style.opacity = "0";
    }
    function loop() {
      rx += (tx - rx) * 0.18;
      ry += (ty - ry) * 0.18;
      if (ringRef.current) ringRef.current.style.transform = `translate(${rx}px, ${ry}px) scale(${scale})`;
      raf = requestAnimationFrame(loop);
    }
    window.addEventListener("mousemove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove("custom-cursor");
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="cursor-ring" aria-hidden />
      <div ref={dotRef} className="cursor-dot" aria-hidden />
    </>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="text-7xl font-bold text-primary">404</div>
      <div className="mt-4 text-lg font-semibold">페이지를 찾을 수 없습니다</div>
      <a href="/" className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">홈으로</a>
    </div>
  );
}

function ErrorPage({ error }: { error: Error }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="text-lg font-semibold">문제가 발생했습니다</div>
      <div className="mt-2 text-sm text-muted-foreground">{error.message}</div>
      <a href="/" className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">홈으로</a>
    </div>
  );
}
