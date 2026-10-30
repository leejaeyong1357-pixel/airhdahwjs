// 접속한 플레이어 — 인벤토리 · 체력 · 배고픔 · 경험치는 서버가 정한다.
import { ITEMS } from "../shared/items.js";
import { loadState, armorPoints, wear } from "../shared/invops.js";

/** 경험치 합계 → [레벨, 다음 레벨까지 진행 0~1] */
export function levelOf(xp) {
  let lvl = 0, need = 7, total = xp;
  while (total >= need) { total -= need; lvl++; need = lvl < 16 ? 2 * lvl + 7 : lvl < 31 ? 5 * lvl - 38 : 9 * lvl - 158; }
  return [lvl, total / need];
}

export class Player {
  constructor({ id, user, conn, realm, saved, spawn }) {
    this.id = id;
    this.user = user;
    this.name = user.name;
    this.key = user.name.toLowerCase();
    this.admin = !!user.admin;
    this.color = user.color ?? 200;
    this.conn = conn;
    this.realm = realm;
    const s = saved && saved.hp > 0 ? saved : null;
    this.p = Array.isArray(s?.p) && s.p.length === 3 && s.p.every(Number.isFinite) ? s.p : [...spawn];
    this.r = Array.isArray(s?.r) ? s.r : [0, 0];
    this.st = loadState(s);
    this.sel = Number.isInteger(s?.sel) ? Math.max(0, Math.min(8, s.sel)) : 0;
    this.mode = saved?.mode === "creative" ? "creative" : "survival";
    this.hp = s?.hp ?? 20;
    this.food = s?.food ?? 20;
    this.sat = s?.sat ?? 5;
    this.xp = saved?.xp ?? 0;
    this.ex = 0;
    this.dead = false;
    this.regenT = 0; this.starveT = 0;
    this.invuln = 0;
    this.flags = 0;   // 1 웅크림 2 달림
    this.box = null;  // 열어 둔 상자 · 화로
    this.dig = null;  // { x, y, z, t }
    this.eatAt = 0;
    this.statsDirty = true;
  }

  get held() { return this.st.inv[this.sel]; }
  get heldId() { return this.held?.id ?? 0; }
  get armor() { return armorPoints(this.st); }

  send(obj) { this.conn.send(obj); }

  serialize() {
    return {
      p: this.p, r: this.r, hp: this.dead ? 0 : this.hp, food: this.food, sat: this.sat, xp: this.xp,
      inv: this.st.inv, armor: this.st.armor, sel: this.sel, mode: this.mode,
    };
  }

  stats() {
    const [lvl, prog] = levelOf(this.xp);
    return { t: "stats", hp: this.hp, food: this.food, sat: Math.round(this.sat * 10) / 10, armor: this.armor, lvl, prog: Math.round(prog * 1000) / 1000 };
  }
  sync() { this.send({ t: "sync", inv: this.st.inv, armor: this.st.armor, cursor: this.st.cursor, grid: this.st.grid, screen: this.st.screen }); }

  addXp(n) { if (n > 0) { this.xp += n; this.statsDirty = true; } }

  addEx(e) {
    if (this.mode !== "survival") return;
    this.ex += e;
    while (this.ex >= 4) {
      this.ex -= 4;
      if (this.sat > 0) this.sat = Math.max(0, this.sat - 1);
      else this.food = Math.max(0, this.food - 1);
      this.statsDirty = true;
    }
  }

  /** 피해. cause: mob · player · explosion · arrow · fall · drown · lava · starve · cactus · void · kill. 죽으면 true */
  damage(amount, cause, from = null, kb = 1, by = "") {
    if (this.dead || amount <= 0) return false;
    if (this.mode === "creative" && cause !== "void" && cause !== "kill") return false;
    const armored = ["mob", "player", "explosion", "arrow"].includes(cause);
    if (armored && this.invuln > 0) return false;
    let dmg = amount;
    if (armored) {
      dmg *= 1 - Math.min(20, this.armor) / 25;
      for (let i = 0; i < 4; i++) if (this.st.armor[i]) wear(this.st.armor, i, 1);
      this.invuln = 0.5;
      this.needSync = true;
    }
    dmg = Math.round(dmg * 2) / 2;
    this.hp = Math.max(0, this.hp - dmg);
    this.addEx(0.1);
    this.statsDirty = true;
    this.send({ t: "hurt", dmg, from: from?.map((v) => Math.round(v * 100) / 100) ?? null, kb: from ? kb : 0, cause });
    if (this.hp <= 0) { this.deathCause = deathText(cause, by); return true; }
    return false;
  }

  heal(n) { if (this.hp < 20) { this.hp = Math.min(20, this.hp + n); this.statsDirty = true; } }

  eat(id) {
    const f = ITEMS[id];
    if (!f?.food) return false;
    this.food = Math.min(20, this.food + f.food);
    this.sat = Math.min(this.food, this.sat + (f.sat ?? f.food * 0.6));
    this.statsDirty = true;
    return true;
  }

  /** 1초에 20번 — 자연 회복 · 굶주림. 굶어 죽으면 true */
  tick(dt) {
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.dead || this.mode !== "survival") return false;
    if (this.food >= 18 && this.hp < 20) {
      this.regenT += dt;
      if (this.regenT >= (this.food >= 20 && this.sat > 0 ? 0.5 : 4)) { this.regenT = 0; this.heal(1); this.addEx(this.food >= 20 && this.sat > 0 ? 1.5 : 3); }
    } else this.regenT = 0;
    if (this.food <= 0) {
      this.starveT += dt;
      if (this.starveT >= 4) { this.starveT = 0; if (this.hp > 1) return this.damage(1, "starve"); }
    } else this.starveT = 0;
    return false;
  }
}

function deathText(cause, by) {
  return {
    mob: by ? `${by}에게 당했습니다` : "몹에게 당했습니다", player: `${by} 님에게 당했습니다`, explosion: "폭발에 휘말렸습니다",
    arrow: by ? `${by}의 화살에 맞았습니다` : "화살에 맞았습니다", fall: "높은 곳에서 떨어졌습니다", drown: "물에 빠졌습니다",
    lava: "용암에 빠졌습니다", starve: "굶어 죽었습니다", cactus: "선인장에 찔렸습니다", void: "세상 밖으로 떨어졌습니다", kill: "목숨을 끊었습니다",
  }[cause] ?? "죽었습니다";
}
