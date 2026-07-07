import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";

interface Props {
  id: string;
  title: string;
  thumbnailUrl: string;
  author: { name: string; team: string; position: string };
  likeCount: number;
}

export function SubmissionCard({ id, title, thumbnailUrl, author, likeCount }: Props) {
  return (
    <Link
      to="/work/$id"
      params={{ id }}
      className="group block overflow-hidden rounded-xl bg-card transition hover:-translate-y-1"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
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
