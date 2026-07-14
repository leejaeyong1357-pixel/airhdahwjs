import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";

interface Props {
  id: string;
  title: string;
  thumbnailUrl: string;
  author: { name: string; team: string; position: string };
  likeCount: number;
  rank?: number; // 좋아요 순위 (1,2,3 이면 뱃지 표시)
}

const RANK_BADGE: Record<number, { emoji: string; label: string; ring: string }> = {
  1: { emoji: "🥇", label: "1위", ring: "ring-2 ring-amber-400" },
  2: { emoji: "🥈", label: "2위", ring: "ring-2 ring-slate-300" },
  3: { emoji: "🥉", label: "3위", ring: "ring-2 ring-orange-400" },
};

export function SubmissionCard({ id, title, thumbnailUrl, author, likeCount, rank }: Props) {
  const badge = rank ? RANK_BADGE[rank] : undefined;
  return (
    <Link
      to="/work/$id"
      params={{ id }}
      className="group block overflow-hidden rounded-xl bg-card transition hover:-translate-y-1"
    >
      <div className={`relative aspect-video w-full overflow-hidden rounded-xl bg-muted ${badge ? badge.ring : ""}`}>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-hyundai-gradient text-xs text-white/60">
            No thumbnail
          </div>
        )}
        {badge && (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-xs font-black text-white backdrop-blur">
            <span className="text-sm">{badge.emoji}</span> {badge.label}
          </div>
        )}
      </div>
      <div className="px-1 pt-3">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-foreground group-hover:text-primary transition-colors">
          {title}
        </h3>
        <div className="mt-2 text-xs text-muted-foreground">
          {author.team || "—"}
        </div>
        <div className="mt-0.5 text-xs font-semibold text-foreground/80">
          {author.name} <span className="font-normal text-muted-foreground">{author.position}</span>
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Heart className="h-3 w-3 fill-rose-500 text-rose-500" />
          <span className="font-semibold text-foreground">{likeCount}</span>
        </div>
      </div>
    </Link>
  );
}
