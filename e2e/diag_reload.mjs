// 진단: 플레이 중 페이지 리로드 원인 규명 — vite HMR이 e2e/ 파일 쓰기에 반응하는지
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL0 = 'http://localhost:4519/nan-2026/?mock';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log(`[NAV] ${new Date().toISOString().slice(11, 23)} -> ${f.url()}`); });
page.on('crash', () => console.log('[CRASH] page crashed'));
page.on('console', (m) => { const t = m.text(); if (t.includes('vite') || t.includes('reload')) console.log(`[CONSOLE] ${t.slice(0, 120)}`); });

await page.goto(URL0, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.boot', { timeout: 4000 }).catch(() => {});
await page.waitForSelector('.boot', { state: 'detached', timeout: 9000 }).catch(() => {});
await page.locator('button.case-pick', { hasText: '사라진 푸딩' }).first().click();
await page.waitForSelector('.briefing');
await page.locator('button.btn.primary', { hasText: '심문 시작' }).click();
await page.waitForSelector('form.input-bar');
console.log('[STATE] 심문 화면 진입, input 존재:', await page.locator('form.input-bar input').count());

// 1) e2e/shots에 PNG 쓰기 → 리로드 여부
fs.writeFileSync('e2e/shots/s2_critique/_probe_write_test.png', Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082', 'hex'));
await page.waitForTimeout(1500);
console.log('[STATE] PNG 쓰기 후 input 존재:', await page.locator('form.input-bar input').count(), 'url:', page.url());

// 2) 스크린샷 API로 실제 캡처 → 리로드 여부
await page.screenshot({ path: 'e2e/shots/s2_critique/_probe_shot_test.png' });
await page.waitForTimeout(1500);
console.log('[STATE] 스크린샷 후 input 존재:', await page.locator('form.input-bar input').count());

// 3) 아무것도 안 하고 20초 대기하며 input 존재 폴
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(2000);
  const n = await page.locator('form.input-bar input').count();
  const boot = await page.locator('.boot').count();
  console.log(`[POLL] +${(i + 1) * 2}s input=${n} boot=${boot} url=${page.url()}`);
  if (n === 0) break;
}
await browser.close();
console.log('진단 완료');
