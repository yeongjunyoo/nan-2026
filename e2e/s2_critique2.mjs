// 보충 프로브 — ①부팅 스킵 동작 ②hit 테이크오버 실캡처(캐러멜 제시) ③모바일 품의서 클로즈업
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'e2e/shots/s2_critique';
const URL0 = 'http://localhost:4519/nan-2026/?mock';
const metrics = { passes: [] };

async function waitStable(page, timeoutMs = 45000) {
  const start = Date.now();
  let prev = null; let stable = 0;
  while (Date.now() - start < timeoutMs) {
    const txt = await page.locator('.log').innerText().catch(() => '');
    if (txt === prev) { stable += 1; if (stable >= 3) return txt; }
    else { stable = 0; prev = txt; }
    await page.waitForTimeout(500);
  }
  return prev ?? '';
}

async function pass(browser, name, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const P = { name };

  await page.goto(URL0, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.boot', { timeout: 3000 }).catch(() => {});
  // 스킵: 클릭 → 소거 시간
  const tSkip = Date.now();
  await page.locator('.boot').click().catch(() => {});
  await page.waitForSelector('.boot', { state: 'detached', timeout: 4000 }).catch(() => {});
  P.bootSkipMs = Date.now() - tSkip;

  await page.locator('button.case-pick', { hasText: '사라진 푸딩' }).first().click();
  await page.waitForSelector('.briefing');
  await page.locator('button.btn.primary', { hasText: '심문 시작' }).click();
  await page.waitForSelector('form.input-bar');
  const ask = async (q) => {
    await page.locator('form.input-bar input').fill(q);
    await page.locator('form.input-bar button[type=submit]').click();
    await page.waitForTimeout(700);
    await waitStable(page);
  };
  await ask('어제 몇 시에 퇴근하셨어요?');
  await ask('쓰레기통에 뭐 버렸어요? 빈 용기 봤어요?');
  await page.locator('aside .suspect', { hasText: '구본식' }).first().click();
  await page.locator('aside .clue', { hasText: '쓰레기통' }).first().locator('button', { hasText: '제시' }).click();
  await page.waitForTimeout(700);
  await waitStable(page);
  await ask('부장실 휴지통 비우셨어요? 캐러멜 소스가 나왔다던데요');

  // hit 테이크오버 캡처 (캐러멜 제시 → 혈당 해금)
  await page.locator('aside .clue', { hasText: '캐러멜' }).first().locator('button', { hasText: '제시' }).click();
  await page.waitForTimeout(250);
  P.takeoverHit = await page.evaluate(() => {
    const t = document.querySelector('.takeover');
    if (!t) return { present: false };
    const c = getComputedStyle(t);
    const before = getComputedStyle(t, '::before');
    return { present: true, opacity: c.opacity, anim: c.animationName, beforeAnim: before.animationName, cls: t.className };
  });
  await page.screenshot({ path: path.join(OUT, `${name}_takeover_hit_real.png`) });
  await waitStable(page);

  // 품의서 클로즈업
  await page.locator('aside button.btn.danger', { hasText: '범인 지목' }).click();
  await page.waitForSelector('.accuse-row');
  await page.locator('.doc').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, `${name}_doc_closeup.png`) });
  P.docPicks = await page.evaluate(() => [...document.querySelectorAll('.doc-pick')].map((b) => {
    const r = b.getBoundingClientRect();
    const lines = Math.round(r.height / parseFloat(getComputedStyle(b).lineHeight));
    return { text: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), wrappedLines: lines };
  }));

  metrics.passes.push(P);
  await ctx.close();
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  await pass(browser, 'pc', { viewport: { width: 1280, height: 800 } });
  await pass(browser, 'm', {
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
} finally {
  fs.writeFileSync(path.join(OUT, 'metrics2.json'), JSON.stringify(metrics, null, 2));
  await browser.close();
}
console.log('완료: metrics2.json');
