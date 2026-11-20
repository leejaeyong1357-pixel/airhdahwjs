// 인벤토리 화면 — E · Tab: 내 모습 + 방어구 + 2x2 조합 / 작업대 3x3 / 상자 / 화로 / 크리에이티브 아이템 목록
// 모든 조작은 shared/invops.js 의 조작(op)으로 보내고, 서버가 같은 조작을 해서 확정한다.
import * as THREE from "../vendor/three.module.min.js";
import { ITEMS } from "/shared/items.js";
import { craftResult } from "/shared/invops.js";
import { itemIcon } from "../textures.js";
import { makeHumanoid, makeItemMesh, disposeTree, setArmor } from "../render/models.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const range = (n) => [...Array(n).keys()];
const ARMOR_LABEL = ["투구", "갑옷", "바지", "신발"];

export class InventoryUI {
  /** game: { st, mode, op(op), cop(op), closeBox(), hue, sfx, changed() } */
  constructor(game) {
    this.g = game;
    this.el = $("invScreen");
    this.screen = null;      // "inv" | "table" | "chest" | "furnace"
    this.box = null;         // 서버가 보낸 상자 · 화로 내용
    this.pending = false;
    this.hover = null;
    this.mouse = { x: 0, y: 0 };
    this.search = "";
    this.drag = null;        // { a, b, slots:Set }

    this.el.addEventListener("mousedown", (e) => this.onDown(e));
    this.el.addEventListener("mouseup", (e) => this.onUp(e));
    this.el.addEventListener("contextmenu", (e) => e.preventDefault());
    this.el.addEventListener("mousemove", (e) => this.onMove(e));
  }

  get isOpen() { return !!this.screen; }
  get st() { return this.g.st; }

  /** screen: "inv" | "table" (조합) · "chest" | "furnace" (서버 상자) */
  open(screen) {
    this.screen = screen;
    if (screen === "inv" || screen === "table") this.g.op({ o: "open", screen });
    else this.box = null;
    this.el.classList.remove("hidden");
    this.build();
    this.render();
  }

  close() {
    if (!this.screen) return;
    if (this.screen === "chest" || this.screen === "furnace") this.g.closeBox();
    else this.g.op({ o: "close" });
    this.screen = null;
    this.box = null;
    this.pending = false;
    this.el.classList.add("hidden");
    this.g.changed();
  }

