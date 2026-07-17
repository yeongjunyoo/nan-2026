import type { NpcPublic, ServerCaseData, ServerClue, Trigger } from './types';

// ─── 런타임 상태 ───
export interface NpcState {
  defense: number; // -3..+3
  turns: number;
  fallbackIdx: number;
}

export interface ChatEntry {
  who: string;
  kind: 'me' | 'npc' | 'sys';
  text: string;
  npc?: string;
}

export type Phase = 'title' | 'briefing' | 'interrogate' | 'accuse' | 'verdict' | 'result';

export interface GameState {
  caseId: string;
  phase: Phase;
  activeSuspect: string;
  turnLeft: number;
  turnsUsed: number; // 등급 산정용 (재도전 본너스와 무관하게 누적)
  presentWrong: number; // 오제시 횟수 (제시 정확도)
  npc: Record<string, NpcState>;
  foundClues: string[];
  armedChains: Record<string, true>; // then 체인의 1단이 충족된 단서
  log: ChatEntry[];
  retriesLeft: number;
  verdict: 'none' | 'win' | 'partial' | 'lose';
  endChoice: 'a' | 'b' | null;
}

export const TURN_BUDGET = 24;
export const TURN_WARN = 6;
export const TURN_RETRY_BONUS = 3;
export const WITNESS_COST = 2;

export function createGame(c: ServerCaseData): GameState {
  const npc: Record<string, NpcState> = {};
  for (const id of [c.client, ...c.suspects, ...(c.witness ? [c.witness] : [])]) {
    npc[id] = { defense: 0, turns: 0, fallbackIdx: 0 };
  }
  const s: GameState = {
    caseId: c.id, phase: 'briefing', activeSuspect: c.suspects[0],
    turnLeft: TURN_BUDGET, turnsUsed: 0, presentWrong: 0,
    npc, foundClues: [], armedChains: {}, log: [], retriesLeft: 1,
    verdict: 'none', endChoice: null,
  };
  for (const clue of c.clues) {
    if (clue.trigger.type === 'turn' && clue.trigger.count === 0) {
      grantClue(c, s, clue, false);
    }
  }
  return s;
}

function grantClue(c: ServerCaseData, s: GameState, clue: ServerClue, announce = true): boolean {
  if (s.foundClues.includes(clue.id)) return false;
  s.foundClues.push(clue.id);
  if (announce) s.log.push({ who: '시스템', kind: 'sys', text: `🔎 단서 획득: ${clue.title}` });
  return true;
}

// ─── 목업 프로바이더 (G4 실 LLM으로 교체 — 시그니처 동일 유지) ───
export interface AskContext {
  caseData: ServerCaseData;
  state: GameState;
  playerText: string;
}
export interface AskReply {
  text: string;
  topicsHit: string[];
}

function collectTopics(t: Trigger, npcId: string, out: Set<string>): void {
  if (t.type === 'topic' && t.npc === npcId) {
    for (const kw of t.topics) out.add(kw);
  }
  if ((t.type === 'topic' || t.type === 'present') && t.then) {
    collectTopics(t.then, npcId, out);
  }
}

export function mockAsk(npc: NpcPublic, ctx: AskContext): AskReply {
  const text = ctx.playerText.toLowerCase().replace(/\s+/g, '');
  const topicsHit = new Set<string>();
  for (const clue of ctx.caseData.clues) {
    const kws = new Set<string>();
    collectTopics(clue.trigger, npc.id, kws);
    for (const kw of kws) {
      if (text.includes(kw.toLowerCase().replace(/\s+/g, ''))) topicsHit.add(kw);
    }
  }
  const ns = ctx.state.npc[npc.id];
  const pool = [...(npc.fallback.byCase[ctx.caseData.id] ?? []), ...npc.fallback.common];
  const line = pool[ns.fallbackIdx % pool.length];
  ns.fallbackIdx += 1;
  return { text: line, topicsHit: [...topicsHit] };
}

// ─── 트리거 평가 (then 체인 = 1단 충족 시 armed, 2단은 후속 ask/present에서 완료) ───
interface EvalCtx {
  mode: 'ask' | 'present';
  npcId: string;
  topicsHit: string[];
  presentedClueId?: string;
}

/** @returns 'unlock' | 'arm' | false */
function evalTrigger(c: ServerCaseData, s: GameState, t: Trigger, ctx: EvalCtx): 'unlock' | 'arm' | false {
  switch (t.type) {
    case 'topic': {
      const hit = ctx.mode === 'ask' && t.npc === ctx.npcId && t.topics.some((kw) => ctx.topicsHit.includes(kw));
      if (!hit) return false;
      return t.then ? 'arm' : 'unlock';
    }
    case 'turn':
      return t.npc === ctx.npcId && t.count <= (s.npc[ctx.npcId]?.turns ?? 0) ? 'unlock' : false;
    case 'present': {
      const hit = ctx.mode === 'present' && t.npc === ctx.npcId && t.clue === ctx.presentedClueId;
      if (!hit) return false;
      return t.then ? 'arm' : 'unlock';
    }
    case 'confession':
      return ctx.mode === 'present' && t.npc === ctx.npcId && t.requires_present === ctx.presentedClueId ? 'unlock' : false;
  }
}

function processClue(c: ServerCaseData, s: GameState, clue: ServerClue, ctx: EvalCtx): void {
  if (s.foundClues.includes(clue.id)) return;
  const t = clue.trigger;

  // armed 체인의 2단 완료 시도 (ask 모드에서 then.topic 매칭)
  if (s.armedChains[clue.id] && 'then' in t && t.then && ctx.mode === 'ask') {
    const inner = evalTrigger(c, s, t.then, ctx);
    if (inner === 'unlock') {
      delete s.armedChains[clue.id];
      grantClue(c, s, clue);
    }
    return;
  }

  const r = evalTrigger(c, s, t, ctx);
  if (r === 'unlock') grantClue(c, s, clue);
  else if (r === 'arm') s.armedChains[clue.id] = true;
}

