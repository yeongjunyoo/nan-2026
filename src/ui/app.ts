import { PUBLIC_CASES } from '../../content/public/cases';
import { NPC_PUBLIC } from '../../content/public/npcs';
import type { NpcPublic, PublicCaseData, ServerCaseData } from '../game/types';
import {
  accuse, applyRetry, ask, createGame, finalizeLose, grade, present,
  GameState, TURN_WARN, WITNESS_COST,
} from '../game/engine';
import { initRemote, remoteAccuse, remoteAsk, remoteEnabled } from '../game/remote';
import { CASE_CARD, LOGO, NPC_AVATAR, NPC_VARIANT, WALLPAPER } from '../assets';

let remoteEnding: ServerCaseData['ending'] | null = null;

const CASES = PUBLIC_CASES;
const NPCS = NPC_PUBLIC;

// ─── 저장 (localStorage 미러) ───
const LS_KEY = 'nan503.v1';
interface SaveData { cleared?: string[]; current?: { caseId: string; state: GameState } }
function loadSave(): SaveData {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as SaveData; } catch { return {}; }
}
function storeSave(d: SaveData): void { localStorage.setItem(LS_KEY, JSON.stringify(d)); }

let save = loadSave();
let currentCase: PublicCaseData | null = null;
let fullCase: ServerCaseData | null = null;
let s: GameState | null = null;

const app = document.querySelector<HTMLDivElement>('#app')!;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 동요한 NPC는 붕괴 표정으로 전환, 아니면 베이스 */
function avatarFor(id: string, st: GameState): string {
  if (st.shaken?.[id] && NPC_VARIANT[id]) return NPC_VARIANT[id].breakdown;
  return NPC_AVATAR[id] ?? '';
}

function avatarImg(id: string, st: GameState, cls: string): HTMLImageElement | null {
  const src = avatarFor(id, st);
  if (!src) return null;
  const img = el('img', cls) as HTMLImageElement;
  img.src = src;
  img.alt = NPCS[id]?.name ?? id;
  return img;
}

function persist(): void {
  if (currentCase && s) {
    save.current = { caseId: currentCase.id, state: s };
    storeSave(save);
  }
}

async function loadFullCase(id: string): Promise<ServerCaseData | null> {
  // 목업 모드: 서버 데이터를 동적 임포트 (원격 모드에서는 프록시가 보유)
  const mod = await import('../../content/server/cases');
  return mod.SERVER_CASES.find((x) => x.id === id) ?? null;
}

// ─── 화면 ───
function renderTitle(): void {
  app.innerHTML = '';
  document.body.style.backgroundImage = `url(${WALLPAPER})`;
  const box = el('div', 'title-screen');
  const logo = el('img', 'logo-img') as HTMLImageElement;
  logo.src = LOGO;
  logo.alt = '사건파일 503호';
  box.append(logo);
  box.append(el('p', 'eyebrow', 'AI 심문 추리, 퇴근길 3분'));
  box.append(el('p', 'concept', '가상 중소기업 두잇상사의 소동 전담 창구. 누구든 심문한다. 단서를 들이대라.'));
  box.append(el('p', 'ai-badge', '🤖 NPC 답변은 실시간 AI로 생성됩니다'));
  for (const c of CASES) {
    const idx = CASES.indexOf(c);
    const locked = idx > 0 && !save.cleared?.includes(CASES[idx - 1].id);
    const done = save.cleared?.includes(c.id);
    const btn = el('button', 'btn case-pick');
    if (CASE_CARD[c.id]) {
      const thumb = el('img', 'case-thumb') as HTMLImageElement;
      thumb.src = CASE_CARD[c.id];
      btn.append(thumb);
    }
    btn.append(el('span', '', `${done ? '✅ ' : ''}${c.title}${locked ? ' 🔒' : ''}`));
    btn.disabled = !!locked;
    btn.onclick = () => { void startCase(c); };
    box.append(btn);
  }
  if (save.current) {
    const cont = el('button', 'btn primary', '이어하기');
    cont.onclick = () => { void resumeCase(); };
    box.append(cont);
  }
  app.append(box);
}

async function startCase(c: PublicCaseData): Promise<void> {
  currentCase = c;
  fullCase = await loadFullCase(c.id);
  if (!fullCase) return;
  s = createGame(fullCase);
  s.phase = 'briefing';
  persist();
  render();
}

async function resumeCase(): Promise<void> {
  const cur = save.current;
  if (!cur) return renderTitle();
  const c = CASES.find((x) => x.id === cur.caseId);
  if (!c) return renderTitle();
  currentCase = c;
  fullCase = await loadFullCase(c.id);
  s = cur.state;
  render();
}

