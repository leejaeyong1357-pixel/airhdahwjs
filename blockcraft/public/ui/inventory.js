// 인벤토리 화면 — E · Tab: 내 모습 + 2x2 조합 / 작업대 3x3 / 화로 / 크리에이티브 아이템 목록
import * as THREE from "../vendor/three.module.min.js";
import { ITEMS, maxStack } from "/shared/items.js";
import { craft } from "/shared/recipes.js";
import { clickSlot, addItem, roomFor, canMerge } from "/shared/inventory.js";
import { itemIcon } from "../textures.js";
import { makeHumanoid, makeItemMesh, disposeTree } from "../render/models.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export class InventoryUI {
  /** game: { inv, mode, send(obj), dropItem(item), changed(), hue, sfx } */
  constructor(game) {
    this.g = game;
    this.el = $("invScreen");
    this.cursor = null;
    this.screen = null;       // "inv" | "table" | "furnace"
    this.grid = [];
    this.furnace = null;      // 서버에서 받은 화로 상태
    this.furnaceKey = null;
    this.pending = false;
    this.hover = null;
    this.mouse = { x: 0, y: 0 };
    this.search = "";

    this.el.addEventListener("mousedown", (e) => this.onDown(e));
    this.el.addEventListener("contextmenu", (e) => e.preventDefault());
    this.el.addEventListener("mousemove", (e) => this.onMove(e));
  }

  get isOpen() { return !!this.screen; }

  open(screen, key = null) {
    this.screen = screen;
    this.furnaceKey = key;
    this.furnace = null;
    this.grid = new Array(screen === "table" ? 9 : 4).fill(null);
    this.el.classList.remove("hidden");
    this.build();
    this.render();
  }

  close() {
    if (!this.screen) return;
    if (this.screen === "furnace") this.g.send({ t: "fclose" });
    for (const s of [...this.grid, this.cursor]) {
      if (!s) continue;
      const left = addItem(this.g.inv, s);
      if (left) this.g.dropItem({ ...s, n: left });
    }
    this.grid = [];
    this.cursor = null;
    this.screen = null;
    this.el.classList.add("hidden");
    this.g.changed();
  }

  // ── 화면 만들기 ──────────────────────────────────────────
  build() {
    const s = this.screen;
    const slot = (area, i, extra = "") => `<div class="slot ${extra}" data-a="${area}" data-i="${i}"></div>`;
    const range = (n) => [...Array(n).keys()];
    let top = "";
    if (s === "inv") {
      top = `<div class="preview" id="invPreview"></div>
        <div class="craft"><div class="ctitle">조합</div>
          <div class="cgrid g2">${range(4).map((i) => slot("craft", i)).join("")}</div>
          <div class="arrow">➜</div>${slot("result", 0, "result")}</div>`;
    } else if (s === "table") {
      top = `<div class="craft big"><div class="ctitle">작업대</div>
          <div class="cgrid g3">${range(9).map((i) => slot("craft", i)).join("")}</div>
          <div class="arrow">➜</div>${slot("result", 0, "result")}</div>`;
    } else if (s === "furnace") {
      top = `<div class="furnace"><div class="ctitle">화로</div>
          <div class="fcol">${slot("f", "in")}<div class="flame"><div id="flameBar"></div></div>${slot("f", "fuel")}</div>
          <div class="farrow"><div id="cookBar"></div>➜</div>${slot("f", "out", "result")}</div>`;
    }
    const creative = this.g.mode === "creative" && s === "inv";
    this.el.innerHTML = `
      <div class="mcWrap">
        ${creative ? `<div class="mc creative"><div class="ctitle">모든 아이템 <span class="hintSmall">왼쪽 64개 · 오른쪽 1개 · 들고 클릭하면 버리기</span></div>
          <input id="creativeSearch" placeholder="검색" value="${esc(this.search)}" autocomplete="off" />
          <div class="cgridAll" id="creativeGrid"></div></div>` : ""}
        <div class="mc">
          <div class="mcTop">${top}</div>
          <div class="ctitle">가방</div>
          <div class="grid9">${range(27).map((i) => slot("inv", i + 9)).join("")}</div>
          <div class="grid9 hot">${range(9).map((i) => slot("inv", i)).join("")}</div>
        </div>
      </div>
      <div id="cursorItem" class="slotItem"></div>
      <div id="tooltip" class="hidden"></div>`;
    if (creative) {
      const input = $("creativeSearch");
      input.addEventListener("input", () => { this.search = input.value; this.renderCreative(); });
      input.addEventListener("keydown", (e) => e.stopPropagation());
      this.renderCreative();
    }
    if (s === "inv") this.mountPreview();
  }

  renderCreative() {
    const grid = $("creativeGrid");
    if (!grid) return;
    const q = this.search.trim();
    grid.innerHTML = Object.values(ITEMS)
      .filter((it) => !q || it.name.includes(q))
      .map((it) => `<div class="slot" data-a="all" data-i="${it.id}" title="${esc(it.name)}"><img src="${itemIcon(it.id)}" alt=""></div>`).join("");
  }

  slotItem(area, i) {
    if (area === "inv") return this.g.inv[i];
    if (area === "craft") return this.grid[i];
    if (area === "result") return this.result();
    if (area === "f") return this.furnace?.[i] ?? null;
    if (area === "all") return { id: Number(i), n: 1 };
    return null;
  }

  result() {
    const size = this.screen === "table" ? 3 : 2;
    const r = craft(this.grid.map((s) => s?.id ?? 0), size);
    return r ? { id: r[0], n: r[1] } : null;
  }

  render() {
    if (!this.screen) return;
    for (const el of this.el.querySelectorAll(".slot")) {
      const a = el.dataset.a;
      if (a === "all") continue;
      fillSlot(el, this.slotItem(a, a === "f" ? el.dataset.i : Number(el.dataset.i)));
    }
    fillSlot($("cursorItem"), this.cursor);
    if (this.screen === "furnace" && this.furnace) {
      const f = this.furnace;
      $("flameBar").style.height = `${f.burnMax ? (f.burn / f.burnMax) * 100 : 0}%`;
      $("cookBar").style.width = `${(f.cook / f.total) * 100}%`;
    }
    this.placeCursor();
  }

  // ── 클릭 ─────────────────────────────────────────────────
  onDown(e) {
    e.preventDefault();
    this.g.sfx?.click();
    const el = e.target.closest(".slot");
    const btn = e.button === 2 ? 2 : 0;
    if (!el) {
      // 창 바깥을 누르면 들고 있던 것을 버린다
      if (!e.target.closest(".mc") && this.cursor) {
        const n = btn === 2 ? 1 : this.cursor.n;
        this.g.dropItem({ ...this.cursor, n });
        this.cursor.n -= n;
        if (this.cursor.n <= 0) this.cursor = null;
        this.render();
      }
      return;
    }
    const a = el.dataset.a, i = a === "f" ? el.dataset.i : Number(el.dataset.i);
    this.clickSlot(a, i, btn, e.shiftKey);
  }

  clickSlot(a, i, btn, shift) {
    const inv = this.g.inv;
    if (a === "all") {
      if (this.cursor) this.cursor = null;
      else if (shift) addItem(inv, { id: i, n: maxStack(i) });
      else this.cursor = { id: i, n: btn === 2 ? 1 : maxStack(i) };
    } else if (a === "inv") {
      if (shift) this.quickMove(i);
      else { const r = clickSlot(inv[i], this.cursor, btn); inv[i] = r.slot; this.cursor = r.cursor; }
    } else if (a === "craft") {
      if (shift) { const s = this.grid[i]; if (s) { const left = addItem(inv, s); this.grid[i] = left ? { ...s, n: left } : null; } }
      else { const r = clickSlot(this.grid[i], this.cursor, btn); this.grid[i] = r.slot; this.cursor = r.cursor; }
    } else if (a === "result") {
      this.takeResult(shift);
    } else if (a === "f") {
      if (this.pending || !this.furnaceKey) return;
      if (shift) this.g.send({ t: "ftake", k: this.furnaceKey, slot: i });
      else {
        this.pending = true;
        this.g.send({ t: "fclick", k: this.furnaceKey, slot: i, button: btn, cursor: this.cursor });
      }
    }
    this.g.changed();
    this.render();
  }

  takeResult(shift) {
    let made = 0;
    do {
      const r = this.result();
      if (!r) break;
      if (shift) {
        if (roomFor(this.g.inv, r) < r.n) break;
        addItem(this.g.inv, r);
      } else {
        if (this.cursor && !(canMerge(this.cursor, r) && this.cursor.n + r.n <= maxStack(r.id))) break;
        this.cursor = this.cursor ? { ...this.cursor, n: this.cursor.n + r.n } : r;
      }
      this.grid = this.grid.map((s) => (s && s.n > 1 ? { ...s, n: s.n - 1 } : null));
      made++;
    } while (shift && made < 64);
  }

  /** Shift+클릭 — 단축칸 ↔ 가방, 화로에서는 화로로 */
  quickMove(i) {
    const inv = this.g.inv;
    const s = inv[i];
    if (!s) return;
    if (this.screen === "furnace" && this.furnaceKey) {
      inv[i] = null;
      this.g.send({ t: "fput", k: this.furnaceKey, item: s });
      return;
    }
    const target = i < 9 ? [...Array(27).keys()].map((k) => k + 9) : [...Array(9).keys()];
    const tmp = inv.slice();
    tmp[i] = null;
    const left = addItem(tmp, s, target);
    tmp[i] = left ? { ...s, n: left } : null;
    for (let k = 0; k < inv.length; k++) inv[k] = tmp[k];
  }

  /** 마우스를 칸 위에 두고 1~9 → 그 단축칸과 바꾸기 */
  hotkey(n) {
    const h = this.hover;
    if (!h || (h.a !== "inv" && h.a !== "craft")) return false;
    const inv = this.g.inv;
    const arr = h.a === "inv" ? inv : this.grid;
    const a = arr[h.i];
    arr[h.i] = inv[n];
    inv[n] = a;
    this.g.changed();
    this.render();
    return true;
  }

  /** 서버가 보낸 화로 · 커서 */
  setFurnace(f) { if (f.k === this.furnaceKey) { this.furnace = f; this.render(); } }
  setCursor(c) { this.cursor = c; this.pending = false; this.g.changed(); this.render(); }

  onMove(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    this.placeCursor();
    const el = e.target.closest(".slot");
    const tip = $("tooltip");
    if (!el) { this.hover = null; tip?.classList.add("hidden"); return; }
    const a = el.dataset.a, i = a === "f" ? el.dataset.i : Number(el.dataset.i);
    this.hover = { a, i };
    const it = this.slotItem(a, i);
    if (!it || this.cursor) { tip.classList.add("hidden"); return; }
    const def = ITEMS[it.id];
    tip.innerHTML = esc(def?.name ?? "?") + (def?.uses ? `<div class="sub">내구도 ${def.uses - (it.dmg ?? 0)} / ${def.uses}</div>` : "")
      + (def?.food ? `<div class="sub">배고픔 +${def.food / 2}</div>` : "");
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY - 10}px`;
    tip.classList.remove("hidden");
  }
  placeCursor() {
    const c = $("cursorItem");
    if (!c) return;
    c.style.left = `${this.mouse.x - 20}px`;
    c.style.top = `${this.mouse.y - 20}px`;
  }

  // ── 내 모습 ──────────────────────────────────────────────
  mountPreview() {
    const box = $("invPreview");
    if (!this.pv) {
      const canvas = document.createElement("canvas");
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(30, 0.62, 0.1, 20);
      cam.position.set(0, 1.05, 4.6);
      const model = makeHumanoid("player", this.g.hue);
      scene.add(model.root);
      this.pv = { canvas, renderer, scene, cam, model, held: null, heldId: -1, t: 0 };
    }
    box.append(this.pv.canvas);
  }
  /** 매 프레임 (인벤토리가 열려 있을 때만) */
  renderPreview(dt, heldId) {
    const pv = this.pv;
    const box = $("invPreview");
    if (!pv || !box || !this.screen) return;
    const w = box.clientWidth, h = box.clientHeight;
    if (pv.canvas.width !== w || pv.canvas.height !== h) { pv.renderer.setSize(w, h, false); pv.cam.aspect = w / h; pv.cam.updateProjectionMatrix(); }
    if (heldId !== pv.heldId) {
      if (pv.held) { pv.model.hand.remove(pv.held); disposeTree(pv.held); pv.held = null; }
      pv.heldId = heldId;
      if (heldId) { pv.held = makeItemMesh(heldId, 0.28); pv.held.position.set(0, -0.05, -0.15); pv.held.rotation.set(0, Math.PI / 2, 0); pv.model.hand.add(pv.held); }
    }
    const r = box.getBoundingClientRect();
    const mx = (this.mouse.x - (r.left + r.width / 2)) / r.width;
    const my = (this.mouse.y - (r.top + r.height * 0.25)) / r.height;
    pv.t += dt;
    const m = pv.model;
    m.root.rotation.y = Math.max(-0.6, Math.min(0.6, mx * 1.2)) * 0.5;
    m.head.rotation.y = Math.max(-0.9, Math.min(0.9, mx * 2)) * 0.6;
    m.head.rotation.x = Math.max(-0.6, Math.min(0.6, my * 1.5));
    m.arms[0].rotation.z = -0.06 - Math.sin(pv.t * 1.5) * 0.04;
    m.arms[1].rotation.z = 0.06 + Math.sin(pv.t * 1.5) * 0.04;
    for (const mat of m.mats) { const b = mat.userData.base; if (b) mat.color.copy(b); else mat.color.setScalar(1); }
    pv.renderer.render(pv.scene, pv.cam);
  }
}

/** 칸 그리기 — 아이콘 + 개수 + 내구도 막대 */
export function fillSlot(el, it) {
  if (!el) return;
  const key = it ? `${it.id}:${it.n}:${it.dmg ?? 0}` : "";
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  if (!it) { el.innerHTML = ""; return; }
  const def = ITEMS[it.id];
  let html = `<img src="${itemIcon(it.id)}" alt="">`;
  if (it.n > 1) html += `<span class="cnt">${it.n}</span>`;
  if (def?.uses && it.dmg) {
    const left = 1 - it.dmg / def.uses;
    html += `<span class="dur"><i style="width:${left * 100}%;background:hsl(${left * 120},90%,45%)"></i></span>`;
  }
  el.innerHTML = html;
}
