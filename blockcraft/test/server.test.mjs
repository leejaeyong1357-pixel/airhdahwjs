// 서버 통합 테스트 — node --test test/
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { startServer, post, connect, sleep } from "./helpers.mjs";
import { B } from "../shared/blocks.js";
import { I } from "../shared/items.js";

let srv;
/** 아이템을 단축칸 8번으로 옮겨 손에 든다 (가방에 있으면 숫자키 바꾸기) */
async function hold(c, id) {
  const st = await c.ask({ t: "op", op: { o: "close" }, d: "x" }, (m) => m.t === "sync");
  let i = st.inv.findIndex((s) => s?.id === id);
  if (i < 0) throw new Error(`아이템 ${id} 없음`);
  if (i > 8) { c.send({ t: "op", op: { o: "key", a: "inv", i, n: 8 } }); i = 8; }
  c.send({ t: "sel", i });
  await sleep(50);
}
before(async () => { srv = await startServer(); });
after(async () => { await srv.stop(); srv.cleanup(); });

const findBlock = (c, wants) => {
  if (!Array.isArray(wants)) wants = [wants];
  // 스폰 근처 지형에서 원하는 블록 찾기 (서버와 같은 시드 생성기 사용)
  return import("../shared/worldgen.js").then(({ generateChunk, index, CHUNK, HEIGHT }) => {
    const [sx, , sz] = c.welcome.spawn;
    const cx = Math.floor(sx / CHUNK), cz = Math.floor(sz / CHUNK);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const d = generateChunk(cx + dx, cz + dz, c.welcome.seed);
      for (let y = HEIGHT - 1; y > 0; y--) for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
        if (wants.includes(d[index(x, y, z)]) && d[index(x, y - 1, z)] !== d[index(x, y, z)]) return [(cx + dx) * CHUNK + x, y, (cz + dz) * CHUNK + z, d[index(x, y, z)]];
      }
    }
    return null;
  });
};

test("가입 · 로그인 · 잘못된 비밀번호", async () => {
  const r1 = await post(srv.base, "/api/register", { name: "관리자", password: "1234" });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.admin, true, "지정한 아이디(ADMINS)만 관리자");
  const r2 = await post(srv.base, "/api/register", { name: "직원1", password: "abcd" });
  assert.equal(r2.body.admin, false);
  assert.equal((await post(srv.base, "/api/register", { name: "직원1", password: "abcd" })).status, 400, "중복 아이디");
  assert.equal((await post(srv.base, "/api/register", { name: "a", password: "abcd" })).status, 400, "짧은 아이디");
  assert.equal((await post(srv.base, "/api/login", { name: "직원1", password: "틀림" })).status, 400);
  const ok = await post(srv.base, "/api/login", { name: "직원1", password: "abcd" });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  const me = await post(srv.base, "/api/me", { token: ok.body.token });
  assert.equal(me.body.name, "직원1");
});

test("캐릭터 꾸미기 — 관리자 옷은 관리자만, 접속한 사람들에게 바로 보임", async () => {
  const { body: a } = await post(srv.base, "/api/login", { name: "관리자", password: "1234" });
  const { body: b } = await post(srv.base, "/api/login", { name: "직원1", password: "abcd" });
  const me0 = await post(srv.base, "/api/me", { token: b.token });
  assert.equal(me0.body.look, null, "처음엔 꾸민 적 없음 → 캐릭터 만들기 화면");
  const r1 = await post(srv.base, "/api/look", { token: b.token, look: { gender: "f", outfit: "admin", sleeve: "short", hair: "pony", hairColor: "blond" } });
  assert.deepEqual(r1.body.look, { gender: "f", outfit: "white", sleeve: "short", hair: "pony", hairColor: "blond" }, "일반 직원은 관리자 옷 불가");
  const r2 = await post(srv.base, "/api/look", { token: a.token, look: { gender: "m", outfit: "admin", sleeve: "long", hair: "pony", hairColor: "black" } });
  assert.equal(r2.body.look.outfit, "admin");
  assert.equal(r2.body.look.hair, "short", "남자에게 없는 머리 모양은 기본값으로");
  const A = await connect(srv.base, a.token);
  const Bc = await connect(srv.base, b.token);
  assert.equal(Bc.welcome.players.find((p) => p.name === "관리자").look.outfit, "admin", "다른 사람 모습이 보임");
  const seen = A.wait((m) => m.t === "look" && m.look.outfit === "navy");
  await post(srv.base, "/api/look", { token: b.token, look: { gender: "f", outfit: "navy", sleeve: "long", hair: "bob", hairColor: "brown" } });
  await seen;
  A.close(); Bc.close();
});