function markCleared(id: string): void {
  save.cleared = [...new Set([...(save.cleared ?? []), id])];
  if (save.current?.caseId === id) delete save.current;
  storeSave(save);
}

// ─── 액션 핸들러 (원격 우선, 실패 시 목업 폴리백) ───
/** 해금된 단서의 reveal 대사를 단서 소유자 NPC의 입으로 출력 (심문 판타지 핵심) */
function pushReveals(st: GameState, fc: ServerCaseData, ids: string[]): void {
  for (const id of ids) {
    const cl = fc.clues.find((x) => x.id === id);
    if (!cl?.reveal) continue;
    const holderName = NPCS[cl.holder]?.name ?? '???';
    // 콘텐츠의 "차민재: ..." 화자 접두는 버블 레이블과 중복 — 제거
    const text = cl.reveal.replace(new RegExp(`^${holderName}:\\s*`), '');
    st.log.push({ who: holderName, kind: 'npc', text, npc: cl.holder });
  }
}

/** 서버 armedChains 스냅샷 동기화. 새로 arm된 단서가 있으면 true */
function syncArmed(st: GameState, meta: { armedChains?: Record<string, true> }): boolean {
  const before = new Set(Object.keys(st.armedChains ?? {}));
  if (meta.armedChains) st.armedChains = { ...meta.armedChains };
  return Object.keys(st.armedChains ?? {}).some((k) => !before.has(k));
}

function announceUnlocks(st: GameState, fc: ServerCaseData, unlocked: Array<{ id: string; title: string; reveal?: string }>): void {
  for (const u of unlocked) {
    if (st.foundClues.includes(u.id)) continue;
    st.foundClues.push(u.id);
    st.log.push({ who: '시스템', kind: 'sys', text: `🔎 단서 획득: ${u.title}` });
  }
  pushReveals(st, fc, unlocked.map((u) => u.id));
}

function armHint(st: GameState): void {
  st.log.push({ who: '시스템', kind: 'sys', text: '💢 상대가 크게 동요했다 — 이 선에서 더 캐물을 수 있을 것 같다.' });
}

function afterTurn(st: GameState): void {
  if (st.turnLeft <= 0 && st.phase === 'interrogate') {
    st.log.push({ who: '시스템', kind: 'sys', text: '마감입니다. 현재 단서로 지목해주세요.' });
    st.phase = 'accuse';
  }
  persist(); render();
}

async function handleAsk(npc: NpcPublic, fc: ServerCaseData, st: GameState, text: string): Promise<void> {
  if (remoteEnabled()) {
    const cost = npc.id === fc.witness ? WITNESS_COST : 1;
    st.turnLeft = Math.max(0, st.turnLeft - cost);
    st.turnsUsed += cost;
    st.npc[npc.id].turns += 1;
    st.log.push({ who: '나', kind: 'me', text, npc: npc.id });
    let streamed = '';
    const bubble = { who: npc.name, kind: 'npc' as const, text: '…', npc: npc.id };
    st.log.push(bubble);
    try {
      const meta = await remoteAsk(fc, st, npc, text, null, (d) => {
        streamed += d;
        bubble.text = streamed;
        render();
      });
      bubble.text = meta.reply;
      st.npc[npc.id].defense = Math.max(-3, Math.min(3, st.npc[npc.id].defense + meta.defenseDelta));
      const newArm = syncArmed(st, meta);
      announceUnlocks(st, fc, meta.unlocked);
      if (meta.unlocked.length === 0 && newArm) armHint(st);
      afterTurn(st);
      return;
    } catch {
      st.log.pop(); // 스트리밍 버블 제거 후 목업 폴리백
      st.log.pop();
      st.turnLeft += cost; // 비용 복원
      st.turnsUsed -= cost;
      st.npc[npc.id].turns -= 1;
    }
  }
  const armedBefore = new Set(Object.keys(st.armedChains ?? {}));
  const cluesBefore = new Set(st.foundClues);
  ask(npc, fc, st, text);
  const newIds = st.foundClues.filter((id) => !cluesBefore.has(id));
  pushReveals(st, fc, newIds);
  if (newIds.length === 0 && Object.keys(st.armedChains ?? {}).some((k) => !armedBefore.has(k))) armHint(st);
  afterTurn(st);
}

