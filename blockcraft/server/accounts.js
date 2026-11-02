// 계정 — 가입 · 로그인 · 자동 로그인 토큰 · 계정별 진행 상황(위치 · 인벤토리 등) 저장
// 비밀번호는 scrypt 해시로만 저장하고, 토큰도 해시로만 저장한다.
import { scrypt, randomBytes, createHash, timingSafeEqual, randomInt } from "node:crypto";
import { join, dirname } from "node:path";
import { writeSafe, readJsonWithBackup } from "./world.js";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const NAME_RE = /^[\p{L}\p{N}_]{2,12}$/u;
const TOKEN_DAYS = 180;

export class Accounts {
  /** admins: 관리자 아이디 목록 (config.json · ADMINS 환경변수). /op 로 지정한 사람(op)도 관리자 */
  constructor(file, admins = []) {
    this.admins = new Set(admins.map((n) => String(n).trim().toLowerCase()).filter(Boolean));
    this.file = file;
    // 망가졌으면 가장 최근 백업에서 되살린다
    this.data = readJsonWithBackup(file, join(dirname(file), "backups")) ?? { users: {}, tokens: {} };
    this.data.users ??= {};
    this.data.tokens ??= {};
    // 예전 규칙(처음 가입자 = 관리자)은 없앤다 — 목록에 있거나 /op 받은 사람만
    for (const [k, u] of Object.entries(this.data.users)) u.admin = this.admins.has(k) || u.op === true;
    this.dirty = false;
    this.fails = new Map(); // ip → [시각...]
  }

  save(force = false) {
    if (!this.dirty && !force) return;
    writeSafe(this.file, JSON.stringify(this.data));
    this.dirty = false;
  }

  get count() { return Object.keys(this.data.users).length; }
  get(name) { return this.data.users[String(name).toLowerCase()] ?? null; }

  tooMany(ip) {
    const now = Date.now();
    const list = (this.fails.get(ip) ?? []).filter((t) => now - t < 5 * 60_000);
    this.fails.set(ip, list);
    return list.length >= 10;
  }
  failed(ip) { this.fails.get(ip)?.push(Date.now()) ?? this.fails.set(ip, [Date.now()]); }

  async register(name, password, ip) {
    name = String(name ?? "").trim();
    password = String(password ?? "");
    if (!NAME_RE.test(name)) throw new Error("아이디는 한글 · 영문 · 숫자 2~12자로 만들어 주세요.");
    if (password.length < 4 || password.length > 64) throw new Error("비밀번호는 4자 이상으로 만들어 주세요.");
    if (this.get(name)) throw new Error("이미 있는 아이디입니다. 다른 아이디를 써 주세요.");
    if (this.tooMany(ip)) throw new Error("잠시 후 다시 시도해 주세요.");
    const salt = randomBytes(16).toString("hex");
    const hash = (await scryptAsync(password, salt, 64)).toString("hex");
    if (this.get(name)) throw new Error("이미 있는 아이디입니다. 다른 아이디를 써 주세요.");
    const admin = this.admins.has(name.toLowerCase()); // 관리자는 config.json 에 적은 아이디만
    this.data.users[name.toLowerCase()] = {
      name, salt, hash, admin, color: randomInt(0, 360), created: new Date().toISOString(), state: null,
    };
    this.dirty = true;
    this.save();
    return this.issue(name);
  }

  async login(name, password, ip) {
    if (this.tooMany(ip)) throw new Error("로그인 실패가 많습니다. 5분 뒤에 다시 시도해 주세요.");
    const u = this.get(name);
    const salt = u?.salt ?? "0".repeat(32);
    const hash = await scryptAsync(String(password ?? ""), salt, 64);
    if (!u || !timingSafeEqual(hash, Buffer.from(u.hash, "hex"))) {
      this.failed(ip);
      throw new Error("아이디 또는 비밀번호가 맞지 않습니다.");
    }
    return this.issue(u.name);
  }

  issue(name) {
    const token = randomBytes(24).toString("base64url");
    this.data.tokens[sha(token)] = { key: name.toLowerCase(), created: Date.now() };
    // 오래된 토큰 정리
    const old = Date.now() - TOKEN_DAYS * 86400_000;
    for (const [k, t] of Object.entries(this.data.tokens)) if (t.created < old) delete this.data.tokens[k];
    this.dirty = true;
    this.save();
    const u = this.get(name);
    return { token, name: u.name, admin: u.admin };
  }

  byToken(token) {
    const t = this.data.tokens[sha(String(token ?? ""))];
    if (!t || t.created < Date.now() - TOKEN_DAYS * 86400_000) return null;
    return this.data.users[t.key] ?? null;
  }

  logout(token) {
    delete this.data.tokens[sha(String(token ?? ""))];
    this.dirty = true;
  }

  /** 관리자가 비밀번호를 잊은 사람 비밀번호를 바꿔 줄 때 (서버 창에서) */
  async setPassword(name, password) {
    const u = this.get(name);
    if (!u) throw new Error("없는 아이디");
    u.salt = randomBytes(16).toString("hex");
    u.hash = (await scryptAsync(String(password), u.salt, 64)).toString("hex");
    for (const [k, t] of Object.entries(this.data.tokens)) if (t.key === name.toLowerCase()) delete this.data.tokens[k];
    this.dirty = true;
    this.save();
  }
}

const sha = (s) => createHash("sha256").update(s).digest("hex");
