import { case1 } from '../../content/cases/case1';
import { accuse, ask, createInitialState } from '../game/engine';
import type { CaseData, GameState } from '../game/types';

const app = document.querySelector<HTMLDivElement>('#app')!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function render(c: CaseData, s: GameState): void {
  app.innerHTML = '';
  const root = el('div', 'layout');

  // ── 좌측: 사건 정보 + 용의자 + 단서 ──
  const side = el('aside', 'side');
  side.append(el('h1', 'case-title', c.title));
  if (s.phase === 'briefing') {
    const b = el('p', 'briefing', c.briefing);
    side.append(b);
    const start = el('button', 'btn primary', '심문 시작');
    start.onclick = () => { s.phase = 'interrogate'; render(c, s); };
    side.append(start);
  } else {
    side.append(el('h2', 'sec', '용의자'));
    for (const sp of c.suspects) {
      const card = el('button', `suspect${sp.id === s.activeSuspect ? ' active' : ''}`);
      card.style.setProperty('--c', sp.color);
      card.append(el('strong', '', `${sp.name} · ${sp.role}`));
      card.append(el('span', 'one-liner', sp.oneLiner));
      card.onclick = () => { s.activeSuspect = sp.id; render(c, s); };
      side.append(card);
    }
    side.append(el('h2', 'sec', `단서 ${s.foundClues.length}/${c.clues.length}`));
    for (const cid of s.foundClues) {
      const clue = c.clues.find((x) => x.id === cid);
      if (!clue) continue;
      const ce = el('div', 'clue');
      ce.append(el('strong', '', clue.title));
      ce.append(el('p', '', clue.desc));
      side.append(ce);
    }
    const accuseBtn = el('button', 'btn danger', '범인 지목');
    accuseBtn.onclick = () => { s.phase = 'accuse'; render(c, s); };
    side.append(accuseBtn);
  }

  // ── 우측: 대화 로그 + 입력 ──
  const main = el('main', 'main');
  const log = el('div', 'log');
  for (const e of s.log) {
    const row = el('div', `msg ${e.kind}`);
    row.append(el('span', 'who', e.who));
    row.append(el('div', 'bubble', e.text));
    log.append(row);
  }
  main.append(log);

  if (s.phase === 'interrogate') {
    const sp = c.suspects.find((x) => x.id === s.activeSuspect)!;
    const form = el('form', 'input-bar');
    const input = el('input');
    input.placeholder = `${sp.name}에게 질문… (Enter 전송)`;
    input.autofocus = true;
    const send = el('button', 'btn primary', '전송');
    send.type = 'submit';
    form.append(input, send);
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      ask(c, s, text);
      render(c, s);
    };
    main.append(form);
  } else if (s.phase === 'accuse') {
    main.append(el('h2', 'sec', '누가 범인인가?'));
    const row = el('div', 'accuse-row');
    for (const sp of c.suspects) {
      const b = el('button', 'btn danger', `${sp.name} 지목`);
      b.onclick = () => { accuse(c, s, sp.id); render(c, s); };
      row.append(b);
    }
    const back = el('button', 'btn', '← 심문으로');
    back.onclick = () => { s.phase = 'interrogate'; render(c, s); };
    main.append(row, back);
  } else if (s.phase === 'verdict') {
    const again = el('button', 'btn primary', '다시 플레이');
    again.onclick = () => { Object.assign(s, createInitialState(c)); s.phase = 'interrogate'; render(c, s); };
    main.append(again);
  }

  root.append(side, main);
  app.append(root);
  log.scrollTop = log.scrollHeight;
}

render(case1, createInitialState(case1));
