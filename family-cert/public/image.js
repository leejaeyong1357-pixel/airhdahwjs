// 스캔 그림 다루기: 흑백화 · 기울기 보정 · 표 선 찾기/지우기 · 칸 나누기
// (순수 계산만 — 브라우저와 Node 테스트에서 함께 씀)

export function toGray(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return g;
}

// 종이 밝기(가장 흔한 밝은 값)
export function paperLevel(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i += 7) hist[gray[i]]++;
  let best = 255, bv = 0;
  for (let v = 90; v < 256; v++) if (hist[v] > bv) { bv = hist[v]; best = v; }
  return best;
}
// 글자(잉크) 밝기: 가장 어두운 1.5% 지점
export function inkLevel(gray) {
  const hist = new Uint32Array(256); let n = 0;
  for (let i = 0; i < gray.length; i += 7) { hist[gray[i]]++; n++; }
  let acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.015) return v; }
  return 0;
}

// 잉크(1) / 종이(0). 주변보다 뚜렷이 어둡고, "글자색과 종이색의 중간"보다 어두운 점만 잉크로 본다.
// → 바탕 무늬(워터마크)·얼룩은 글자보다 옅으므로 빠진다. 진하게 스캔돼 무늬가 짙어져도 글자보다는 옅다.
export function binarize(gray, w, h, opt = {}) {
  const win = opt.win || Math.max(15, Math.round(w / 60)), t = opt.t ?? 0.12;
  const paper = paperLevel(gray), ink = Math.min(inkLevel(gray), paper - 40);
  const cut = Math.min(paper * 0.78, ink + (paper - ink) * (opt.mid ?? 0.55));
  const W = w + 1, integ = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += gray[y * w + x]; integ[(y + 1) * W + x + 1] = integ[y * W + x + 1] + row; }
  }
  const out = new Uint8Array(w * h), r = win >> 1, deep = ink + (paper - ink) * 0.25;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x];
      if (v >= cut) continue;
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = integ[y1 * W + x1] - integ[y0 * W + x1] - integ[y1 * W + x0] + integ[y0 * W + x0];
      if (v * (x1 - x0) * (y1 - y0) < sum * (1 - t) || v < deep) out[y * w + x] = 1;
    }
  }
  return out;
}

// 긴 가로/세로 줄(표 선)만 골라낸 마스크.
// 흐린 스캔에서 선이 군데군데 끊겨도 잇되(gap), 글자 줄을 선으로 착각하지 않도록 "거의 꽉 찬" 구간만 선으로 본다.
export function lineMasks(bin, w, h, minH, minV, gap = Math.max(2, Math.round(w * 0.003)), fill = 0.82) {
  const hm = new Uint8Array(w * h), vm = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let start = -1, last = -1, ink = 0;
    for (let x = 0; x <= w; x++) {
      const on = x < w && bin[y * w + x];
      if (on) { if (start < 0) { start = x; ink = 0; } last = x; ink++; }
      else if (start >= 0 && (x - last > gap || x === w)) {
        const len = last - start + 1;
        if (len >= minH && ink >= len * fill) hm.fill(1, y * w + start, y * w + last + 1);
        start = -1;
      }
    }
  }
  for (let x = 0; x < w; x++) {
    let start = -1, last = -1, ink = 0;
    for (let y = 0; y <= h; y++) {
      const on = y < h && bin[y * w + x];
      if (on) { if (start < 0) { start = y; ink = 0; } last = y; ink++; }
      else if (start >= 0 && (y - last > gap || y === h)) {
        const len = last - start + 1;
        if (len >= minV && ink >= len * fill) for (let k = start; k <= last; k++) vm[k * w + x] = 1;
        start = -1;
      }
    }
  }
  return { hm, vm };
}

// 가로줄 마스크로 기울기(도) 추정
export function estimateSkew(hm, w, h) {
  const pts = [];
  const step = Math.max(1, Math.round(w / 500));
  for (let y = 0; y < h; y++) for (let x = (y * 3) % step; x < w; x += step) if (hm[y * w + x]) pts.push(x, y);
  if (pts.length < 400) return 0;
  const score = deg => {
    const k = Math.tan(deg * Math.PI / 180), hist = new Uint32Array(h * 2 + 1);
    for (let i = 0; i < pts.length; i += 2) hist[Math.round(pts[i + 1] - (pts[i] - w / 2) * k) + (h >> 1)]++;
    let s = 0; for (let i = 0; i < hist.length; i++) s += hist[i] * hist[i];
    return s;
  };
  let best = 0, bs = -1;
  for (let d = -4; d <= 4.001; d += 0.25) { const s = score(d); if (s > bs) { bs = s; best = d; } }
  const c = best;
  for (let d = c - 0.25; d <= c + 0.2501; d += 0.05) { const s = score(d); if (s > bs) { bs = s; best = d; } }
  return Math.round(best * 100) / 100;
}

