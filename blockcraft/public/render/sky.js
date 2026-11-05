// 하늘 — 시간에 따라 해 · 달 · 별 · 구름 · 하늘색 · 안개색이 바뀐다
import * as THREE from "../vendor/three.module.min.js";

export const DAY = 24000;
const DAY_SKY = new THREE.Color(0x8ec5ff), NIGHT_SKY = new THREE.Color(0x070b18), SUNSET = new THREE.Color(0xf08850);
const WATER_FOG = new THREE.Color(0x1b3f8f);

/** 0 = 밤 ~ 1 = 한낮 (서버와 같은 식) */
export const daylightAt = (t) => Math.max(0, Math.min(1, Math.sin((t / DAY) * Math.PI * 2) * 2.2 + 0.45));

function squareTex(draw, size = 32) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    const mk = (tex, size) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.renderOrder = -10;
      return m;
    };
    this.sun = mk(squareTex((g, s) => {
      g.fillStyle = "rgba(255,240,150,0.25)"; g.fillRect(0, 0, s, s);
      g.fillStyle = "#fff6c0"; g.fillRect(s * 0.25, s * 0.25, s * 0.5, s * 0.5);
      g.fillStyle = "#ffffff"; g.fillRect(s * 0.32, s * 0.32, s * 0.36, s * 0.36);
    }), 60);
    this.moon = mk(squareTex((g, s) => {
      g.fillStyle = "#dfe6f2"; g.fillRect(s * 0.25, s * 0.25, s * 0.5, s * 0.5);
      g.fillStyle = "#aeb8c8"; g.fillRect(s * 0.33, s * 0.35, 4, 4); g.fillRect(s * 0.55, s * 0.55, 5, 3); g.fillRect(s * 0.5, s * 0.3, 3, 3);
    }), 40);
    this.group.add(this.sun, this.moon);

    // 별
    const pts = [];
    for (let i = 0; i < 1200; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (v.length() > 1 || v.length() < 0.1) { i--; continue; }
      v.normalize().multiplyScalar(380);
      pts.push(v.x, v.y, v.z);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    this.stars.renderOrder = -11;
    this.group.add(this.stars);

    // 구름 — 큰 판 하나에 네모 구름 무늬, 천천히 흘러간다
    const ct = squareTex((g, s) => {
      g.clearRect(0, 0, s, s);
      let seed = 7;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      g.fillStyle = "#fff";
      for (let i = 0; i < 70; i++) {
        const x = Math.floor(r() * s), y = Math.floor(r() * s), w = 2 + Math.floor(r() * 7), h = 1 + Math.floor(r() * 4);
        g.fillRect(x, y, w, h); g.fillRect(x - s, y, w, h); g.fillRect(x, y - s, w, h);
      }
    }, 64);
    ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
    ct.repeat.set(4, 4);
    this.cloudTex = ct;
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1024, 1024),
      new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = -5;
    scene.add(this.clouds);

    this.color = new THREE.Color();
    this.fog = new THREE.Color();
    this.daylight = 1;
  }

  /** time: 게임 시간(틱), cam: 카메라, underwater: 눈이 물속 */
  update(time, cam, underwater, uniforms, viewDist) {
    const a = (time / DAY) * Math.PI * 2;
    const sunH = Math.sin(a);
    const dl = daylightAt(time);
    this.daylight = dl;
    this.color.copy(NIGHT_SKY).lerp(DAY_SKY, dl);
    const dusk = Math.max(0, 1 - Math.abs(sunH) / 0.3) * 0.55;
    this.fog.copy(this.color).lerp(SUNSET, dusk);

    this.group.position.copy(cam.position);
    const dir = new THREE.Vector3(Math.cos(a), sunH, 0.25).normalize();
    this.sun.position.copy(dir).multiplyScalar(300);
    this.sun.lookAt(cam.position);
    this.moon.position.copy(dir).multiplyScalar(-300);
    this.moon.lookAt(cam.position);
    this.stars.material.opacity = Math.max(0, 1 - dl * 1.6);
    this.stars.rotation.z = a;

    this.clouds.position.set(Math.floor(cam.position.x / 64) * 64, 110, Math.floor(cam.position.z / 64) * 64);
    this.cloudTex.offset.set((this.clouds.position.x / 256 + time / 24000) % 1, -(this.clouds.position.z / 256) % 1);
    this.clouds.material.color.setScalar(0.25 + dl * 0.75);

    const fogColor = underwater ? WATER_FOG.clone().multiplyScalar(0.3 + dl * 0.7) : this.fog;
    this.scene.background = underwater ? fogColor : this.fog;
    uniforms.daylight.value = 0.27 + 0.73 * dl;
    uniforms.fogColor.value.copy(fogColor);
    uniforms.fogNear.value = underwater ? 1 : viewDist * 0.6;
    uniforms.fogFar.value = underwater ? 16 : viewDist * 0.95;
    if (this.scene.fog) { this.scene.fog.color.copy(fogColor); this.scene.fog.near = uniforms.fogNear.value; this.scene.fog.far = uniforms.fogFar.value; }
    return dl;
  }
}
