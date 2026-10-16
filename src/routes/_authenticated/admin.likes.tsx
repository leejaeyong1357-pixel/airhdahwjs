import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListLikes, adminListSubmissionLikeCounts, adminAdjustLike, adminRemoveLike,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Heart, Search, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/likes")({
  component: AdminLikes,
});

function AdminLikes() {
  const listFn = useServerFn(adminListLikes);
  const countsFn = useServerFn(adminListSubmissionLikeCounts);
  const adjustFn = useServerFn(adminAdjustLike);
  const removeFn = useServerFn(adminRemoveLike);
  const qc = useQueryClient();

  const { data = [] } = useQuery({ queryKey: ["admin", "likes"], queryFn: () => listFn() });
  const { data: counts = [] } = useQuery({ queryKey: ["admin", "likeCounts"], queryFn: () => countsFn() });
  const [q, setQ] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "likes"] });
    qc.invalidateQueries({ queryKey: ["admin", "likeCounts"] });
    qc.invalidateQueries({ queryKey: ["submissions"] });
  };

  const adjustMut = useMutation({
    mutationFn: (v: { submissionId: string; delta: number }) => adjustFn({ data: v }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: (v: { submissionId: string; userId: string; createdAt: string }) => removeFn({ data: v }),
    onSuccess: () => { toast.success("좋아요를 삭제했습니다."); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return data;
    return data.filter((l: any) =>
      `${l.likerName} ${l.likerTeam} ${l.likerEmpNo} ${l.submissionTitle} ${l.submissionAuthor}`
        .toLowerCase()
        .includes(k),
    );
  }, [data, q]);

  return (
    <div className="space-y-10">
      {/* 작품별 하트 수 조정 */}
      <section>
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 fill-rose-500 text-rose-500" />
          <h2 className="text-lg font-black tracking-tight">작품별 좋아요 수 조정</h2>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          − 버튼으로 하트를 내리거나 + 버튼으로 올릴 수 있습니다. (조정된 하트는 아래 상세 내역에 표시되지 않습니다.)
        </p>
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr><Th>작품</Th><Th>글쓴이</Th><Th className="text-center">좋아요</Th><Th className="text-right">조정</Th></tr>
            </thead>
            <tbody>
              {counts.map((s: any) => (
                <tr key={s.submissionId} className="border-t border-border">
                  <Td className="font-semibold">{s.title}</Td>
                  <Td className="text-xs text-muted-foreground">{s.author}</Td>
                  <Td className="text-center">
                    <span className="inline-flex items-center gap-1 font-bold text-rose-500">
                      <Heart className="h-4 w-4 fill-rose-500" /> {s.likeCount}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm" variant="outline"
                        disabled={adjustMut.isPending || s.likeCount === 0}
                        onClick={() => adjustMut.mutate({ submissionId: s.submissionId, delta: -1 })}
                        title="하트 -1"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        disabled={adjustMut.isPending}
                        onClick={() => adjustMut.mutate({ submissionId: s.submissionId, delta: 1 })}
                        title="하트 +1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
              {counts.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">제출된 작품이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 좋아요 상세 내역 */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            누가 어떤 작품에 좋아요를 눌렀는지 상세 내역입니다. (관리자 전용)
            <span className="ml-2 font-semibold text-foreground">총 {data.length}건</span>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름 · 작품 · 팀 검색"
              className="w-64 rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <Th>일시</Th>
                <Th>좋아요 누른 사람</Th>
                <Th></Th>
                <Th>받은 작품</Th>
                <Th className="text-right">삭제</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l: any) => (
                <tr key={l.key} className="border-t border-border">
                  <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(l.createdAt)}</Td>
                  <Td>
                    <div className="font-semibold text-foreground">{l.likerName} <span className="font-normal text-muted-foreground">{l.likerPosition}</span></div>
                    <div className="text-xs text-muted-foreground">{l.likerTeam}{l.likerTeam ? " · " : ""}사번 {l.likerEmpNo}</div>
                  </Td>
                  <Td className="text-center text-rose-500">
                    <Heart className="mx-auto h-4 w-4 fill-rose-500" />
                  </Td>
                  <Td>
                    <div className="font-semibold text-foreground">{l.submissionTitle}</div>
                    <div className="text-xs text-muted-foreground">{l.submissionAuthor}</div>
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm" variant="ghost"
                      disabled={removeMut.isPending}
                      onClick={() => removeMut.mutate({ submissionId: l.submissionId, userId: l.likerEmpNo, createdAt: l.createdAt })}
                      title="이 좋아요 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </Td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                    {data.length === 0 ? "아직 좋아요 내역이 없습니다." : "검색 결과가 없습니다."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children, className }: any) { return <th className={`px-4 py-2.5 text-left font-semibold ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-4 py-3 align-top ${className ?? ""}`}>{children}</td>; }
