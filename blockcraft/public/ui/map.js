// 지도 (M) — 위에서 내려다본 월드 + 리스폰 지점 · 내 위치 · 다른 사람
// 불러온 청크는 실제 블록으로, 아직 안 불러온 곳은 같은 시드로 지형을 만들어서 그린다 (가운데부터 조금씩).
import { BLOCKS, AIR, B } from "/shared/blocks.js";
import { generateChunk, index, CHUNK, HEIGHT, SEA } from "/shared/worldgen.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ZOOMS = [0.5, 1, 2, 3, 4, 6, 8];
const GEN_BUDGET_MS = 14; // 한 프레임에 지형 만들기에 쓰는 시간

export class WorldMap {
  /** get: () => ({ me: {x, z, yaw}, spawn: [x, y, z], others: [{name, x, z, color, dead}], dead }) */
  constructor(world, atlas, get) {
    this.world = world;
    this.get = get;
    this.tiles = new Map();   // "cx,cz" → { canvas, real }
    this.seed = null;
    this.zoom = 2;            // 1 블록 = zoom 픽셀
    this.cx = 0; this.cz = 0; // 화면 가운데 (블록 좌표)
    this.follow = true;
    this.open = false;
    this.colors = blockColors(atlas);
    this.canvas = $("mapCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.bind();
  }

  bind() {
    const c = this.canvas;
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const i = ZOOMS.indexOf(this.zoom);
      this.zoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + (e.deltaY < 0 ? 1 : -1)))];
    }, { passive: false });
    let drag = null;
    c.addEventListener("mousedown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz }; });
    window.addEventListener("mousemove", (e) => {
      if (!drag || !this.open) return;
      const k = (this.canvas.width / this.canvas.clientWidth) / this.zoom;
      this.cx = drag.cx - (e.clientX - drag.x) * k;
      this.cz = drag.cz - (e.clientY - drag.y) * k;
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) this.follow = false;
    });
    window.addEventListener("mouseup", () => { drag = null; });
    $("mapMe").onclick = () => { this.follow = true; };
    $("mapSpawn").onclick = () => { const s = this.get().spawn; this.follow = false; this.cx = s[0]; this.cz = s[2]; };
  }

  show(focusSpawn = false) {
    if (this.world.seed !== this.seed) { this.tiles.clear(); this.seed = this.world.seed; }
    // 불러온 청크는 바뀌었을 수 있으니 다시 그린다
    for (const [k, t] of this.tiles) if (t.real) this.tiles.delete(k);
    const s = this.get();
    this.follow = !focusSpawn;
    if (focusSpawn) { this.cx = s.spawn[0]; this.cz = s.spawn[2]; }
    this.open = true;
    $("mapScreen").classList.remove("hidden");
    this.resize();
  }
  hide() { this.open = false; $("mapScreen").classList.add("hidden"); }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(200, Math.round(r.width)), h = Math.max(200, Math.round(r.height));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  /** 청크 하나를 16x16 그림으로 */
  tile(cx, cz, allowGen) {
    const k = `${cx},${cz}`;
    const have = this.tiles.get(k);
    const live = this.world.chunks.get(k);
    if (have && (have.real || !live)) return have;
    let data;
    if (live) data = live.data;
    else {
      if (!allowGen) return have ?? null;
      data = generateChunk(cx, cz, this.world.seed);
      const edits = this.world.editsByChunk.get(k);
      if (edits) for (const [pos, b] of edits) { const [x, y, z] = pos.split(",").map(Number); data[index(x - cx * CHUNK, y, z - cz * CHUNK)] = b; }
    }
    const canvas = have?.canvas ?? Object.assign(document.createElement("canvas"), { width: CHUNK, height: CHUNK });
    const g = canvas.getContext("2d");
    const img = g.createImageData(CHUNK, CHUNK);
    const tops = new Int16Array(CHUNK * CHUNK);
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      let y = HEIGHT - 1, b = AIR, water = 0;
      for (; y > 0; y--) {
        b = data[index(x, y, z)];
        if (b === AIR) continue;
        const kind = BLOCKS[b]?.kind;
        if (kind === "plant" || kind === "torch") continue;
        if (b === B.WATER) { water++; continue; }
        break;
      }
      tops[z * CHUNK + x] = y + water;
      let [r, gg, bb] = this.colors[b] ?? [120, 120, 120];
      if (water) { // 물 — 깊을수록 진하게
        const t = Math.min(0.92, 0.55 + water * 0.05);
        r = r * (1 - t) + 40 * t; gg = gg * (1 - t) + 92 * t; bb = bb * (1 - t) + 200 * t;
      }
      const p = (z * CHUNK + x) * 4;
      img.data[p] = r; img.data[p + 1] = gg; img.data[p + 2] = bb; img.data[p + 3] = 255;
    }
    // 북쪽(위)보다 높으면 밝게, 낮으면 어둡게 — 높낮이가 보이게
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const h = tops[z * CHUNK + x], n = z > 0 ? tops[(z - 1) * CHUNK + x] : h;
      const f = h > n ? 1.12 : h < n ? 0.86 : 1;
      const lift = 0.85 + Math.max(-0.15, Math.min(0.2, (h - SEA) / 160));
      const p = (z * CHUNK + x) * 4;
      for (let i = 0; i < 3; i++) img.data[p + i] = Math.min(255, img.data[p + i] * f * lift);
    }
    g.putImageData(img, 0, 0);
    const t = { canvas, real: !!live };
    this.tiles.set(k, t);
    return t;
  }

  draw() {
    if (!this.open) return;
    this.resize();
    const s = this.get();
    if (this.follow) { this.cx = s.me.x; this.cz = s.me.z; }
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height, Z = this.zoom;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0d1626";
    ctx.fillRect(0, 0, W, H);
    const sx = (x) => W / 2 + (x - this.cx) * Z, sy = (z) => H / 2 + (z - this.cz) * Z;
    // 보이는 청크 — 가운데에서 가까운 순서로 만든다
    const c0 = Math.floor((this.cx - W / 2 / Z) / CHUNK), c1 = Math.floor((this.cx + W / 2 / Z) / CHUNK);
    const r0 = Math.floor((this.cz - H / 2 / Z) / CHUNK), r1 = Math.floor((this.cz + H / 2 / Z) / CHUNK);
    const mcx = Math.floor(this.cx / CHUNK), mcz = Math.floor(this.cz / CHUNK);
    const list = [];
    for (let cz = r0; cz <= r1; cz++) for (let cx = c0; cx <= c1; cx++) list.push([cx, cz, (cx - mcx) ** 2 + (cz - mcz) ** 2]);
    list.sort((a, b) => a[2] - b[2]);
    const until = performance.now() + GEN_BUDGET_MS;
    let missing = 0;
    for (const [cx, cz] of list) {
      const t = this.tile(cx, cz, performance.now() < until);
      if (t) ctx.drawImage(t.canvas, sx(cx * CHUNK), sy(cz * CHUNK), CHUNK * Z + 0.5, CHUNK * Z + 0.5);
      else missing++;
    }
    // 격자 (64칸마다)
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil((this.cx - W / 2 / Z) / 64) * 64; x < this.cx + W / 2 / Z; x += 64) { ctx.moveTo(sx(x) + 0.5, 0); ctx.lineTo(sx(x) + 0.5, H); }
    for (let z = Math.ceil((this.cz - H / 2 / Z) / 64) * 64; z < this.cz + H / 2 / Z; z += 64) { ctx.moveTo(0, sy(z) + 0.5); ctx.lineTo(W, sy(z) + 0.5); }
    ctx.stroke();

    const now = performance.now() / 1000;
    // 리스폰 지점 — 깜빡이는 원 + 깃발
    const [spx, , spz] = s.spawn;
    const px = sx(spx), py = sy(spz);
    const pulse = (now * 0.8) % 1;
    ctx.strokeStyle = `rgba(255,70,70,${1 - pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 10 + pulse * 26, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(255,60,60,.25)";
    ctx.beginPath(); ctx.arc(px, py, Math.max(8, 8 * Z), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ff4040"; ctx.lineWidth = 2;
    ctx.stroke();
    // 깃발
    ctx.fillStyle = "#fff";
    ctx.fillRect(px - 1, py - 26, 2, 26);
    ctx.fillStyle = "#ff3b3b";
    ctx.beginPath(); ctx.moveTo(px + 1, py - 26); ctx.lineTo(px + 17, py - 21); ctx.lineTo(px + 1, py - 15); ctx.fill();
    label(ctx, "리스폰", px, py + 22, "#ff6b6b");

    // 다른 사람
    for (const o of s.others) {
      if (o.dead) continue;
      const ox = sx(o.x), oy = sy(o.z);
      ctx.fillStyle = `hsl(${o.color}, 80%, 60%)`;
      ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      label(ctx, o.name, ox, oy - 10, "#fff");
    }
    // 나 — 보는 방향 화살표
    const mx = sx(s.me.x), my = sy(s.me.z);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(-s.me.yaw);
    ctx.fillStyle = s.dead ? "#888" : "#fff";
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    label(ctx, s.dead ? "나 (죽음)" : "나", mx, my + 22, "#fff");

    // 화면 밖이면 리스폰 방향 표시
    if (px < 0 || py < 0 || px > W || py > H) {
      const a = Math.atan2(py - H / 2, px - W / 2);
      const ex = W / 2 + Math.cos(a) * (W / 2 - 24), ey = H / 2 + Math.sin(a) * (H / 2 - 24);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
      ctx.fillStyle = "#ff3b3b";
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.fill();
      ctx.restore();
    }
    // 아래 정보
    const dist = Math.round(Math.hypot(spx - s.me.x, spz - s.me.z));
    $("mapInfo").innerHTML = `내 위치 <b>${Math.floor(s.me.x)}, ${Math.floor(s.me.z)}</b> · 리스폰 <b>${Math.floor(spx)}, ${Math.floor(spz)}</b> · 리스폰까지 <b>${dist}칸</b> ${dirText(spx - s.me.x, spz - s.me.z)}`
      + ` · 확대 ${Z}×${missing ? ` · <small>지도 그리는 중...</small>` : ""}`;
  }
}

function label(ctx, text, x, y, color) {
  ctx.font = "bold 13px 'Malgun Gothic', sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
function dirText(dx, dz) {
  if (Math.hypot(dx, dz) < 3) return "(바로 여기)";
  const a = (Math.atan2(dx, -dz) * 180) / Math.PI; // 0 = 북(위)
  const names = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return `(${names[((Math.round(a / 45) % 8) + 8) % 8]}쪽)`;
}

/** 블록 윗면 색 — 텍스처 평균 */
function blockColors(atlas) {
  const g = atlas.canvas.getContext("2d");
  const out = [];
  for (const b of BLOCKS) {
    if (!b) continue;
    const [x, y, w, h] = atlas.rect(b.tex[0]);
    const d = g.getImageData(x, y, w, h).data;
    let r = 0, gg = 0, bb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
    out[b.id] = n ? [r / n, gg / n, bb / n] : [120, 120, 120];
  }
  out[B.WATER] = [50, 90, 200];
  return out;
}
