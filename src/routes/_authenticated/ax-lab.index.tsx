import { createFileRoute } from "@tanstack/react-router";
import { AxLabOverview } from "@/components/AxLabOverview";

export const Route = createFileRoute("/_authenticated/ax-lab/")({ component: AxLabPage });

function AxLabPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <AxLabOverview />
    </div>
  );
}