async function handlePresent(npc: NpcPublic, fc: ServerCaseData, st: GameState, clueId: string): Promise<void> {
  if (remoteEnabled()) {
    const clue = fc.clues.find((x) => x.id === clueId);
    st.log.push({ who: '나', kind: 'me', text: `[단서 제시] ${clue?.title ?? clueId}`, npc: npc.id });
    try {
      const meta = await remoteAsk(fc, st, npc, `이 단서를 보시죠: ${clue?.title ?? ''}`, clueId, () => {});
      st.log.push({ who: npc.name, kind: 'npc', text: meta.reply, npc: npc.id });
      const newArm = syncArmed(st, meta);
      announceUnlocks(st, fc, meta.unlocked);
      if (meta.unlocked.length > 0 || newArm) {
        (st.shaken ??= {})[npc.id] = true;
        if (meta.unlocked.length === 0) armHint(st); // 1단 적중 — 체인 발동 대기
      } else {
        st.npc[npc.id].defense = Math.min(3, st.npc[npc.id].defense + 1);
        st.presentWrong += 1;
      }
      persist(); render();
      return;
    } catch {
      st.log.pop();
    }
  }
  const res = present(npc, fc, st, clueId);
  pushReveals(st, fc, res.unlocked);
  if (res.unlocked.length > 0 || res.armed.length > 0) {
    (st.shaken ??= {})[npc.id] = true;
    if (res.unlocked.length === 0) armHint(st);
  }
  persist(); render();
}

async function handleAccuse(fc: ServerCaseData, st: GameState, culpritId: string, clueIds: string[]): Promise<void> {
  st.accusedId = culpritId;
  if (remoteEnabled()) {
    try {
      const r = await remoteAccuse(fc, st, culpritId, clueIds);
      st.phase = 'verdict';
      st.verdict = r.verdict;
      if (r.verdict !== 'win') st.log.push({ who: '판정', kind: 'sys', text: r.feedback }); // 승리 문구는 verdict-box가 출력 (중복 방지)
      if (r.verdict === 'win') {
        st.phase = 'result';
        if (r.ending) remoteEnding = r.ending;
        for (const id of r.postUnlock ?? []) {
          if (!st.foundClues.includes(id)) st.foundClues.push(id);
        }
      }
      persist(); render();
      return;
    } catch {
      // 목업 폴리백으로 진행
    }
  }
  const r = accuse(fc, st, culpritId, clueIds);
  if (r.verdict !== 'win') st.log.push({ who: '판정', kind: 'sys', text: r.feedback });
  persist(); render();
}

