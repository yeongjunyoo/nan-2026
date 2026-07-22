import { PUBLIC_CASES } from '../../content/public/cases';
import { NPC_PUBLIC } from '../../content/public/npcs';
import type { NpcPublic, PublicCaseData, ServerCaseData } from '../game/types';
import {
  accuse, applyRetry, ask, createGame, finalizeLose, grade, present,
  GameState, TURN_BUDGET, TURN_WARN, WITNESS_COST,
} from '../game/engine';
import { initRemote, remoteAccuse, remoteAsk, remoteEnabled } from '../game/remote';
import { CASE_CARD, LOGO, NPC_AVATAR, NPC_VARIANT, WALLPAPER } from '../assets';
import { sfxPlay } from './sfx';

let remoteEnding: ServerCaseData['ending'] | null = null;

const CASES = PUBLIC_CASES;
const NPCS = NPC_PUBLIC;

// ─── 저장 (localStorage 미러) ───
const LS_KEY = 'nan503.v1';
// 스토리지 차단 환경(일부 인앱 웹뷰/프라이버시 모드)에서도 앱이 죽지 않게 전부 try 가드 (M5)
const storage = {
  get(area: 'local' | 'session', key: string): string | null {
    try { return (area === 'local' ? localStorage : sessionStorage).getItem(key); } catch { return null; }
  },
  set(area: 'local' | 'session', key: string, val: string): void {
    try { (area === 'local' ? localStorage : sessionStorage).setItem(key, val); } catch { /* 차단 환경 — 무시 */ }
  },
};
interface SaveData { cleared?: string[]; current?: { caseId: string; state: GameState } }
function loadSave(): SaveData {
  try { return JSON.parse(storage.get('local', LS_KEY) ?? '{}') as SaveData; } catch { return {}; }
}
function storeSave(d: SaveData): void { storage.set('local', LS_KEY, JSON.stringify(d)); }

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

