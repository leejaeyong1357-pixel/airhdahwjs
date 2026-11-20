// 캐릭터 꾸미기 — 성별 · 옷 · 소매 · 머리 모양 · 머리색 (서버와 브라우저 공용)
export const LOOK_OPTIONS = {
  gender: [["m", "남자"], ["f", "여자"]],
  outfit: [["white", "흰 집업"], ["navy", "남색 작업복"], ["admin", "와이셔츠 · 검은 넥타이 (관리자)"]],
  sleeve: [["long", "긴팔"], ["short", "반팔"]],
  hair: {
    m: [["short", "짧은 머리"], ["part", "가르마"], ["buzz", "스포츠"]],
    f: [["bob", "단발"], ["long", "긴 머리"], ["pony", "묶은 머리"]],
  },
  hairColor: [["black", "검정", "#222024"], ["brown", "갈색", "#60402a"], ["light", "밝은 갈색", "#7e5836"], ["blond", "금발", "#c8a25a"]],
};

const pick = (list, v, d) => (list.some(([k]) => k === v) ? v : d);

/** 저장 · 전송된 값을 안전하게 — admin 옷은 관리자만 */
export function cleanLook(raw, admin = false) {
  const r = raw && typeof raw === "object" ? raw : {};
  const gender = pick(LOOK_OPTIONS.gender, r.gender, "m");
  let outfit = pick(LOOK_OPTIONS.outfit, r.outfit, admin ? "admin" : "white");
  if (outfit === "admin" && !admin) outfit = "white";
  return {
    gender, outfit,
    sleeve: pick(LOOK_OPTIONS.sleeve, r.sleeve, "long"),
    hair: pick(LOOK_OPTIONS.hair[gender], r.hair, LOOK_OPTIONS.hair[gender][0][0]),
    hairColor: pick(LOOK_OPTIONS.hairColor, r.hairColor, "black"),
  };
}

/** 아직 꾸미지 않은 계정 — 색 번호로 기본 모습을 정한다 */
export function defaultLook(hue = 0, admin = false) {
  const v = Math.abs(Math.round(hue));
  const gender = v % 2 ? "f" : "m";
  return cleanLook({
    gender, outfit: admin ? "admin" : v % 3 === 0 ? "navy" : "white", sleeve: "long",
    hair: LOOK_OPTIONS.hair[gender][Math.floor(v / 2) % 3][0], hairColor: LOOK_OPTIONS.hairColor[Math.floor(v / 6) % 3][0],
  }, admin);
}
