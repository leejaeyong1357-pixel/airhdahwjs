import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axListWorksBy } from "@/lib/ax-lab.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AX_STAGES, AX_STATUS, axFileUrl } from "@/lib/ax-stages";
import { formatDate } from "@/lib/utils";
import { Download, Paperclip, Link2, ShieldCheck, Sparkles, ExternalLink } from "lucide-react";

/** 작품 카드/썸네일을 눌렀을 때 뜨는 상세 팝업 — 설명 + 첨부파일 다운로드. */
export function AxWorkDetailDialog({ work, onClose }: { work: any | null; onClose: () => void }) {
  return (
    <Dialog open={!!work} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto p-0">
        {work && (
          <div>
            <div className="relative aspect-video w-full overflow-hidden rounded-t-lg bg-black">
              {work.thumbnailUrl ? (
                <img src={work.thumbnailUrl} alt={work.title} className="absolute inset-0 h-full w-full object-contain" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-hyundai-gradient text-sm text-white/70">No thumbnail</div>
              )}
            </div>
            <div className="p-6">
              <div className="flex flex-wrap items-center gap-2">
                {work.stage ? (
                  <span className={`rounded-full px-2.5 py-1 text-[12px] font-black ${AX_STAGES[work.stage as 1].soft}`}>
                    {AX_STAGES[work.stage as 1].label}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-bold text-muted-foreground">미분류</span>
                )}
                {work.request && (
                  <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${AX_STATUS[work.request.status].tone}`}>
                    {AX_STATUS[work.request.status].label}
                  </span>
                )}
                <span className="text-[12px] text-muted-foreground">
                  {work.source === "contest" ? "경진대회 출품작" : "신규 등록"}
                </span>
              </div>
              <h3 className="mt-2 text-[24px] font-black tracking-tight text-foreground">{work.title}</h3>
              <div className="mt-1 text-[14px] text-muted-foreground">
                {work.authorTeam} · {work.authorName} {work.authorPosition}
              </div>

              {/* 단계마다 올린 최신 결과물 — 이것이 지금 버전이다 */}
              <AxLatestVersion request={work.request} />

              <div className="mt-5 space-y-4">
                {work.request?.versions?.length > 0 && (
                  <div className="text-[12px] font-semibold text-muted-foreground">
                    아래는 처음 등록할 때의 내용입니다.
                  </div>
                )}
                <Detail label="작품 설명">{work.description}</Detail>
                {work.features && <Detail label="주요 기능">{work.features}</Detail>}
                {work.techStack && <Detail label="사용 AI · 기술 · 스택">{work.techStack}</Detail>}
                {work.expectedImpact && <Detail label="기대 효과">{work.expectedImpact}</Detail>}
              </div>

              {work.files?.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" /> 첨부 파일 ({work.files.length})
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {work.files.map((f: any, i: number) => (
                      <a
                        key={i}
                        href={f.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={f.file_name}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3.5 py-2.5 text-[13px] hover:border-primary/40 hover:bg-muted/50"
                      >
                        <span className="truncate font-medium">{f.file_name}</span>
                        <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const VERSION_KIND: Record<string, string> = { request: "고도화 신청", saas: "SaaS 승인 신청" };

/** 가장 최근에 올린 결과물 (없으면 아무것도 안 그린다) */
export function AxLatestVersion({ request }: { request: any }) {
  const list: any[] = request?.versions ?? [];
  const v = list[list.length - 1];
  if (!v) return null;
  return (
    <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <span className="text-[14px] font-black text-slate-900">최신 버전</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11.5px] font-bold text-blue-600">
          {VERSION_KIND[v.kind] ?? ""} · {formatDate(v.at)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11.5px] font-bold text-emerald-700">
          <ShieldCheck className="h-3 w-3" /> 셀프 보안점검 {v.securityScore}점
        </span>
      </div>
      {v.note && <p className="mt-2 whitespace-pre-wrap break-keep text-[13.5px] leading-relaxed text-slate-700">{v.note}</p>}
      <VersionLinks v={v} />
    </div>
  );
}

/** 결과물 파일·링크 버튼 */
export function VersionLinks({ v }: { v: any }) {
  if (!v.filePath && !v.link) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {v.filePath && (
        <a
          href={axFileUrl(v.filePath)}
          target="_blank"
          rel="noopener noreferrer"
          download={v.fileName}
          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:border-blue-300"
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{v.fileName ?? "첨부파일"}</span>
        </a>
      )}
      {v.link && (
        <a
          href={v.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-blue-600 hover:border-blue-300"
        >
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{v.link}</span>
        </a>
      )}
    </div>
  );
}

/** 단계별로 올린 결과물 이력 (최신이 위) */
export function AxVersionHistory({ request }: { request: any }) {
  const list: any[] = [...(request?.versions ?? [])].reverse();
  if (!list.length) return null;
  return (
    <div className="space-y-2">
      {list.map((v, i) => (
        <div key={i} className={`rounded-xl border p-3 ${i === 0 ? "border-blue-200 bg-blue-50/40" : "border-slate-200"}`}>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            {i === 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 font-black text-white">최신</span>}
            <span className="font-black text-slate-800">{VERSION_KIND[v.kind] ?? ""}</span>
            <span className="text-slate-400">{formatDate(v.at)}</span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-700">
              보안점검 {v.securityScore}점
            </span>
          </div>
          {v.note && <p className="mt-1.5 whitespace-pre-wrap break-keep text-[13px] leading-relaxed text-slate-600">{v.note}</p>}
          <VersionLinks v={v} />
        </div>
      ))}
    </div>
  );
}

export type AxWorksPick = {
  scope: "sil" | "team" | "all";
  name: string;
  filter: "all" | "stage1" | "stage2" | "stage3" | "requested" | "approved" | "target";
  title: string;
};

/** 상단 숫자 4개 — 누르면 그 숫자에 해당하는 작품 목록이 열린다. */
export const AX_STAT_PICKS: Record<"total" | "target" | "requested" | "approved", AxWorksPick> = {
  total: { scope: "all", name: "", filter: "all", title: "AX 작품" },
  target: { scope: "all", name: "", filter: "target", title: "고도화 대상 · 3단계" },
  requested: { scope: "all", name: "", filter: "requested", title: "고도화 신청 · 진행 중" },
  approved: { scope: "all", name: "", filter: "approved", title: "SaaS 승인" },
};

/** 숫자를 누르면 뜨는 작품 목록 → 작품을 누르면 상세 */
export function AxWorksListDialog({ pick, onClose }: { pick: AxWorksPick | null; onClose: () => void }) {
  const listByFn = useServerFn(axListWorksBy);
  const [detail, setDetail] = useState<any | null>(null);
  const { data: works = [], isFetching } = useQuery({
    queryKey: ["ax", "worksBy", pick?.scope, pick?.name, pick?.filter],
    queryFn: () => listByFn({ data: { scope: pick!.scope, name: pick!.name, filter: pick!.filter } }),
    enabled: !!pick,
  });

  return (
    <>
      <Dialog open={!!pick} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pick?.title} {!isFetching && `· ${works.length}건`}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
            {works.map((w: any) => (
              <AxWorkCard
                key={w.id}
                work={w}
                onClick={() => {
                  // 서비스 링크가 있는 SaaS 작품은 정보 대신 서비스로 바로 접속
                  const url = w.request?.serviceUrl;
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                  else { onClose(); setDetail(w); }
                }}
              />
            ))}
            {!isFetching && works.length === 0 && (
              <div className="col-span-full p-6 text-center text-sm text-muted-foreground">작품이 없습니다.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AxWorkDetailDialog work={detail} onClose={() => setDetail(null)} />
    </>
  );
}

/** 썸네일 카드 — 작품 목록 팝업/그리드 공용. */
export function AxWorkCard({ work, onClick }: { work: any; onClick?: () => void }) {
  return (
    <button type="button" className="text-left" onClick={onClick}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
        {work.thumbnailUrl ? (
          <img src={work.thumbnailUrl} alt={work.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-hyundai-gradient text-xs text-white/60">No thumbnail</div>
        )}
        <div className="absolute left-2 top-2">
          {work.stage ? (
            <span className={`rounded-full px-2 py-1 text-[11px] font-black shadow ${AX_STAGES[work.stage as 1].solid}`}>
              {AX_STAGES[work.stage as 1].label}
            </span>
          ) : (
            <span className="rounded-full bg-black/60 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">미분류</span>
          )}
        </div>
        {work.request?.serviceUrl ? (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-[11px] font-bold text-white shadow">
            바로가기 <ExternalLink className="h-3 w-3" />
          </div>
        ) : work.files?.length > 0 && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">
            <Paperclip className="h-3 w-3" /> {work.files.length}
          </div>
        )}
      </div>
      <div className="px-0.5 pt-2">
        <h4 className="line-clamp-2 text-[14px] font-bold leading-snug text-foreground">{work.title}</h4>
        <div className="mt-1 text-xs text-muted-foreground">
          {work.authorTeam} · {work.authorName} {work.authorPosition}
        </div>
        {work.request && (
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${AX_STATUS[work.request.status].tone}`}>
            {AX_STATUS[work.request.status].label}
          </span>
        )}
      </div>
    </button>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <p className="mt-0.5 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">{children || "—"}</p>
    </div>
  );
}
