// 사건파일 503호 — 까다로운 플레이어 옹호자 1인 플레이.
// 배포본 case1을 자연스러운 심문(정보/감정/잡담/재추궁 혼합)으로 플레이하고
// 매 교환 스크린샷 + NPC 응답 텍스트를 transcript JSON으로 남긴다.
// 사용: node e2e/advocate_play.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const URL0 = 'https://yeongjunyoo.github.io/nan-2026/';
const SHOTS = 'C:/Users/basqu/projects/nan-2026/e2e/shots/advocate';
const CASE_TITLE = '사라진 푸딩 한 개';

fs.mkdirSync(SHOTS, { recursive: true });
const transcript = [];
let n = 0;
const t0 = Date.now();

async function shot(page, name) {
  n += 1;
  const file = path.join(SHOTS, `${String(n).padStart(2, '0')}_${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function waitStable(page, timeoutMs = 90000) {
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
  console.log('warn: 스트리밍 안정화 타임아웃');
  return prev ?? '';
}

// 마지막 NPC 버블 + 단서 수 스냅샷
async function capture(page) {
  const last = page.locator('.log .msg.npc').last();
  const who = await last.locator('.who').innerText().catch(() => '?');
  const reply = await last.locator('.bubble').innerText().catch(() => '');
  const clueCount = await page.locator('aside .clue').count().catch(() => -1);
  return { who, reply, clueCount };
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => sessionStorage.setItem('nan503.booted', '1'));
page.setDefaultTimeout(20000);

// 교환 스크립트 — type: info(정보) / poke(감정) / chat(잡담) / followup(재추궁) / present(제시)
const EXCHANGES = [
  { suspect: '차민재', type: 'info', q: '어제 푸딩 사라진 거, 언제쯤 알았어요?' },
  { suspect: '차민재', type: 'info', q: '몇 시에 퇴근하셨어요?' },
  { suspect: '차민재', type: 'info', q: '탕비실 쓰레기통, 어제 누가 치웠는지 아세요?' },
  { suspect: '차민재', type: 'poke', q: '왜 이렇게 긴장하셨어요? 뭔가 숨기는 거 아니에요?' },
  { suspect: '차민재', type: 'chat', q: '푸딩 좋아하세요? 저는 캐러멜 푸딩이 제일 좋던데.' },
  { suspect: '오복자', type: 'info', q: '어젯밤 늦게까지 남아 계셨다면서요. 뭐 본 거 없어요?' },
  { suspect: '오복자', type: 'chat', q: '복자 씨가 보기에 이 회사에서 제일 수상한 사람 누구예요?' },
  { suspect: '구본식', type: 'poke', q: '부장님, 푸딩 하나 때문에 이 난리를… 그렇게 소중한 푸딩이었어요?' },
  { suspect: '구본식', type: 'present', clue: '빈 푸딩 용기', fallbackQ: '쓰레기통에서 빈 푸딩 용기 나온 거 아세요? 어떻게 생각하세요?' },
  { suspect: '구본식', type: 'followup', q: '휴지통에서 캐러멜 소스 포장지가 나왔다는데, 그것도 모른다고 하실 건가요?' },
  { suspect: '마루팡', type: 'info', q: '과장님은 어제 몇 시에 퇴근하셨어요?' },
  { suspect: '마루팡', type: 'chat', q: '솔직히 물어볼게요. 과장님이 먹은 거 아니죠?' },
];

try {
  await page.goto(URL0, { waitUntil: 'networkidle' });
  await shot(page, 'title');

  await page.locator('button.case-pick', { hasText: CASE_TITLE }).first().click();
  await page.waitForSelector('.briefing');
  await shot(page, 'briefing');
  await page.locator('button.btn.primary', { hasText: '심문 시작' }).click();
  await page.waitForSelector('form.input-bar');
  await page.waitForTimeout(500);
  await shot(page, 'interrogate_start');

  let cur = null;
  for (let i = 0; i < EXCHANGES.length; i++) {
    const ex = EXCHANGES[i];
    if (ex.suspect && ex.suspect !== cur) {
      await page.locator('aside .suspect', { hasText: ex.suspect }).first().click();
      await page.waitForTimeout(700);
      cur = ex.suspect;
    }
    let asked = null;
    let presented = null;
    if (ex.clue) {
      const clue = page.locator('aside .clue', { hasText: ex.clue }).first();
      const cnt = await clue.count();
      if (cnt > 0) {
        presented = ex.clue;
        await clue.locator('button', { hasText: '제시' }).click();
      } else {
        asked = ex.fallbackQ;
        await page.locator('form.input-bar input').fill(ex.fallbackQ);
        await page.locator('form.input-bar button[type=submit]').click();
      }
    } else {
      asked = ex.q;
      await page.locator('form.input-bar input').fill(ex.q);
      await page.locator('form.input-bar button[type=submit]').click();
    }
    await page.waitForTimeout(800);
    await waitStable(page);
    const c = await capture(page);
    const file = await shot(page, `ex${String(i + 1).padStart(2, '0')}_${ex.type}`);
    transcript.push({ i: i + 1, suspect: cur, type: ex.type, q: asked, presented, ...c, file });
    console.log(`#${i + 1} [${ex.type}] ${cur} | clues=${c.clueCount}`);
    console.log(`  Q: ${asked ?? '(제시: ' + presented + ')'}`);
    console.log(`  A: ${c.reply.slice(0, 220)}`);
  }
} catch (e) {
  console.error('FATAL', e);
  await shot(page, 'fatal').catch(() => {});
}

fs.writeFileSync(path.join(SHOTS, 'transcript.json'), JSON.stringify(transcript, null, 2));
console.log(`\ntotal ${(Date.now() - t0) / 1000}s, exchanges=${transcript.length}`);
await browser.close();
