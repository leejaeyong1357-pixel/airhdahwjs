import { Fragment, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { axRequestSaasApproval } from "@/lib/ax-lab.functions";
import { AxSecurityGuideDialog } from "@/components/AxSecurityGuideDialog";
import { AxSaasCertificate, type SaasCertInfo } from "@/components/AxSaasCertificate";
import { AxVersionHistory } from "@/components/AxWorkDetailDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AX_PROGRESS_STEPS, AX_STATUS, SECURITY_PASS_SCORE, progressOf,
} from "@/lib/ax-stages";
import { uploadFile } from "@/lib/upload";
import { formatDate } from "@/lib/utils";
import {
  FileText, ArrowUpRight, Check, Clock, ShieldCheck, Award, AlertCircle, Paperclip,
  Upload, Users, ArrowRight,
} from "lucide-react";

type Me = { name: string; team: string; position: string; empNo: string };

/** 내 신청 현황 — 작품을 고르면 지금 몇 단계인지, 다음에 뭘 해야 하는지 보여준다. */
export function AxMyProgress({ works, me }: { works: any[]; me: Me }) {
  // 진행 중인 신청이 있는 작품을 먼저 보여준다
  const ordered = [...works].sort((a, b) => Number(!!b.request) - Number(!!a.request));
  const [selId, setSelId] = useState<string>("");
  useEffect(() => {
    if (!ordered.some((w) => w.id === selId)) setSelId(ordered[0]?.id ?? "");
  }, [ordered.map((w) => w.id).join(","), selId]);
  const w = ordered.find((x) => x.id === selId) ?? ordered[0] ?? null;
  const r = w?.request ?? null;
  const p = progressOf(r);

  const [security, setSecurity] = useState(false);
  const [saasOpen, setSaasOpen] = useState(false);
  const [history, setHistory] = useState(false);
  const [cert, setCert] = useState(false);

  const certInfo: SaasCertInfo | null = r?.saas?.number
    ? {
        number: r.saas.number, category: r.saas.category, issuedAt: r.saas.issuedAt,
        title: w.title, authorName: me.name, authorTeam: me.team,
        authorPosition: me.position, authorEmpNo: me.empNo,
      }
    : null;

  return (
    <section id="my-progress" className="rounded-2xl border border-[#e6eaf1] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[22px] font-black tracking-tight text-[#0f1f38]">내 신청 현황</h2>
        {ordered.length > 0 && (
          <select
            value={w?.id ?? ""}
            onChange={(e) => setSelId(e.target.value)}
            className="min-w-[240px] rounded-xl border border-[#e3e8f0] bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-700"
          >
            {ordered.map((x) => (
              <option key={x.id} value={x.id}>{x.title}</option>
            ))}
          </select>
        )}
      </div>

      {!w ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f5f8fc] px-5 py-5">
          <div className="text-[14px] text-slate-500">
            아직 등록된 작품이 없습니다. 새 작품을 등록하고 고도화를 신청해 보세요.
          </div>
          <Link
            to="/ax-lab/request"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[13.5px] font-bold text-white hover:bg-blue-700"
          >
            고도화 신청하기 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <>
          {/* 현재 단계 */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-[#f5f8fc] px-4 py-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white">
              <FileText className="h-[22px] w-[22px] text-blue-600" strokeWidth={1.7} />
            </span>
            <span className="rounded-full bg-[#e6effd] px-3 py-1 text-[13px] font-bold text-blue-600">현재 단계</span>
            <span className={`text-[22px] font-black tracking-tight ${r?.status === "rejected" ? "text-destructive" : "text-blue-600"}`}>
              {p.title}
            </span>
            <span className="hidden h-7 w-px bg-slate-300 md:block" />
            <span className="min-w-0 flex-1 break-keep text-[14px] text-slate-500">{p.desc}</span>
            {r && (
              <button
                onClick={() => setHistory(true)}
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl border-[1.5px] border-blue-500 bg-white px-4 py-2 text-[14px] font-bold text-blue-600 transition hover:bg-[#eef4ff]"
              >
                신청 내역 보기 <ArrowUpRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* 6단계 진행 표시 + 다음 할 일 */}
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-center">
            <Stepper step={p.step} done={p.done} />
            <div className="flex shrink-0 items-start gap-2.5 border-slate-200 lg:border-l lg:pl-6">
              <Clock className="mt-0.5 h-6 w-6 shrink-0 text-blue-600" strokeWidth={1.8} />
              <div className="text-[14px] leading-snug">
                <span className="font-black text-slate-900">다음 할 일: </span>
                <span className="break-keep text-slate-500">{p.next}</span>
              </div>
            </div>
          </div>

          {/* 반려 사유 */}
          {r?.rejectReason && (
            <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-center gap-1.5 text-[13px] font-black text-destructive">
                <AlertCircle className="h-4 w-4" />
                {r.rejectedFrom === "saasCancel" ? "SaaS 등록 취소 사유"
                  : r.rejectedFrom === "review" ? "SaaS 승인 반려 사유" : "고도화 신청 반려 사유"}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-keep text-[13.5px] leading-relaxed text-slate-700">
                {r.rejectReason}
              </p>
            </div>
          )}

          {/* AX협의체 지원방안 — 통보된 뒤에 보인다 */}
          {r?.plan?.text && r.notifiedAt && (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
              <div className="flex items-center gap-1.5 text-[13px] font-black text-sky-800">
                <Users className="h-4 w-4" /> AX협의체 고도화 지원방안
                <span className="font-semibold text-sky-700/70">· {formatDate(r.notifiedAt)} 안내</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-keep text-[13.5px] leading-relaxed text-slate-700">
                {r.plan.text}
              </p>
            </div>
          )}

          {/* 지금 할 수 있는 일 */}
          {p.action && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(p.action === "apply" || p.action === "saas" || p.action === "reapply") && (
                <button
                  onClick={() => setSecurity(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#dbe5f5] px-3.5 py-2 text-[13.5px] font-bold text-blue-600 transition hover:bg-[#eef4ff]"
                >
                  <ShieldCheck className="h-4 w-4" /> 셀프 보안점검 프롬프트
                </button>
              )}
              {(p.action === "apply" || p.action === "reapply") && (
                <Link
                  to="/ax-lab/request"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[13.5px] font-bold text-white hover:bg-blue-700"
                >
                  {p.action === "reapply" ? "보완해서 다시 신청" : "고도화 신청하기"} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              {p.action === "saas" && (
                <button
                  onClick={() => setSaasOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[13.5px] font-bold text-white hover:bg-blue-700"
                >
                  <Upload className="h-4 w-4" /> 최신 결과물 올리고 SaaS 승인 신청
                </button>
              )}
              {p.action === "cert" && certInfo && (
                <button
                  onClick={() => setCert(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3.5 py-2 text-[13.5px] font-bold text-emerald-700 transition hover:bg-emerald-50"
                >
                  <Award className="h-4 w-4" /> SaaS 인증서 보기
                </button>
              )}
            </div>
          )}
        </>
      )}

      <AxSecurityGuideDialog open={security} onOpenChange={setSecurity} />
      <AxSaasCertificate info={certInfo} open={cert} onOpenChange={setCert} />
      {r && <SaasApplyDialog request={r} title={w.title} open={saasOpen} onOpenChange={setSaasOpen} onSecurity={() => setSecurity(true)} />}
      {r && <HistoryDialog request={r} title={w.title} open={history} onOpenChange={setHistory} />}
    </section>
  );
}

/** 1~6 단계 진행 막대 */
function Stepper({ step, done }: { step: number; done: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 items-start overflow-x-auto pb-1 pt-7">
      {AX_PROGRESS_STEPS.map((label, i) => {
        const n = i + 1;
        const passed = done || n < step;
        const current = !done && n === step;
        return (
          <Fragment key={label}>
            <div className="relative flex w-[92px] shrink-0 flex-col items-center sm:w-[104px]">
              {current && (
                <span className="absolute -top-7 whitespace-nowrap rounded-full bg-blue-600 px-2.5 py-0.5 text-[11.5px] font-bold text-white">
                  현재 위치
                </span>
              )}
              <span
                className={`grid h-9 w-9 place-items-center rounded-full text-[14px] font-black ${
                  passed
                    ? "bg-blue-600 text-white"
                    : current
                      ? "border-[2.5px] border-blue-600 bg-white text-blue-600"
                      : "border-[1.5px] border-slate-300 bg-white text-slate-500"
                }`}
              >
                {passed ? <Check className="h-[18px] w-[18px]" strokeWidth={3} /> : n}
              </span>
              <span
                className={`mt-2.5 whitespace-nowrap text-[13px] ${
                  current ? "font-bold text-slate-900" : passed ? "text-slate-700" : "text-slate-500"
                }`}
              >
                {n}. {label}
              </span>
            </div>
            {n < AX_PROGRESS_STEPS.length && (
              <span
                className={`mt-[17px] h-0 min-w-[16px] flex-1 ${
                  done || n < step ? "border-t-2 border-blue-600" : "border-t-2 border-dotted border-slate-300"
                }`}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * SaaS 승인 신청 — 셀프 보안점검 점수와 최신 결과물을 받는다.
 * 매번 새로 올려야 해서, 처음 신청할 때 올린 옛날 결과물로는 승인 협의에 올라갈 수 없다.
 */
function SaasApplyDialog({ request, title, open, onOpenChange, onSecurity }: {
  request: any; title: string; open: boolean; onOpenChange: (v: boolean) => void; onSecurity: () => void;
}) {
  const qc = useQueryClient();
  const applyFn = useServerFn(axRequestSaasApproval);
  const [score, setScore] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePath, setFilePath] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScore(""); setNote(""); setLink(""); setFile(null); setFilePath("");
  }, [open]);

  const n = Number(score);
  const scoreOk = score !== "" && Number.isInteger(n) && n >= SECURITY_PASS_SCORE && n <= 100;
  const lowScore = score !== "" && Number.isFinite(n) && n < SECURITY_PASS_SCORE;

  const mut = useMutation({
    mutationFn: () =>
      applyFn({
        data: {
          requestId: request.id, securityScore: n, note: note.trim(), link: link.trim(),
          filePath: filePath || undefined, fileName: file?.name,
        },
      }),
    onSuccess: () => {
      toast.success("SaaS 승인을 신청했습니다. AX협의체가 보안 · 실효성을 검토합니다.");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["ax"] });
      qc.invalidateQueries({ queryKey: ["admin", "ax"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setUploading(true);
    try {
      setFilePath(`/media/ax-attachments/${await uploadFile("ax-attachments", f)}`);
    } catch (err: any) {
      toast.error(err?.message ?? "파일 업로드에 실패했습니다.");
      setFile(null);
      setFilePath("");
    } finally {
      setUploading(false);
    }
  }

  const canSubmit = scoreOk && note.trim() && (filePath || link.trim()) && !uploading && !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>SaaS 승인 신청</DialogTitle></DialogHeader>
        <div className="rounded-xl border border-slate-200 p-3.5">
          <div className="text-[15px] font-black text-slate-900">{title}</div>
          <div className="mt-0.5 text-[12.5px] text-slate-500">
            고도화를 마친 <b>최신 결과물</b>을 올려주세요. 승인 협의는 여기 올린 버전으로 진행합니다.
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-bold text-slate-700">
                셀프 보안점검 점수 <span className="text-destructive">*</span>
              </label>
              <button type="button" onClick={onSecurity} className="text-[12px] font-semibold text-blue-600">
                보안점검 프롬프트 열기
              </button>
            </div>
            <Input
              type="number" min={0} max={100} inputMode="numeric"
              value={score} onChange={(e) => setScore(e.target.value)}
              placeholder={`0 ~ 100 (${SECURITY_PASS_SCORE}점 이상)`} className="mt-1.5"
            />
            {lowScore && (
              <p className="mt-1.5 text-[12.5px] font-semibold text-destructive">
                {SECURITY_PASS_SCORE}점 미만입니다. 보완 후 다시 점검해 주세요.
              </p>
            )}
          </div>

          <div>
            <label className="text-[13px] font-bold text-slate-700">
              최신 결과물 <span className="text-destructive">*</span>
              <span className="ml-1 font-normal text-slate-400">파일 또는 링크 중 하나 이상</span>
            </label>
            <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-[13px] text-slate-500 hover:border-blue-300">
              <Paperclip className="h-4 w-4 shrink-0" />
              <span className="truncate">{uploading ? "업로드 중…" : file ? file.name : "최신 파일을 첨부하세요"}</span>
              <input type="file" className="hidden" onChange={onFile} />
            </label>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https:// (프로그램 · 문서 링크)" className="mt-2" />
          </div>

          <div>
            <label className="text-[13px] font-bold text-slate-700">
              고도화한 내용 <span className="text-destructive">*</span>
            </label>
            <Textarea
              rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5"
              placeholder="처음 신청 이후 무엇을 고치고 보완했는지 적어주세요."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button disabled={!canSubmit} onClick={() => mut.mutate()}>SaaS 승인 신청</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 신청 내역 — 신청 내용 · 지원방안 · 단계별로 올린 결과물 */
function HistoryDialog({ request: r, title, open, onOpenChange }: {
  request: any; title: string; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>신청 내역 — {title}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className={`rounded-full px-2.5 py-1 font-bold ${AX_STATUS[r.status]?.tone ?? ""}`}>
            {AX_STATUS[r.status]?.label ?? r.status}
          </span>
          {r.saas?.number && (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-black tabular-nums text-emerald-700">{r.saas.number}</span>
          )}
          <span className="text-slate-500">신청 {formatDate(r.createdAt)}</span>
        </div>

        {r.form && (
          <div className="space-y-3">
            <Item label="활용할 업무와 현재의 불편함">{r.form.painPoint}</Item>
            <Item label="고도화하고 싶은 내용">{r.form.improvementDetail}</Item>
            {r.form.neededSupport && <Item label="고도화에 필요한 지원">{r.form.neededSupport}</Item>}
          </div>
        )}

        {r.plan?.text && r.notifiedAt && (
          <Item label="AX협의체 고도화 지원방안">{r.plan.text}</Item>
        )}

        <div>
          <div className="mb-2 text-[12px] font-bold text-slate-500">단계별로 올린 결과물</div>
          {r.versions?.length ? (
            <AxVersionHistory request={r} />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-[13px] text-slate-400">
              아직 올린 결과물이 없습니다.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-bold text-slate-500">{label}</div>
      <p className="mt-0.5 whitespace-pre-wrap break-keep text-[14px] leading-relaxed text-slate-800">{children || "—"}</p>
    </div>
  );
}