test("토큰 없이 접속 거부", async () => {
  const c = await connect(srv.base, "가짜토큰");
  assert.equal(c.welcome.t, "auth");
  c.close();
});

test("빈손 시작 · 나무 캐기(시간 필요) · 줍기 · 조합 · 놓기 · 동기화", async () => {
  const { body: a } = await post(srv.base, "/api/login", { name: "관리자", password: "1234" });
  const { body: b } = await post(srv.base, "/api/login", { name: "직원1", password: "abcd" });
  const A = await connect(srv.base, a.token);
  const Bc = await connect(srv.base, b.token);
  assert.equal(A.welcome.t, "welcome");
  const kit = await A.wait((m) => m.t === "sync");
  assert.deepEqual(kit.inv.filter(Boolean).map((s) => s.id).sort(), [302, 303, 304], "처음엔 칼 · M16 · 저격총만");
  assert.deepEqual(A.welcome.spawn, Bc.welcome.spawn, "모두 같은 스폰");
  await A.wait((m) => m.t === "join" && m.name === "직원1");

  const log = await findBlock(A, [B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG]);
  assert.ok(log, "근처에 나무가 있어야 함");
  const [x, y, z, LOG] = log;
  const stand = [x + 0.5, y - 1, z + 2.5];
  await A.ask({ t: "chat", msg: `/tp ${stand.join(" ")}` }, (m) => m.t === "tp");
  A.send({ t: "move", p: stand, r: [0, 0] });
  await sleep(100);

  // 너무 빨리 캐면 거절
  A.send({ t: "digstart", x, y, z });
  A.send({ t: "dig", x, y, z });
  const fix = await A.wait((m) => m.t === "sets");
  assert.equal(fix.s[0][3], LOG, "즉시 캐기는 거절되고 원래 블록을 돌려받음");

  // 맨손 나무 = 2 x 1.5 = 3초
  A.send({ t: "digstart", x, y, z });
  await sleep(2400);
  A.send({ t: "dig", x, y, z });
  const brk = await Bc.wait((m) => m.t === "sets" && m.s[0][0] === x && m.s[0][1] === y);
  assert.equal(brk.s[0][3], B.AIR ?? 0, "다른 사람에게도 블록이 사라짐");

  // 떨어진 아이템 줍기
  const ents = await A.wait((m) => m.t === "ents" && m.i.some((it) => it[1] === LOG), 3000);
  const item = ents.i.find((it) => it[1] === LOG);
  await sleep(600);
  A.send({ t: "pickup", id: item[0] });
  Bc.send({ t: "pickup", id: item[0] }); // 동시에 주워도 한 명만
  const give = await A.wait((m) => m.t === "give");
  assert.equal(give.item.id, LOG);
  await sleep(200);
  assert.ok(!Bc.msgs.some((m) => m.t === "give"), "같은 아이템을 두 명이 받으면 안 됨");

  // 인벤토리 조합: 나무 → 판자 4
  const op = (o) => A.send({ t: "op", op: o });
  const s0 = await A.ask({ t: "op", op: { o: "close" }, d: "x" }, (m) => m.t === "sync");
  const li = s0.inv.findIndex((it) => it?.id === LOG);
  const free = s0.inv.findIndex((it, i) => !it && i !== li);
  op({ o: "open", screen: "inv" });
  op({ o: "click", a: "inv", i: li, b: 0 });          // 나무 집기
  op({ o: "click", a: "craft", i: 0, b: 0 });         // 조합칸에 놓기
  op({ o: "click", a: "result", b: 0 });              // 판자 4 집기
  op({ o: "click", a: "inv", i: free, b: 0 });        // 빈 칸에 놓기
  op({ o: "close" });
  // 일부러 틀린 요약 → 서버가 정답을 보냄
  const sync = await A.ask({ t: "op", op: { o: "close" }, d: "틀린요약" }, (m) => m.t === "sync");
  assert.deepEqual(sync.inv[free], { id: B.PLANKS, n: 4 }, "판자 4개");
  assert.equal(sync.inv[li], null, "나무는 써서 없어짐");

  // 블록이 아닌 것(칼)으로는 놓을 수 없음
  A.send({ t: "sel", i: sync.inv.findIndex((it) => it?.id === 302) });
  const nofix = await A.ask({ t: "place", x, y, z }, (m) => m.t === "sets");
  assert.equal(nofix.s[0][3], 0, "블록이 아니면 못 놓음");

  // 판자 놓기
  A.send({ t: "sel", i: free });
  A.send({ t: "place", x, y, z });
  const placed = await Bc.wait((m) => m.t === "sets" && m.s[0][3] === B.PLANKS);
  assert.deepEqual(placed.s[0].slice(0, 3), [x, y, z]);

  // 채팅
  Bc.send({ t: "chat", msg: "안녕하세요" });
  const chat = await A.wait((m) => m.t === "chat" && m.name === "직원1");
  assert.equal(chat.msg, "안녕하세요");

  // 일반 사용자는 관리자 명령 불가, 관리자는 가능
  const deny = await Bc.ask({ t: "chat", msg: "/give 다이아몬드 5" }, (m) => m.t === "chat" && m.msg.includes("관리자만"));
  assert.ok(deny);
  const g = await A.ask({ t: "chat", msg: "/give 다이아몬드 5" }, (m) => m.t === "give");
  assert.deepEqual(g.item, { id: I.DIAMOND, n: 5 });
  A.close(); Bc.close();
});