// 마스크 → 선분 목록
function segments(mask, w, h, horizontal) {
  // 가로선: 줄(y)마다 켜진 구간을 모아, 위아래로 붙은 것끼리 합친다 (세로선은 축을 바꿔서)
  const A = horizontal ? h : w, B = horizontal ? w : h;
  const at = horizontal ? (a, b) => mask[a * w + b] : (a, b) => mask[b * w + a];
  const done = [], active = [];
  for (let a = 0; a <= A; a++) {
    const runs = [];
    if (a < A) {
      let s = -1;
      for (let b = 0; b <= B; b++) {
        const on = b < B && at(a, b);
        if (on && s < 0) s = b;
        else if (!on && s >= 0) { runs.push([s, b - 1]); s = -1; }
      }
    }
    for (const seg of active) seg.hit = false;
    for (const [s, e] of runs) {
      let m = null;
      for (const seg of active) if (s <= seg.b1 + 3 && e >= seg.b0 - 3) { m = seg; break; }
      if (m) { m.b0 = Math.min(m.b0, s); m.b1 = Math.max(m.b1, e); m.a1 = a; m.hit = true; }
      else active.push({ a0: a, a1: a, b0: s, b1: e, hit: true });
    }
    for (let i = active.length - 1; i >= 0; i--) if (!active[i].hit && a - active[i].a1 > 2) done.push(active.splice(i, 1)[0]);
    if (a === A) done.push(...active.splice(0));
  }
  return done.map(s => horizontal ? { x0: s.b0, x1: s.b1, y0: s.a0, y1: s.a1 } : { x0: s.a0, x1: s.a1, y0: s.b0, y1: s.b1 });
}

// 그림 안에서 증명서 표가 차지하는 자리를 찾는다 (화면 캡처·축소 스캔처럼 표가 그림의 일부일 때 크기를 맞추려고).
// 증명서의 표들은 가로선 길이와 좌우 끝이 모두 같다 → 좌우 끝이 같은 가는 가로선이 가장 많이 모인 묶음이 표.
// 결과: { x0, x1, y0, y1, n } 또는 null
export function tableSpan(hm, w, h) {
  const thick = Math.max(6, Math.round(w * 0.004)), tol = Math.max(5, w * 0.008);
  // 두꺼운 덩어리(어두운 바탕·창 테두리)는 뺀다: 위아래로 thick만큼 떨어진 곳도 켜져 있으면 선이 아니다
  const thin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (hm[i] && !((y >= thick && hm[i - thick * w]) && (y + thick < h && hm[i + thick * w]))) thin[i] = 1;
  }
  const H = segments(thin, w, h, true).filter(s => s.y1 - s.y0 + 1 <= thick * 3 && s.x1 - s.x0 > 100);
  let best = null;
  for (const a of H) {
    const g = H.filter(b => Math.abs(b.x0 - a.x0) <= tol && Math.abs(b.x1 - a.x1) <= tol);
    if (g.length >= 4 && (!best || g.length > best.length)) best = g;
  }
  if (!best) return null;
  const med = arr => arr.sort((p, q) => p - q)[arr.length >> 1];
  return { x0: med(best.map(b => b.x0)), x1: med(best.map(b => b.x1)), y0: Math.min(...best.map(b => b.y0)), y1: Math.max(...best.map(b => b.y1)), n: best.length };
}

