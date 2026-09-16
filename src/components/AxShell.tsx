import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { getLocalUser } from "@/integrations/supabase/demo";
import { isAxLabAdminViewer } from "@/lib/ax-lab";
import { supabase } from "@/integrations/supabase/client";
import teczenLogo from "@/assets/teczen-logo.png";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard, Lightbulb, Send, ClipboardList, Package, BarChart3,
  Bell, ChevronDown, LogOut, User as UserIcon, Shield, Upload, Gavel,
} from "lucide-react";

type NavItem = { label: string; icon: any; to?: string; href?: string; adminOnly?: boolean };

const NAV: NavItem[] = [
  { label: "대시보드", icon: LayoutDashboard, to: "/" },
  { label: "경진대회 작품", icon: Lightbulb, href: "/#gallery" },
  { label: "고도화 신청", icon: Send, to: "/ax-lab/request" },
  { label: "과제 관리", icon: ClipboardList, to: "/ax-lab/manage", adminOnly: true },
  { label: "SaaS 승인·등록", icon: Package, to: "/ax-lab/manage", adminOnly: true },
  { label: "우수 사례", icon: BarChart3, href: "/#gallery" },
];

const CRUMB: Record<string, string> = {
  "/": "대시보드",
  "/ax-lab": "고도화 현황",
  "/ax-lab/request": "고도화 신청",
  "/ax-lab/manage": "과제 관리",
};

/** AX 플랫폼 공통 레이아웃 — 좌측 사이드바 + 상단 바. */
export function AxShell({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  // 로그인 정보는 브라우저에만 있다 — 마운트 후에 읽어야 서버 렌더 결과와 어긋나지 않는다.
  const [user, setUser] = useState<ReturnType<typeof getLocalUser>>(null);
  useEffect(() => setUser(getLocalUser()), [path]);
  const isAdmin = !!user?.roles?.includes("admin");
  const canManage = isAdmin || isAxLabAdminViewer(user?.empNo);
  const items = NAV.filter((n) => !n.adminOnly || canManage);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-[#f6f7f9]">
      {/* 사이드바 */}
      <aside className="sticky top-0 hidden h-screen w-[228px] shrink-0 flex-col border-r border-[#e9ecf2] bg-white lg:flex">
        <Link to="/" className="block px-6 pb-6 pt-7">
          <img src={teczenLogo} alt="TECZEN" className="h-[22px] w-auto" />
          <div className="mt-2 text-[12.5px] font-medium text-slate-400">AX Platform</div>
        </Link>

        <nav className="flex-1 space-y-1 px-3">
          {items.map((n) => {
            const active = n.to ? (n.to === "/" ? path === "/" : path.startsWith(n.to)) : false;
            const cls = `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] transition ${
              active ? "bg-[#eef4ff] font-bold text-blue-600" : "font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`;
            return n.to ? (
              <Link key={n.label} to={n.to} className={cls}>
                <n.icon className="h-[18px] w-[18px]" /> {n.label}
              </Link>
            ) : (
              <a key={n.label} href={n.href} className={cls}>
                <n.icon className="h-[18px] w-[18px]" /> {n.label}
              </a>
            );
          })}
        </nav>

        <div className="px-6 pb-7 text-[12.5px] leading-relaxed text-slate-400">
          AI로 만드는
          <br />더 나은 오늘,
          <br />TECZEN
        </div>
      </aside>

      {/* 본문 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#e9ecf2] bg-[#f6f7f9]/95 px-5 backdrop-blur sm:px-8">
          <div className="flex items-center gap-2 text-[13.5px]">
            <Link to="/" className="font-medium text-slate-400 hover:text-slate-600">AX 플랫폼</Link>
            <span className="text-slate-300">/</span>
            <span className="font-bold text-slate-700">{CRUMB[path] ?? "대시보드"}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full text-slate-400">
              <Bell className="h-[18px] w-[18px]" />
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-slate-100">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#dde8fb] text-[13px] font-black text-blue-700">
                  {user?.name?.[0] ?? "?"}
                </span>
                <span className="hidden text-[13.5px] font-bold text-slate-700 sm:block">
                  {user?.name} {user?.position}
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => navigate({ to: "/my-page" })}>
                  <UserIcon className="mr-2 h-4 w-4" /> 마이페이지
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/submit" })}>
                  <Upload className="mr-2 h-4 w-4" /> 작품 제출
                </DropdownMenuItem>
                {user?.roles?.includes("judge") && (
                  <DropdownMenuItem onClick={() => navigate({ to: "/judge" })}>
                    <Gavel className="mr-2 h-4 w-4" /> 평가하기
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate({ to: "/admin" })}>
                    <Shield className="mr-2 h-4 w-4" /> 관리자
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" /> 로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-5 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