// ─── 본편 ───
function render(): void {
  if (!currentCase || !fullCase || !s) return renderTitle();
  const c = currentCase;
  const fc = fullCase;
  const st = s;
  app.innerHTML = '';
  const root = el('div', 'layout');

  const side = el('aside', 'side');
  side.append(el('h1', 'case-title', c.title));
  side.append(el('p', 'turn-counter', `남은 심문: ${st.turnLeft}${st.turnLeft <= TURN_WARN ? ' ⚠️ 마감 임박' : ''}`));

  if (st.phase === 'briefing') {
    if (CASE_CARD[c.id]) {
      const card = el('img', 'briefing-card') as HTMLImageElement;
      card.src = CASE_CARD[c.id];
      side.append(card);
    }
    side.append(el('p', 'briefing', c.briefing));
    side.append(el('p', 'cap-line', '503호 창구: 누구든 심문하고 단서를 들이댈 수 있습니다.'));
    const start = el('button', 'btn primary', '심문 시작');
    start.onclick = () => { st.phase = 'interrogate'; persist(); render(); };
    side.append(start);
  } else {
    side.append(el('h2', 'sec', '용의자'));
    // 의뢰인 카드 (심문 가능, 지목 불가)
    if (!c.suspects.includes(c.client)) {
      const npc = NPCS[c.client];
      const card = el('button', `suspect client${c.client === st.activeSuspect ? ' active' : ''}`);
      card.style.setProperty('--c', npc.color);
      const cav = avatarImg(c.client, st, 'suspect-avatar');
      if (cav) card.append(cav);
      const cText = el('span', 'suspect-text');
      cText.append(el('strong', '', `${npc.name} · ${npc.role}`));
      cText.append(el('span', 'one-liner', '의뢰인 (심문 가능)'));
      card.append(cText);
      card.onclick = () => { st.activeSuspect = c.client; persist(); render(); };
      side.append(card);
    }
    for (const id of c.suspects) {
      const npc = NPCS[id];
      const card = el('button', `suspect${id === st.activeSuspect ? ' active' : ''}`);
      card.style.setProperty('--c', npc.color);
      const av = avatarImg(id, st, 'suspect-avatar');
      if (av) card.append(av);
      const textWrap = el('span', 'suspect-text');
      textWrap.append(el('strong', '', `${npc.name} · ${npc.role}`));
      textWrap.append(el('span', 'one-liner', npc.oneLiner));
      card.append(textWrap);
      card.onclick = () => { st.activeSuspect = id; persist(); render(); };
      side.append(card);
    }
    if (c.witness) {
      const w = NPCS[c.witness];
      const card = el('button', `suspect witness${c.witness === st.activeSuspect ? ' active' : ''}`);
      card.style.setProperty('--c', w.color);
      const wav = avatarImg(c.witness, st, 'suspect-avatar');
      if (wav) card.append(wav);
      const wText = el('span', 'suspect-text');
      wText.append(el('strong', '', `${w.name} · ${w.role}`));
      wText.append(el('span', 'one-liner', `목격자? (심문 1회 = 2턴)`));
      card.append(wText);
      card.onclick = () => { st.activeSuspect = c.witness!; persist(); render(); };
      side.append(card);
    }
    side.append(el('h2', 'sec', `단서 ${st.foundClues.length}/${c.clues.length}`));
    for (const cid of st.foundClues) {
      const clue = c.clues.find((x) => x.id === cid);
      if (!clue) continue;
      const ce = el('div', 'clue');
      ce.append(el('strong', '', clue.title));
      ce.append(el('p', '', clue.desc));
      if (st.phase === 'interrogate') {
        const pb = el('button', 'btn mini', '제시');
        pb.onclick = () => {
          const npc = NPCS[st.activeSuspect];
          void handlePresent(npc, fc, st, clue.id);
        };
        ce.append(pb);
      }
      side.append(ce);
    }
    if (st.phase === 'interrogate') {
      const accuseBtn = el('button', 'btn danger', '범인 지목');
      accuseBtn.onclick = () => { st.phase = 'accuse'; render(); };
      side.append(accuseBtn);
    }
  }

  const main = el('main', 'main');
  const log = el('div', 'log');
  const npcFilter = st.activeSuspect;
  for (const e of st.log) {
    if (e.npc && e.npc !== npcFilter && st.phase === 'interrogate') continue;
    const row = el('div', `msg ${e.kind}`);
    if (e.kind === 'npc' && e.npc) {
      const av = avatarImg(e.npc, st, 'msg-avatar');
      if (av) row.append(av);
    }
    row.append(el('span', 'who', e.who));
    row.append(el('div', 'bubble', e.text));
    log.append(row);
  }
  main.append(log);

  if (st.phase === 'interrogate') {
    const npc = NPCS[st.activeSuspect];
    const form = el('form', 'input-bar');
    const input = el('input');
    input.placeholder = `${npc.name}에게 질문… (Enter 전송)`;
    let composing = false;
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; });
    const send = el('button', 'btn primary', '전송');
    send.type = 'submit';
    form.append(input, send);
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      void handleAsk(npc, fc, st, text);
    };
    input.onkeydown = (ev) => {
      if (ev.key === 'Enter' && (composing || (ev as KeyboardEvent).keyCode === 229)) ev.stopPropagation();
    };
    main.append(form);
  } else if (st.phase === 'accuse') {
    main.append(el('h2', 'sec', c.question));
    main.append(el('p', 'dim', '범인 1명 + 핵심 단서 2개를 골라 제출'));
    let pickedNpc: string | null = null;
    const pickedClues = new Set<string>();
    const npcRow = el('div', 'accuse-row');
    const submit = el('button', 'btn danger', '제출');
    for (const id of c.suspects) {
      const npc = NPCS[id];
      const b = el('button', 'btn', npc.name);
      b.onclick = () => {
        pickedNpc = id;
        for (const x of npcRow.children) (x as HTMLElement).classList.remove('picked');
        b.classList.add('picked');
      };
      npcRow.append(b);
    }
    main.append(npcRow);
    const clueWrap = el('div', 'accuse-clues');
    for (const cid of st.foundClues) {
      const clue = c.clues.find((x) => x.id === cid);
      if (!clue) continue;
      const b = el('button', 'btn mini', clue.title);
      b.onclick = () => {
        if (pickedClues.has(cid)) pickedClues.delete(cid);
        else if (pickedClues.size < 2) pickedClues.add(cid);
        b.classList.toggle('picked');
      };
      clueWrap.append(b);
    }
    main.append(clueWrap);
    if (st.foundClues.length < 2) main.append(el('p', 'dim', '⚠️ 핵심 단서가 부족합니다. 그래도 제출할 수는 있습니다.'));
    submit.onclick = () => {
      if (!pickedNpc) return;
      void handleAccuse(fc, st, pickedNpc, [...pickedClues]);
    };
    const back = el('button', 'btn', '← 심문으로');
    back.onclick = () => { st.phase = 'interrogate'; render(); };
    main.append(submit, back);
  } else if (st.phase === 'verdict') {
    if (st.verdict === 'win') {
      renderResult(c, fc, st, main);
    } else {
      // 지목 실패 — 버텨낸 용의자의 여유 미소 (코미디)
      if (st.accusedId && NPC_VARIANT[st.accusedId]) {
        const p = el('img', 'verdict-portrait') as HTMLImageElement;
        p.src = NPC_VARIANT[st.accusedId].smile;
        p.alt = NPCS[st.accusedId]?.name ?? st.accusedId;
        main.append(p);
        main.append(el('p', 'verdict-caption', `${NPCS[st.accusedId]?.name ?? ''} — 아쉽게도 빠져나갔습니다. 결정적 한 방이 부족했습니다.`));
      }
      const retryBtn = el('button', 'btn primary', `재도전 (턴 +3, 남은 기회 ${st.retriesLeft})`);
      retryBtn.disabled = st.retriesLeft <= 0;
      retryBtn.onclick = () => { applyRetry(st); persist(); render(); };
      const giveUp = el('button', 'btn', '포기하고 마무리 (C등급)');
      giveUp.onclick = () => {
        st.log.push({ who: '판정', kind: 'sys', text: fc.ending.lose });
        finalizeLose(st);
        markCleared(c.id);
        persist(); render();
      };
      main.append(retryBtn, giveUp);
    }
  } else if (st.phase === 'result') {
    renderResult(c, fc, st, main);
  }

  root.append(side, main);
  app.append(root);
  log.scrollTop = log.scrollHeight;
}