/** 단말기 창 프레임 (타이틀바 + 본문) — 인트라넷 503 골격. onClose 주면 끝 버튼이 진짜 닫기로 동작 */
function windowFrame(title: string, body: HTMLElement, onClose?: () => void, cls?: string): HTMLElement {
  const win = el('div', cls ? `win ${cls}` : 'win');
  const bar = el('div', 'win-bar');
  bar.append(el('span', 'win-title', title));
  const btns = el('span', 'win-btns');
  btns.append(el('i'), el('i'));
  if (onClose) {
    const x = el('button', 'win-close', '✕');
    x.setAttribute('aria-label', '닫기');
    x.onclick = onClose;
    btns.append(x);
  } else {
    btns.append(el('i'));
  }
  bar.append(btns);
  const wrap = el('div', 'win-body');
  wrap.append(body);
  win.append(bar, wrap);
  return win;
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

/** 경계(방어) 단계 표시 — 오제시할수록 차오름 */
function defenseSpan(st: GameState, id: string): HTMLElement | null {
  const d = st.npc[id]?.defense ?? 0;
  if (d <= 0) return null;
  const span = el('span', 'defense-meter', `경계 ${'●'.repeat(d)}${'○'.repeat(Math.max(0, 3 - d))}`);
  span.title = '엉뚱한 단서를 들이댈수록 상대가 마음을 닫습니다';
  return span;
}

let logAll = false; // 로그 전체/현재 인물 토글 (심문 화면)
let openClueId: string | null = null; // 증거 파일 창으로 열어본 단서
let inputDraft = ''; // render() 재생성에도 입력 초안 보존 (H4)

// 목업 폴리백 발동 시 1회만 고지 — "AI인 줄 알았는데 목업" 은폐 방지
let mockNoticeShown = false;
let mockRecovered = false;
function notifyMockOnce(st: GameState): void {
  if (mockNoticeShown) return;
  mockNoticeShown = true;
  st.log.push({ who: '시스템', kind: 'sys', text: '현재 연결 상태로는 실시간 AI를 불러오지 못했습니다. 기본 답변으로 응답합니다. (다음 행동부터 자동 재시도)' });
}
/** 폴리백 고지 후 원격이 회복되면 1회 알림 (지금부터 실시간인지 알 방법이 없던 문제) */
function notifyRecoveryOnce(st: GameState): void {
  if (!mockNoticeShown || mockRecovered) return;
  mockRecovered = true;
  st.log.push({ who: '시스템', kind: 'sys', text: 'AI 연결이 복구됐습니다. 지금부터 실시간 답변입니다.' });
}

/** 첫 턴 예시 질문 칩 (시간/현장/인물 3축 암묵 교육) */
const EXAMPLE_CHIPS: Record<string, string[]> = {
  case1: ['어제 몇 시에 퇴근하셨어요?', '탕비실 쓰레기통, 누가 치웠는지 아세요?', '혹시 푸딩 좋아하세요?'],
  case2: ['회식 끝나고 몇 시에 퇴근하셨어요?', '파쇄함, 어제 누가 썼나요?', '영수증은 보통 누가 챙겨요?'],
  case3: ['어제 오후에 자리 비우셨어요?', '급톡 본 사람이 있나요?', '퇴근 전에 PC 만진 사람 봤어요?'],
};

/** 첫 대면 NPC는 인사말을 띄운다 (빈 로그로 시작하는 어색함 해소) */
function greetIfNew(st: GameState, id: string): void {
  if (st.log.some((e) => e.npc === id)) return;
  const npc = NPCS[id];
  const g = npc?.greetingByCase?.[st.caseId] ?? npc?.greeting;
  if (g) st.log.push({ who: npc!.name, kind: 'npc', text: g, npc: id });
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
  box.append(el('p', 'eyebrow', '퇴근길 3분, 직접 물어보는 AI 심문 추리'));
  box.append(el('p', 'concept', '두잇상사 소동 전담 창구 503호 — 오늘도 사건이 접수됐습니다.'));
  box.append(el('p', 'loop-preview', '심문하고 → 단서를 들이대고 → 범인을 지목하세요'));
  box.append(el('p', 'ai-badge', 'NPC의 답변은 실시간 AI 생성 — 같은 질문에 같은 답은 없습니다'));
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
    btn.append(el('span', '', `${done ? '[완료] ' : ''}${c.title}${locked ? ' [잠금]' : ''}`));
    btn.disabled = !!locked;
    btn.onclick = () => { void startCase(c); };
    box.append(btn);
  }
  if (save.current) {
    const cont = el('button', 'btn primary', '이어하기');
    cont.onclick = () => { void resumeCase(); };
    box.append(cont);
  }
  const win = windowFrame('503호 수사 단말 — 시작', box);
  win.classList.add('title-win');
  app.append(win);
}

async function startCase(c: PublicCaseData): Promise<void> {
  currentCase = c;
  fullCase = await loadFullCase(c.id);
  if (!fullCase) return;
  openClueId = null;
  remoteEnding = null; // 이전 사건 엔딩이 새 사건 지면에 섞이는 크로스케이스 오염 방지 (C1)
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
  openClueId = null;
  remoteEnding = null;
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
    if (cl.holder === 'system') {
      st.log.push({ who: '시스템', kind: 'sys', text: `📁 ${cl.reveal}` });
      continue;
    }
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
  const beforeCount = st.foundClues.length; // 자동 획득(브리핑) 단서만 있던 상태인지
  for (const u of unlocked) {
    if (st.foundClues.includes(u.id)) continue;
    st.foundClues.push(u.id);
    // 배너 제목은 공개판 기준 (서버 제목이 결정적 수치를 선노출하는 사고 방지)
    const pub = currentCase?.clues.find((x) => x.id === u.id);
    st.log.push({ who: '시스템', kind: 'sys', text: `🔎 단서 획득: ${pub?.title ?? u.title}` });
  }
  if (beforeCount <= 1 && st.foundClues.length > beforeCount) {
    st.log.push({ who: '시스템', kind: 'sys', text: '단서는 [제시] 버튼으로 상대에게 들이댈 수 있습니다. 제시는 턴을 쓰지 않습니다.' });
  }
  if (st.foundClues.length > beforeCount) sfxPlay('unlock');
  pushReveals(st, fc, unlocked.map((u) => u.id));
}

