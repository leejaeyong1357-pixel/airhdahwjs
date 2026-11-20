// 월드 종류에 따라 청크 만들기 — "normal": 시드로 만든 자연 지형, "evo": 에보 팀전 맵
import { generateChunk } from "./worldgen.js";
import { arenaChunk } from "./arena.js";

export function genChunk(cx, cz, seed, gen = "normal") {
  return gen === "evo" ? arenaChunk(cx, cz) : generateChunk(cx, cz, seed);
}
