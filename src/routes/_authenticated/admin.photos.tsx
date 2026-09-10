import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { uploadSiteImage, SITE_IMAGE_SLOTS } from "@/lib/site-images.functions";
import { SiteImage, bumpSiteImageVersion } from "@/components/SiteImage";
import { Button } from "@/components/ui/button";

import heroDefault from "@/assets/ai-head-v2.png";
import axlabHeroDefault from "@/assets/ai-hero.png";
import prize1Default from "@/assets/prize-claude.jpg";
import prize2Default from "@/assets/prize-keyboard.jpg";
import prize3Default from "@/assets/prize-mouse.jpg";
import news1Default from "@/assets/article-vibe-coding.png";
import news2Default from "@/assets/article-jensen.png";
import news3Default from "@/assets/article-reading.png";
import news4Default from "@/assets/article-agent-table.png";
import news5Default from "@/assets/article-meta-glasses.png";
import video1Default from "@/assets/video-1.jpg";
import video2Default from "@/assets/video-2.jpg";
import video3Default from "@/assets/video-3.jpg";
import video4Default from "@/assets/video-4.jpg";
import video5Default from "@/assets/video-5.jpg";

export const Route = createFileRoute("/_authenticated/admin/photos")({
  component: PhotosPage,
});

const DEFAULTS: Record<string, string> = {
  hero: heroDefault,
  "axlab-hero": axlabHeroDefault,
  "prize-1": prize1Default,
  "prize-2": prize2Default,
  "prize-3": prize3Default,
  "news-1": news1Default,
  "news-2": news2Default,
  "news-3": news3Default,
  "news-4": news4Default,
  "news-5": news5Default,
  "video-1": video1Default,
  "video-2": video2Default,
  "video-3": video3Default,
  "video-4": video4Default,
  "video-5": video5Default,
};

function PhotosPage() {
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        사진을 업로드하면 사이트에 바로 반영됩니다. (재빌드·재시작 불필요)
      </p>
      <div className="mt-6 grid grid-cols-2 gap-5 md:grid-cols-3">
        {SITE_IMAGE_SLOTS.map(({ slot, label }) => (
          <PhotoSlot key={slot} slot={slot} label={label} />
        ))}
      </div>
    </div>
  );
}

function PhotoSlot({ slot, label }: { slot: string; label: string }) {
  const upload = useServerFn(uploadSiteImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await upload({ data: { slot, dataUrl } });
      bumpSiteImageVersion();
      toast.success(`${label} 교체 완료`);
    } catch (err: any) {
      toast.error(err.message ?? "업로드 실패");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-sm font-bold">{label}</div>
      <div className="mt-3 aspect-video w-full overflow-hidden rounded-lg bg-muted">
        <SiteImage slot={slot} fallback={DEFAULTS[slot]} alt={label} className="h-full w-full object-cover" />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="mt-3 w-full"
      >
        <Upload className="mr-2 h-4 w-4" />
        {busy ? "업로드 중…" : "사진 교체"}
      </Button>
    </div>
  );
}
