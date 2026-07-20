// 배포본 풀플레이 드라이버 — 액션 JSON을 받아 실제 브라우저로 플레이하고 스크린샷/결과를 남긴다.
// 사용: node e2e/play.mjs --case "사건 제목 일부" --actions e2e/actions/case1.json --shots e2e/shots/case1 [--seed '{"cleared":["case1"]}'] [--url URL]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const CASE_TITLE = args.case;
const ACTIONS = JSON.parse(fs.readFileSync(args.actions, 'utf8'));
const SHOTS = args.shots ?? 'e2e/shots/run';
const URL0 = args.url ?? 'https://yeongjunyoo.github.io/nan-2026/';
const SEED = args.seed ?? null;

fs.mkdirSync(SHOTS, { recursive: true });
const result = { case: CASE_TITLE, steps: [], expects: [], final: {} };
let n = 0;
const t0 = Date.now();

function rec(step, ok = true, extra = {}) {
  result.steps.push({ step, ok, t: Date.now() - t0, ...extra });
  console.log(`${ok ? '✅' : '❌'} ${step}`);
}

async function shot(page, name) {
  n += 1;
  const file = path.join(SHOTS, `${String(n).padStart(2, '0')}_${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  rec(`shot: ${name}`, true, { file });
}

// 스트리밍이 렌더를 계속 갈아엎으므로, 로그 텍스트 전체가 안정될 때까지 폴
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
  rec('warn: 스트리밍 안정화 타임아웃', false);
  return prev ?? '';
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
if (SEED) await page.addInitScript((s) => localStorage.setItem('nan503.v1', s), SEED);
page.setDefaultTimeout(15000);

try {
  await page.goto(URL0, { waitUntil: 'networkidle' });
  await shot(page, 'title');

  // 사건 선택 → 브리핑
  await page.locator('button.case-pick', { hasText: CASE_TITLE }).first().click();
  await page.waitForSelector('.briefing');
  await shot(page, 'briefing');
  await page.locator('button.btn.primary', { hasText: '심문 시작' }).click();
  await page.waitForSelector('form.input-bar');

  for (const a of ACTIONS) {
    if (a.shot) { await shot(page, a.shot); continue; }
    if (a.note) { rec(`note: ${a.note}`); continue; }
    if (a.suspect) {
      await page.locator('aside .suspect', { hasText: a.suspect }).first().click();
      rec(`suspect: ${a.suspect}`);
      continue;
    }
    if (a.ask) {
      await page.locator('form.input-bar input').fill(a.ask);
      await page.locator('form.input-bar button[type=submit]').click();
      await page.waitForTimeout(800);
      const log = await waitStable(page);
      rec(`ask: ${a.ask}`, true, { replyTail: log.slice(-300) });
      continue;
    }
    if (a.present) {
      const clue = page.locator('aside .clue', { hasText: a.present }).first();
      await clue.locator('button', { hasText: '제시' }).click();
      await page.waitForTimeout(800);
      const log = await waitStable(page);
      rec(`present: ${a.present}`, true, { replyTail: log.slice(-300) });
      continue;
    }
    if (a.accuseOpen) {
      await page.locator('aside button.btn.danger', { hasText: '범인 지목' }).click();
      await page.waitForSelector('.accuse-row');
      rec('accuse: 지목 화면 진입');
      continue;
    }
    if (a.accusePick) {
      await page.locator('.accuse-row button', { hasText: a.accusePick }).first().click();
      rec(`accuse: 용의자 선택 ${a.accusePick}`);
      continue;
    }
    if (a.accuseClues) {
      for (const t of a.accuseClues) {
        await page.locator('.accuse-clues button', { hasText: t }).first().click();
      }
      rec(`accuse: 단서 선택 ${a.accuseClues.join(', ')}`);
      continue;
    }
    if (a.accuseSubmit) {
      await page.locator('main button.btn.stamp, main button.btn.danger').first().click();
      await page.waitForTimeout(1500);
      await waitStable(page);
      rec('accuse: 제출 완료');
      continue;
    }
    if (a.retry) {
      await page.locator('button', { hasText: '재도전' }).click();
      await page.waitForSelector('form.input-bar');
      rec('retry: 재도전 사용');
      continue;
    }
    if (a.giveUp) {
      await page.locator('button', { hasText: '포기하고 마무리' }).click();
      rec('giveUp: 포기 선택');
      continue;
    }
    if (a.choice) {
      await page.locator('main button', { hasText: a.choice }).first().click();
      rec(`choice: ${a.choice}`);
      continue;
    }
    if (a.expectText) {
      const found = await page.locator('body').innerText().then((t) => t.includes(a.expectText));
      result.expects.push({ text: a.expectText, pass: found });
      rec(`expect: "${a.expectText}"`, found);
      continue;
    }
    if (a.waitMs) { await page.waitForTimeout(a.waitMs); continue; }
    rec(`unknown action: ${JSON.stringify(a)}`, false);
  }

  // 최종 상태 스크래핑
  const body = await page.locator('body').innerText();
  result.final = {
    turnCounter: await page.locator('.turn-counter').innerText().catch(() => null),
    clueCounter: await page.locator('aside h2.sec', { hasText: '단서' }).innerText().catch(() => null),
    grade: await page.locator('.grade-stamp, .grade').first().innerText().catch(() => null),
    hasVerdictPortrait: (await page.locator('img.verdict-portrait').count()) > 0,
    avatarCount: await page.locator('img.msg-avatar').count(),
    bodyTail: body.slice(-600),
  };
} catch (err) {
  result.error = String(err);
  await shot(page, 'ERROR').catch(() => {});
  console.error(err);
} finally {
  fs.writeFileSync(path.join(SHOTS, 'result.json'), JSON.stringify(result, null, 2));
  await browser.close();
}
console.log(`\n결과: ${path.join(SHOTS, 'result.json')}`);
