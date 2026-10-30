// 캐릭터 꾸미기 화면 — 성별 · 옷 · 소매 · 머리 모양 · 머리색, 돌아가는 미리보기
import * as THREE from "../vendor/three.module.min.js";
import { LOOK_OPTIONS, cleanLook } from "/shared/look.js";
import { makeHumanoid, disposeTree, tint } from "../render/models.js";

const $ = (id) => document.getElementById(id);

export class LookEditor {
  /** onSave(look) → Promise */
  constructor(onSave) {
    this.onSave = onSave;
    this.el = $("lookModal");
    this.look = null;
    this.admin = false;
    this.renderer = null;
    this.raf = 0;
    $("lookSave").onclick = async () => {
      $("lookSave").disabled = true;
      $("lookError").textContent = "";
      try { await this.onSave(this.look); this.close(); } catch (err) { $("lookError").textContent = err.message; }
      $("lookSave").disabled = false;
    };
  }

  open(look, admin, first = false) {
    this.admin = admin;
    this.look = cleanLook(look, admin);
    $("lookTitle").textContent = first ? "캐릭터 만들기" : "캐릭터 꾸미기";
    $("lookSub").textContent = first ? "처음 한 번 내 캐릭터를 골라 주세요. 나중에 다시 바꿀 수 있어요." : "바꾸면 같이 접속한 사람들 화면에도 바로 바뀝니다.";
    this.el.classList.remove("hidden");
    this.renderOptions();
    this.mountPreview();
    this.rebuild();
    cancelAnimationFrame(this.raf);
    const loop = (t) => {
      if (this.el.classList.contains("hidden")) return;
      this.raf = requestAnimationFrame(loop);
      this.draw(t / 1000);
    };
    this.raf = requestAnimationFrame(loop);
  }

  close() { this.el.classList.add("hidden"); cancelAnimationFrame(this.raf); }

  renderOptions() {
    const L = this.look;
    const group = (key, list, label) => {
      const items = list.filter(([v]) => key !== "outfit" || v !== "admin" || this.admin);
      return `<div class="lookRow"><span>${label}</span><div class="chips">${items.map(([v, name, color]) =>
        `<button class="chip${L[key] === v ? " on" : ""}" data-k="${key}" data-v="${v}">${color ? `<i style="background:${color}"></i>` : ""}${name}</button>`).join("")}</div></div>`;
    };
    $("lookOptions").innerHTML =
      group("gender", LOOK_OPTIONS.gender, "성별") +
      group("outfit", LOOK_OPTIONS.outfit, "옷") +
      group("sleeve", LOOK_OPTIONS.sleeve, "소매") +
      group("hair", LOOK_OPTIONS.hair[L.gender], "머리") +
      group("hairColor", LOOK_OPTIONS.hairColor, "머리색");
    for (const b of $("lookOptions").querySelectorAll(".chip")) {
      b.onclick = () => {
        const next = { ...this.look, [b.dataset.k]: b.dataset.v };
        if (b.dataset.k === "gender") next.hair = LOOK_OPTIONS.hair[b.dataset.v][0][0];
        this.look = cleanLook(next, this.admin);
        this.renderOptions();
        this.rebuild();
      };
    }
  }

  mountPreview() {
    if (this.renderer) return;
    const canvas = $("lookCanvas");
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, 0.75, 0.1, 20);
    this.cam.position.set(0, 1.0, 4.4);
    this.cam.lookAt(0, 0.95, 0);
  }

  rebuild() {
    if (this.model) { this.scene.remove(this.model.root); disposeTree(this.model.root); }
    this.model = makeHumanoid("player", this.look);
    this.model.shadow.visible = false;
    this.scene.add(this.model.root);
  }

  draw(t) {
    const c = $("lookCanvas");
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w || c.height !== h) { this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
    const m = this.model;
    m.root.rotation.y = Math.PI + Math.sin(t * 0.6) * 0.9;
    m.arms[0].rotation.x = Math.sin(t * 2) * 0.15;
    m.arms[1].rotation.x = -Math.sin(t * 2) * 0.15;
    tint(m.mats, 1);
    this.renderer.render(this.scene, this.cam);
  }
}