test("작업대 · 곡괭이 · 화로 굽기 · 상자", async () => {
  const { body: a } = await post(srv.base, "/api/login", { name: "관리자", password: "1234" });
  const A = await connect(srv.base, a.token);
  const say = (msg) => A.ask({ t: "chat", msg }, (m) => m.t === "give");
  await say("/give 참나무판자 64");
  await say("/give 조약돌 64");
  await say("/give 막대기 8");
  await say("/give 철광석 3");
  await say("/give 석탄 2");
  await say("/give 다이아몬드 2");
  const s0 = await A.ask({ t: "op", op: { o: "close" }, d: "x" }, (m) => m.t === "sync");
  const slotOf = (st, id) => st.inv.findIndex((s) => s?.id === id);
  const planks = slotOf(s0, B.PLANKS), cobble = slotOf(s0, B.COBBLE), stick = slotOf(s0, I.STICK);
  assert.ok(planks >= 0 && cobble >= 0 && stick >= 0);

  // 작업대 놓기
  const [sx, sy, sz] = A.welcome.spawn;
  // 스폰 근처에서 위로 4칸이 비어 있는 땅 찾기 (나뭇잎 · 나무 피하기)
  const { generateChunk, index, CHUNK, HEIGHT } = await import("../shared/worldgen.js");
  let tx = 0, tz = 0, ty = 0;
  search: for (let r = 2; r < 20; r++) for (let dx = -r; dx <= r; dx++) {
    const x = Math.floor(sx) + dx, z = Math.floor(sz) + r;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const d = generateChunk(cx, cz, A.welcome.seed);
    const at = (y) => d[index(x - cx * CHUNK, y, z - cz * CHUNK)];
    for (let y = HEIGHT - 6; y > 30; y--) {
      if (at(y) === 0 || at(y) === 31) continue;
      if ([1, 2, 3, 5].includes(at(y)) && [1, 2, 3, 4].every((k) => at(y + k) === 0 || at(y + k) === 31)) { tx = x; ty = y + 1; tz = z; break search; }
      break;
    }
  }
  assert.ok(ty, "놓을 자리를 찾음");
  await A.ask({ t: "chat", msg: `/give 작업대 1` }, (m) => m.t === "give");
  const s1 = await A.ask({ t: "op", op: { o: "close" }, d: "x" }, (m) => m.t === "sync");
  await A.ask({ t: "chat", msg: "/gamemode creative" }, (m) => m.t === "mode");
  // 놓을 자리 위에 받침이 필요 없도록 공중이 아닌 땅 위를 찾는다
  await A.ask({ t: "chat", msg: `/tp ${sx} ${ty} ${sz}` }, (m) => m.t === "tp");
  A.send({ t: "move", p: [sx, ty, sz], r: [0, 0] });
  await sleep(100);
  await hold(A, B.CRAFTING_TABLE);
  A.send({ t: "place", x: tx, y: ty, z: tz });
  await sleep(150);
  // 작업대 열기 → 3x3 조합 (돌 곡괭이)
  A.send({ t: "use", x: tx, y: ty, z: tz });
  const op = (o) => A.send({ t: "op", op: o });
  op({ o: "click", a: "inv", i: cobble, b: 0 });
  for (const i of [0, 1, 2]) op({ o: "click", a: "craft", i, b: 2 }); // 오른쪽 클릭 1개씩
  op({ o: "click", a: "inv", i: cobble, b: 0 });
  op({ o: "click", a: "inv", i: stick, b: 0 });
  for (const i of [4, 7]) op({ o: "click", a: "craft", i, b: 2 });
  op({ o: "click", a: "inv", i: stick, b: 0 });
  op({ o: "click", a: "result", b: 0, s: true });
  const s2 = await A.ask({ t: "op", op: { o: "close" }, d: "x" }, (m) => m.t === "sync");
  assert.ok(slotOf(s2, 274) >= 0, "돌 곡괭이가 만들어짐");

  // 화로 놓고 철광석 굽기
  await A.ask({ t: "chat", msg: "/give 화로 1" }, (m) => m.t === "give");
  const s3 = await A.ask({ t: "op", op: { o: "close" }, d: "x" }, (m) => m.t === "sync");
  await hold(A, B.FURNACE);
  A.send({ t: "place", x: tx, y: ty + 1, z: tz });
  await sleep(150);
  A.send({ t: "use", x: tx, y: ty + 1, z: tz });
  const box = await A.wait((m) => m.t === "box");
  assert.equal(box.kind, "furnace");
  A.send({ t: "cop", op: { a: "inv", i: slotOf(s3, B.IRON_ORE), s: true } });
  A.send({ t: "cop", op: { a: "inv", i: slotOf(s3, I.COAL), s: true } });
  const cooking = await A.wait((m) => m.t === "box" && m.in?.id === B.IRON_ORE && m.burn > 0, 3000);
  assert.ok(cooking.fuel === null || cooking.fuel.n === 1, "석탄 1개 태움");
  const done = await A.wait((m) => m.t === "box" && m.out?.id === I.IRON_INGOT, 12000);
  assert.equal(done.out.n, 1, "10초 뒤 철괴 1개");
  A.send({ t: "cclose" });

  // 상자: 놓고 넣었다가 다시 열기
  await A.ask({ t: "chat", msg: "/give 상자 1" }, (m) => m.t === "give");
  const s4 = await A.ask({ t: "op", op: { o: "close" }, d: "x" }, (m) => m.t === "sync");
  await hold(A, B.CHEST);
  A.send({ t: "place", x: tx, y: ty + 2, z: tz });
  await sleep(150);
  A.send({ t: "use", x: tx, y: ty + 2, z: tz });
  await A.wait((m) => m.t === "box" && m.kind === "chest");
  A.send({ t: "cop", op: { a: "inv", i: slotOf(s4, I.DIAMOND), s: true } });
  const chest = await A.wait((m) => m.t === "box" && m.slots?.some((s) => s?.id === I.DIAMOND));
  assert.ok(chest);
  A.send({ t: "cclose" });
  A.close();
});

