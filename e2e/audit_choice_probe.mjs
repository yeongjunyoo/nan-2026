// case2 엔딩 분기 클릭 검증 — play.mjs와 동일 경로로 승리 후 .overlay-panel 내 버튼 클릭
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const SHOTS = 'e2e/shots/audit_case2/r7';
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => sessionStorage.setItem('nan503.booted', '1'));
await page.addInitScript((s) => localStorage.setItem('nan503.v1', s), JSON.stringify({ cleared: ['case1', 'case2'] }));
page.setDefaultTimeout(15000);

await page.goto('http://localhost:4519/nan-2026/?mock', { waitUntil: 'networkidle' });
await page.locator('button.case-pick', { hasText: '23만원' }).first().click();
await page.waitForSelector('.briefing');
await page.locator('button.btn.primary', { hasText: '심문 시작' }).click();
await page.waitForSelector('form.input-bar');

async function ask(t) {
  await page.locator('form.input-bar input').fill(t);
  await page.locator('form.input-bar button[type=submit]').click();
  await page.waitForTimeout(2500);
}
await page.locator('aside .suspect', { hasText: '이상록' }).first().click();
await ask('어제 뭐 하셨어요?');
await ask('뭘 버렸어요?');
const clue = page.locator('aside .clue', { hasText: '파쇄함 조각' }).first();
await clue.locator('button', { hasText: '제시' }).click();
await page.waitForTimeout(2500);

await page.locator('aside button.btn.danger', { hasText: '범인 지목' }).click();
await page.waitForSelector('.accuse-row');
await page.locator('.accuse-row button', { hasText: '이상록' }).first().click();
for (const t of ['파쇄함 조각', '조각에 섞인', '이상록의 시인']) {
  await page.locator('.accuse-clues button', { hasText: t }).first().click();
}
await page.locator('main button.btn.stamp, main button.btn.danger').first().click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SHOTS}/01_verdict.png`, fullPage: true });

// 오버레이 패널 안 버튼 존재/가시성 확인
const btns = await page.locator('.overlay-panel button').allInnerTexts().catch(() => []);
console.log('overlay-panel buttons:', JSON.stringify(btns));
const vis = await page.locator('.overlay-panel button', { hasText: '규정대로' }).first().isVisible().catch(() => false);
const box = await page.locator('.overlay-panel button', { hasText: '규정대로' }).first().boundingBox().catch(() => null);
console.log('choice button visible:', vis, 'box:', JSON.stringify(box));
const panelBox = await page.locator('.overlay-panel').boundingBox().catch(() => null);
console.log('panel box:', JSON.stringify(panelBox));

await page.locator('.overlay-panel button', { hasText: '규정대로 보고한다' }).first().click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOTS}/02_ending.png`, fullPage: true });
const tail = await page.locator('body').innerText();
console.log('--- BODY TAIL ---');
console.log(tail.slice(-900));
await browser.close();
