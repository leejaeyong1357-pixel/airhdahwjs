import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetRankings, adminListUsers, listTeamSubmissionCounts } from "@/lib/admin.functions";
import { listSubmissions } from "@/lib/submissions.functions";
import { Users, FileImage, Trophy, Building2, UserPlus, Building, Gavel, BarChart3, Upload } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const usersFn = useServerFn(adminListUsers);
  const subsFn = useServerFn(listSubmissions);
  const teamsFn = useServerFn(listTeamSubmissionCounts);
  const rankFn = useServerFn(adminGetRankings);

  const { data: users = [] } = useQuery({ queryKey: ["admin", "users"], queryFn: () => usersFn() });
  const { data: subs = [] } = useQuery({ queryKey: ["submissions"], queryFn: () => subsFn() });
  const { data: teams = [] } = useQuery({ queryKey: ["teamCounts"], queryFn: () => teamsFn() });
  const { data: ranks = [] } = useQuery({ queryKey: ["admin", "rankings"], queryFn: () => rankFn() });

  const roleCounts = users.reduce<Record<string, number>>((a, u: any) => { a[u.role] = (a[u.role] ?? 0) + 1; return a; }, {});

  return (
    <div className="space-y-6">
      {/* 관리자 사용 가이드 */}
      <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/5 to-primary/5 p-6">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent">GUIDE</div>
          <div className="text-sm font-semibold">관리자 사용 가이드 · 이렇게 진행하세요</div>
        </div>
        <ol className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <GuideStep n={1} icon={Building} title="실/팀 등록" desc="[실/팀] 탭에서 조직 구조 먼저 등록. 사용자 등록 시 이 목록에서 선택." to="/admin/teams" cta="실/팀 관리로 이동" />
          <GuideStep n={2} icon={UserPlus} title="사용자 등록" desc="[사용자] 탭에서 단건 등록 또는 CSV 업로드. 이름·사번·주민앞6자리·팀·직급·역할." to="/admin/users" cta="사용자 관리로 이동" />
          <GuideStep n={3} icon={Upload} title="작품 접수 확인" desc="참여자가 업로드한 작품과 좋아요·댓글 현황을 실시간으로 확인." to="/admin/evaluations" cta="평가 내역으로 이동" />
          <GuideStep n={4} icon={BarChart3} title="심사/순위 관리" desc="7/14 심사 후 [순위] 탭에서 최종 결과 확인. 임원평균×0.8 + 좋아요×0.2." to="/admin/rankings" cta="순위 보기" />
        </ol>
        <div className="mt-4 rounded-lg border border-border/60 bg-background/50 p-4 text-xs text-muted-foreground leading-relaxed">
          <b className="text-foreground">초기 접속 정보</b> — 참여자·심사위원 계정은 <b>초기 비밀번호 = 주민등록번호 앞 6자리</b>로 로그인됩니다. 최초 로그인 시 비밀번호 변경이 강제되며, 분실 시 관리자가 [사용자] 탭에서 <b>비밀번호 재설정</b> 버튼으로 초기화할 수 있습니다.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat icon={Users} label="전체 사용자" value={users.length} />
        <Stat icon={FileImage} label="제출 작품" value={subs.length} />
        <Stat icon={Building2} label="참여 팀 수" value={teams.length} />
        <Stat icon={Trophy} label="심사 완료" value={ranks.filter((r: any) => r.judgeCount > 0).length} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="text-sm font-semibold">권한별 사용자</div>
          <div className="mt-4 space-y-2">
            {(["admin", "judge", "participant"] as const).map((r) => (
              <div key={r} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{{admin:"관리자",judge:"심사위원",participant:"참여자"}[r]}</span>
                <span className="font-bold">{roleCounts[r] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="text-sm font-semibold">실별 지원자 수</div>
          <div className="mt-4 space-y-2 max-h-64 overflow-auto">
            {teams.map((t: any) => (
              <div key={t.team} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t.team}</span>
                <span className="font-bold">{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="text-sm font-semibold">상위 순위 (미리보기)</div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2">순위</th><th>제목</th><th>팀·이름</th><th className="text-right">임원평균</th><th className="text-right">좋아요</th><th className="text-right">최종점수</th>
              </tr>
            </thead>
            <tbody>
              {ranks.slice(0, 10).map((r: any) => (
                <tr key={r.submissionId} className="border-b border-border/60">
                  <td className="py-2 font-bold">{r.rank}</td>
                  <td>{r.title}</td>
                  <td className="text-muted-foreground">{r.author?.team} · {r.author?.name}</td>
                  <td className="text-right">{r.judgeAvg}</td>
                  <td className="text-right">{r.likeCount}</td>
                  <td className="text-right font-bold text-primary">{r.final}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: any) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Icon className="h-5 w-5 text-accent" />
      <div className="mt-3 text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-bold text-primary">{value}</div>
    </div>
  );
}

function GuideStep({ n, icon: Icon, title, desc, to, cta }: any) {
  return (
    <li className="relative rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{n}</div>
        <Icon className="h-4 w-4 text-accent" />
        <div className="text-sm font-bold">{title}</div>
      </div>
      <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{desc}</div>
      <Link to={to} className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline">{cta} →</Link>
    </li>
  );
}
