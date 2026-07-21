// 스테이지2 적대적 비주얼 크리틱 프로브 v3 — 모바일 수정 후 상태 검증 (처음부터 재실행)
// 패스: pc(1280×800) / m(390×844, 터치) / m_reduced(390×844 + prefers-reduced-motion) / 스킵 측정 패스
// 산출: e2e/shots/s2_critique/*.png + metrics3.json
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

// ─── 창 골격/레이아웃 실측 ───
async function measureLayout(page, label) {
  const m = await page.evaluate(() => {
    const cs = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const c = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) },
        height: c.height, padding: c.padding, overflowY: c.overflowY, maxHeight: c.maxHeight,
        clientH: el.clientHeight, scrollH: el.scrollHeight,
      };
    };
    const wins = [...document.querySelectorAll('.layout > .win')].map((w) => {
      const r = w.getBoundingClientRect();
      const body = w.querySelector(':scope > .win-body');
      const bc = body ? getComputedStyle(body) : null;
      // 창 테두리와 내용물 사이 간격 (패딩 0이면 내용이 프레임에 붙음)
      const first = body?.firstElementChild;
      const fr = first?.getBoundingClientRect();
      return {
        title: w.querySelector('.win-title')?.textContent ?? '',
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) },
        computedHeight: getComputedStyle(w).height,
        bodyPadding: bc ? bc.padding : null,
        bodyOverflowY: bc ? bc.overflowY : null,
        bodyMaxHeight: bc ? bc.maxHeight : null,
        contentGapLeft: fr ? Math.round(fr.left - r.left) : null,
      };
    });
    const accuseBtn = [...document.querySelectorAll('aside button.btn.danger')][0];
    const ar = accuseBtn?.getBoundingClientRect();
    return {
      viewport: { w: innerWidth, h: innerHeight },
      pageW: document.documentElement.scrollWidth,
      pageH: document.documentElement.scrollHeight,
      hScroll: document.documentElement.scrollWidth > innerWidth + 1,
      wins,
      log: cs('.log'),
      inputBar: cs('form.input-bar'),
      accuseBtn: ar ? { y: Math.round(ar.y), bottom: Math.round(ar.bottom), inView: ar.bottom <= innerHeight && ar.top >= 0 } : null,
    };
  });
  return { label, ...m };
}

// ─── 입력창 가시성 (스크롤 위치별) ───
async function inputAt(page, scrollY) {
  await page.evaluate((y) => window.scrollTo(0, y), scrollY);
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const f = document.querySelector('form.input-bar');
    if (!f) return null;
    const r = f.getBoundingClientRect();
    const c = getComputedStyle(f);
    const inp = f.querySelector('input');
    const btn = f.querySelector('button[type=submit]');
    const ir = inp.getBoundingClientRect(); const br = btn.getBoundingClientRect();
    return {
      scrollY: Math.round(scrollY), position: c.position, zIndex: c.zIndex,
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      inView: r.bottom <= innerHeight && r.top >= 0,
      inputH: Math.round(ir.height), sendH: Math.round(br.height),
      inputFont: `${getComputedStyle(inp).fontFamily.split(',')[0]} ${getComputedStyle(inp).fontSize}`,
      sendBottom: Math.round(br.bottom), inputBottom: Math.round(ir.bottom),
      alignDelta: Math.round(ir.height - br.height),
    };
  });
}

// ─── 버튼 전수 (터치 타겟/클리핑) ───
async function measureButtons(page, label) {
  const btns = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return [...document.querySelectorAll('button')].filter(vis).map((b) => {
      const r = b.getBoundingClientRect();
      const c = getComputedStyle(b);
      return {
        cls: String(b.className).slice(0, 40), text: (b.textContent ?? '').trim().slice(0, 24),
        w: Math.round(r.width), h: Math.round(r.height),
        font: c.fontFamily.split(',')[0], size: c.fontSize,
        clipY: b.scrollHeight > b.clientHeight + 1, clipX: b.scrollWidth > b.clientWidth + 1,
      };
    });
  });
  return { label, btns };
}

