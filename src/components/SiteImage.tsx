import { useEffect, useState } from "react";

// 관리자 [사진 관리]에서 업로드한 이미지(/uploads/<슬롯>.png)가 있으면 그걸 쓰고,
// 없으면(404) 번들에 포함된 기본 이미지로 대체한다.

function currentVersion() {
  if (typeof window === "undefined") return "1";
  return localStorage.getItem("teczen-img-v") ?? "1";
}

export function bumpSiteImageVersion() {
  localStorage.setItem("teczen-img-v", String(Date.now()));
  window.dispatchEvent(new CustomEvent("teczen:img-version"));
}

export function SiteImage({
  slot,
  fallback,
  alt,
  className,
  style,
}: {
  slot: string;
  fallback: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(currentVersion);

  useEffect(() => {
    function onBump() {
      setFailed(false);
      setVersion(currentVersion());
    }
    window.addEventListener("teczen:img-version", onBump);
    return () => window.removeEventListener("teczen:img-version", onBump);
  }, []);

  return (
    <img
      src={failed ? fallback : `/uploads/${slot}.png?v=${version}`}
      onError={() => setFailed(true)}
      alt={alt}
      className={className}
      style={style}
    />
  );
}
