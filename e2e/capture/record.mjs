// 플레이 영상 녹화 드라이버 — e2e/play.mjs의 액션 드라이버 패턴(chromium launch, 액션 문법)을 재사용해
// 실제 브라우저 플레이를 webm으로 녹화하고, 컷편집용 비트 타임스탬프(beats.json)를 남긴다.
// 부팅 시퀀스를 스킵하지 않는다(play.mjs와 달리 sessionStorage 부팅 스킵 addInitScript 없음) — 실플레이 그대로 녹화.
//
// 사용:
//   node e2e/capture/record.mjs --actions e2e/capture/beats-case1.json --case "사라진 푸딩" \
//     --out e2e/capture/out/case1 [--url "https://yeongjunyoo.github.io/nan-2026/?mock"] [--typeDelay 70] [--headed]
//
// 기본 --url은 ?mock (오프라인 목업, 비용 0) — 라이브 촬영 시 --url로 실제 배포 URL(쿼리 없이)을 넘긴다.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const key = a.replace(/^--/, '');
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) { args[key] = true; continue; }
  args[key] = next;
  i += 1;
}

const CASE_TITLE = args.case ?? '사라진 푸딩';
const ACTIONS = JSON.parse(fs.readFileSync(args.actions ?? 'e2e/capture/beats-case1.json', 'utf8'));
const OUT_DIR = args.out ?? 'e2e/capture/out/case1';
const URL0 = args.url ?? 'https://yeongjunyoo.github.io/nan-2026/?mock';
const SEED = args.seed ?? null;
const TYPE_DELAY = Number(args.typeDelay ?? 70); // 사람처럼 타이핑하는 키 입력 간 delay(ms)
const HEADED = Boolean(args.headed);

fs.mkdirSync(OUT_DIR, { recursive: true });

const beats = []; // { step, label, tMs } — 영상 기준 타임스탬프(ms), 컷편집 좌표용
let n = 0;
const t0 = Date.now();

function beat(step, extra = {}) {
  const tMs = Date.now() - t0;
  beats.push({ step, tMs, ...extra });
  console.log(`[${String(tMs).padStart(6, ' ')}ms] ${step}`);
}

async function shot(page, name) {
  n += 1;
  const file = path.join(OUT_DIR, `ref_${String(n).padStart(2, '0')}_${name}.png`);
  await page.screenshot({ path: file }).catch(() => {});
  beat(`shot: ${name}`, { file });
}

// 스트리밍 텍스트가 안정될 때까지 폴 (play.mjs와 동일 패턴)
async function waitStable(page, timeoutMs = 60000) {
  const start = Date.now();
  let prev = null;
  let stable = 0;
  while (Date.now() - start < timeoutMs) {
    const txt = await page.locator('.log').innerText().catch(() => '');
    if (txt === prev) {
      stable += 1;
      if (stable >= 3) return txt;
    } else {
      stable = 0;
      prev = txt;
    }
    await page.waitForTimeout(600);
  }
  beat('warn: 스트리밍 안정화 타임아웃');
  return prev ?? '';
}

const browser = await chromium.launch({ channel: 'msedge', headless: !HEADED });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: OUT_DIR, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
const video = page.video();
if (SEED) await page.addInitScript((s) => localStorage.setItem('nan503.v1', s), SEED);
page.setDefaultTimeout(20000);

let videoPath = null;
try {
  beat('nav: 페이지 이동 시작');
  await page.goto(URL0, { waitUntil: 'domcontentloaded' });

  // 부팅 시퀀스를 스킵하지 않고 그대로 촬영 — 등장/사라짐을 대기만 한다.
  await page.waitForSelector('.boot', { timeout: 5000 }).catch(() => {});
  await page.waitForSelector('.boot', { state: 'detached', timeout: 20000 }).catch(() => {});
  beat('boot: 부팅 시퀀스 종료');
  await shot(page, 'title');

  await page.locator('button.case-pick', { hasText: CASE_TITLE }).first().click();
  await page.waitForSelector('.briefing');
  beat('nav: 브리핑 진입');
  await shot(page, 'briefing');
  await page.locator('button.btn.primary', { hasText: '심문 시작' }).click();
  await page.waitForSelector('form.input-bar');
  beat('nav: 심문 화면 진입');

  for (const a of ACTIONS) {
    if (a.note) { beat(`note: ${a.note}`); continue; }
    if (a.shot) { await shot(page, a.shot); continue; }
    if (a.suspect) {
      await page.locator('aside .suspect', { hasText: a.suspect }).first().click();
      beat(`suspect: ${a.suspect}`);
      continue;
    }
    if (a.ask) {
      const input = page.locator('form.input-bar input');
      await input.click();
      await input.pressSequentially(a.ask, { delay: TYPE_DELAY }); // 사람처럼 타이핑
      beat(`ask:typing: ${a.ask}`);
      await page.locator('form.input-bar button[type=submit]').click();
      await page.waitForTimeout(800);
      await waitStable(page);
      beat(`ask:answered: ${a.ask}`);
      continue;
    }
    if (a.present) {
      const clue = page.locator('aside .clue', { hasText: a.present }).first();
      await clue.locator('button', { hasText: '제시' }).click();
      beat(`present:submitted: ${a.present}`);
      await page.waitForTimeout(800);
      await waitStable(page);
      beat(`present:answered: ${a.present}`);
      continue;
    }
    if (a.accuseOpen) {
      await page.locator('aside button.btn.danger', { hasText: '범인 지목' }).click();
      await page.waitForSelector('.accuse-row');
      beat('accuse: 지목 화면 진입');
      continue;
    }
    if (a.accusePick) {
      await page.locator('.accuse-row button', { hasText: a.accusePick }).first().click();
      beat(`accuse: 용의자 선택 ${a.accusePick}`);
      continue;
    }
    if (a.accuseClues) {
      for (const t of a.accuseClues) {
        await page.locator('.accuse-clues button', { hasText: t }).first().click();
      }
      beat(`accuse: 단서 선택 ${a.accuseClues.join(', ')}`);
      continue;
    }
    if (a.accuseSubmit) {
      await page.locator('main button.btn.stamp, main button.btn.danger').first().click();
      beat('accuse: 제출');
      await page.waitForTimeout(1500);
      await waitStable(page);
      beat('accuse: 엔딩 렌더 완료');
      continue;
    }
    if (a.choice) {
      await page.locator('main button', { hasText: a.choice }).first().click();
      beat(`choice: ${a.choice}`);
      continue;
    }
    if (a.expectText) {
      const found = await page.locator('body').innerText().then((t) => t.includes(a.expectText));
      beat(`expect: "${a.expectText}" -> ${found ? 'ok' : 'MISSING'}`);
      continue;
    }
    if (a.waitMs) { await page.waitForTimeout(a.waitMs); beat(`wait: ${a.waitMs}ms`); continue; }
    beat(`unknown action: ${JSON.stringify(a)}`);
  }

  await shot(page, 'ending');
} catch (err) {
  beat(`error: ${String(err)}`);
  await shot(page, 'ERROR').catch(() => {});
  console.error(err);
} finally {
  await page.close(); // video 파일이 flush되도록 page/context를 명시적으로 닫는다
  videoPath = await video?.path().catch(() => null);
  await context.close();
  await browser.close();
}

const beatsFile = path.join(OUT_DIR, 'beats.json');
fs.writeFileSync(beatsFile, JSON.stringify({ case: CASE_TITLE, url: URL0, video: videoPath, beats }, null, 2));
console.log(`\n영상: ${videoPath}`);
console.log(`비트: ${beatsFile}`);