// ─── border-radius 전수 ───
async function radiusSweep(page, label) {
  const bad = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const c = getComputedStyle(el);
      const r = c.borderRadius;
      if (r && r !== '0px' && !r.split(' ').every((v) => v === '0px')) {
        out.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), radius: r });
      }
      for (const ps of ['::before', '::after']) {
        const p = getComputedStyle(el, ps);
        if (p.borderRadius && p.borderRadius !== '0px') out.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), pseudo: ps, radius: p.borderRadius });
      }
    }
    return out;
  });
  return { label, nonZeroRadius: bad };
}

// ─── NPC 발화 라벨 줄바꿈 실측 ───
async function whoWrap(page, label) {
  const rows = await page.evaluate(() => {
    return [...document.querySelectorAll('.msg.npc')].map((m) => {
      const who = m.querySelector('.who');
      const bubble = m.querySelector('.bubble');
      const wr = who.getBoundingClientRect(); const br = bubble.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(who).lineHeight);
      return {
        who: who.textContent, whoW: Math.round(wr.width), whoH: Math.round(wr.height),
        whoLines: Math.round(wr.height / lh), bubbleW: Math.round(br.width),
      };
    });
  });
  return { label, rows };
}

// ─── 신문/오버레이 실측 ───
async function measurePaper(page, label) {
  const m = await page.evaluate(() => {
    const rectOf = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
    };
    const inter = (a, b) => {
      if (!a || !b) return null;
      const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return { x: Math.round(x), y: Math.round(y), area: Math.round(x * y) };
    };
    const mast = document.querySelector('.paper-masthead');
    const mastR = rectOf('.paper-masthead');
    const stamp = rectOf('.grade-stamp');
    const st = document.querySelector('.grade-stamp');
    const panel = document.querySelector('.overlay-panel');
    const panelR = rectOf('.overlay-panel');
    // 스탬프의 DOM 이웃 (어느 위치에 끼어 있는가)
    const prev = st?.previousElementSibling; const next = st?.nextElementSibling;
    const panelBtns = panel ? [...panel.querySelectorAll('button')].map((b) => {
      const r = b.getBoundingClientRect();
      return { text: b.textContent.trim().slice(0, 22), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), inView: r.bottom <= innerHeight && r.top >= 0 };
    }) : [];
    const row = panel?.querySelector('.accuse-row');
    const rowR = row ? row.getBoundingClientRect() : null;
    return {
      masthead: mastR,
      mastheadLines: mast ? Math.round(mastR.h / parseFloat(getComputedStyle(mast).lineHeight)) : 0,
      stamp, stampPos: st ? getComputedStyle(st).position : null, stampTransform: st ? getComputedStyle(st).transform : null,
      stampPrev: prev ? `${prev.tagName}.${String(prev.className).slice(0, 20)}` : null,
      stampNext: next ? `${next.tagName}.${String(next.className).slice(0, 20)}` : null,
      stampVsMasthead: inter(stamp, mastR),
      stampVsHeadline: inter(stamp, rectOf('.paper-headline')),
      stampVsArticle: inter(stamp, rectOf('.paper-article')),
      stampVsCaption: inter(stamp, rectOf('.verdict-caption')),
      overlayPanel: panelR ? { ...panelR, scrollH: panel.scrollHeight, clientH: panel.clientHeight, cut: panel.scrollHeight > panel.clientHeight + 2 } : null,
      panelBtns,
      accuseRowH: rowR ? Math.round(rowR.height) : null,
      viewport: { w: innerWidth, h: innerHeight },
    };
  });
  return { label, ...m };
}

// ─── CRT 토글 실측 ───
async function measureCrt(page, label) {
  const m = await page.evaluate(() => {
    const t = document.querySelector('.crt-toggle');
    if (!t) return { present: false };
    const r = t.getBoundingClientRect();
    const c = getComputedStyle(t);
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      present: true, position: c.position, zIndex: c.zIndex,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) },
      h: Math.round(r.height),
      coveredBy: el && el !== t ? `${el.tagName}.${String(el.className).slice(0, 30)}` : null,
      inView: r.bottom <= innerHeight && r.top >= 0,
      scrollY: Math.round(scrollY),
    };
  });
  return { label, ...m };
}

