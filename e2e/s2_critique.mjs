// 스테이지2 적대적 비주얼 크리틱 프로브 — PC(1280×800) + 모바일(390×844) + reduced-motion 패스.
// 측정치는 e2e/shots/s2_critique/metrics.json, 스크린샷은 같은 디렉터리.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'e2e/shots/s2_critique';
const URL0 = 'http://localhost:4519/nan-2026/?mock';
fs.mkdirSync(OUT, { recursive: true });
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

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
async function shotVp(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

// ─── 레이아웃/스타일 측정 묶음 ───
async function measure(page, label) {
  const m = await page.evaluate(() => {
    const out = {};
    const cs = (sel, pseudo = null) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const c = getComputedStyle(el, pseudo);
      const r = el.getBoundingClientRect();
      return {
        rect: { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right },
        height: c.height, padding: c.padding, overflowY: c.overflowY,
        clientH: el.clientHeight, scrollH: el.scrollHeight, clientW: el.clientWidth, scrollW: el.scrollWidth,
      };
    };
    out.viewport = { w: innerWidth, h: innerHeight };
    out.pageH = document.documentElement.scrollHeight;
    out.wins = [...document.querySelectorAll('.layout > .win')].map((w) => {
      const r = w.getBoundingClientRect();
      const body = w.querySelector(':scope > .win-body');
      const bc = body ? getComputedStyle(body) : null;
      return {
        title: w.querySelector('.win-title')?.textContent ?? '',
        rect: { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom },
        computedHeight: getComputedStyle(w).height,
        bodyPadding: bc ? bc.padding : null,
        bodyOverflowY: bc ? bc.overflowY : null,
        bodyMaxHeight: bc ? bc.maxHeight : null,
      };
    });
    out.log = cs('.log');
    out.inputBar = cs('form.input-bar');
    out.bodyFont = (() => {
      const c = getComputedStyle(document.body);
      return { family: c.fontFamily, size: c.fontSize, lineHeight: c.lineHeight };
    })();
    out.fontsLoaded = [...document.fonts].map((f) => `${f.family}:${f.status}`);
    return out;
  });
  return { label, ...m };
}

// ─── 버튼 터치 타겟/클리핑 측정 ───
async function measureButtons(page, label) {
  const btns = await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return [...document.querySelectorAll('button')].filter(vis).map((b) => {
      const r = b.getBoundingClientRect();
      const c = getComputedStyle(b);
      return {
        cls: b.className, text: (b.textContent ?? '').trim().slice(0, 24),
        w: Math.round(r.width), h: Math.round(r.height),
        font: c.fontFamily.split(',')[0], size: c.fontSize, lineHeight: c.lineHeight,
        clipY: b.scrollHeight > b.clientHeight + 1, clipX: b.scrollWidth > b.clientWidth + 1,
      };
    });
  });
  return { label, btns };
}

// ─── border-radius 전수 스캔 ───
async function radiusSweep(page, label) {
  const bad = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const c = getComputedStyle(el);
      const r = c.borderRadius;
      if (r && r !== '0px' && !r.split(' ').every((v) => v === '0px')) {
        out.push({ tag: el.tagName, cls: typeof el.className === 'string' ? el.className : '', radius: r });
      }
      const pe = getComputedStyle(el, '::before');
      if (pe.borderRadius && pe.borderRadius !== '0px') out.push({ tag: el.tagName, cls: String(el.className), pseudo: '::before', radius: pe.borderRadius });
      const pa = getComputedStyle(el, '::after');
      if (pa.borderRadius && pa.borderRadius !== '0px') out.push({ tag: el.tagName, cls: String(el.className), pseudo: '::after', radius: pa.borderRadius });
    }
    return out;
  });
  return { label, nonZeroRadius: bad };
}

// ─── 신문 지면 측정 ───
async function measurePaper(page, label) {
  const m = await page.evaluate(() => {
    const rectOf = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    const inter = (a, b) => {
      if (!a || !b) return null;
      const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, area: Math.round(x * y) };
    };
    const mast = document.querySelector('.paper-masthead');
    const mastR = rectOf('.paper-masthead');
    const mastLines = mast ? Math.round(mast.getBoundingClientRect().height / parseFloat(getComputedStyle(mast).lineHeight)) : 0;
    const stamp = rectOf('.grade-stamp');
    const panel = document.querySelector('.overlay-panel');
    const panelR = rectOf('.overlay-panel');
    const stampTransform = document.querySelector('.grade-stamp') ? getComputedStyle(document.querySelector('.grade-stamp')).transform : null;
    return {
      masthead: mastR, mastheadLines: mastLines,
      mastheadFont: mast ? `${getComputedStyle(mast).fontSize}/${getComputedStyle(mast).lineHeight}` : null,
      stamp, stampTransform,
      stampVsMasthead: inter(stamp, mastR),
      stampVsHeadline: inter(stamp, rectOf('.paper-headline')),
      stampVsArticle: inter(stamp, rectOf('.paper-article')),
      overlayPanel: panelR ? { ...panelR, scrollH: panel.scrollHeight, clientH: panel.clientHeight, cut: panel.scrollHeight > panel.clientHeight + 2 } : null,
      viewport: { w: innerWidth, h: innerHeight },
    };
  });
  return { label, ...m };
}

