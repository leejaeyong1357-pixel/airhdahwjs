import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AX_STAGES, AX_STATUS } from "@/lib/ax-stages";
import { Download, Paperclip } from "lucide-react";

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

              <div className="mt-5 space-y-4">
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
        {work.files?.length > 0 && (
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