// ─── 메인 플레이 패스 ───
async function playPass(browser, { name, ctxOpts }) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const P = { name, shots: [], reloaded: false, crashed: false };
  // 병렬 세션 저장 → vite full-reload 감지 (측정 오염 방지)
  let navCount = 0;
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) { navCount += 1; if (navCount > 1) P.reloaded = true; }
  });
  page.on('crash', () => { P.crashed = true; });
  try {
    // ① 부팅 — 실측 타이밍 + 텍스트 넘침
    const t0 = Date.now();
    await page.goto(URL0, { waitUntil: 'domcontentloaded' });
    const bootSeen = await page.waitForSelector('.boot', { timeout: 3000 }).then(() => true).catch(() => false);
    P.boot = { seen: bootSeen };
    if (bootSeen) {
      await page.waitForTimeout(1100);
      P.shots.push(await shotVp(page, `${name}_boot_mid`));
      P.boot.hintText = await page.locator('.boot-hint').innerText().catch(() => null);
      P.boot.textOverflow = await page.evaluate(() => {
        const pre = document.querySelector('.boot-text');
        if (!pre) return null;
        const lh = parseFloat(getComputedStyle(pre).lineHeight);
        return { scrollW: pre.scrollWidth, clientW: pre.clientWidth, lines: Math.round(pre.getBoundingClientRect().height / lh), overflowX: pre.scrollWidth > pre.clientWidth + 1, font: `${getComputedStyle(pre).fontFamily.split(',')[0]} ${getComputedStyle(pre).fontSize}` };
      });
      await page.waitForSelector('.boot', { state: 'detached', timeout: 9000 }).catch(() => {});
      P.boot.removedMs = Date.now() - t0;
    }
    P.shots.push(await shotVp(page, `${name}_title_vp`));
    P.shots.push(await shot(page, `${name}_title_full`));

    // ② 사건 선택 → 브리핑 → 심문 시작
    await page.locator('button.case-pick', { hasText: '사라진 푸딩' }).first().click();
    await page.waitForSelector('.briefing');
    P.shots.push(await shot(page, `${name}_briefing_full`));
    await page.locator('button.btn.primary', { hasText: '심문 시작' }).click();
    await page.waitForSelector('form.input-bar');
    P.layoutEmpty = await measureLayout(page, 'interrogate-empty');
    P.shots.push(await shotVp(page, `${name}_interrogate_empty_vp`));
    P.shots.push(await shot(page, `${name}_interrogate_empty_full`));
    P.inputEmpty = await inputAt(page, 0);
    P.crtEmpty = await measureCrt(page, 'empty');

    // ③ 질문 2회
    const ask = async (q) => {
      await page.locator('form.input-bar input').fill(q);
      await page.locator('form.input-bar button[type=submit]').click();
      await page.waitForTimeout(700);
      await waitStable(page);
    };
    await ask('어제 몇 시에 퇴근하셨어요?');
    await ask('쓰레기통에 뭐 버렸어요? 빈 용기 봤어요?');
    P.layoutAfter2 = await measureLayout(page, 'after-2-asks');
    P.who = await whoWrap(page, 'after-2-asks');
    // 스크롤 위치별 입력창 가시성 (sticky 실효 검증)
    P.inputScrollTop = await inputAt(page, 0);
    P.shots.push(await shotVp(page, `${name}_after2_vp_top`));
    P.inputScrollMid = await inputAt(page, Math.max(0, P.layoutAfter2.pageH - P.layoutAfter2.viewport.h - 300));
    P.shots.push(await shotVp(page, `${name}_after2_vp_mid`));
    P.inputScrollEnd = await inputAt(page, P.layoutAfter2.pageH);
    P.shots.push(await shotVp(page, `${name}_after2_vp_end`));
    P.crtAfter2 = await measureCrt(page, 'after-2');
    P.buttonsAfter2 = await measureButtons(page, 'after-2');

    // ④ 구본식에게 쓰레기통 제시 (arm) → 캐러멜 루트 → hit 테이크오버 실캡처
    await page.locator('aside .suspect', { hasText: '구본식' }).first().click();
    await page.locator('aside .clue', { hasText: '쓰레기통' }).first().locator('button', { hasText: '제시' }).click();
    await page.waitForTimeout(700);
    await waitStable(page);
    await ask('부장실 휴지통 비우셨어요? 캐러멜 소스가 나왔다던데요');
    await page.locator('aside .clue', { hasText: '캐러멜' }).first().locator('button', { hasText: '제시' }).click();
    await page.waitForTimeout(250);
    P.takeoverHit = await page.evaluate(() => {
      const t = document.querySelector('.takeover');
      if (!t) return { present: false };
      const c = getComputedStyle(t);
      return { present: true, opacity: c.opacity, anim: c.animationName, cls: t.className, rectTop: Math.round(t.getBoundingClientRect().top) };
    });
    P.shots.push(await shotVp(page, `${name}_takeover_hit_mid`));
    await waitStable(page);

    // ⑤ 증거 파일 창 (H1: 지목 진입 시 자동 닫힘 검증 + M2: 진짜 ✕ 닫기 버튼 실측)
    await page.locator('aside .clue', { hasText: '캐러멜' }).first().click();
    await page.waitForTimeout(200);
    P.fileWin = await page.evaluate(() => {
      const fw = document.querySelector('.file-win');
      if (!fw) return { present: false };
      const r = fw.getBoundingClientRect();
      const close = fw.querySelector('.win-close');
      const cr = close?.getBoundingClientRect();
      return {
        present: true, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) },
        zIndex: getComputedStyle(fw).zIndex, viewport: { w: innerWidth, h: innerHeight },
        fitsX: r.left >= 0 && r.right <= innerWidth, fitsY: r.top >= 0 && r.bottom <= innerHeight,
        winClose: cr ? { w: Math.round(cr.width), h: Math.round(cr.height) } : null,
      };
    });
    P.shots.push(await shotVp(page, `${name}_filewin`));

    // ⑥ 품의서
    await page.locator('aside button.btn.danger', { hasText: '범인 지목' }).click();
    await page.waitForSelector('.accuse-row');
    await page.waitForTimeout(300);
    P.fileWinAutoClosed = (await page.locator('.file-win').count()) === 0;
    P.doc = await page.evaluate(() => {
      const d = document.querySelector('.doc');
      const r = d.getBoundingClientRect();
      const picks = [...document.querySelectorAll('.doc-pick')].map((b) => {
        const br = b.getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(b).lineHeight);
        return { text: b.textContent.trim(), w: Math.round(br.width), h: Math.round(br.height), nameLines: Math.round(br.height / (lh + 20)) > 1 || br.height > 41, top: Math.round(br.top) };
      });
      const clues = [...document.querySelectorAll('.doc-clue')].map((b) => {
        const br = b.getBoundingClientRect();
        return { text: b.textContent.trim().slice(0, 16), w: Math.round(br.width), h: Math.round(br.height) };
      });
      const stampBtn = document.querySelector('.btn.stamp');
      const sr = stampBtn.getBoundingClientRect();
      return {
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) },
        overflowX: d.scrollWidth > d.clientWidth + 1,
        picks, clues, submit: { w: Math.round(sr.width), h: Math.round(sr.height), top: Math.round(sr.top) },
        viewport: { w: innerWidth, h: innerHeight }, scrollY: Math.round(scrollY),
      };
    });
    P.shots.push(await shot(page, `${name}_doc_full`));
    await page.locator('.doc').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    P.shots.push(await shotVp(page, `${name}_doc_closeup`));
    P.docButtons = await measureButtons(page, 'doc-phase');
    P.shots.push(await shotVp(page, `${name}_doc_view`));

    // ⑦ 상신 → verdict 셰이크 중간 실측 (S2 재검증: fixed 파괴)
    await page.locator('.accuse-row button', { hasText: '구본식' }).first().click();
    await page.locator('.accuse-clues button', { hasText: '캐러멜' }).first().click();
    await page.locator('.accuse-clues button', { hasText: '혈당' }).first().click();
    await page.locator('main button.btn.stamp').first().click();
    await page.waitForTimeout(300);
    P.verdictMid = await page.evaluate(() => {
      const t = document.querySelector('.takeover');
      const ov = document.querySelector('.overlay');
      const shake = document.body.classList.contains('shake');
      const bodyTransform = getComputedStyle(document.body).transform;
      const ovR = ov?.getBoundingClientRect();
      return {
        shake, bodyTransform,
        takeover: t ? { present: true, cls: t.className, opacity: getComputedStyle(t).opacity } : { present: false },
        overlay: ovR ? { top: Math.round(ovR.top), left: Math.round(ovR.left), w: Math.round(ovR.width), h: Math.round(ovR.height) } : null,
        scrollY: Math.round(scrollY), viewportH: innerHeight,
      };
    });
    P.shots.push(await shotVp(page, `${name}_takeover_verdict_mid`));
    await page.waitForTimeout(1200);
    await waitStable(page);

    // ⑧ 결과 오버레이 회복 실측 (셰이크 종료 후 fixed 복귀하는가)
    P.overlayAfter = await page.evaluate(() => {
      const ov = document.querySelector('.overlay');
      if (!ov) return { overlay: false };
      const r = ov.getBoundingClientRect();
      const fw = document.querySelector('.file-win');
      return {
        overlay: true, top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height),
        fileWin: !!fw, fwZ: fw ? getComputedStyle(fw).zIndex : null, ovZ: getComputedStyle(ov).zIndex,
        scrollY: Math.round(scrollY),
      };
    });
    P.shots.push(await shotVp(page, `${name}_verdict_overlay`));

    // ⑨ (파일창이 남아 있으면 닫고) 신문 실측
    const closeBtn = page.locator('.file-win button', { hasText: '닫기' });
    if (await closeBtn.count()) await closeBtn.first().click();
    const closeX = page.locator('.file-win .win-close');
    if (await closeX.count()) await closeX.first().click();
    await page.waitForTimeout(300);
    P.paper = await measurePaper(page, 'newspaper');
    P.shots.push(await shotVp(page, `${name}_newspaper_vp`));
    P.shots.push(await shot(page, `${name}_newspaper_full`));

    P.radius = await radiusSweep(page, name);
    P.allButtons = await measureButtons(page, 'final');
    P.fonts = await page.evaluate(() => ({
      loaded: [...document.fonts].map((f) => `${f.family}:${f.status}`),
      body: (() => { const c = getComputedStyle(document.body); return `${c.fontFamily.split(',')[0]} ${c.fontSize}/${c.lineHeight}`; })(),
    }));
  } catch (err) {
    P.error = String(err);
    await shot(page, `${name}_ERROR`).catch(() => {});
  }
  metrics.passes.push(P);
  await ctx.close();
}