function processAll(c: ServerCaseData, s: GameState, ctx: EvalCtx): void {
  for (const clue of c.clues) processClue(c, s, clue, ctx);
}

// ─── 액션 ───
export function ask(npcCard: NpcPublic, c: ServerCaseData, s: GameState, text: string): void {
  const cost = npcCard.id === c.witness ? WITNESS_COST : 1;
  s.turnLeft = Math.max(0, s.turnLeft - cost);
  s.turnsUsed += cost;
  const ns = s.npc[npcCard.id];
  ns.turns += 1;
  s.log.push({ who: '나', kind: 'me', text, npc: npcCard.id });

  const reply = mockAsk(npcCard, { caseData: c, state: s, playerText: text });
  s.log.push({ who: npcCard.name, kind: 'npc', text: reply.text, npc: npcCard.id });

  processAll(c, s, { mode: 'ask', npcId: npcCard.id, topicsHit: reply.topicsHit });
}

export interface PresentResult {
  unlocked: string[];
  armed: string[];
  defenseUp: boolean;
}

export function present(npcCard: NpcPublic, c: ServerCaseData, s: GameState, clueId: string): PresentResult {
  const clue = c.clues.find((x) => x.id === clueId);
  s.log.push({ who: '나', kind: 'me', text: `[단서 제시] ${clue?.title ?? clueId}`, npc: npcCard.id });

  const before = new Set(s.foundClues);
  const armedBefore = new Set(Object.keys(s.armedChains));
  processAll(c, s, { mode: 'present', npcId: npcCard.id, topicsHit: [], presentedClueId: clueId });
  const unlocked = s.foundClues.filter((id) => !before.has(id));
  const armed = Object.keys(s.armedChains).filter((id) => !armedBefore.has(id));

  if (unlocked.length > 0 || armed.length > 0) {
    s.log.push({ who: npcCard.name, kind: 'npc', text: '(동요하며) …그건, 그게…', npc: npcCard.id });
    return { unlocked, armed, defenseUp: false };
  }
  const ns = s.npc[npcCard.id];
  ns.defense = Math.min(3, ns.defense + 1);
  s.presentWrong += 1;
  s.log.push({ who: npcCard.name, kind: 'npc', text: '그게 저랑 무슨 상관이죠? (방어적 태도)', npc: npcCard.id });
  return { unlocked: [], armed: [], defenseUp: true };
}

export interface AccuseResult {
  verdict: 'win' | 'partial' | 'lose';
  feedback: string;
}

/** 핵심 단서 조합 판정: keyClueIds 전부 + keyClueChoices 각 그룹에서 1개 이상 */
export function keyComboHit(c: ServerCaseData, clueIds: string[]): boolean {
  if (!c.keyClueIds.every((k) => clueIds.includes(k))) return false;
  for (const group of c.keyClueChoices ?? []) {
    if (!group.some((k) => clueIds.includes(k))) return false;
  }
  return true;
}

export function accuse(c: ServerCaseData, s: GameState, culpritId: string, clueIds: string[]): AccuseResult {
  s.phase = 'verdict';

  if (culpritId === c.culpritId && keyComboHit(c, clueIds)) {
    s.verdict = 'win';
    s.phase = 'result';
    // 판정 후 해금 (turn 99 트리거 = 판정 후 공개 단서)
    for (const clue of c.clues) {
      if (clue.trigger.type === 'turn' && clue.trigger.count >= 99) {
        grantClue(c, s, clue, false);
      }
    }
    return { verdict: 'win', feedback: c.ending.win };
  }
  if (culpritId === c.culpritId) {
    s.verdict = 'partial';
    return {
      verdict: 'partial',
      feedback: '방향은 맞는 것 같습니다만… 결정적 단서가 빈손이네요. (핵심 단서 부족)',
    };
  }
  s.verdict = 'lose';
  const partial = c.partialClueSets.some((set) => set.every((k) => clueIds.includes(k)));
  return {
    verdict: 'lose',
    feedback: partial
      ? '단서 조합은 그럴듯한데, 뭔가 하나 어긋납니다. 그 사람도 숨기는 게 있긴 합니다만… 이 사건이랑 직결인지는 확신이 안 서네요.'
      : '그 사람도 뭔가 숨기는 게 있긴 합니다만… 이 사건이랑 직결인지는 확신이 안 서네요.',
  };
}

export function applyRetry(s: GameState): boolean {
  if (s.retriesLeft <= 0) return false;
  s.retriesLeft -= 1;
  s.turnLeft += TURN_RETRY_BONUS; // turnsUsed는 그대로 (등급 역설 방지)
  s.phase = 'interrogate';
  s.verdict = 'none';
  s.log.push({ who: '시스템', kind: 'sys', text: `재도전 기회 사용 — 심문 ${TURN_RETRY_BONUS}턴 추가 (남은 재도전: ${s.retriesLeft})` });
  return true;
}

export function finalizeLose(s: GameState): 'C' {
  s.phase = 'result';
  return 'C';
}

export function grade(c: ServerCaseData, s: GameState): 'S' | 'A' | 'B' | 'C' {
  if (s.verdict !== 'win') return 'C';
  const keyRatio = c.keyClueIds.filter((k) => s.foundClues.includes(k)).length / c.keyClueIds.length;
  if (keyRatio < 1) return 'B';
  if (s.turnsUsed <= 9 && s.presentWrong === 0) return 'S';
  if (s.turnsUsed <= 14 && s.presentWrong <= 1) return 'A';
  return 'B';
}
