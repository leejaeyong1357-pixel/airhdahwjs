import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Check } from "lucide-react";

const HIDE_KEY = "teczen-ax-intro-hide-until";

/** 처음 들어온 사람에게 이 사이트가 무엇을 하는 곳인지 알려주는 안내 팝업. */
export function AxIntroPopup() {
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    let hidden = false;
    try {
      const until = Number(localStorage.getItem(HIDE_KEY) ?? 0);
      hidden = Date.now() < until;
    } catch { /* 저장소를 못 써도 안내는 띄운다 */ }
    if (hidden) return;
    const t = setTimeout(() => setOpen(true), 500);
    return () => clearTimeout(t);
  }, []);

  function close() {
    if (dontShow) {
      const next = new Date();
      next.setHours(24, 0, 0, 0);
      try { localStorage.setItem(HIDE_KEY, String(next.getTime())); } catch { /* ignore */ }
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto p-0">
        <div className="bg-[linear-gradient(120deg,#f4f8ff_0%,#eaf1fd_100%)] px-8 pb-7 pt-9">
          <div className="text-[12px] font-black uppercase tracking-[0.22em] text-blue-600">AX LAB</div>
          <h2 className="mt-2.5 text-[27px] font-black leading-tight tracking-tight text-[#12315c]">
            104개의 아이디어,
            <br />실제 <span className="text-blue-600">업무의 변화로</span>
          </h2>
        </div>

        <div className="space-y-4 px-8 py-7">
          <p className="break-keep text-[15px] leading-relaxed text-slate-700">
            여러분들의 <b className="text-slate-900">104개 혁신과제</b>를 검토해 보니,
            바로 적용 가능한 것도 있고 <b className="text-slate-900">보안 문제·서버 문제</b>로
            고도화 및 보완이 필요한 부분들이 있었습니다.
          </p>
          <p className="break-keep text-[15px] leading-relaxed text-slate-700">
            여러분들이 만든 것을 <b className="text-slate-900">직접 고도화 신청</b>해 주시면,
            그에 필요한 것들은 <b className="text-slate-900">같이 고민하고 지원</b>해 드리려고 합니다.
          </p>

          <ul className="space-y-2 rounded-xl bg-[#f7f9fc] px-5 py-4">
            {[
              "고도화 신청 → AX협의체가 실효성을 검토합니다.",
              "고도화는 작품을 만든 본인이 진행합니다.",
              "필요한 지원은 신청서에 적어주시면 함께 검토합니다.",
              "보안검증 · SaaS 승인을 거쳐 전사로 확산합니다.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 break-keep text-[13.5px] font-medium text-slate-600">
                <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-blue-600">
                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                </span>
                {t}
              </li>
            ))}
          </ul>

          <Link
            to="/ax-lab/request"
            onClick={close}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-[15px] font-bold text-white transition hover:bg-blue-700"
          >
            내 작품 고도화 신청하기 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="flex items-center justify-between border-t border-[#eef1f6] bg-[#fbfcfe] px-8 py-3.5">
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-500">
            <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(!!v)} />
            오늘 하루 열지 않기
          </label>
          <button onClick={close} className="rounded-lg px-4 py-2 text-[13px] font-bold text-slate-500 hover:bg-slate-100">
            닫기
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