function armHint(st: GameState): void {
  sfxPlay('arm');
  st.log.push({ who: '시스템', kind: 'sys', text: '상대가 크게 동요했습니다. 이 단서가 건드린 모양입니다 — 같은 선으로 더 캐물어보세요.' });
}

/** 목업 경로용: 첫 수득 단서라면 제시 튜토리얼 1회 */
function tutorialIfFirst(st: GameState, beforeCount: number): void {
  if (beforeCount <= 1 && st.foundClues.length > beforeCount) {
    st.log.push({ who: '시스템', kind: 'sys', text: '단서는 [제시] 버튼으로 상대에게 들이댈 수 있습니다. 제시는 턴을 쓰지 않습니다.' });
  }
}

/** 제시 적중 시 플레이어 대사를 추궁 시그니처로 교체 */
function signatureOnHit(st: GameState): void {
  const lastMe = [...st.log].reverse().find((e) => e.kind === 'me');
  if (lastMe) lastMe.text = `${lastMe.text} — 그건 어떻게 설명하시죠?`;
}

/** 폭로 전면 테이크오버 (플래시+집중선, reduced-motion 건드) */
function takeover(kind: 'hit' | 'verdict'): void {
  sfxPlay(kind); // 사운드는 reduced-motion과 무관 (시각 효과만 건너뜀)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelector('.takeover')?.remove(); // 연타 시 중첩 부착 방지 (M4)
  const ov = el('div', `takeover ${kind}`);
  document.body.append(ov);
  if (kind === 'verdict') {
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 450);
  }
  setTimeout(() => ov.remove(), 700);
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
      sfxPlay('receive');
      notifyRecoveryOnce(st);
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
      notifyMockOnce(st);
    }
  }
  const armedBefore = new Set(Object.keys(st.armedChains ?? {}));
  const cluesBefore = new Set(st.foundClues);
  ask(npc, fc, st, text);
  sfxPlay('receive');
  const newIds = st.foundClues.filter((id) => !cluesBefore.has(id));
  pushReveals(st, fc, newIds);
  tutorialIfFirst(st, cluesBefore.size);
  if (newIds.length === 0 && Object.keys(st.armedChains ?? {}).some((k) => !armedBefore.has(k))) armHint(st);
  afterTurn(st);
}

