import { case1 } from '../../content/cases/case1';
import { case2 } from '../../content/cases/case2';
import { case3 } from '../../content/cases/case3';
import { gubonsik } from '../../content/npc/gubonsik';
import { chaminjae } from '../../content/npc/chaminjae';
import { isangrok } from '../../content/npc/isangrok';
import { jeonsunduk } from '../../content/npc/jeonsunduk';
import { marupang } from '../../content/npc/marupang';
import { obokja } from '../../content/npc/obokja';
import type { CaseData, VoiceCard } from '../game/types';
import {
  accuse, applyRetry, ask, createGame, finalizeLose, grade, present,
  GameState, TURN_WARN,
} from '../game/engine';

const NPCS: Record<string, VoiceCard> = {
  gu: gubonsik, cha: chaminjae, lee: isangrok, jeon: jeonsunduk, ma: marupang, ok: obokja,
};
const CASES: CaseData[] = [case1, case2, case3];

// ─── 저장 (localStorage 미러) ───
const LS_KEY = 'nan503.v1';
interface SaveData { cleared?: string[]; current?: { caseId: string; state: GameState } }
function loadSave(): SaveData {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as SaveData; } catch { return {}; }
}
function storeSave(d: SaveData): void { localStorage.setItem(LS_KEY, JSON.stringify(d)); }

let save = loadSave();
let currentCase: CaseData | null = null;
let s: GameState | null = null;

const app = document.querySelector<HTMLDivElement>('#app')!;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function persist(): void {
  if (currentCase && s) {
    save.current = { caseId: currentCase.id, state: s };
    storeSave(save);
  }
}

// ─── 화면 ───
function renderTitle(): void {
  app.innerHTML = '';
  const box = el('div', 'title-screen');
  box.append(el('p', 'eyebrow', 'AI 심문 추리 · 퇴근길 3분'));
  box.append(el('h1', '', '사건파일 503호'));
  box.append(el('p', 'concept', '가상 중소기업 두잇상사의 소동 전담 창구. 누구든 심문하고, 단서를 들이대라.'));
  box.append(el('p', 'ai-badge', '🤖 NPC 답변은 실시간 AI로 생성됩니다'));
  for (const c of CASES) {
    const idx = CASES.indexOf(c);
    const locked = idx > 0 && !save.cleared?.includes(CASES[idx - 1].id);
    const done = save.cleared?.includes(c.id);
    const btn = el('button', 'btn case-pick', `${done ? '✅ ' : ''}${c.title}${locked ? ' 🔒' : ''}`);
    btn.disabled = !!locked;
    btn.onclick = () => startCase(c);
    box.append(btn);
  }
  if (save.current) {
    const cont = el('button', 'btn primary', '이어하기');
    cont.onclick = () => resumeCase();
    box.append(cont);
  }
  app.append(box);
}

function startCase(c: CaseData): void {
  currentCase = c;
  s = createGame(c);
  s.phase = 'briefing';
  persist();
  render();
}

function resumeCase(): void {
  const cur = save.current;
  if (!cur) return renderTitle();
  const c = CASES.find((x) => x.id === cur.caseId);
  if (!c) return renderTitle();
  currentCase = c;
  s = cur.state;
  render();
}

function markCleared(id: string): void {
  save.cleared = [...new Set([...(save.cleared ?? []), id])];
  if (save.current?.caseId === id) delete save.current;
  storeSave(save);
}

