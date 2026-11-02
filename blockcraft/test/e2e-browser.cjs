// 브라우저 자동 테스트 — 시나리오 A(실행) · C(채굴) · D(제작)
//   1) 서버 켜기:  WORLD_SEED=12345 DATA_DIR=./data-e2e node server.js
//   2) 실행:       node test/e2e-browser.cjs [스크린샷폴더]
//   Playwright 가 필요합니다 (npm i -D playwright 또는 전역 설치). 크롬 경로는 CHROME 환경변수로 지정 가능.
const { chromium } = require('playwright');
const S = process.argv[2] ?? require('os').tmpdir();
const BASE = process.env.BASE ?? 'http://localhost:25565';
require('fs').mkdirSync(S + '/shots', { recursive: true });
const log = (...a) => console.log(...a);
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p.goto(BASE + '/');
  await p.waitForTimeout(800);
  await p.click('#btnStart'); await p.click('#tabJoin');
  await p.fill('#authName', process.env.U || ('e2e' + (Date.now() % 100000))); await p.fill('#authPw', '1234'); await p.fill('#authPw2', '1234');
  await p.click('#authSubmit'); await p.waitForTimeout(600);
  await p.click('#playMulti');
  await p.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
  await p.click('#resumeBtn');
  await p.waitForTimeout(800);
  const inv = () => p.evaluate(() => __game.game.st.inv.map((s) => s && [s.id, s.n, s.dmg ?? 0]));
  const slot = (a, i) => `#invScreen .slot[data-a="${a}"][data-i="${i}"]`;

  // 나무 찾기
  const findTree = () => p.evaluate(() => {
    const w = __game.world, P = __game.player.pos;
    let best = null;
    const free = (b) => b === 0 || b === 31 || b === 32 || b === 33;
    for (let dx = -30; dx <= 30; dx++) for (let dz = -30; dz <= 30; dz++) for (let y = 30; y < 80; y++) {
      const x = Math.floor(P.x) + dx, z = Math.floor(P.z) + dz;
      const bl = w.get(x, y, z);
      if ((bl === 6 || bl === 37 || bl === 39) && w.get(x, y - 1, z) !== bl && w.get(x, y - 1, z) !== 0 && free(w.get(x, y, z + 1)) && free(w.get(x, y + 1, z + 1)) && w.get(x, y - 1, z + 1) !== 0) {
        const d = Math.abs(dx) + Math.abs(dz);
        if (!best || d < best.d) best = { x, y, z, d };
      }
    }
    return best;
  });
  // 나무 4칸 캐기 (기둥 아래 2칸 + 다른 나무)
  let logs = 0;
  for (let k = 0; k < 4 && logs < 3; k++) {
    const t = await findTree();
    if (!t) break;
    await p.evaluate((t) => __game.net({ t: 'chat', msg: `/tp ${t.x + 0.5} ${t.y} ${t.z + 1.5}` }), t);
    await p.waitForTimeout(400);
    await p.evaluate((t) => { const pl = __game.player; pl.pos.set(t.x + 0.5, t.y, t.z + 1.5); pl.vel.set(0, 0, 0); pl.yaw = 0; pl.pitch = -0.5; }, t);
    await p.waitForTimeout(300);
    for (const pitch of [-0.5, 0.1]) {
      await p.evaluate((pt) => { __game.player.pitch = pt; }, pitch);
      await p.waitForTimeout(150);
      const aim = await p.evaluate(() => __game.raycastBlock());
      if (!aim || ![6, 37, 39].includes(aim.b)) continue;
      await p.mouse.down();
      await p.waitForTimeout(3400);
      await p.mouse.up();
      await p.waitForTimeout(300);
    }
    await p.keyboard.down('KeyW'); await p.waitForTimeout(300); await p.keyboard.up('KeyW');
    await p.waitForTimeout(1500);
    logs = (await inv()).filter(Boolean).filter((s) => [6, 37, 39].includes(s[0])).reduce((n, s) => n + s[1], 0);
    log('logs', logs);
  }
  await p.screenshot({ path: S + '/shots/20-after-logs.png' });

  // 인벤토리: 나무 → 판자 (전부), 판자 → 작업대, 판자 → 막대기
  await p.keyboard.press('KeyE');
  await p.waitForTimeout(600);
  let iv = await inv();
  const li = iv.findIndex((s) => s && [6, 37, 39].includes(s[0]));
  await p.click(slot('inv', li));
  await p.click(slot('craft', 0));
  await p.click(slot('result', 0), { modifiers: ['Shift'] });
  await p.waitForTimeout(200);
  iv = await inv();
  let pi = iv.findIndex((s) => s && s[0] === 8);
  log('planks', iv[pi]);
  await p.click(slot('inv', pi));
  for (const i of [0, 1, 2, 3]) await p.click(slot('craft', i), { button: 'right' });
  await p.screenshot({ path: S + '/shots/21-inv-craft.png' });
  await p.click(slot('inv', pi));
  await p.click(slot('result', 0));
  await p.click(slot('inv', 8));            // 작업대를 단축칸 9번에
  // 막대기: 판자 2개 세로
  iv = await inv(); pi = iv.findIndex((s) => s && s[0] === 8);
  await p.click(slot('inv', pi));
  await p.click(slot('craft', 0), { button: 'right' });
  await p.click(slot('craft', 2), { button: 'right' });
  await p.click(slot('inv', pi));
  await p.click(slot('result', 0), { modifiers: ['Shift'] });
  await p.waitForTimeout(300);
  log('after craft', JSON.stringify((await inv()).filter(Boolean)));
  await p.keyboard.press('KeyE');
  await p.waitForTimeout(400);

  // 작업대 놓기
  await p.click('#game'); await p.waitForTimeout(300);
  await p.keyboard.press('Digit9');
  await p.evaluate(() => { __game.player.pitch = -0.55; __game.player.yaw = Math.PI; });
  await p.waitForTimeout(300);
  const ground = await p.evaluate(() => __game.raycastBlock());
  await p.mouse.click(640, 360, { button: 'right' });
  await p.waitForTimeout(600);
  const tpos = [ground.x + ground.face[0], ground.y + ground.face[1], ground.z + ground.face[2]];
  log('table placed', await p.evaluate((t) => __game.world.get(...t), tpos), 'at', tpos);
  await p.screenshot({ path: S + '/shots/22-table.png' });

  // 작업대 열기 → 나무 곡괭이
  await p.mouse.click(640, 360, { button: 'right' });
  await p.waitForTimeout(700);
  log('ui', await p.evaluate(() => __game.ui.screen));
  iv = await inv(); pi = iv.findIndex((s) => s && s[0] === 8);
  const si = iv.findIndex((s) => s && s[0] === 256);
  await p.click(slot('inv', pi));
  for (const i of [0, 1, 2]) await p.click(slot('craft', i), { button: 'right' });
  await p.click(slot('inv', pi));
  await p.click(slot('inv', si));
  for (const i of [4, 7]) await p.click(slot('craft', i), { button: 'right' });
  await p.click(slot('inv', si));
  await p.waitForTimeout(200);
  await p.screenshot({ path: S + '/shots/23-table-ui.png' });
  await p.click(slot('result', 0), { modifiers: ['Shift'] });
  await p.waitForTimeout(300);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  iv = await inv();
  const pk = iv.findIndex((s) => s && s[0] === 270);
  log('pickaxe slot', pk);

  // 곡괭이 들고 돌 캐기
  await p.click('#game'); await p.waitForTimeout(300);
  if (pk >= 0 && pk < 9) await p.keyboard.press(`Digit${pk + 1}`);
  await p.waitForTimeout(400);
  await p.screenshot({ path: S + '/shots/24-pickaxe.png' });
  // 옆이 트인 돌(절벽 · 동굴 벽) 찾기 → 그 옆 빈칸에 서서 바라보기
  const stone = await p.evaluate(() => {
    const w = __game.world, P = __game.player.pos;
    const air = (b) => b === 0 || b === 31 || b === 32 || b === 33;
    for (let r = 0; r < 40; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = Math.floor(P.x) + dx, z = Math.floor(P.z) + dz;
      for (let y = 75; y > 12; y--) {
        if (w.get(x, y, z) !== 3) continue;
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const sx = x + nx, sz = z + nz;
          if (air(w.get(sx, y, sz)) && air(w.get(sx, y + 1, sz)) && !air(w.get(sx, y - 1, sz)) && w.get(sx, y - 1, sz) !== 10) return { x, y, z, sx, sz };
        }
      }
    }
    return null;
  });
  log('stone', JSON.stringify(stone));
  let gotCobble = false;
  if (stone) {
    await p.evaluate((s) => __game.net({ t: 'chat', msg: `/tp ${s.sx + 0.5} ${s.y} ${s.sz + 0.5}` }), stone);
    await p.waitForTimeout(400);
    await p.evaluate((s) => {
      const pl = __game.player; pl.pos.set(s.sx + 0.5, s.y, s.sz + 0.5); pl.vel.set(0, 0, 0);
      pl.yaw = Math.atan2(-(s.x - s.sx), -(s.z - s.sz)); pl.pitch = -0.75;
    }, stone);
    await p.waitForTimeout(400);
    const aim = await p.evaluate(() => __game.raycastBlock());
    log('aim stone', JSON.stringify(aim && [aim.x, aim.y, aim.z, aim.b]));
    await p.mouse.down();
    await p.waitForTimeout(600);
    await p.screenshot({ path: S + '/shots/25-mining-stone.png' });
    await p.waitForTimeout(1200);   // 나무 곡괭이로 돌 = 1.5 x 1.5 / 2 ≈ 1.1초
    await p.mouse.up();
    await p.waitForTimeout(1500);
    const after = (await inv()).filter(Boolean);
    gotCobble = after.some((s) => s[0] === 4);
    log('after stone', JSON.stringify(after), 'cobble', gotCobble);
  }
  const ok = logs >= 1 && (await inv()).some((s) => s && s[0] === 270) && (!stone || gotCobble);
  log('errors', errs.slice(0, 10).join('\n'));
  log(ok && !errs.length ? '통과' : '실패');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