// ─── 메인 플레이 패스 ───
async function playPass(browser, { name, ctxOpts }) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const P = { name, shots: [] };

  // 부팅 측정
  const t0 = Date.now();
  await page.goto(URL0, { waitUntil: 'domcontentloaded' });
  const bootSeen = await page.waitForSelector('.boot', { timeout: 3000 }).then(() => true).catch(() => false);
  P.boot = { seen: bootSeen };
  if (bootSeen) {
    await page.waitForTimeout(1100);
    P.shots.push(await shotVp(page, `${name}_boot_mid`));
    P.boot.textOverflow = await page.evaluate(() => {
      const pre = document.querySelector('.boot-text');
      if (!pre) return null;
      const lh = parseFloat(getComputedStyle(pre).lineHeight);
      return { scrollW: pre.scrollWidth, clientW: pre.clientWidth, lines: Math.round(pre.getBoundingClientRect().height / lh), overflowX: pre.scrollWidth > pre.clientWidth + 1 };
    });
    await page.waitForSelector('.boot', { state: 'detached', timeout: 8000 }).catch(() => {});
    P.boot.removedMs = Date.now() - t0;
  }
  P.shots.push(await shot(page, `${name}_title`));

  // 사건 선택 → 심문 시작
  await page.locator('button.case-pick', { hasText: '사라진 푸딩' }).first().click();
  await page.waitForSelector('.briefing');
  P.shots.push(await shot(page, `${name}_briefing`));
  await page.locator('button.btn.primary', { hasText: '심문 시작' }).click();
  await page.waitForSelector('form.input-bar');
  P.layoutEmpty = await measure(page, 'interrogate-empty');
  P.shots.push(await shotVp(page, `${name}_interrogate_empty_vp`));
  P.shots.push(await shot(page, `${name}_interrogate_empty_full`));

  // 질문 2회 (로그 성장 후 레이아웃 재측정)
  const ask = async (q) => {
    await page.locator('form.input-bar input').fill(q);
    await page.locator('form.input-bar button[type=submit]').click();
    await page.waitForTimeout(700);
    await waitStable(page);
  };
  await ask('어제 몇 시에 퇴근하셨어요?');
  await ask('쓰레기통에 뭐 버렸어요? 빈 용기 봤어요?');
  P.layoutAfter2 = await measure(page, 'after-2-asks');
  P.inputVisible = await page.evaluate(() => {
    const f = document.querySelector('form.input-bar');
    if (!f) return null;
    const r = f.getBoundingClientRect();
    return { bottom: r.bottom, viewportH: innerHeight, inView: r.bottom <= innerHeight && r.top >= 0 };
  });
  P.shots.push(await shotVp(page, `${name}_after2_vp`));

  // 구본식에게 쓰레기통 제시 — 테이크오버 중간 캡처
  await page.locator('aside .suspect', { hasText: '구본식' }).first().click();
  const clue1 = page.locator('aside .clue', { hasText: '쓰레기통' }).first();
  await clue1.locator('button', { hasText: '제시' }).click();
  await page.waitForTimeout(280);
  P.takeoverHit = await page.evaluate(() => {
    const t = document.querySelector('.takeover');
    if (!t) return { present: false };
    const c = getComputedStyle(t);
    return { present: true, opacity: c.opacity, animation: c.animationName, cls: t.className };
  });
  P.shots.push(await shotVp(page, `${name}_takeover_hit_mid`));
  await waitStable(page);

  // 캐러멜 루트
  await ask('부장실 휴지통 비우셨어요? 캐러멜 소스가 나왔다던데요');
  const clue2 = page.locator('aside .clue', { hasText: '캐러멜' }).first();
  await clue2.locator('button', { hasText: '제시' }).click();
  await page.waitForTimeout(700);
  await waitStable(page);

  // 증거 파일 창 — 열어둔 채 지목 진행 (스태킹 검증)
  await page.locator('aside .clue', { hasText: '캐러멜' }).first().click();
  await page.waitForTimeout(200);
  P.fileWin = await page.evaluate(() => {
    const fw = document.querySelector('.file-win');
    if (!fw) return { present: false };
    const r = fw.getBoundingClientRect();
    const c = getComputedStyle(fw);
    return {
      present: true, rect: { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom },
      zIndex: c.zIndex, viewport: { w: innerWidth, h: innerHeight },
      fitsX: r.left >= 0 && r.right <= innerWidth, fitsY: r.top >= 0 && r.bottom <= innerHeight,
    };
  });
  P.shots.push(await shotVp(page, `${name}_filewin`));

  await page.locator('aside button.btn.danger', { hasText: '범인 지목' }).click();
  await page.waitForSelector('.accuse-row');
  P.doc = await page.evaluate(() => {
    const d = document.querySelector('.doc');
    const r = d.getBoundingClientRect();
    const picks = [...document.querySelectorAll('.doc-pick')].map((b) => {
      const br = b.getBoundingClientRect();
      return { text: b.textContent.trim(), w: Math.round(br.width), h: Math.round(br.height) };
    });
    const clues = [...document.querySelectorAll('.doc-clue')].map((b) => {
      const br = b.getBoundingClientRect();
      return { text: b.textContent.trim().slice(0, 14), w: Math.round(br.width), h: Math.round(br.height) };
    });
    const stampBtn = document.querySelector('.btn.stamp');
    const sr = stampBtn.getBoundingClientRect();
    return {
      rect: { x: r.x, w: r.width, h: r.height },
      overflowX: d.scrollWidth > d.clientWidth + 1,
      picks, clues, submit: { w: Math.round(sr.width), h: Math.round(sr.height) },
      viewportW: innerWidth,
    };
  });
  P.shots.push(await shot(page, `${name}_doc_full`));
  P.docButtons = await measureButtons(page, 'doc-phase');
  P.shots.push(await shotVp(page, `${name}_doc_filewin_stack`));

  await page.locator('.accuse-row button', { hasText: '구본식' }).first().click();
  await page.locator('.accuse-clues button', { hasText: '캐러멜' }).first().click();
  await page.locator('.accuse-clues button', { hasText: '혈당' }).first().click();
  await page.locator('main button.btn.stamp').first().click();
  await page.waitForTimeout(300);
  P.takeoverVerdict = await page.evaluate(() => {
    const t = document.querySelector('.takeover');
    const shake = document.body.classList.contains('shake');
    if (!t) return { present: false, shake };
    const c = getComputedStyle(t);
    return { present: true, opacity: c.opacity, cls: t.className, shake };
  });
  P.shots.push(await shotVp(page, `${name}_takeover_verdict_mid`));
  await page.waitForTimeout(1200);
  await waitStable(page);

  // 결과 오버레이 + 파일창 스태킹
  P.stackVerdict = await page.evaluate(() => {
    const fw = document.querySelector('.file-win');
    const ov = document.querySelector('.overlay');
    if (!ov) return { overlay: false };
    if (!fw) return { overlay: true, fileWin: false };
    const r = fw.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + 12);
    return { overlay: true, fileWin: true, topAtFileWin: el ? `${el.tagName}.${String(el.className).slice(0, 30)}` : null };
  });
  P.shots.push(await shotVp(page, `${name}_verdict_filewin_stack`));

  // 파일창 닫고 신문 측정
  const closeBtn = page.locator('.file-win button', { hasText: '닫기' });
  if (await closeBtn.count()) await closeBtn.first().click();
  await page.waitForTimeout(300);
  P.paper = await measurePaper(page, 'newspaper');
  P.shots.push(await shotVp(page, `${name}_newspaper_vp`));
  P.shots.push(await shot(page, `${name}_newspaper_full`));

  P.radius = await radiusSweep(page, name);
  P.allButtons = await measureButtons(page, 'final');
  metrics.passes.push(P);
  await ctx.close();
}

// ─── reduced-motion 패스 (모바일 뷰포트) ───
async function reducedPass(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    reducedMotion: 'reduce',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const P = { name: 'm_reduced', shots: [] };
  await page.goto(URL0, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  P.bootPresent = await page.locator('.boot').count();
  P.scanlines = await page.evaluate(() => getComputedStyle(document.body, '::after').display);
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
  await page.waitForTimeout(350);
  P.afterHit = await page.evaluate(() => ({
    takeoverCount: document.querySelectorAll('.takeover').length,
    bodyShake: document.body.classList.contains('shake'),
  }));
  P.shots.push(await shotVp(page, 'm_reduced_after_hit'));
  metrics.passes.push(P);
  await ctx.close();
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  await playPass(browser, {
    name: 'pc',
    ctxOpts: { viewport: { width: 1280, height: 800 } },
  });
  await playPass(browser, {
    name: 'm',
    ctxOpts: {
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
  });
  await reducedPass(browser);
} catch (err) {
  metrics.error = String(err);
  console.error(err);
} finally {
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
  await browser.close();
}
console.log(`완료: ${path.join(OUT, 'metrics.json')}`);
