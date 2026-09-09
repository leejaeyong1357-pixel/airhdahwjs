import { createFileRoute, Outlet } from "@tanstack/react-router";

// /ax-lab 은 레이아웃 전용(자식 라우트 통과) — 실제 화면은
// ax-lab.index.tsx(/ax-lab) 와 ax-lab.request.tsx(/ax-lab/request) 가 담당한다.
export const Route = createFileRoute("/_authenticated/ax-lab")({
  component: () => <Outlet />,
});