test("몹 · 전투 · 피해 · 죽음 · 부활", async () => {
  const { body: b } = await post(srv.base, "/api/login", { name: "직원1", password: "abcd" });
  const { body: a } = await post(srv.base, "/api/login", { name: "관리자", password: "1234" });
  const A = await connect(srv.base, a.token);
  const Bc = await connect(srv.base, b.token);
  await A.ask({ t: "chat", msg: "/gamemode survival" }, (m) => m.t === "mode");
  const [sx, , sz] = A.welcome.spawn;
  const { heightAt } = await import("../shared/worldgen.js");
  const gy = heightAt(Math.floor(sx), Math.floor(sz), A.welcome.seed) + 1;
  await A.ask({ t: "chat", msg: "/time midnight" }, (m) => m.t === "time");
  await A.ask({ t: "chat", msg: `/tp ${sx} ${gy} ${sz}` }, (m) => m.t === "tp");
  A.send({ t: "move", p: [sx, gy, sz], r: [0, 0] });
  Bc.send({ t: "move", p: [sx + 30, gy + 30, sz], r: [0, 0] });
  await sleep(100);
  const ent = await A.ask({ t: "chat", msg: "/summon 좀비 1" }, (m) => m.t === "ents" && m.m.some((e) => e[1] === 4));
  const z = ent.m.find((e) => e[1] === 4);
  // 좀비가 다가와 때린다
  const hurt = await A.wait((m) => m.t === "hurt" && m.cause === "mob", 8000);
  assert.ok(hurt.dmg > 0, "좀비에게 맞음");
  const stats = await A.wait((m) => m.t === "stats" && m.hp < 20);
  assert.ok(stats.hp < 20, "체력 감소");
  // 플레이어가 좀비를 때려서 잡기
  await A.ask({ t: "chat", msg: "/give 다이아몬드검 1" }, (m) => m.t === "give");
  const s = await A.ask({ t: "op", op: { o: "close" }, d: "x" }, (m) => m.t === "sync");
  await hold(A, 285);
  let dead = null;
  for (let i = 0; i < 10 && !dead; i++) {
    const e = (await A.wait((m) => m.t === "ents")).m.find((q) => q[0] === z[0]);
    if (e) A.send({ t: "move", p: [e[2], e[3], e[4] + 1.5], r: [0, 0] });
    await sleep(650);
    A.send({ t: "attack", mob: z[0] });
    dead = A.msgs.find((m) => m.t === "mobdie" && m.id === z[0]);
    await sleep(50);
  }
  dead ??= await A.wait((m) => m.t === "mobdie" && m.id === z[0], 2000);
  assert.ok(dead, "좀비가 죽음");
  // 낙하 피해로 죽기 → 부활
  A.send({ t: "env", dmg: 100, why: "fall" });
  const d = await A.wait((m) => m.t === "dead");
  assert.match(d.why, /떨어/);
  A.send({ t: "respawn" });
  const rs = await A.wait((m) => m.t === "respawn");
  assert.deepEqual(rs.p, A.welcome.spawn, "스폰에서 부활");
  A.close(); Bc.close();
});