// ─── 본편 ───
function render(): void {
  if (!currentCase || !s) return renderTitle();
  const c = currentCase;
  const st = s;
  app.innerHTML = '';
  const root = el('div', 'layout');

  // 좌: 사건 파일
  const side = el('aside', 'side');
  side.append(el('h1', 'case-title', c.title));
  side.append(el('p', 'turn-counter', `남은 심문: ${st.turnLeft}${st.turnLeft <= TURN_WARN ? ' ⚠️ 마감 임박' : ''}`));

  if (st.phase === 'briefing') {
    side.append(el('p', 'briefing', c.briefing));
    side.append(el('p', 'cap-line', '503호 창구: 누구든 심문하고, 단서를 들이댈 수 있습니다.'));
    const start = el('button', 'btn primary', '심문 시작');
    start.onclick = () => { st.phase = 'interrogate'; persist(); render(); };
    side.append(start);
  } else {
    side.append(el('h2', 'sec', '용의자'));
    for (const id of c.suspects) {
      const npc = NPCS[id];
      const card = el('button', `suspect${id === st.activeSuspect ? ' active' : ''}`);
      card.style.setProperty('--c', npc.color);
      card.append(el('strong', '', `${npc.name} · ${npc.role}`));
      card.append(el('span', 'one-liner', npc.oneLiner));
      card.onclick = () => { st.activeSuspect = id; persist(); render(); };
      side.append(card);
    }
    if (c.witness) {
      const w = NPCS[c.witness];
      const card = el('button', `suspect witness${c.witness === st.activeSuspect ? ' active' : ''}`);
      card.style.setProperty('--c', w.color);
      card.append(el('strong', '', `${w.name} · ${w.role}`));
      card.append(el('span', 'one-liner', `목격자? (심문 1회 = 2턴)`));
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
          present(npc, c, st, clue.id);
          persist(); render();
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

  // 우: 로그 + 입력
  const main = el('main', 'main');
  const log = el('div', 'log');
  const npcFilter = st.activeSuspect;
  for (const e of st.log) {
    if (e.npc && e.npc !== npcFilter && st.phase === 'interrogate') continue;
    const row = el('div', `msg ${e.kind}`);
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
      ask(npc, c, st, text);
      if (st.turnLeft <= 0) {
        st.log.push({ who: '시스템', kind: 'sys', text: '마감입니다. 현재 단서로 지목해주세요.' });
        st.phase = 'accuse';
      }
      persist(); render();
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
    const rerender = () => render();
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
      const r = accuse(c, st, pickedNpc, [...pickedClues]);
      st.log.push({ who: '판정', kind: 'sys', text: r.feedback });
      persist(); rerender();
    };
    const back = el('button', 'btn', '← 심문으로');
    back.onclick = () => { st.phase = 'interrogate'; render(); };
    main.append(submit, back);
  } else if (st.phase === 'verdict') {
    if (st.verdict === 'win') {
      renderResult(c, st, main);
    } else {
      const retryBtn = el('button', 'btn primary', `재도전 (턴 +3, 남은 기회 ${st.retriesLeft})`);
      retryBtn.disabled = st.retriesLeft <= 0;
      retryBtn.onclick = () => { applyRetry(st); persist(); render(); };
      const giveUp = el('button', 'btn', '포기하고 마무리 (C등급)');
      giveUp.onclick = () => {
        st.log.push({ who: '판정', kind: 'sys', text: c.ending.lose });
        finalizeLose(st);
        markCleared(c.id);
        persist(); render();
      };
      main.append(retryBtn, giveUp);
    }
  } else if (st.phase === 'result') {
    renderResult(c, st, main);
  }

  root.append(side, main);
  app.append(root);
  log.scrollTop = log.scrollHeight;
}

function renderResult(c: CaseData, st: GameState, main: HTMLElement): void {
  if (st.verdict === 'win' && !st.endChoice) {
    main.append(el('div', 'verdict-box', c.ending.win));
    if (c.ending.twist) main.append(el('div', 'twist-box', c.ending.twist));
    if (c.ending.choice) {
      const a = el('button', 'btn primary', c.ending.choice.a.label);
      const b = el('button', 'btn', c.ending.choice.b.label);
      a.onclick = () => { st.endChoice = 'a'; markCleared(c.id); persist(); render(); };
      b.onclick = () => { st.endChoice = 'b'; markCleared(c.id); persist(); render(); };
      main.append(a, b);
      return;
    }
    markCleared(c.id);
  }
  if (st.endChoice && c.ending.choice) {
    main.append(el('div', 'twist-box', st.endChoice === 'a' ? c.ending.choice.a.text : c.ending.choice.b.text));
  }
  const g = grade(c, st);
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
    next.onclick = () => startCase(CASES[nextIdx]);
    btns.append(next);
  }
  const retry = el('button', 'btn', '다시 플레이');
  retry.onclick = () => startCase(c);
  const home = el('button', 'btn', '타이틀로');
  home.onclick = () => { currentCase = null; s = null; persist(); renderTitle(); };
  btns.append(retry, home);
  main.append(share, btns);
}

// ─── 부트 ───
if (save.current) {
  // 자동 이어하기 대신 타이틀에서 선택 (명시 프롬프트)
}
renderTitle();