// 6칸짜리 표 줄(구분·성명·출생연월일·주민등록번호·성별·본)을 찾는다.
// 결과: [{ y0, y1, cells: [{x0,x1} × 6], est?: true }] (위→아래)
//  ① 세로선 기준: 같은 높이로 뻗은 세로선 7개 = 표 하나. 그 안을 가로선으로 나눠 줄을 얻는다.
//     가로선이 흐려 빠졌으면 보통 줄 높이로 나눠 "추정 줄(est)"로 넣는다 → 줄이 말없이 사라지지 않게.
//  ② 가로선 기준: 위·아래 가로선 한 쌍 사이를 지나는 세로선으로 줄을 얻는다 (세로선이 토막 난 경우 대비).
export function findRows(hm, vm, w, h) {
  const Hs = segments(hm, w, h, true).filter(s => s.x1 - s.x0 > w * 0.2).sort((a, b) => a.y0 - b.y0);
  const Vs = segments(vm, w, h, false).sort((a, b) => a.y0 - b.y0);
  const minGap = w * 0.016, maxGap = w * 0.11, tol = Math.max(6, w * 0.006), tol2 = w * 0.012;
  const mid = v => (v.x0 + v.x1) / 2;
  const mergeX = list => {
    const xs = [];
    for (const v of list.map(v => ({ x0: v.x0, x1: v.x1 })).sort((a, b) => a.x0 - b.x0)) { const l = xs[xs.length - 1]; if (l && v.x0 - l.x1 <= tol) l.x1 = Math.max(l.x1, v.x1); else xs.push(v); }
    return xs;
  };
  // 양식의 칸 비율(대략 9·30·23·21·8·8%)
  const full = xs => {
    if (xs.length !== 7) return false;
    const tw = xs[6].x0 - xs[0].x1; if (tw < w * 0.3) return false;
    const f = []; for (let k = 0; k < 6; k++) f.push((xs[k + 1].x0 - xs[k].x1) / tw);
    return !(f[1] < 0.2 || f[0] > 0.2 || f[4] > 0.16 || f[5] > 0.18 || f[2] < 0.13 || f[3] < 0.13);
  };

  // ① 세로선 묶음 → 표
  const groups = [];
  for (const v of Vs) {
    let g = groups.find(g => Math.abs(g.y0 - v.y0) <= tol2 && Math.abs(g.y1 - v.y1) <= tol2);
    if (!g) groups.push(g = { y0: v.y0, y1: v.y1, vs: [] });
    g.vs.push(v);
  }
  for (const g of groups) g.xs = mergeX(g.vs);
  // ② 가로선 쌍 → 띠
  const bands = [];
  for (let i = 0; i < Hs.length; i++) {
    const top = Hs[i]; if (top.x1 - top.x0 < w * 0.35) continue;
    let bot = null;
    for (let j = i + 1; j < Hs.length; j++) {
      const c = Hs[j];
      if (c.y0 - top.y1 < minGap) continue;
      if (c.y0 - top.y1 > maxGap) break;
      const ov = Math.min(top.x1, c.x1) - Math.max(top.x0, c.x0);
      if (ov > 0.8 * Math.min(top.x1 - top.x0, c.x1 - c.x0)) { bot = c; break; }
    }
    if (!bot) continue;
    const y0 = top.y1 + 1, y1 = bot.y0 - 1, bx0 = Math.max(top.x0, bot.x0), bx1 = Math.min(top.x1, bot.x1);
    bands.push({ y0, y1, xs: mergeX(Vs.filter(v => v.y0 <= y0 + tol && v.y1 >= y1 - tol && v.x0 >= bx0 - tol && v.x1 <= bx1 + tol)) });
  }
  // 기준 칸 나눔: 7줄이 온전히 잡힌 곳
  const tmpl = [...groups, ...bands].filter(c => full(c.xs));
  if (!tmpl.length) return [];
  const colsFor = c => {
    if (full(c.xs)) return c.xs;
    if (c.xs.length < 3 || c.xs.length >= 7) return null;
    const t = tmpl.reduce((a, b) => (Math.abs(b.y0 - c.y0) < Math.abs(a.y0 - c.y0) ? b : a));
    return c.xs.every(v => t.xs.some(tv => Math.abs(mid(v) - mid(tv)) <= tol2)) ? t.xs : null;
  };

  const found = [];
  for (const g of groups) {
    const xs = colsFor(g); if (!xs) continue;
    const tx0 = xs[0].x0, tx1 = xs[6].x1, tw = tx1 - tx0;
    const ys = [];
    for (const s of Hs) {
      if (s.y1 < g.y0 - tol2 || s.y0 > g.y1 + tol2) continue;
      if (Math.min(s.x1, tx1) - Math.max(s.x0, tx0) < tw * 0.5) continue;
      const l = ys[ys.length - 1];
      if (l && s.y0 - l.y1 < minGap * 0.5) l.y1 = Math.max(l.y1, s.y1); else ys.push({ y0: s.y0, y1: s.y1 });
    }
    if (!ys.length || ys[0].y0 - g.y0 > minGap * 0.6) ys.unshift({ y0: g.y0, y1: g.y0 });
    if (g.y1 - ys[ys.length - 1].y1 > minGap * 0.6) ys.push({ y0: g.y1, y1: g.y1 });
    for (let i = 0; i + 1 < ys.length; i++) if (ys[i + 1].y0 - ys[i].y1 >= minGap) found.push({ y0: ys[i].y1 + 1, y1: ys[i + 1].y0 - 1, xs });
  }
  for (const b of bands) {
    const xs = colsFor(b); if (!xs) continue;
    const covered = found.some(r => Math.min(r.y1, b.y1) - Math.max(r.y0, b.y0) > 0.5 * Math.min(r.y1 - r.y0, b.y1 - b.y0));
    if (!covered) found.push({ y0: b.y0, y1: b.y1, xs });
  }
  // 너무 큰 줄(가로선이 빠져 두세 줄이 합쳐진 것)은 보통 줄 높이로 나눈다
  // (이 양식은 모든 줄 높이가 같으므로, 찾은 줄 중 가장 낮은 것을 보통 높이로 삼는다)
  const hs = found.map(r => r.y1 - r.y0).filter(v => v <= maxGap).sort((a, b) => a - b), med = hs.length ? hs[0] : 0;
  const rows = [];
  for (const r of found.sort((a, b) => a.y0 - b.y0)) {
    const hh = r.y1 - r.y0, n = med ? Math.round(hh / med) : 1;
    if (med && hh > med * 1.6 && n >= 2) {
      const step = (hh + 1) / n;
      for (let k = 0; k < n; k++) rows.push({ y0: Math.round(r.y0 + k * step) + (k ? 3 : 0), y1: Math.round(r.y0 + (k + 1) * step) - (k < n - 1 ? 3 : 1), xs: r.xs, est: true });
    } else rows.push(r);
  }
  // 겹치는 줄 정리 (같은 줄이 두 방식에서 약간 다르게 잡힌 경우)
  const out = [];
  for (const r of rows) {
    const l = out[out.length - 1];
    if (l && Math.min(l.y1, r.y1) - Math.max(l.y0, r.y0) > 0.5 * Math.min(l.y1 - l.y0, r.y1 - r.y0)) { if (med && Math.abs(r.y1 - r.y0 - med) < Math.abs(l.y1 - l.y0 - med)) out[out.length - 1] = r; continue; }
    out.push(r);
  }
  return out.map(r => ({ y0: r.y0, y1: r.y1, est: !!r.est, cells: Array.from({ length: 6 }, (_, k) => ({ x0: r.xs[k].x1 + 1, x1: r.xs[k + 1].x0 - 1 })) }));
}