test("플레이어끼리 때리기 (PvP) · 다른 사람에게 맞는 모습 보임", async () => {
  const { body: a } = await post(srv.base, "/api/login", { name: "관리자", password: "1234" });
  const { body: b } = await post(srv.base, "/api/login", { name: "직원1", password: "abcd" });
  const A = await connect(srv.base, a.token);
  const Bc = await connect(srv.base, b.token);
  await A.ask({ t: "chat", msg: "/gamemode survival" }, (m) => m.t === "mode");
  await A.ask({ t: "chat", msg: "/gamemode survival 직원1" }, (m) => m.t === "chat");
  const [sx, sy, sz] = A.welcome.spawn;
  await A.ask({ t: "chat", msg: `/tp ${sx} ${sy} ${sz}` }, (m) => m.t === "tp");
  A.send({ t: "move", p: [sx, sy, sz], r: [0, 0] });
  Bc.send({ t: "move", p: [sx, sy, sz - 2], r: [0, 0] });
  await sleep(700);
  const hurt = Bc.ask({ t: "ping" }, (m) => m.t === "hurt" && m.cause === "player");
  const seen = A.wait((m) => m.t === "phurt" && m.id === Bc.welcome.id);
  A.send({ t: "attack", pid: Bc.welcome.id });
  const h = await hurt;
  assert.ok(h.dmg > 0, "맞은 사람 체력 감소");
  await seen; // 때린 사람 화면에 상대가 빨갛게 번쩍
  const st = await Bc.wait((m) => m.t === "stats" && m.hp < 20);
  assert.ok(st.hp < 20);
  // PvP 끄면 안 맞음
  await A.ask({ t: "chat", msg: "/gamerule pvp false" }, (m) => m.t === "rules");
  await sleep(700);
  Bc.msgs.length = 0;
  A.send({ t: "attack", pid: Bc.welcome.id });
  await sleep(400);
  assert.ok(!Bc.msgs.some((m) => m.t === "hurt"), "pvp 꺼지면 피해 없음");
  await A.ask({ t: "chat", msg: "/gamerule pvp true" }, (m) => m.t === "rules");
  A.close(); Bc.close();
});

