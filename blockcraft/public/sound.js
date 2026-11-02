// 소리 — 소리 파일 없이 브라우저에서 바로 만든다 (WebAudio)
let ctx = null, master = null, noiseBuf = null;
let volume = 0.6;

export function setVolume(v) { volume = v; if (master) master.gain.value = v; }

function init() {
  if (ctx) return ctx.state === "running";
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
  return false;
}
/** 클릭 · 키 입력 뒤에 불러야 소리가 난다 (브라우저 규칙) */
export function unlock() { init(); if (ctx?.state === "suspended") ctx.resume(); }

function noise(dur, freq, q, gain, type = "bandpass", decay = dur) {
  if (!ctx || ctx.state !== "running" || volume <= 0) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.6 + Math.random() * 0.8;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5, dur);
}
function tone(f0, f1, dur, gain, type = "sine") {
  if (!ctx || ctx.state !== "running" || volume <= 0) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur);
}

// 재질별 소리 높이
const MATERIAL = { pickaxe: [1800, 0.35], axe: [700, 0.4], shovel: [450, 0.45], none: [900, 0.3] };
const mat = (b) => MATERIAL[b?.tool ?? "none"] ?? MATERIAL.none;

export const sfx = {
  hit: (b) => { const [f, g] = mat(b); noise(0.08, f, 1.2, g * 0.6); },
  brk: (b) => { const [f, g] = mat(b); noise(0.25, f * 0.8, 0.9, g, "bandpass", 0.22); },
  place: (b) => { const [f, g] = mat(b); noise(0.12, f * 0.7, 1, g * 0.8); },
  step: (b) => { const [f] = mat(b); noise(0.06, f * 0.6, 1.5, 0.12); },
  pop: () => tone(500 + Math.random() * 300, 1300, 0.08, 0.15),
  hurt: () => { tone(220, 90, 0.18, 0.3, "square"); noise(0.1, 300, 1, 0.3); },
  attack: () => noise(0.06, 1200, 0.8, 0.25),
  mobHurt: () => tone(400, 200, 0.15, 0.18, "triangle"),
  eat: () => noise(0.09, 2500, 2, 0.2),
  burp: () => tone(180, 90, 0.3, 0.25, "sawtooth"),
  boom: () => { noise(1.2, 160, 0.6, 1.2, "lowpass", 1.1); tone(90, 30, 0.8, 0.6, "sine"); },
  hiss: () => noise(0.5, 4000, 0.5, 0.35, "highpass", 0.5),
  groan: () => { tone(110, 70, 0.7, 0.18, "sawtooth"); },
  click: () => tone(1200, 900, 0.04, 0.12, "square"),
  toolBreak: () => { noise(0.2, 3000, 2, 0.4); tone(900, 300, 0.2, 0.2, "square"); },
  splash: () => noise(0.4, 1200, 0.5, 0.4, "bandpass", 0.35),
  rain: () => noise(0.5, 6000, 0.3, 0.05, "highpass", 0.5),
  bird: () => { const f = 2400 + Math.random() * 1500; tone(f, f * 1.3, 0.08, 0.05); setTimeout(() => tone(f * 1.1, f * 0.9, 0.1, 0.05), 120); },
  cricket: () => { for (let i = 0; i < 3; i++) setTimeout(() => tone(4200, 4100, 0.04, 0.03, "square"), i * 70); },
  cave: () => noise(1.6, 220, 0.4, 0.08, "lowpass", 1.6),
  mobDie: () => tone(300, 80, 0.3, 0.2, "triangle"),
  gun: (far = 0) => { noise(0.18, 900, 0.5, 0.9 * (1 - far), "lowpass", 0.16); noise(0.05, 3500, 0.7, 0.6 * (1 - far)); tone(140, 50, 0.12, 0.4 * (1 - far), "square"); },
  sniper: (far = 0) => { noise(0.6, 600, 0.4, 1.3 * (1 - far), "lowpass", 0.55); noise(0.08, 4000, 0.8, 0.8 * (1 - far)); tone(90, 30, 0.4, 0.6 * (1 - far), "sine"); },
  dry: () => tone(2400, 2200, 0.03, 0.15, "square"),
  reload: () => { tone(900, 700, 0.05, 0.15, "square"); setTimeout(() => noise(0.08, 2500, 2, 0.25), 400); setTimeout(() => tone(1300, 1100, 0.05, 0.18, "square"), 900); },
  hitmark: () => tone(1900, 1700, 0.05, 0.18, "square"),
  headshot: () => { tone(2600, 2600, 0.12, 0.25, "triangle"); noise(0.15, 500, 1, 0.5, "bandpass", 0.14); },
  squish: () => { noise(0.14, 380, 1.4, 0.55, "bandpass", 0.13); tone(160, 70, 0.12, 0.2, "sine"); },
  slash: () => noise(0.09, 5200, 1.2, 0.35, "bandpass", 0.08),
};