// 선 지우기 (잉크 마스크에서 선 자리를 뺀다. 선 두께만큼 살짝 넓혀서)
export function eraseLines(bin, hm, vm, w, h, grow = 2) {
  const out = bin.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (hm[i]) for (let d = -grow; d <= grow; d++) { const yy = y + d; if (yy >= 0 && yy < h) out[yy * w + x] = 0; }
    if (vm[i]) for (let d = -grow; d <= grow; d++) { const xx = x + d; if (xx >= 0 && xx < w) out[y * w + xx] = 0; }
  }
  return out;
}

// 영역 안 잉크 비율
export function inkRatio(bin, w, x0, y0, x1, y1) {
  let n = 0; const area = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) n += bin[y * w + x];
  return n / area;
}

// 영역 안 잉크의 실제 테두리 (없으면 null)
export function inkBox(bin, w, x0, y0, x1, y1) {
  let ax = 1e9, ay = 1e9, bx = -1, by = -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (bin[y * w + x]) { if (x < ax) ax = x; if (x > bx) bx = x; if (y < ay) ay = y; if (y > by) by = y; }
  return bx < 0 ? null : { x0: ax, y0: ay, x1: bx, y1: by };
}

// 영역 안 글자 덩어리(가로로 떨어진 것끼리) → [{x0,x1,y0,y1}]
export function glyphRuns(bin, w, b) {
  const runs = []; let cur = null;
  for (let x = b.x0; x <= b.x1 + 1; x++) {
    let ya = -1, yb = -1;
    if (x <= b.x1) for (let y = b.y0; y <= b.y1; y++) if (bin[y * w + x]) { if (ya < 0) ya = y; yb = y; }
    if (ya >= 0) { if (!cur) cur = { x0: x, x1: x, y0: ya, y1: yb }; else { cur.x1 = x; cur.y0 = Math.min(cur.y0, ya); cur.y1 = Math.max(cur.y1, yb); } }
    else if (cur) { runs.push(cur); cur = null; }
  }
  return runs.filter(r => r.x1 - r.x0 >= 1 || r.y1 - r.y0 >= 4);
}

// 주민번호 칸이 "앞 7자리 + 별표(******)" 모양인지 그림으로 판별한다.
// 숫자는 키가 크고 별표는 작다는 점을 쓴다. (별표를 숫자 5·8로 잘못 읽는 것을 막는다)
export function looksMasked(bin, w, b) {
  const runs = glyphRuns(bin, w, b);
  if (runs.length < 8) return false;
  const hs = runs.map(r => r.y1 - r.y0 + 1), top = [...hs].sort((a, c) => c - a), H = top[Math.min(2, top.length - 1)];
  const tall = runs.map((r, i) => hs[i] >= H * 0.78);
  const lastTall = tall.lastIndexOf(true), nTall = tall.filter(Boolean).length;
  if (nTall < 5 || nTall > 9) return false;
  const tail = runs.slice(lastTall + 1);
  if (!tail.length) return false;
  const digitW = (runs[lastTall].x1 - runs[0].x0) / Math.max(1, nTall);
  const tailW = tail[tail.length - 1].x1 - tail[0].x0;
  return tailW >= digitW * 2.2;
}