test("총 · 칼 — 헤드샷 한 방, 몸 10발, 칼 20번, 탄창 30/10, 장전", async () => {
  const { body: a } = await post(srv.base, "/api/login", { name: "관리자", password: "1234" });
  const { body: b } = await post(srv.base, "/api/login", { name: "직원1", password: "abcd" });
  const A = await connect(srv.base, a.token);
  const Bc = await connect(srv.base, b.token);
  await A.ask({ t: "chat", msg: "/gamerule pvp true" }, (m) => m.t === "rules" || m.t === "chat");
  await A.ask({ t: "chat", msg: "/gamemode survival 직원1" }, (m) => m.t === "chat");
  // 탁 트인 하늘 위에 나란히 (공중이라 블록에 안 막힘)
  const [sx, , sz] = A.welcome.spawn;
  const y = 90;
  await A.ask({ t: "chat", msg: `/tp ${sx} ${y} ${sz}` }, (m) => m.t === "tp");
  await A.ask({ t: "chat", msg: `/tp 직원1 ${sx} ${y} ${sz}` }, (m) => m.t === "tp" || m.t === "chat");
  const hold = async (c, id) => {
    const st = await c.ask({ t: "op", op: { o: "close" }, d: "x" }, (m) => m.t === "sync");
    c.send({ t: "sel", i: st.inv.findIndex((it) => it?.id === id) });
    await sleep(60);
  };
  const place = (c, p) => c.send({ t: "move", p, r: [0, 0] });
  place(A, [sx, y, sz]); place(Bc, [sx, y, sz - 6]);
  await sleep(200);
  const ammo = await A.ask({ t: "chat", msg: "/time noon" }, (m) => m.t === "time");
  void ammo;
  // 저격총 헤드샷 → 한 방에 죽음
  await hold(A, 304);
  const eye = [sx, y + 1.5, sz];
  const shootAt = (tx, ty, tz) => { const d = [tx - eye[0], ty - eye[1], tz - eye[2]]; A.send({ t: "shoot", o: eye, d }); };
  const dead = Bc.wait((m) => m.t === "dead", 3000);
  const hit = A.wait((m) => m.t === "hit");
  shootAt(sx, y + 1.7, sz - 6);
  const h = await hit;
  assert.equal(h.head, true, "머리 맞음");
  assert.equal(h.ammo[304], 9, "저격총 10발 중 1발 씀");
  assert.match((await dead).why, /헤드샷/);
  Bc.send({ t: "respawn" });
  await Bc.wait((m) => m.t === "respawn");
  const kit = await Bc.wait((m) => m.t === "ammo");
  assert.equal(kit.ammo[303], 30, "부활하면 M16 30발");
  assert.equal(kit.ammo[304], 10, "저격총 10발");
  // 몸에 10발 → 죽음 (M16)
  await A.ask({ t: "chat", msg: `/tp 직원1 ${sx} ${y} ${sz}` }, (m) => m.t === "chat");
  place(Bc, [sx, y, sz - 6]);
  await sleep(200);
  await hold(A, 303);
  let shots = 0;
  const died = Bc.wait((m) => m.t === "dead", 8000);
  let done = false;
  died.then(() => { done = true; }, () => {});
  while (!done && shots < 14) { shootAt(sx, y + 1.0, sz - 6); shots++; await sleep(130); }
  await died;
  assert.equal(shots, 10, "몸통 10발에 죽음");
  // 장전
  const r = A.ask({ t: "reload" }, (m) => m.t === "ammo" && m.reloading);
  await r;
  const full = await A.wait((m) => m.t === "ammo" && !m.reloading && m.ammo[303] === 30, 4000);
  assert.equal(full.ammo[303], 30, "장전하면 30발");
  // 칼 20번
  Bc.send({ t: "respawn" });
  await Bc.wait((m) => m.t === "respawn");
  await A.ask({ t: "chat", msg: `/tp 직원1 ${sx} ${y} ${sz}` }, (m) => m.t === "chat" || m.t === "tp");
  place(Bc, [sx, y, sz - 1.5]);
  await sleep(200);
  await hold(A, 302);
  let stabs = 0;
  const died2 = Bc.wait((m) => m.t === "dead", 15000);
  let done2 = false;
  died2.then(() => { done2 = true; }, () => {});
  while (!done2 && stabs < 30) { A.send({ t: "attack", pid: Bc.welcome.id }); stabs++; await sleep(260); }
  await died2;
  assert.equal(stabs, 20, "칼 20번에 죽음");
  Bc.send({ t: "respawn" });
  A.close(); Bc.close();
});

