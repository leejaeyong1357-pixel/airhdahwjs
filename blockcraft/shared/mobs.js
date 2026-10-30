// 몹 정의 — 서버(움직임 · 판정)와 브라우저(모양 · 맞히기)가 같이 쓴다.
// w: 몸 반폭, h: 키 (블록 단위), attitude: passive(도망) · neutral(맞으면 반격) · hostile(먼저 공격)
// 모양은 모두 이 게임만의 디자인 (public/render/models.js)
import { B } from "./blocks.js";
import { I } from "./items.js";

export const MOBS = [
  { key: "pig", name: "돼지", hp: 10, w: 0.45, h: 0.9, walk: 1.3, run: 3.4, attitude: "passive", xp: 2 },
  { key: "cow", name: "소", hp: 10, w: 0.45, h: 1.4, walk: 1.1, run: 3.0, attitude: "passive", xp: 2 },
  { key: "sheep", name: "양", hp: 8, w: 0.45, h: 1.3, walk: 1.1, run: 3.0, attitude: "passive", xp: 2 },
  { key: "chicken", name: "닭", hp: 4, w: 0.2, h: 0.7, walk: 1.0, run: 2.8, attitude: "passive", xp: 1 },
  { key: "zombie", name: "좀비", hp: 20, w: 0.3, h: 1.95, walk: 1.0, run: 2.6, attitude: "hostile", damage: 3, sight: 24, xp: 5 },
  // 폭탄몬 — 다가와서 심지에 불이 붙으면 터진다
  { key: "bomber", name: "폭탄몬", hp: 20, w: 0.32, h: 1.5, walk: 1.0, run: 2.7, attitude: "hostile", fuse: 1.5, sight: 16, xp: 5 },
  // 멧돼지 — 평소엔 얌전, 맞으면 들이받는다
  { key: "boar", name: "멧돼지", hp: 14, w: 0.45, h: 1.0, walk: 1.2, run: 3.6, attitude: "neutral", damage: 4, sight: 20, xp: 3 },
  // 해골 궁수 — 멀리서 화살을 쏜다
  { key: "archer", name: "해골 궁수", hp: 20, w: 0.3, h: 1.95, walk: 1.0, run: 2.4, attitude: "hostile", damage: 3, sight: 20, ranged: true, xp: 5 },
];
export const MOB = Object.fromEntries(MOBS.map((m, i) => [m.key.toUpperCase(), i]));

/** 양털 색 (양 extra 값 → 블록) */
export const SHEEP_WOOL = [B.WOOL_WHITE, B.WOOL_BLACK, B.WOOL_RED, B.WOOL_BLUE, B.WOOL_YELLOW, B.WOOL_GREEN];

/** 죽었을 때 떨어뜨리는 것 [[아이템, 개수]] */
export function mobDrops(type, extra, rnd = Math.random) {
  const n = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  switch (type) {
    case MOB.PIG: return [[I.RAW_PORK, n(1, 3)]];
    case MOB.COW: return [[I.RAW_BEEF, n(1, 3)], [I.LEATHER, n(0, 2)]];
    case MOB.SHEEP: return [[SHEEP_WOOL[extra] ?? B.WOOL_WHITE, 1]];
    case MOB.CHICKEN: return [[I.RAW_CHICKEN, 1], [I.FEATHER, n(0, 2)]];
    case MOB.ZOMBIE: return [[I.ROTTEN_FLESH, n(0, 2)]];
    case MOB.BOMBER: return [[I.GUNPOWDER, n(0, 2)]];
    case MOB.BOAR: return [[I.RAW_PORK, n(1, 3)], [I.LEATHER, n(0, 1)]];
    case MOB.ARCHER: return [[I.BONE, n(0, 2)], [I.ARROW, n(0, 2)]];
    default: return [];
  }
}
