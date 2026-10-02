// 새 버전을 올리면 예전 청크 파일(assets/route-xxxx.js)이 사라진다.
// 그때 이미 열려 있던 탭이 화면을 이동하면 없어진 청크를 부르다가
// "Failed to fetch dynamically imported module" 로 죽는다.
// → 이 경우 한 번만 자동으로 새로고침해서 최신 번들을 받아오게 한다.

const KEY = "teczen-stale-reload-at";
/** 같은 오류로 무한 새로고침 되지 않도록 최소 간격을 둔다. */
const COOLDOWN_MS = 60_000;

export function isStaleBundleError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(msg);
}

/** 새로고침을 실제로 시도했으면 true (쿨다운 중이면 false). */
export function reloadForStaleBundle(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < COOLDOWN_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // 세션 스토리지를 못 쓰는 환경이어도 새로고침은 시도한다.
  }
  window.location.reload();
  return true;
}

/** 앱 시작 시 1회 호출 — 청크 로딩 실패를 잡아 자동 복구한다. */
export function installStaleBundleRecovery() {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    reloadForStaleBundle();
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (isStaleBundleError((e as PromiseRejectionEvent).reason)) reloadForStaleBundle();
  });
}
