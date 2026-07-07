import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import teczenLogo from "@/assets/teczen-logo.png.asset.json";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, LogOut, Upload, Gavel, Shield, User as UserIcon, ClipboardCheck, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { openPrizePopup } from "@/components/PrizePopup";
import { openContestGuide } from "@/components/ContestGuideModal";

interface Me {
  profile: { name: string; team?: string | null; position?: string | null; employee_no: string } | null;
  role: "admin" | "judge" | "participant";
}

export function Header() {
  const navigate = useNavigate();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (mounted) { setMe(null); setReady(true); } return; }
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("name,team,position,employee_no").eq("id", session.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", session.user.id),
      ]);
      if (!mounted) return;
      setMe({
        profile: profile as any,
        role: ((roles?.[0] as any)?.role as Me["role"]) ?? "participant",
      });
      setReady(true);
    }
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        load();
        router.invalidate();
      }
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-white">
      <div className="flex h-24 w-full items-center justify-between pl-3 pr-6 md:pl-4">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <img src={teczenLogo.url} alt="TECZEN" className="h-20 w-20 object-contain" />
          <span className="hidden sm:block text-base md:text-lg font-black tracking-tight text-primary">
            제 1회 테크젠 사내 AI 경진대회
          </span>
        </Link>

        <div className="flex items-center gap-1 md:gap-4">
          <nav className="hidden md:flex items-center gap-1">
            <a href="/#news" className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
              AI 뉴스
            </a>
            <button onClick={openContestGuide} className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
              대회 안내
            </button>
            <button onClick={openPrizePopup} className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
              시상 내역
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1">
                  <ClipboardCheck className="h-4 w-4" /> 평가요소
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96 p-5">
                <div className="mb-3">
                  <div className="text-sm font-black text-primary">평가 기준 안내</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    실/팀장 평가 <b className="text-foreground">80%</b> + 좋아요 수 <b className="text-foreground">20%</b>
                  </div>
                </div>
                <ul className="space-y-3 text-sm">
                  <li className="rounded-lg border border-border/60 bg-muted/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">혁신성</span>
                      <span className="font-black text-primary">40점</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      아이디어의 창의성과 새로움. 기존과 차별화된 접근인지 평가.
                    </div>
                  </li>
                  <li className="rounded-lg border border-border/60 bg-muted/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">완성도</span>
                      <span className="font-black text-primary">40점</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      결과물의 품질, UI/UX, 안정성, 디테일 수준.
                    </div>
                  </li>
                  <li className="rounded-lg border border-border/60 bg-muted/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">활용도</span>
                      <span className="font-black text-primary">20점</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      실제 업무 적용 가능성과 파급 효과.
                    </div>
                  </li>
                </ul>
                <div className="mt-4 rounded-md bg-primary/5 p-3 text-[11px] text-muted-foreground leading-relaxed">
                  총점 = (실/팀장 평가 100점 환산 × 0.8) + (좋아요 정규화 점수 × 0.2)
                </div>
              </PopoverContent>
            </Popover>
            {me && (
              <Link to="/submit" className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
                작품 제출
              </Link>
            )}
          </nav>

          {!ready ? null : me?.profile ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-11 gap-2">
                  <div className="flex flex-col items-end leading-tight">
                    <span className="text-xs text-muted-foreground">{me.profile.team ?? ""}</span>
                    <span className="text-sm font-semibold">
                      {me.profile.name} <span className="text-xs font-normal text-muted-foreground">{me.profile.position}</span>
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">사번 {me.profile.employee_no}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/my-page" })}>
                  <UserIcon className="mr-2 h-4 w-4" /> 마이페이지
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/submit" })}>
                  <Upload className="mr-2 h-4 w-4" /> 작품 제출
                </DropdownMenuItem>
                {(me.role === "judge" || me.role === "admin") && (
                  <DropdownMenuItem onClick={() => navigate({ to: "/judge" })}>
                    <Gavel className="mr-2 h-4 w-4" /> 심사
                  </DropdownMenuItem>
                )}
                {me.role === "admin" && (
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
          ) : (
            <Button asChild variant="default" className="bg-primary hover:bg-primary/90">
              <Link to="/auth">로그인</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