function renderResult(c: PublicCaseData, fc: ServerCaseData, st: GameState, main: HTMLElement): void {
  const ending = remoteEnding ?? fc.ending;
  // 지목 성공 — 붕괴 표정 전면 포트레이트 (폭로 연출)
  if (st.verdict === 'win' && st.accusedId && NPC_VARIANT[st.accusedId]) {
    (st.shaken ??= {})[st.accusedId] = true;
    const p = el('img', 'verdict-portrait breakdown') as HTMLImageElement;
    p.src = NPC_VARIANT[st.accusedId].breakdown;
    p.alt = NPCS[st.accusedId]?.name ?? st.accusedId;
    main.append(p);
    main.append(el('p', 'verdict-caption', `${NPCS[st.accusedId]?.name ?? ''} — 더 이상 빠져나갈 곳이 없습니다.`));
  }
  if (st.verdict === 'win' && !st.endChoice) {
    main.append(el('div', 'verdict-box', ending.win));
    if (ending.twist) main.append(el('div', 'twist-box', ending.twist));
    if (ending.choice) {
      const a = el('button', 'btn primary', ending.choice.a.label);
      const b = el('button', 'btn', ending.choice.b.label);
      a.onclick = () => { st.endChoice = 'a'; markCleared(c.id); persist(); render(); };
      b.onclick = () => { st.endChoice = 'b'; markCleared(c.id); persist(); render(); };
      main.append(a, b);
      return;
    }
    markCleared(c.id);
  }
  if (st.endChoice && ending.choice) {
    main.append(el('div', 'twist-box', st.endChoice === 'a' ? ending.choice.a.text : ending.choice.b.text));
  }
  const g = grade(fc, st);
  main.append(el('div', `grade grade-${g}`, `등급 ${g}`));
  const missing = c.clues.filter((cl) => !st.foundClues.includes(cl.id)).length;
  if (missing > 0) main.append(el('p', 'dim', `숨겨진 단서 ${missing}개가 남아 있습니다.`));
  const share = el('button', 'btn', '결과 카드 복사');
  share.onclick = () => {
    const text = `사건파일 503호 「${c.title}」 — 등급 ${g} (남은 심문 ${st.turnLeft}, 단서 ${st.foundClues.length}/${c.clues.length})`;
    void navigator.clipboard?.writeText(text);
    share.textContent = '복사됨 ✓';
  };
  const nextIdx = CASES.indexOf(c) + 1;
  const btns = el('div', 'accuse-row');
  if (nextIdx < CASES.length) {
    const next = el('button', 'btn primary', `다음 사건: ${CASES[nextIdx].title}`);
    next.onclick = () => { void startCase(CASES[nextIdx]); };
    btns.append(next);
  }
  const retry = el('button', 'btn', '다시 플레이');
  retry.onclick = () => { void startCase(c); };
  const home = el('button', 'btn', '타이틀로');
  home.onclick = () => { currentCase = null; fullCase = null; s = null; persist(); renderTitle(); };
  btns.append(retry, home);
  main.append(share, btns);
}

initRemote();
renderTitle();
