import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axGetMyWorks, axRegisterNewWork, axRequestAdvancement } from "@/lib/ax-lab.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AxSecurityGuideDialog } from "@/components/AxSecurityGuideDialog";
import { AX_AFTER_SUBMIT_STEPS, AX_STAGES, AX_STAGE_LIST, SECURITY_PASS_SCORE } from "@/lib/ax-stages";
import { uploadFile } from "@/lib/upload";
import { toast } from "sonner";
import {
  FileText, Sparkles, PlusCircle, ArrowRight, ArrowLeft, CheckCircle2, Paperclip,
  AlertTriangle, ExternalLink, Check, ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/ax-lab/request")({ component: AxRequestWizard });

const STAGE_LABEL: Record<number, { label: string; tone: string }> = Object.fromEntries(
  AX_STAGE_LIST.map((st) => [st, { label: AX_STAGES[st].label, tone: AX_STAGES[st].soft }]),
);

const IMPROVEMENT_TYPES = ["기능 보완", "업무 프로세스 연결", "사용성 개선", "보안 검토"];
const DATA_TYPES = ["개인정보", "회사 내부정보", "공개 데이터", "아직 미정"];

type Selected = { id: string; source: "contest" | "new"; title: string; description: string; stage: number | null };

function AxRequestWizard() {
  const qc = useQueryClient();
  const myWorksFn = useServerFn(axGetMyWorks);
  const registerFn = useServerFn(axRegisterNewWork);
  const submitFn = useServerFn(axRequestAdvancement);

  const { data: myWorks, refetch } = useQuery({ queryKey: ["ax", "myWorks"], queryFn: () => myWorksFn() });

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [selected, setSelected] = useState<Selected | null>(null);

  // 새로운 작품 등록 폼
  const [nwTitle, setNwTitle] = useState("");
  const [nwDesc, setNwDesc] = useState("");
  const [nwTech, setNwTech] = useState("");
  const [nwFeatures, setNwFeatures] = useState("");
  const [nwImpact, setNwImpact] = useState("");
  const [nwThumb, setNwThumb] = useState<{ name: string; path: string } | null>(null);
  async function onNewWorkThumb(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("대표 이미지는 이미지 파일만 올릴 수 있습니다.");
      return;
    }
    setNwUploading((n) => n + 1);
    try {
      setNwThumb({ name: f.name, path: `/media/ax-newworks/${await uploadFile("ax-newworks", f)}` });
    } catch (err: any) {
      toast.error(err?.message ?? "업로드에 실패했습니다.");
    } finally {
      setNwUploading((n) => n - 1);
    }
  }
  const [nwFiles, setNwFiles] = useState<{ name: string; path: string }[]>([]);
  const [nwUploading, setNwUploading] = useState(0);
  async function onNewWorkFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (nwFiles.length + picked.length > 10) {
      toast.error("첨부는 10개까지 올릴 수 있습니다.");
      return;
    }
    for (const f of picked) {
      setNwUploading((n) => n + 1);
      try {
        const rel = await uploadFile("ax-newworks", f);
        setNwFiles((list) => [...list, { name: f.name, path: `/media/ax-newworks/${rel}` }]);
      } catch (err: any) {
        toast.error(`${f.name}: ${err?.message ?? "업로드에 실패했습니다."}`);
      } finally {
        setNwUploading((n) => n - 1);
      }
    }
  }
  const registerMut = useMutation({
    mutationFn: () =>
      registerFn({
        data: {
          title: nwTitle, features: nwFeatures, description: nwDesc, techStack: nwTech, expectedImpact: nwImpact,
          thumbnail: nwThumb?.path, files: nwFiles,
        },
      }),
    onSuccess: async () => {
      toast.success("작품이 등록되었습니다.");
      const fresh = await refetch();
      const created = fresh.data?.newWorks.find((w: any) => w.title === nwTitle && !w.request);
      if (created) setSelected({ id: created.id, source: "new", title: created.title, description: created.description, stage: created.stage });
      setNwTitle(""); setNwDesc(""); setNwTech(""); setNwFiles([]);
      setNwFeatures(""); setNwImpact(""); setNwThumb(null);
      setTab("existing");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // 신청 내용 (2단계)
  const [painPoint, setPainPoint] = useState("");
  const [improvementTypes, setImprovementTypes] = useState<string[]>([]);
  const [improvementDetail, setImprovementDetail] = useState("");
  const [neededSupport, setNeededSupport] = useState("");
  const [expectedDone, setExpectedDone] = useState("");
  const [expectedUsers, setExpectedUsers] = useState("");
  const [expectedImpact, setExpectedImpact] = useState("");
  const [dataTypes, setDataTypes] = useState<string[]>([]);
  const [referenceLink, setReferenceLink] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPath, setAttachmentPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [consent, setConsent] = useState(false);
  // 셀프 보안점검 — 70점 이상이어야 신청할 수 있다
  const [score, setScore] = useState("");
  const [security, setSecurity] = useState(false);
  const scoreNum = Number(score);
  const scoreOk = score !== "" && Number.isInteger(scoreNum) && scoreNum >= SECURITY_PASS_SCORE && scoreNum <= 100;
  const scoreLow = score !== "" && Number.isFinite(scoreNum) && scoreNum < SECURITY_PASS_SCORE;

  // 작품 변경 시 임시 저장된 초안 불러오기
  useEffect(() => {
    if (!selected) return;
    try {
      const raw = localStorage.getItem(`ax-draft-${selected.id}`);
      if (!raw) return;
      const d = JSON.parse(raw);
      setPainPoint(d.painPoint ?? ""); setImprovementTypes(d.improvementTypes ?? []);
      setImprovementDetail(d.improvementDetail ?? ""); setNeededSupport(d.neededSupport ?? "");
      setExpectedDone(d.expectedDone ?? ""); setExpectedUsers(d.expectedUsers ?? "");
      setExpectedImpact(d.expectedImpact ?? ""); setDataTypes(d.dataTypes ?? []);
      setReferenceLink(d.referenceLink ?? "");
    } catch { /* ignore */ }
  }, [selected?.id]);

  function toggle(list: string[], setList: (v: string[]) => void, v: string) {
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  function saveDraft() {
    if (!selected) return;
    localStorage.setItem(`ax-draft-${selected.id}`, JSON.stringify({
      painPoint, improvementTypes, improvementDetail, neededSupport, expectedDone, expectedUsers, expectedImpact, dataTypes, referenceLink,
    }));
    toast.success("임시 저장되었습니다.");
  }

  async function onAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAttachment(f);
    setUploading(true);
    try {
      setAttachmentPath(`/media/ax-attachments/${await uploadFile("ax-attachments", f)}`);
    } catch (err: any) {
      toast.error(err?.message ?? "파일 업로드에 실패했습니다.");
      setAttachment(null);
      setAttachmentPath("");
    } finally {
      setUploading(false);
    }
  }

  const submitMut = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          workId: selected!.id, workSource: selected!.source,
          form: {
            painPoint, improvementTypes, improvementDetail, neededSupport, expectedDone, expectedUsers, expectedImpact, dataTypes, referenceLink,
            attachmentPath: attachmentPath || undefined, attachmentName: attachment?.name,
          },
          securityScore: scoreNum,
        },
      }),
    onSuccess: () => {
      if (selected) localStorage.removeItem(`ax-draft-${selected.id}`);
      qc.invalidateQueries({ queryKey: ["ax"] });
      setStep(3);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const eligibleWorks: Selected[] = [
    ...(myWorks?.contestWork && !myWorks.contestWork.request
      ? [{ id: myWorks.contestWork.id, source: "contest" as const, title: myWorks.contestWork.title, description: myWorks.contestWork.description, stage: myWorks.contestWork.stage }]
      : []),
    ...((myWorks?.newWorks ?? [])
      .filter((w: any) => !w.request)
      .map((w: any) => ({ id: w.id, source: "new" as const, title: w.title, description: w.description, stage: w.stage }))),
  ];

  const hasResult = !!attachmentPath || !!referenceLink.trim();
  const canSubmit = selected && painPoint.trim() && improvementDetail.trim() && improvementTypes.length > 0 && dataTypes.length > 0
    && scoreOk && hasResult && !uploading && consent && !submitMut.isPending;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-accent">
        <Sparkles className="h-4 w-4" /> AX LAB
      </div>
      <h1 className="mt-2 text-3xl font-black tracking-tight">고도화 신청서 작성</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">어떤 업무에 활용하고, 무엇을 개선하고 싶은지 알려주세요.</p>

      {/* 스텝 인디케이터 */}
      <div className="mt-6 flex items-center gap-3 text-[14px] font-bold">
        <StepDot n={1} label="작품 선택" state={step > 1 ? "done" : step === 1 ? "active" : "todo"} />
        <div className="h-px w-10 bg-border" />
        <StepDot n={2} label="신청 내용 작성" state={step > 2 ? "done" : step === 2 ? "active" : "todo"} />
        <div className="h-px w-10 bg-border" />
        <StepDot n={3} label="신청 완료" state={step === 3 ? "active" : "todo"} />
      </div>

      {step === 3 ? (
        <div className="mt-10 flex flex-col items-center rounded-3xl border border-emerald-200 bg-emerald-50/50 px-8 py-16 text-center">
          <CheckCircle2 className="h-14 w-14 text-emerald-500" />
          <div className="mt-4 text-2xl font-black text-foreground">고도화 신청이 접수되었습니다</div>
          <div className="mt-2 text-[15px] text-muted-foreground">
            {selected?.title} · {myWorks?.orgLabel} — AX 담당자 승인 후 지원방안을 메일로 안내드립니다.
          </div>
          <div className="mt-6 flex gap-3">
            <Button asChild><Link to="/ax-lab">AX LAB으로 돌아가기</Link></Button>
            <Button asChild variant="outline"><Link to="/ax-lab">내 신청 현황 보기</Link></Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            {step === 1 && (
              <>
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="text-[17px] font-black text-foreground">어떤 작품을 고도화할까요?</div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">경진대회에 등록한 내 작품을 불러왔습니다.</p>

                  <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                    <button type="button" onClick={() => setTab("existing")} className={`rounded-lg py-2 text-[13.5px] font-bold transition ${tab === "existing" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}>기존 작품 선택</button>
                    <button type="button" onClick={() => setTab("new")} className={`rounded-lg py-2 text-[13.5px] font-bold transition ${tab === "new" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}>+ 새로운 작품 등록</button>
                  </div>

                  {tab === "existing" ? (
                    <div className="mt-4 space-y-3">
                      {eligibleWorks.map((w) => {
                        const active = selected?.id === w.id;
                        return (
                          <button
                            key={w.id} type="button" onClick={() => setSelected(w)}
                            className={`flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
                          >
                            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border-2 ${active ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                              {active && <Check className="h-3.5 w-3.5 text-white" />}
                            </span>
                            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[15.5px] font-black text-foreground">{w.title}</span>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                                  {w.source === "contest" ? "경진대회 출품작" : "신규 등록"}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[12.5px] text-muted-foreground">{myWorks?.orgLabel} · {myWorks?.authorName}</div>
                              {w.description && <p className="mt-1 line-clamp-2 text-[13px] text-foreground/80">{w.description}</p>}
                              <div className="mt-2 flex items-center gap-2">
                                {w.stage ? (
                                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_LABEL[w.stage].tone}`}>{STAGE_LABEL[w.stage].label}</span>
                                ) : (
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">미분류</span>
                                )}
                                <span className="text-[11px] text-muted-foreground">AX협의체 분류</span>
                                {w.source === "contest" && (
                                  <Link to="/work/$id" params={{ id: w.id }} target="_blank" className="ml-auto inline-flex items-center gap-0.5 text-[12px] font-semibold text-primary">
                                    작품 상세보기 <ExternalLink className="h-3 w-3" />
                                  </Link>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}

                      <button type="button" onClick={() => setTab("new")} className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-border py-6 text-center hover:border-primary/40">
                        <PlusCircle className="h-6 w-6 text-primary" />
                        <span className="text-[14px] font-bold text-foreground">+ 새로운 작품 등록</span>
                        <span className="text-[12px] text-muted-foreground">경진대회 이후 만든 프로그램이나 새로운 아이디어도 신청할 수 있어요.</span>
                      </button>

                      {eligibleWorks.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
                          신청 가능한 작품이 없습니다. 이미 모든 작품을 신청했거나, 새 작품을 등록해 보세요.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <p className="text-[12.5px] text-muted-foreground">
                        경진대회 제출 양식과 같습니다. 등록하면 아래 <b>모두의 AI 작품</b>에도 함께 보이고, 바로 3단계(고도화)로 분류됩니다.
                      </p>
                      <NwField label="1. 제목">
                        <Input placeholder="작품 제목을 입력하세요" maxLength={120} value={nwTitle} onChange={(e) => setNwTitle(e.target.value)} />
                      </NwField>
                      <NwField label="2. 주요 기능">
                        <Textarea placeholder="핵심 기능을 요약해 주세요" rows={3} maxLength={2000} value={nwFeatures} onChange={(e) => setNwFeatures(e.target.value)} />
                      </NwField>
                      <NwField label="3. 설명">
                        <Textarea placeholder="작품에 대한 자세한 설명" rows={4} maxLength={5000} value={nwDesc} onChange={(e) => setNwDesc(e.target.value)} />
                      </NwField>
                      <NwField label="4. 사용한 AI · 기술 · 스택 · 알고리즘 · 아키텍처">
                        <Textarea placeholder="예: OpenAI GPT-5, LangChain, React, PostgreSQL, Vector DB..." rows={2} maxLength={2000} value={nwTech} onChange={(e) => setNwTech(e.target.value)} />
                      </NwField>
                      <NwField label="5. 기대 효과">
                        <Textarea placeholder="업무·조직·비즈니스에 기대되는 효과" rows={2} maxLength={2000} value={nwImpact} onChange={(e) => setNwImpact(e.target.value)} />
                      </NwField>
                      <NwField label="6. 대표 이미지 (썸네일 · 선택)">
                        <label className="flex aspect-[16/6] cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 text-center text-[13px] text-muted-foreground hover:border-primary/40">
                          {nwThumb ? (
                            <img src={nwThumb.path} alt="대표 이미지" className="h-full w-full object-cover" />
                          ) : (
                            <span>클릭하여 대표 이미지를 올리세요</span>
                          )}
                          <input type="file" accept="image/*" className="hidden" onChange={onNewWorkThumb} />
                        </label>
                      </NwField>
                      <div>
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-center text-[13px] text-muted-foreground hover:border-primary/40">
                          <Paperclip className="h-4 w-4 shrink-0" />
                          {nwUploading > 0 ? "업로드 중…" : "7. 첨부 파일 (선택 · 여러 개 가능)"}
                          <input type="file" multiple className="hidden" onChange={onNewWorkFiles} />
                        </label>
                        {nwFiles.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {nwFiles.map((f, i) => (
                              <li key={f.path} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-[12.5px]">
                                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                                <button
                                  type="button"
                                  onClick={() => setNwFiles((list) => list.filter((_, j) => j !== i))}
                                  className="shrink-0 text-[12px] font-semibold text-muted-foreground hover:text-destructive"
                                >
                                  삭제
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <Button
                        className="w-full"
                        disabled={
                          !nwTitle.trim() || !nwFeatures.trim() || !nwDesc.trim() || !nwTech.trim() || !nwImpact.trim()
                          || nwUploading > 0 || registerMut.isPending
                        }
                        onClick={() => registerMut.mutate()}
                      >
                        등록하고 계속하기
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-2xl border border-border bg-card p-5">
                  <div className="text-[14px] font-black text-foreground">신청 전에 확인해 주세요</div>
                  <ul className="mt-2 space-y-1.5 text-[13.5px] text-foreground/85">
                    <li className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> 셀프 보안점검 {SECURITY_PASS_SCORE}점 이상이어야 신청할 수 있습니다. 미만이면 보완 후 다시 점검하세요.</li>
                    <li className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> 신청 후 AX협의체가 고도화 방향을 함께 검토합니다.</li>
                    <li className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> 고도화 대상(3단계) 작품도 보안검증과 최종 승인을 거쳐 등록됩니다.</li>
                  </ul>
                </div>
              </>
            )}

            {step === 2 && selected && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="text-[15.5px] font-black text-foreground">{selected.title}</div>
                      <div className="text-[12px] text-muted-foreground">{selected.source === "contest" ? "경진대회 출품작" : "신규 등록"} · {myWorks?.orgLabel}</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => setStep(1)} className="text-[13px] font-semibold text-primary">작품 변경</button>
                </div>

                <div className="mt-5 space-y-6">
                  <Field n={1} label="활용할 업무와 현재의 불편함" required>
                    <Textarea rows={3} maxLength={500} value={painPoint} onChange={(e) => setPainPoint(e.target.value)} placeholder="예: 매일 생산 실적을 엑셀로 취합하고 있습니다. 반복 작업에 시간이 많이 걸립니다." />
                    <CharCount v={painPoint} />
                  </Field>

                  <Field n={2} label="고도화하고 싶은 내용" required>
                    <div className="flex flex-wrap gap-2">
                      {IMPROVEMENT_TYPES.map((t) => (
                        <Chip key={t} active={improvementTypes.includes(t)} onClick={() => toggle(improvementTypes, setImprovementTypes, t)}>{t}</Chip>
                      ))}
                    </div>
                    <Textarea className="mt-2" rows={3} maxLength={500} value={improvementDetail} onChange={(e) => setImprovementDetail(e.target.value)} placeholder="구체적으로 어떤 기능/개선이 필요한지 적어주세요." />
                    <CharCount v={improvementDetail} />
                  </Field>

                  <Field n={3} label="고도화에 필요한 지원" hint="고도화는 작품을 만든 본인이 진행합니다. 진행하면서 필요한 것이 있으면 적어주세요.">
                    <Textarea rows={3} maxLength={500} value={neededSupport} onChange={(e) => setNeededSupport(e.target.value)} placeholder="예: 사내 데이터 접근 권한, API 사용료, 서버·계정, 교육, AX협의체 기술 자문 등" />
                    <CharCount v={neededSupport} />
                  </Field>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field n={4} label="사용 예정 조직" required>
                      <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-[14px] text-foreground/80">{myWorks?.orgLabel}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">기존 조직 정보가 자동 반영됩니다.</div>
                    </Field>
                    <Field n={5} label="예상 사용자 수">
                      <Input value={expectedUsers} onChange={(e) => setExpectedUsers(e.target.value)} placeholder="예: 10명" />
                    </Field>
                  </div>

                  <Field n={6} label="예상 개발 완료 기간" hint="고도화를 언제쯤 마칠 수 있을지 적어주세요.">
                    <Input value={expectedDone} onChange={(e) => setExpectedDone(e.target.value)} placeholder="예: 2026년 11월 말 / 약 2개월" />
                  </Field>

                  <Field n={7} label="기대 효과">
                    <Textarea rows={2} maxLength={500} value={expectedImpact} onChange={(e) => setExpectedImpact(e.target.value)} placeholder="예: 작성 시간을 줄이고, 입력 오류를 예방합니다." />
                    <CharCount v={expectedImpact} />
                  </Field>

                  <Field n={8} label="사용 데이터" required hint="해당하는 항목을 모두 선택해 주세요.">
                    <div className="flex flex-wrap gap-2">
                      {DATA_TYPES.map((t) => (
                        <Chip key={t} active={dataTypes.includes(t)} onClick={() => toggle(dataTypes, setDataTypes, t)}>{t}</Chip>
                      ))}
                    </div>
                    {(dataTypes.includes("개인정보") || dataTypes.includes("회사 내부정보")) && (
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> 내부정보를 사용하는 작품은 보안검증에서 데이터 처리 방식을 확인합니다.
                      </div>
                    )}
                  </Field>

                  <Field n={9} label="최신 결과물" required hint="지금 버전을 링크 또는 파일로 올려주세요. (둘 중 하나 이상)">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input value={referenceLink} onChange={(e) => setReferenceLink(e.target.value)} placeholder="https:// (프로그램 · 문서 링크)" />
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-center text-[12.5px] text-muted-foreground hover:border-primary/40">
                        <Paperclip className="h-4 w-4 shrink-0" />
                        <span className="truncate">{uploading ? "업로드 중…" : attachment ? attachment.name : "최신 파일을 클릭하여 첨부하세요."}</span>
                        <input type="file" className="hidden" onChange={onAttachmentChange} />
                      </label>
                    </div>
                  </Field>

                  <Field n={10} label="셀프 보안점검 점수" required hint={`${SECURITY_PASS_SCORE}점 이상이어야 신청할 수 있습니다.`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="number" min={0} max={100} inputMode="numeric"
                        value={score} onChange={(e) => setScore(e.target.value)}
                        placeholder="0 ~ 100" className="w-40"
                      />
                      <Button type="button" variant="outline" onClick={() => setSecurity(true)}>
                        <ShieldCheck className="mr-1.5 h-4 w-4" /> 보안점검 프롬프트 열기
                      </Button>
                    </div>
                    {scoreLow && (
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12.5px] font-semibold text-destructive">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        {SECURITY_PASS_SCORE}점 미만입니다. 보완해서 다시 점검한 뒤 신청해 주세요.
                      </div>
                    )}
                  </Field>
                </div>
              </div>
            )}
          </div>

          {/* 우측 패널 */}
          <div className="space-y-4 lg:sticky lg:top-4 h-fit">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="text-[14px] font-black text-foreground">{step === 1 ? "신청 요약" : "신청 정보"}</div>
                {selected && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">선택한 작품 1건</span>}
              </div>
              <dl className="mt-3 space-y-2 text-[13.5px]">
                <Row label="작품명">{selected?.title ?? "—"}</Row>
                <Row label="신청자">{myWorks?.authorName ?? "—"}</Row>
                <Row label="소속">{myWorks?.orgLabel ?? "—"}</Row>
              </dl>

              {step === 1 ? (
                <>
                  <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2.5 text-[12.5px] text-muted-foreground">
                    다음 단계에서 활용 목적과 보완하고 싶은 내용을 작성합니다.
                  </div>
                  <Button className="mt-3 w-full" disabled={!selected} onClick={() => setStep(2)}>
                    신청 내용 작성하기 <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                  <div className="mt-1 text-center text-[11px] text-muted-foreground">현재 단계에서는 신청이 제출되지 않습니다.</div>
                </>
              ) : (
                <>
                  <div className="mt-3 space-y-1.5">
                    <span className="inline-block rounded-full bg-primary/10 px-2.5 py-1 text-[11.5px] font-bold text-primary">접수 후 다음 단계 · 신청 승인</span>
                    <p className="text-[12.5px] leading-relaxed text-muted-foreground">AX 담당자가 승인하면 AX협의체가 고도화 지원방안을 세워 메일로 안내합니다.</p>
                  </div>
                  <label className="mt-3 flex items-start gap-2 text-[12.5px] text-foreground/85">
                    <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} className="mt-0.5" />
                    신청 내용과 자료를 AX협의체 검토에 제공하는 데 동의합니다.
                  </label>
                  <Button className="mt-3 w-full" disabled={!canSubmit} onClick={() => submitMut.mutate()}>
                    고도화 신청 제출하기
                  </Button>
                  <div className="mt-2 flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setStep(1)}><ArrowLeft className="mr-1 h-3.5 w-3.5" /> 이전</Button>
                    <Button variant="outline" className="flex-1" onClick={saveDraft}>임시 저장</Button>
                  </div>
                  <div className="mt-1 text-center text-[11px] text-muted-foreground">제출 후 내 신청 현황에서 진행 상황을 확인할 수 있습니다.</div>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="text-[14px] font-black text-foreground">{step === 1 ? "신청 후 진행 과정" : "신청 후 이렇게 진행돼요"}</div>
              <ol className="mt-3 space-y-3">
                {AX_AFTER_SUBMIT_STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-2.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[12px] font-black text-primary">{i + 1}</span>
                    <div>
                      <div className="text-[13px] font-bold text-foreground">{s.title}</div>
                      <div className="text-[12px] leading-relaxed text-muted-foreground">{s.desc}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
      <AxSecurityGuideDialog open={security} onOpenChange={setSecurity} />
    </div>
  );
}

function NwField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-bold text-foreground">{label}</div>
      {children}
    </div>
  );
}

function StepDot({ n, label, state }: { n: number; label: string; state: "done" | "active" | "todo" }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`grid h-7 w-7 place-items-center rounded-full text-[13px] font-black ${
        state === "done" ? "bg-primary text-white" : state === "active" ? "bg-primary/10 text-primary ring-2 ring-primary" : "bg-muted text-muted-foreground"
      }`}>
        {state === "done" ? <Check className="h-4 w-4" /> : n}
      </span>
      <span className={state === "todo" ? "text-muted-foreground" : "text-foreground"}>{label}</span>
    </div>
  );
}

function Field({ n, label, required, hint, children }: { n: number; label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-1.5">
        <span className="text-[14.5px] font-black text-foreground">{n}. {label}</span>
        {required && <span className="text-[13px] font-bold text-destructive">*</span>}
        {hint && <span className="text-[12px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function CharCount({ v }: { v: string }) {
  return <div className="mt-1 text-right text-[11px] text-muted-foreground">{v.length} / 500</div>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-[13px] font-bold transition ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
    >
      <span className={`grid h-4 w-4 place-items-center rounded border-2 ${active ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
        {active && <Check className="h-3 w-3 text-white" />}
      </span>
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-foreground">{children}</dd>
    </div>
  );
}