  // ── 화면 만들기 ──────────────────────────────────────────
  build() {
    const s = this.screen;
    const slot = (area, i, extra = "", title = "") => `<div class="slot ${extra}" data-a="${area}" data-i="${i}"${title ? ` data-tip="${title}"` : ""}></div>`;
    let top = "";
    if (s === "inv") {
      top = `<div class="armorCol">${range(4).map((i) => slot("armor", i, "armor", ARMOR_LABEL[i])).join("")}</div>
        <div class="preview" id="invPreview"></div>
        <div class="craft"><div class="ctitle">조합</div>
          <div class="cgrid g2">${range(4).map((i) => slot("craft", i)).join("")}</div>
          <div class="arrow">➜</div>${slot("result", 0, "result")}</div>`;
    } else if (s === "table") {
      top = `<div class="craft big"><div class="ctitle">작업대</div>
          <div class="cgrid g3">${range(9).map((i) => slot("craft", i)).join("")}</div>
          <div class="arrow">➜</div>${slot("result", 0, "result")}</div>`;
    } else if (s === "furnace") {
      top = `<div class="furnace"><div class="ctitle">화로</div>
          <div class="fcol">${slot("c", "in", "", "재료")}<div class="flame"><div id="flameBar"></div></div>${slot("c", "fuel", "", "연료")}</div>
          <div class="farrow"><div id="cookBar"></div>➜</div>${slot("c", "out", "result")}
          <div class="fnote" id="fNote"></div></div>`;
    } else if (s === "chest") {
      top = `<div class="chestBox"><div class="ctitle">상자</div><div class="grid9">${range(27).map((i) => slot("c", i)).join("")}</div></div>`;
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
      .map((it) => `<div class="slot" data-a="all" data-i="${it.id}" data-tip="${esc(it.name)}"><img src="${itemIcon(it.id)}" alt=""></div>`).join("");
  }

  slotItem(a, i) {
    const st = this.st;
    if (a === "inv") return st.inv[i];
    if (a === "armor") return st.armor[i];
    if (a === "craft") return st.grid[i];
    if (a === "result") return craftResult(st);
    if (a === "c") return this.screen === "chest" ? this.box?.slots?.[i] ?? null : this.box?.[i] ?? null;
    if (a === "all") return { id: Number(i), n: 1 };
    return null;
  }

  render() {
    if (!this.screen) return;
    for (const el of this.el.querySelectorAll(".slot")) {
      const a = el.dataset.a;
      if (a === "all") continue;
      fillSlot(el, this.slotItem(a, a === "c" && this.screen === "furnace" ? el.dataset.i : Number(el.dataset.i)), a === "armor" ? `armor${el.dataset.i}` : "");
      el.classList.toggle("dragOn", !!this.drag?.slots.has(`${a}:${el.dataset.i}`));
    }
    fillSlot($("cursorItem"), this.st.cursor);
    if (this.screen === "furnace" && this.box) {
      const f = this.box;
      $("flameBar").style.height = `${f.burnMax ? (f.burn / f.burnMax) * 100 : 0}%`;
      $("cookBar").style.width = `${(f.cook / f.total) * 100}%`;
      $("fNote").textContent = f.burn > 0 ? `불 ${Math.ceil(f.burn)}초 남음 · 굽는 중 ${Math.floor((f.cook / f.total) * 100)}%` : f.in ? "연료를 넣으세요" : "재료와 연료를 넣으세요";
    }
    this.placeCursor();
  }

  // ── 클릭 ─────────────────────────────────────────────────
  parse(el) {
    const a = el.dataset.a;
    const raw = el.dataset.i;
    return { a, i: a === "c" && this.screen === "furnace" ? raw : Number(raw) };
  }

  onDown(e) {
    e.preventDefault();
    if (this.pending) return;
    this.g.sfx?.click();
    const el = e.target.closest(".slot");
    const b = e.button === 2 ? 2 : 0;
    if (!el) {
      if (!e.target.closest(".mc") && this.st.cursor) { this.g.op({ o: "out", b }); this.render(); }
      return;
    }
    const { a, i } = this.parse(el);
    // 들고 끌기 시작 (가방 · 조합칸)
    if (this.st.cursor && !e.shiftKey && (a === "inv" || a === "craft")) {
      this.drag = { a, b, first: { a, i }, slots: new Set([`${a}:${i}`]), list: [i] };
      this.render();
      return;
    }
    this.click(a, i, b, e.shiftKey);
  }

  onUp() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.list.length > 1) this.g.op({ o: "drag", a: d.a, slots: d.list, b: d.b });
    else this.click(d.first.a, d.first.i, d.b, false);
    this.render();
  }

  click(a, i, b, s) {
    const box = this.screen === "chest" || this.screen === "furnace";
    if (a === "c" || (box && a === "inv" && s)) {
      // 상자 · 화로 칸 — 서버만 처리 (모두가 같이 쓰는 칸)
      this.pending = true;
      this.g.cop({ a, i, b, s });
    } else {
      this.g.op({ o: "click", a, i, b, s });
    }
    this.render();
  }

  /** 마우스를 칸 위에 두고 1~9 → 그 단축칸과 바꾸기, Q → 버리기 */
  hotkey(n) {
    const h = this.hover;
    if (!h || (h.a !== "inv" && h.a !== "craft")) return false;
    this.g.op({ o: "key", a: h.a, i: h.i, n });
    this.render();
    return true;
  }
  dropHovered(all) {
    const h = this.hover;
    if (!h || (h.a !== "inv" && h.a !== "craft" && h.a !== "armor")) return false;
    this.g.op({ o: "drop", a: h.a, i: h.i, all });
    this.render();
    return true;
  }

  /** 서버가 보낸 상자 · 화로 */
  setBox(v) {
    if (!v.kind) { if (this.screen === "chest" || this.screen === "furnace") this.close(); return; }
    this.box = v;
    if (this.screen !== v.kind) this.open(v.kind);
    this.render();
  }
  synced() { this.pending = false; this.render(); }

  onMove(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    this.placeCursor();
    const el = e.target.closest(".slot");
    const tip = $("tooltip");
    if (!el) { this.hover = null; tip?.classList.add("hidden"); return; }
    const { a, i } = this.parse(el);
    this.hover = { a, i };
    if (this.drag && this.drag.a === a && !this.drag.slots.has(`${a}:${i}`)) {
      this.drag.slots.add(`${a}:${i}`); this.drag.list.push(i); this.render();
    }
    const it = this.slotItem(a, i);
    if (this.st.cursor || (!it && !el.dataset.tip)) { tip.classList.add("hidden"); return; }
    const def = it ? ITEMS[it.id] : null;
    tip.innerHTML = def ? esc(def.name)
      + (def.uses ? `<div class="sub">내구도 ${def.uses - (it.dmg ?? 0)} / ${def.uses}</div>` : "")
      + (def.damage ? `<div class="sub">공격력 ${def.damage}</div>` : "")
      + (def.points ? `<div class="sub">방어력 +${def.points}</div>` : "")
      + (def.food ? `<div class="sub">배고픔 +${def.food / 2}</div>` : "")
      : esc(el.dataset.tip);
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
      const model = makeHumanoid("player", this.g.hue); // 꾸민 모습 (없으면 색 번호)
      model.shadow.visible = false;
      model.root.rotation.y = Math.PI;
      scene.add(model.root);
      this.pv = { canvas, renderer, scene, cam, model, held: null, heldId: -1, armorKey: "", t: 0 };
    }
    box.append(this.pv.canvas);
  }
  /** 매 프레임 (인벤토리가 열려 있을 때만) */
  renderPreview(dt, heldId) {
    const pv = this.pv;
    const box = $("invPreview");
    if (!pv || !box || this.screen !== "inv") return;
    const w = box.clientWidth, h = box.clientHeight;
    if (pv.canvas.width !== w || pv.canvas.height !== h) { pv.renderer.setSize(w, h, false); pv.cam.aspect = w / h; pv.cam.updateProjectionMatrix(); }
    if (heldId !== pv.heldId) {
      if (pv.held) { pv.model.hand.remove(pv.held); disposeTree(pv.held); pv.held = null; }
      pv.heldId = heldId;
      if (heldId) { pv.held = makeItemMesh(heldId, 0.28); pv.held.position.set(0, -0.05, -0.15); pv.held.rotation.set(0, Math.PI / 2, 0); pv.model.hand.add(pv.held); }
    }
    const ak = this.st.armor.map((a) => a?.id ?? 0).join();
    if (ak !== pv.armorKey) { pv.armorKey = ak; setArmor(pv.model, this.st.armor.map((a) => a?.id ?? 0)); }
    const r = box.getBoundingClientRect();
    const mx = (this.mouse.x - (r.left + r.width / 2)) / r.width;
    const my = (this.mouse.y - (r.top + r.height * 0.25)) / r.height;
    pv.t += dt;
    const m = pv.model;
    // 마우스 쪽으로 몸 · 고개를 돌린다
    m.root.rotation.y = Math.PI - Math.max(-0.6, Math.min(0.6, mx * 1.2)) * 0.5;
    m.head.rotation.y = -Math.max(-0.9, Math.min(0.9, mx * 2)) * 0.6;
    m.head.rotation.x = -Math.max(-0.6, Math.min(0.6, my * 1.5));
    m.arms[0].rotation.z = -0.06 - Math.sin(pv.t * 1.5) * 0.04;
    m.arms[1].rotation.z = 0.06 + Math.sin(pv.t * 1.5) * 0.04;
    for (const mat of m.mats) { const b = mat.userData.base; if (b) mat.color.copy(b); else mat.color.setScalar(1); }
    pv.renderer.render(pv.scene, pv.cam);
  }
}

/** 칸 그리기 — 아이콘 + 개수 + 내구도 막대 (빈 방어구 칸은 흐린 표시) */
export function fillSlot(el, it, empty = "") {
  if (!el) return;
  const key = it ? `${it.id}:${it.n}:${it.dmg ?? 0}` : empty;
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  if (!it) { el.innerHTML = empty ? `<span class="ghost">${ARMOR_LABEL[Number(empty.slice(5))]}</span>` : ""; return; }
  const def = ITEMS[it.id];
  let html = `<img src="${itemIcon(it.id)}" alt="">`;
  if (it.n > 1) html += `<span class="cnt">${it.n}</span>`;
  if (def?.uses && it.dmg) {
    const left = 1 - it.dmg / def.uses;
    html += `<span class="dur"><i style="width:${left * 100}%;background:hsl(${left * 120},90%,45%)"></i></span>`;
  }
  el.innerHTML = html;
}