test("새로 가입한 직원은 관리자가 아님", async () => {
  const r = await post(srv.base, "/api/register", { name: "신입", password: "1234" });
  assert.equal(r.body.admin, false);
  const c = await connect(srv.base, r.body.token);
  const res = await c.ask({ t: "chat", msg: "/give 다이아몬드 1" }, (m) => m.t === "chat" && m.msg.includes("관리자"));
  assert.match(res.msg, /관리자만/);
  c.close();
});

test("싱글플레이 월드는 따로", async () => {
  const { body: b } = await post(srv.base, "/api/login", { name: "직원1", password: "abcd" });
  const S = await connect(srv.base, b.token, "solo");
  assert.equal(S.welcome.realm, "solo:직원1");
  assert.equal(S.welcome.players.length, 0);
  S.send({ t: "chat", msg: "/gamemode creative" });
  const mode = await S.wait((m) => m.t === "mode" || (m.t === "chat" && m.msg.includes("관리자만")));
  assert.equal(mode.t, "chat", "관리자가 아니면 싱글플레이에서도 명령 불가");
  S.close();
});

test("서버를 껐다 켜도 월드 · 인벤토리 유지", async () => {
  const { body: a } = await post(srv.base, "/api/login", { name: "관리자", password: "1234" });
  let A = await connect(srv.base, a.token);
  await A.ask({ t: "chat", msg: "/give 흑요석 7" }, (m) => m.t === "give");
  const editsBefore = Object.keys(A.welcome.edits).length;
  A.close();
  await sleep(200);
  const port = srv.port, dataDir = srv.dataDir;
  await srv.stop();
  srv = await startServer({ port, dataDir });
  const r = await post(srv.base, "/api/login", { name: "관리자", password: "1234" });
  A = await connect(srv.base, r.body.token);
  assert.ok(A.welcome.inv.some((s) => s?.id === B.OBSIDIAN && s.n === 7), "인벤토리 유지");
  assert.ok(Object.keys(A.welcome.edits).length >= editsBefore && editsBefore > 0, "바뀐 블록 유지");
  A.close();
});
