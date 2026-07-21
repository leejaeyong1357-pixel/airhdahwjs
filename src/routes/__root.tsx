import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouterState,
  useNavigate,
  Link,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import teczenLogo from "@/assets/teczen-logo.png";
import { getLocalUser, clearLocalUser } from "@/integrations/supabase/demo";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TECZEN · 발표 평가" },
      { name: "description", content: "TECZEN AI 경진대회 현장 발표 평가" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
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
  const hideHeader = path.startsWith("/auth") || path === "/";
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col bg-background">
        {!hideHeader && <LiveHeader />}
        <main className="flex-1"><Outlet /></main>
        <Toaster position="top-center" richColors />
      </div>
    </QueryClientProvider>
  );
}

function LiveHeader() {
  const nav = useNavigate();
  const user = getLocalUser();
  const isAdmin = user?.roles?.includes("admin");
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link to={isAdmin ? "/control" : "/live"} className="flex items-center gap-2.5">
          <img src={teczenLogo} alt="TECZEN" className="h-8 w-auto object-contain" />
          <span className="text-[15px] font-black tracking-tight text-foreground">발표 평가</span>
        </Link>
        {user && (
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-foreground">
              {user.name}
              <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                {isAdmin ? "관리자" : "평가자"}
              </span>
            </span>
            <button
              onClick={() => { clearLocalUser(); nav({ to: "/auth" }); }}
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-muted"
            >
              로그아웃
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center p-8 text-center">
      <div>
        <div className="text-2xl font-black">페이지를 찾을 수 없습니다</div>
        <Link to="/auth" className="mt-4 inline-block text-primary underline">로그인으로</Link>
      </div>
    </div>
  );
}