// ─── reduced-motion 패스 ───
async function reducedPass(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    reducedMotion: 'reduce',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const P = { name: 'm_reduced', shots: [] };
  try {
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
    await page.waitForTimeout(700);
    await waitStable(page);
    await ask('부장실 휴지통 비우셨어요? 캐러멜 소스가 나왔다던데요');
    await page.locator('aside .clue', { hasText: '캐러멜' }).first().locator('button', { hasText: '제시' }).click();
    await page.waitForTimeout(350);
    P.afterHit = await page.evaluate(() => ({
      takeoverCount: document.querySelectorAll('.takeover').length,
      bodyShake: document.body.classList.contains('shake'),
    }));
    P.shots.push(await shotVp(page, 'm_reduced_after_hit'));
  } catch (err) { P.error = String(err); }
  metrics.passes.push(P);
  await ctx.close();
}

// ─── 부팅 스킵 패스 (클릭/키보드) ───
async function bootSkipPass(browser) {
  for (const mode of ['click', 'key']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    const P = { name: `boot_skip_${mode}` };
    try {
      await page.goto(URL0, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.boot', { timeout: 3000 });
      await page.waitForTimeout(500);
      const t = Date.now();
      if (mode === 'click') await page.locator('.boot').click();
      else await page.keyboard.press('Space');
      await page.waitForSelector('.boot', { state: 'detached', timeout: 5000 });
      P.skipToDetachedMs = Date.now() - t;
    } catch (err) { P.error = String(err); }
    metrics.passes.push(P);
    await ctx.close();
  }
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  await playPass(browser, { name: 'pc', ctxOpts: { viewport: { width: 1280, height: 800 } } });
  await playPass(browser, {
    name: 'm',
    ctxOpts: {
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
  });
  await reducedPass(browser);
  await bootSkipPass(browser);
} catch (err) {
  metrics.error = String(err);
  console.error(err);
} finally {
  fs.writeFileSync(path.join(OUT, 'metrics3.json'), JSON.stringify(metrics, null, 2));
  await browser.close();
}
console.log(`완료: ${path.join(OUT, 'metrics3.json')}`);