async function handlePresent(npc: NpcPublic, fc: ServerCaseData, st: GameState, clueId: string): Promise<void> {
  if (remoteEnabled()) {
    const clue = fc.clues.find((x) => x.id === clueId);
    st.log.push({ who: '나', kind: 'me', text: `[단서 제시] ${clue?.title ?? clueId}`, npc: npc.id });
    try {
      const meta = await remoteAsk(fc, st, npc, `이 단서를 보시죠: ${clue?.title ?? ''}`, clueId, () => {});
      notifyRecoveryOnce(st);
      st.log.push({ who: npc.name, kind: 'npc', text: meta.reply, npc: npc.id });
      sfxPlay('receive');
      const newArm = syncArmed(st, meta);
      announceUnlocks(st, fc, meta.unlocked);
      if (meta.unlocked.length > 0 || newArm) {
        (st.shaken ??= {})[npc.id] = true;
        if (meta.unlocked.length > 0) { signatureOnHit(st); takeover('hit'); }
        else armHint(st); // 1단 적중 — 체인 발동 대기
      } else {
        st.npc[npc.id].defense = Math.min(3, st.npc[npc.id].defense + 1);
        st.presentWrong += 1;
        st.log.push({ who: '시스템', kind: 'sys', text: '통하지 않았습니다. 상대의 경계가 올랐습니다. (경계 +1)' });
      }
      persist(); render();
      return;
    } catch {
      st.log.pop();
      notifyMockOnce(st);
    }
  }
  const cluesBefore = new Set(st.foundClues);
  const res = present(npc, fc, st, clueId);
  sfxPlay('receive');
  pushReveals(st, fc, res.unlocked);
  tutorialIfFirst(st, cluesBefore.size);
  if (res.unlocked.length > 0 || res.armed.length > 0) {
    (st.shaken ??= {})[npc.id] = true;
    if (res.unlocked.length > 0) { signatureOnHit(st); takeover('hit'); }
    else armHint(st);
  } else if (res.defenseUp) {
    st.log.push({ who: '시스템', kind: 'sys', text: '통하지 않았습니다. 상대의 경계가 올랐습니다. (경계 +1)' });
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
        takeover('verdict');
        setTimeout(() => sfxPlay('fanfare'), 700); // 플래시 걷힌 뒤 신문 지면 팡파레
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
  else { takeover('verdict'); setTimeout(() => sfxPlay('fanfare'), 700); }
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
  let accuseDoc: HTMLElement | null = null;
  // 파일 창은 심문 중에만 — 페이즈 이탈 시 자동으로 닫아 판정 오버레이와 겹치지 않게 (H1)
  if (st.phase !== 'interrogate') openClueId = null;

  const side = el('aside', 'side');
  side.append(el('h1', 'case-title', c.title));
  if (st.phase !== 'briefing') {
    side.append(el('p', 'turn-counter', `남은 질문: ${st.turnLeft}회${st.turnLeft === 0 ? ' — 마감' : st.turnLeft <= TURN_WARN ? ' — 마감 임박' : ''}`));
  }

  if (st.phase === 'briefing') {
    if (CASE_CARD[c.id]) {
      const card = el('img', 'briefing-card') as HTMLImageElement;
      card.src = CASE_CARD[c.id];
      side.append(card);
    }
    side.append(el('p', 'briefing', c.briefing));
    if (c.clientVoice) {
      const cv = el('p', 'client-voice');
      cv.append(el('span', 'client-voice-name', `${NPCS[c.client]?.name ?? '의뢰인'}의 말`));
      cv.append(el('q', '', c.clientVoice));
      side.append(cv);
    }
    const guide = el('div', 'guide-box');
    guide.append(el('strong', '', '수사 방법'));
    guide.append(el('p', '', '① 목록에서 심문할 사람을 고르고 자유롭게 질문하세요. 선택지는 없습니다. (질문 1회 = 1턴)'));
    guide.append(el('p', '', '② 얻은 단서는 [제시]로 들이대세요. 제시는 턴을 쓰지 않습니다.'));
    guide.append(el('p', '', `③ 핵심 단서를 모아 [범인 지목]. ${TURN_BUDGET}턴 안에 결론을 내야 합니다.`));
    side.append(guide);
    const start = el('button', 'btn primary', '심문 시작');
    start.onclick = () => { sfxPlay('send'); st.phase = 'interrogate'; greetIfNew(st, st.activeSuspect); persist(); render(); };
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
      const cd = defenseSpan(st, c.client);
      if (cd) cText.append(cd);
      card.append(cText);
      card.onclick = () => { st.activeSuspect = c.client; greetIfNew(st, c.client); persist(); render(); };
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
      const dm = defenseSpan(st, id);
      if (dm) textWrap.append(dm);
      card.append(textWrap);
      card.onclick = () => { st.activeSuspect = id; greetIfNew(st, id); persist(); render(); };
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
      wText.append(el('span', 'one-liner', `목격자? (질문 1회 = 2턴)`));
      const wd = defenseSpan(st, c.witness);
      if (wd) wText.append(wd);
      card.append(wText);
      card.onclick = () => { st.activeSuspect = c.witness!; greetIfNew(st, c.witness!); persist(); render(); };
      side.append(card);
    }
    side.append(el('h2', 'sec', `단서 ${st.foundClues.length}/${c.clues.length}`));
    for (const cid of st.foundClues) {
      const clue = c.clues.find((x) => x.id === cid);
      if (!clue) continue;
      const ce = el('div', 'clue clickable');
      ce.append(el('strong', '', clue.title));
      ce.append(el('p', '', clue.desc));
      ce.tabIndex = 0; // 키보드 접근 (H4)
      ce.onclick = () => { openClueId = cid; render(); };
      ce.onkeydown = (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openClueId = cid; render(); }
      };
      if (st.phase === 'interrogate') {
        const pb = el('button', 'btn mini', '제시');
        pb.onclick = (ev) => {
          ev.stopPropagation();
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
  if (st.phase === 'interrogate') {
    const bar = el('div', 'log-bar');
    const tgl = el('button', 'log-toggle', logAll ? '◀ 현재 인물과의 대화만' : '전체 대화 기록 보기');
    tgl.onclick = () => { logAll = !logAll; render(); };
    bar.append(tgl);
    main.append(bar);
  }
  const log = el('div', 'log');
  const npcFilter = st.activeSuspect;
  for (const e of st.log) {
    if (!logAll && e.npc && e.npc !== npcFilter && st.phase === 'interrogate') continue;
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
    if (st.turnsUsed === 0) {
      const chips = el('div', 'chips');
      chips.append(el('span', 'chips-label', '이렇게 물어보세요:'));
      for (const q of EXAMPLE_CHIPS[c.id] ?? []) {
        const chip = el('button', 'chip', q);
        chip.type = 'button';
        chip.onclick = () => {
          const inp = document.querySelector<HTMLInputElement>('form.input-bar input');
          if (inp) { inp.value = q; inp.focus(); }
        };
        chips.append(chip);
      }
      main.append(chips);
    }
    const form = el('form', 'input-bar');
    const input = el('input');
    input.placeholder = `${npc.name}에게 질문… (Enter 전송)`;
    input.value = inputDraft; // render 재생성에도 초안 유지
    input.addEventListener('input', () => { inputDraft = input.value; });
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
      inputDraft = '';
      sfxPlay('send');
      void handleAsk(npc, fc, st, text);
    };
    input.onkeydown = (ev) => {
      if (ev.key === 'Enter' && (composing || (ev as KeyboardEvent).keyCode === 229)) ev.stopPropagation();
    };
    main.append(form);
  } else if (st.phase === 'accuse') {
    // 품의서 지목 — "구속영장"이 아니라 "수사 결과 보고서 상신" (직장 밈)
    const doc = el('div', 'doc');
    accuseDoc = doc;
    const caseNo = CASES.indexOf(c) + 1;
    doc.append(el('p', 'doc-no', `품의서 제503-${caseNo}호`));
    doc.append(el('h2', 'doc-title', '수사 결과 보고서'));
    doc.append(el('p', 'doc-case', `사건: 「${c.title}」 — ${c.question}`));
    doc.append(el('p', 'doc-sec', '범 인 (1명)'));
    let pickedNpc: string | null = null;
    const pickedClues = new Set<string>();
    const npcRow = el('div', 'accuse-row');
    const submit = el('button', 'btn stamp', '상 신');
    submit.disabled = true; // 용의자 선택 전에는 비활성
    for (const id of c.suspects) {
      const npc = NPCS[id];
      const b = el('button', 'btn doc-pick', npc.name);
      b.onclick = () => {
        pickedNpc = id;
        submit.disabled = false;
        for (const x of npcRow.children) (x as HTMLElement).classList.remove('picked');
        b.classList.add('picked');
      };
      npcRow.append(b);
    }
    doc.append(npcRow);
    doc.append(el('p', 'doc-sec', '근거 단서 (최대 2개)'));
    const clueWrap = el('div', 'accuse-clues');
    for (const cid of st.foundClues) {
      const clue = c.clues.find((x) => x.id === cid);
      if (!clue) continue;
      const b = el('button', 'btn mini doc-clue', clue.title);
      b.onclick = () => {
        if (pickedClues.has(cid)) pickedClues.delete(cid);
        else if (pickedClues.size < 2) pickedClues.add(cid);
        b.classList.toggle('picked', pickedClues.has(cid)); // 3번째 클릭 데싱크 방지 (M1)
      };
      clueWrap.append(b);
    }
    doc.append(clueWrap);
    if (st.foundClues.length < 2) doc.append(el('p', 'doc-warn', '단서가 부족합니다. 그래도 상신할 수는 있습니다.'));
    const docBtns = el('div', 'doc-btns');
    submit.onclick = () => {
      if (!pickedNpc) return;
      sfxPlay('stamp');
      void handleAccuse(fc, st, pickedNpc, [...pickedClues]);
    };
    const back = el('button', 'btn', '← 심문으로');
    back.onclick = () => { st.phase = 'interrogate'; render(); };
    docBtns.append(submit, back);
    doc.append(docBtns);
    main.append(doc);
  }

  // 브리핑 단계는 빈 메신저 창을 띄우지 않는다 (특히 모바일에서 노이즈)
  const sideWin = windowFrame('사건 파일 — 503호', side, undefined, 'side-win');
  if (st.phase === 'briefing') {
    root.append(sideWin);
  } else {
    root.append(
      sideWin,
      windowFrame(
        st.phase === 'interrogate' ? `사내 메신저 — ${NPCS[st.activeSuspect].name}` : '사내 메신저 — 503호 수사 채널',
        main,
        undefined,
        'main-win',
      ),
    );
  }
  app.append(root);
  log.scrollTop = log.scrollHeight;
  // 지목 진입 시 품의서가 화면 안으로 (모바일에서 로그 아래에 묻히는 문제)
  accuseDoc?.scrollIntoView({ block: 'start' });
  // 모바일 심문은 최신 대화+입력창이 항상 보이게 페이지 하단 추적 (카톡 패턴)
  if (matchMedia('(max-width: 800px)').matches && st.phase === 'interrogate') {
    window.scrollTo(0, document.body.scrollHeight);
  }

  // ─── 판정/결과는 전면 오버레이 (뷰포트 밖으로 밀리는 문제 방지) ───
  if (st.phase === 'verdict' || st.phase === 'result') {
    const ov = el('div', 'overlay');
    const panel = el('div', 'overlay-panel');
    if (st.phase === 'verdict' && st.verdict !== 'win') {
      // 지목 실패 — 버텨낸 용의자의 여유 미소 (코미디)
      if (st.accusedId && NPC_VARIANT[st.accusedId]) {
        const p = el('img', 'verdict-portrait') as HTMLImageElement;
        p.src = NPC_VARIANT[st.accusedId].smile;
        p.alt = NPCS[st.accusedId]?.name ?? st.accusedId;
        panel.append(p);
        panel.append(el('p', 'verdict-caption', st.verdict === 'partial' ? `${NPCS[st.accusedId]?.name ?? ''} — 방향은 맞습니다. 그를 묶을 결정적 물증이 부족했습니다.` : `${NPCS[st.accusedId]?.name ?? ''} — 아쉽게도 빠져나갔습니다. 결정적 한 방이 부족했습니다.`));
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
      panel.append(retryBtn, giveUp);
    } else {
      renderResult(c, fc, st, panel);
    }
    ov.append(panel);
    app.append(ov);
  }

  // ─── 증거 파일 창 (단서 확대 보기) ───
  if (openClueId) {
    const clue = c.clues.find((x) => x.id === openClueId);
    if (clue) {
      const body = el('div', 'file-body');
      body.append(el('p', 'file-desc', clue.desc));
      body.append(el('p', 'file-holder', `출처: ${NPCS[clue.holder]?.name ?? '기록'}`));
      const fbtns = el('div', 'file-btns');
      if (st.phase === 'interrogate') {
        const pb = el('button', 'btn primary mini', '이 단서 제시');
        pb.onclick = () => {
          openClueId = null;
          const npc = NPCS[st.activeSuspect];
          void handlePresent(npc, fc, st, clue.id);
        };
        fbtns.append(pb);
      }
      const close = el('button', 'btn mini', '닫기');
      close.onclick = () => { openClueId = null; render(); };
      fbtns.append(close);
      body.append(fbtns);
      const fw = windowFrame(`증거 파일 — ${clue.title}`, body, () => { openClueId = null; render(); });
      fw.classList.add('file-win');
      app.append(fw);
    }
  }
}

function renderResult(c: PublicCaseData, fc: ServerCaseData, st: GameState, main: HTMLElement): void {
  const ending = remoteEnding ?? fc.ending;
  // 사내 신문 「두잇일보」 형식의 결과 지면
  const paper = el('div', 'paper');
  paper.append(el('p', 'paper-masthead', '두잇일보'));
  paper.append(el('p', 'paper-date', '사보 제503호 · 503호 창구 특보'));
  paper.append(el('h2', 'paper-headline', st.verdict === 'win' ? `「${c.title}」 해결` : `「${c.title}」 미해결 종결`));

  // 지목 성공 — 붕괴 표정 전면 포트레이트 (폭로 연출)
  if (st.verdict === 'win' && st.accusedId && NPC_VARIANT[st.accusedId]) {
    (st.shaken ??= {})[st.accusedId] = true;
    const p = el('img', 'verdict-portrait breakdown') as HTMLImageElement;
    p.src = NPC_VARIANT[st.accusedId].breakdown;
    p.alt = NPCS[st.accusedId]?.name ?? st.accusedId;
    paper.append(p);
    paper.append(el('p', 'verdict-caption', `${NPCS[st.accusedId]?.name ?? ''} — 더 이상 빠져나갈 곳이 없습니다.`));
  }
  // 미해결 마무리 — 지목했던 용의자의 여유 미소 (C등급에도 연출을)
  if (st.verdict !== 'win' && st.accusedId && NPC_VARIANT[st.accusedId]) {
    const p = el('img', 'verdict-portrait') as HTMLImageElement;
    p.src = NPC_VARIANT[st.accusedId].smile;
    p.alt = NPCS[st.accusedId]?.name ?? st.accusedId;
    paper.append(p);
    paper.append(el('p', 'verdict-caption', `${NPCS[st.accusedId]?.name ?? ''} — 끝내 밝혀내지 못했습니다.`));
  }
  if (st.verdict !== 'win') paper.append(el('div', 'paper-article', ending.lose));

  const g = grade(fc, st);
  const stamp = el('div', `grade-stamp grade-${g}`, `고과 ${g}`);
  paper.append(stamp);

  if (st.verdict === 'win' && !st.endChoice) {
    paper.append(el('div', 'paper-article', ending.win));
    if (ending.twist) paper.append(el('div', 'twist-box', ending.twist));
    if (ending.choice) {
      const a = el('button', 'btn primary', ending.choice.a.label);
      const b = el('button', 'btn', ending.choice.b.label);
      a.onclick = () => { st.endChoice = 'a'; markCleared(c.id); persist(); render(); };
      b.onclick = () => { st.endChoice = 'b'; markCleared(c.id); persist(); render(); };
      const bar = el('div', 'choice-bar');
      bar.append(a, b);
      main.append(paper, bar); // 스티키 하단 바 — 신문 지면에 묻히지 않게
      return;
    }
    markCleared(c.id);
  }
  if (st.endChoice && ending.choice) {
    paper.append(el('div', 'twist-box', st.endChoice === 'a' ? ending.choice.a.text : ending.choice.b.text));
  }
  const missing = c.clues.filter((cl) => !st.foundClues.includes(cl.id)).length;
  if (missing > 0) paper.append(el('p', 'dim', `숨겨진 단서 ${missing}개가 남아 있습니다.`));
  main.append(paper);

  const share = el('button', 'btn', '결과 카드 복사');
  share.onclick = () => {
    const text = `사건파일 503호 「${c.title}」 — 고과 ${g} (질문 ${st.turnsUsed}회, 단서 ${st.foundClues.length}/${c.clues.length})`;
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

// CRT 스캔라인 강도 토글 (우하단 고정, 심사 조건 방어)
const CRT_LEVELS: Array<[string, number]> = [['기본', 0.5], ['약함', 0.2], ['끔', 0]];
(function crtToggle(): void {
  let idx = Math.min(CRT_LEVELS.length - 1, Math.max(0, Number(storage.get('local', 'nan503.crt') ?? '0') || 0));
  const btn = document.createElement('button');
  btn.className = 'crt-toggle';
  const apply = (): void => {
    document.body.style.setProperty('--scan', String(CRT_LEVELS[idx][1]));
    btn.textContent = `CRT 효과: ${CRT_LEVELS[idx][0]}`;
  };
  btn.onclick = () => {
    idx = (idx + 1) % CRT_LEVELS.length;
    storage.set('local', 'nan503.crt', String(idx));
    apply();
  };
  apply();
  document.body.append(btn);
})();

// 부팅 시퀀스 (세션 1회, 3초 이내, 클릭/키 스킵, reduced-motion 건드) — "회사가 싸구려로 도입한 수사 단말기" 설치
(function boot(): void {
  if (storage.get('session', 'nan503.booted')) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  storage.set('session', 'nan503.booted', '1');
  const ov = el('div', 'boot');
  const crt = el('div', 'boot-crt'); // 전원 플래시 레이어
  const pre = el('pre', 'boot-text');
  const hint = el('p', 'boot-hint', '화면을 터치하거나 아무 키나 누르세요 — 건너뛰기');
  ov.append(crt, pre, hint);
  document.body.append(ov);
  let skipped = false;
  const timers: number[] = [];
  const wait = (ms: number): Promise<void> =>
    new Promise((res) => { timers.push(window.setTimeout(res, ms)); });
  const finish = (): void => {
    skipped = true;
    timers.forEach((t) => clearTimeout(t));
    ov.classList.add('boot-out');
    setTimeout(() => ov.remove(), 320);
    document.removeEventListener('keydown', skip);
  };
  const skip = (): void => { if (!skipped) finish(); };
  ov.addEventListener('click', skip);
  document.addEventListener('keydown', skip);

  const line = (text: string, cls = ''): void => {
    if (skipped) return;
    sfxPlay('bootBlip');
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = `${text}
`;
    pre.append(span);
  };
  const dots = async (label: string, n: number, per: number): Promise<void> => {
    if (skipped) return;
    const span = document.createElement('span');
    span.textContent = label;
    pre.append(span);
    for (let i = 0; i < n && !skipped; i += 1) {
      span.textContent += '.';
      await wait(per);
    }
    if (!skipped) span.textContent += ' OK\n';
  };

  void (async () => {
    await wait(480); // CRT 전원 플래시
    line('DOIT-BIOS v2.03 — (주)두잇상사 사내 표준 단말');
    await wait(260);
    line('INTRANET-503 수사 단말 클라이언트');
    await wait(340);
    // 메모리 카운트업
    const mem = document.createElement('span');
    pre.append(mem);
    for (const n of [64, 256, 1024, 4096, 16384]) {
      if (skipped) return;
      mem.textContent = `메모리 체크 ......... ${n}KB`;
      await wait(110);
    }
    if (skipped) return;
    mem.textContent += ' OK\n';
    await wait(200);
    line('CRT 디스플레이 ......... OK');
    await wait(170);
    line('사내 전화선 모뎀 ......... 33.6kbps OK');
    await wait(230);
    await dots('사내 망 접속 ', 7, 130);
    await wait(190);
    await dots('AI 심문 엔진 연결 ', 9, 150); // 의도적 지연 — 점점점이 기다리게
    if (skipped) return;
    await wait(280);
    line('인격 모듈 적재 중:');
    const modules: Array<[string, string]> = [
      ['구본식 (영업부장)', '적재'],
      ['차민재 (마케팅 대리)', '적재'],
      ['이상록 (신입사원)', '적재'],
      ['전순덕 (경리과장)', '적재'],
      ['마루팡 (총무 과장)', '지연 — 원래 이런 분'],
      ['오복자 (청소 담당)', '적재'],
    ];
    for (const [name, status] of modules) {
      if (skipped) return;
      line(`  ${name} .......... ${status}`, status.startsWith('지연') ? 'boot-warn' : '');
      await wait(status.startsWith('지연') ? 430 : 130);
    }
    await wait(320);
    line('');
    line('경고: 이 단말기는 (주)두잇상사의 자산입니다.', 'boot-warn');
    line('심문 내용은 503호에 기록됩니다. — 총무팀', 'boot-warn');
    await wait(700);
    if (skipped) return;
    const logo = document.createElement('img');
    logo.src = LOGO;
    logo.className = 'boot-logo';
    logo.alt = '사건파일 503호';
    ov.append(logo);
    sfxPlay('slam');
    await wait(1000);
    finish();
  })();
})();

renderTitle();
