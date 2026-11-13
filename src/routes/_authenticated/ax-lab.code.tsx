import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { axGetCodeLib, axAdminSaveCode, axAdminDeleteCode } from "@/lib/ax-code.functions";
import { getLocalUser } from "@/integrations/supabase/demo";
import { isAxLabAdminViewer } from "@/lib/ax-lab";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { Code2, Copy, Check, Search, Plus, PenLine, Trash2, ShieldCheck, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ax-lab/code")({ component: StandardCodePage });

type CodeItem = {
  id: string; category: string; title: string; description: string; language: string; code: string;
  updatedAt?: string; updatedByName?: string;
};

/**
 * 클립보드 복사 — 사내망 http 주소에서는 navigator.clipboard 가 막혀 있어
 * 예전 방식(execCommand)으로 한 번 더 시도한다.
 */
async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 아래 방식으로 */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

function StandardCodePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(axGetCodeLib);
  const { data: items = [], isLoading } = useQuery<CodeItem[]>({ queryKey: ["ax", "codeLib"], queryFn: () => listFn() });

  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    const u = getLocalUser();
    setCanEdit(isAxLabAdminViewer(u?.empNo) || !!u?.roles?.includes("admin"));
  }, []);

  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [edit, setEdit] = useState<Partial<CodeItem> | null>(null);

  // 분류 순서는 목록에 처음 나온 순서
  const groups = useMemo(() => {
    const k = q.trim().toLowerCase();
    const hit = (x: CodeItem) => !k || `${x.category} ${x.title} ${x.description}`.toLowerCase().includes(k);
    const map = new Map<string, CodeItem[]>();
    for (const x of items) {
      if (!hit(x)) continue;
      if (!map.has(x.category)) map.set(x.category, []);
      map.get(x.category)!.push(x);
    }
    return [...map.entries()];
  }, [items, q]);

  const sel = items.find((x) => x.id === selId) ?? groups[0]?.[1][0] ?? null;
  useEffect(() => setCopied(false), [sel?.id]);

  async function onCopy() {
    if (!sel) return;
    const ok = await copyText(sel.code);
    if (ok) {
      setCopied(true);
      toast.success("코드를 복사했습니다. 개발 중인 프로그램에 붙여넣으세요.");
      setTimeout(() => setCopied(false), 2500);
    } else {
      toast.error("복사하지 못했습니다. 코드 영역을 드래그해서 Ctrl+C 로 복사해 주세요.");
    }
  }

  const saveFn = useServerFn(axAdminSaveCode);
  const delFn = useServerFn(axAdminDeleteCode);
  const saveMut = useMutation({
    mutationFn: (v: Partial<CodeItem>) =>
      saveFn({
        data: {
          id: v.id, category: v.category ?? "", title: v.title ?? "", description: v.description ?? "",
          language: v.language ?? "", code: v.code ?? "",
        },
      }),
    onSuccess: (r: any) => {
      toast.success("저장했습니다.");
      setEdit(null);
      setSelId(r.id);
      qc.invalidateQueries({ queryKey: ["ax", "codeLib"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("삭제했습니다.");
      setEdit(null);
      setSelId("");
      qc.invalidateQueries({ queryKey: ["ax", "codeLib"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const categories = [...new Set(items.map((x) => x.category))];
  const lines = sel ? sel.code.replace(/\n$/, "").split("\n") : [];

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      {/* 머리말 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.2em] text-blue-600">
            <Code2 className="h-4 w-4" /> Standard Source Code
          </div>
          <h1 className="mt-2 text-[30px] font-black tracking-tight text-[#0f1f38]">표준소스코드</h1>
          <p className="mt-1 text-[14.5px] text-slate-500">
            검증된 표준 코드를 복사해 개발 중인 프로그램에 바로 붙여 쓰세요. 개발 시간은 줄이고, 보안 위험은 최소화합니다.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setEdit({ category: sel?.category ?? "", language: "JavaScript (Node.js)" })}>
            <Plus className="mr-1.5 h-4 w-4" /> 새 코드 추가
          </Button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* 왼쪽 — 분류 트리 */}
        <aside className="h-fit rounded-2xl border border-[#e6eaf1] bg-white p-4 lg:sticky lg:top-20">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="기능 검색 (예: 로그인, 메일)"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-[13.5px]"
            />
          </div>

          <div className="mt-4 space-y-4">
            {groups.map(([cat, list]) => (
              <div key={cat}>
                <div className="inline-block rounded-md border border-slate-300 bg-slate-100 px-3 py-1 text-[13.5px] font-black text-slate-700">
                  {cat}
                </div>
                <ul className="ml-4 mt-1">
                  {list.map((x, i) => {
                    const on = sel?.id === x.id;
                    const last = i === list.length - 1;
                    return (
                      <li key={x.id} className="relative pl-5">
                        {/* 트리 연결선 */}
                        <span className={`absolute left-0 top-0 border-l-[1.5px] border-slate-300 ${last ? "h-1/2" : "h-full"}`} />
                        <span className="absolute left-0 top-1/2 w-4 border-t-[1.5px] border-slate-300" />
                        <button
                          onClick={() => setSelId(x.id)}
                          className={`my-0.5 w-full rounded-lg border-2 px-2.5 py-1.5 text-left text-[14px] font-bold transition ${
                            on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-transparent text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {x.title}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {!isLoading && groups.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-[13px] text-slate-400">
                {q ? "검색 결과가 없습니다." : "등록된 코드가 없습니다."}
              </div>
            )}
          </div>
        </aside>

        {/* 오른쪽 — 상세설명 + 코드 */}
        <section className="min-w-0 rounded-2xl border border-[#e6eaf1] bg-white p-5 sm:p-6">
          {!sel ? (
            <div className="p-16 text-center text-sm text-slate-400">{isLoading ? "불러오는 중…" : "왼쪽에서 코드를 고르세요."}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[#1f2937] px-3 py-1.5 text-[15px] font-black text-white">{sel.title}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-bold text-slate-500">{sel.category}</span>
                {sel.language && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[12px] font-bold text-blue-600">{sel.language}</span>
                )}
                {canEdit && (
                  <button
                    onClick={() => setEdit({ ...sel })}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-bold text-slate-500 hover:bg-slate-50"
                  >
                    <PenLine className="h-3.5 w-3.5" /> 수정
                  </button>
                )}
              </div>

              <p className="mt-4 whitespace-pre-wrap break-keep text-[14.5px] leading-[1.8] text-slate-700">{sel.description}</p>

              <div className="mt-5 overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
                  <span className="text-[12px] font-semibold text-slate-400">{sel.language || "code"} · {lines.length}줄</span>
                  <button
                    onClick={onCopy}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-bold text-slate-300 hover:bg-white/10"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "복사됨" : "복사"}
                  </button>
                </div>
                <div className="max-h-[560px] overflow-auto">
                  <pre className="py-3 font-mono text-[12.5px] leading-[1.65] text-slate-100">
                    {lines.map((ln, i) => (
                      <div key={i} className="flex">
                        <span className="w-12 shrink-0 select-none pr-3 text-right text-slate-500">{i + 1}</span>
                        <code className="whitespace-pre pr-4">{ln || " "}</code>
                      </div>
                    ))}
                  </pre>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-400">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  비밀번호 · 키는 코드에 넣지 말고 .env(환경변수)로 관리하세요.
                </span>
                {sel.updatedAt && (
                  <span className="inline-flex items-center gap-1 text-[12px] text-slate-400">
                    <Clock className="h-3.5 w-3.5" /> {formatDate(sel.updatedAt)} {sel.updatedByName} 수정
                  </span>
                )}
                <button
                  onClick={onCopy}
                  className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#1f2937] px-5 py-3 text-[14.5px] font-black text-white transition hover:bg-black"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  {copied ? "복사 완료" : "코드복사"}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* 추가 · 수정 (AX Hub 관리 권한) */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.id ? "표준소스코드 수정" : "새 표준소스코드 추가"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-[12.5px] font-bold text-slate-600">
                  분류
                  <Input
                    list="code-categories"
                    value={edit.category ?? ""}
                    onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                    placeholder="예: 보안, 권한, 활용도"
                    className="mt-1"
                  />
                  <datalist id="code-categories">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </label>
                <label className="text-[12.5px] font-bold text-slate-600">
                  이름
                  <Input value={edit.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="예: 방문자 카운트" className="mt-1" />
                </label>
                <label className="text-[12.5px] font-bold text-slate-600">
                  언어
                  <Input value={edit.language ?? ""} onChange={(e) => setEdit({ ...edit, language: e.target.value })} placeholder="예: Python, JavaScript" className="mt-1" />
                </label>
              </div>
              <label className="block text-[12.5px] font-bold text-slate-600">
                상세설명
                <Textarea rows={6} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="무엇을 하는 코드인지, 어떻게 쓰는지 적어주세요." className="mt-1" />
              </label>
              <label className="block text-[12.5px] font-bold text-slate-600">
                소스코드
                <Textarea
                  rows={14}
                  spellCheck={false}
                  value={edit.code ?? ""}
                  onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                  className="mt-1 font-mono text-[12.5px]"
                />
              </label>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            {edit?.id && (
              <Button
                variant="outline"
                className="mr-auto text-destructive"
                disabled={delMut.isPending}
                onClick={() => { if (window.confirm(`'${edit.title}' 코드를 삭제할까요?`)) delMut.mutate(edit.id!); }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> 삭제
              </Button>
            )}
            <Button variant="outline" onClick={() => setEdit(null)}>취소</Button>
            <Button
              disabled={saveMut.isPending || !edit?.category?.trim() || !edit?.title?.trim() || !edit?.code?.trim()}
              onClick={() => edit && saveMut.mutate(edit)}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
