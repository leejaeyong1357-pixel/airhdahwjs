import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

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
      </div>
    </QueryClientProvider>
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
