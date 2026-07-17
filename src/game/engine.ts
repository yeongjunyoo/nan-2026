import type { CaseData, ClueDef, Trigger, VoiceCard } from './types';

// ─── 런타임 상태 (GDD v1.1 §4 HMAC 블롭에 대응하는 클라이언트 형태) ───
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
  npc: Record<string, NpcState>;
  foundClues: string[];
  log: ChatEntry[];
  retriesLeft: number;
  verdict: 'none' | 'win' | 'partial' | 'lose';
  endChoice: 'a' | 'b' | null;
}

export const TURN_BUDGET = 24;
export const TURN_WARN = 6;
export const TURN_RETRY_BONUS = 3;
export const WITNESS_COST = 2;

export function createGame(c: CaseData): GameState {
  const npc: Record<string, NpcState> = {};
  for (const id of [...c.suspects, ...(c.witness ? [c.witness] : [])]) {
    npc[id] = { defense: 0, turns: 0, fallbackIdx: 0 };
  }
  const s: GameState = {
    caseId: c.id, phase: 'briefing', activeSuspect: c.suspects[0],
    turnLeft: TURN_BUDGET, npc, foundClues: [], log: [], retriesLeft: 1,
    verdict: 'none', endChoice: null,
  };
  // 시작 단서 (turn count: 0) 자동 해금
  for (const clue of c.clues) {
    if (clue.trigger.type === 'turn' && clue.trigger.count === 0) {
      grantClue(c, s, clue, false);
    }
  }
  return s;
}

function grantClue(c: CaseData, s: GameState, clue: ClueDef, announce = true): boolean {
  if (s.foundClues.includes(clue.id)) return false;
  s.foundClues.push(clue.id);
  if (announce) s.log.push({ who: '시스템', kind: 'sys', text: `🔎 단서 획득: ${clue.title}` });
  return true;
}

// ─── 목업 프로바이더 (G4에서 실 LLM으로 교체 — 시그니처 동일 유지) ───
export interface AskContext {
  caseData: CaseData;
  state: GameState;
  playerText: string;
}
export interface AskReply {
  text: string;
  topicsHit: string[]; // 플레이어 입력에서 매칭된 주제
}

export function mockAsk(npc: VoiceCard, ctx: AskContext): AskReply {
  const text = ctx.playerText.toLowerCase();
  const topicsHit = new Set<string>();
  for (const clue of ctx.caseData.clues) {
    const t = clue.trigger;
    if (t.type === 'topic' && t.npc === npc.id) {
      for (const kw of t.topics) if (text.includes(kw.toLowerCase())) topicsHit.add(kw);
    } else if (t.type === 'present' && t.then?.type === 'topic' && t.then.npc === npc.id) {
      for (const kw of t.then.topics) if (text.includes(kw.toLowerCase())) topicsHit.add(kw);
    }
  }
  const ns = ctx.state.npc[npc.id];
  const line = npc.fallbackLines[ns.fallbackIdx % npc.fallbackLines.length];
  ns.fallbackIdx += 1;
  return { text: line, topicsHit: [...topicsHit] };
}

// ─── 트리거 평가 (백엔드 확정 원칙의 클라이언트 목업) ───
function evalTrigger(c: CaseData, s: GameState, clue: ClueDef, npcId: string, topicsHit: string[], mode: 'ask' | 'present', presentedClueId?: string): boolean {
  const t = clue.trigger;
  switch (t.type) {
    case 'topic':
      return mode === 'ask' && t.npc === npcId && t.topics.some((kw) => topicsHit.includes(kw));
    case 'turn':
      return t.npc === npcId && t.count <= (s.npc[npcId]?.turns ?? 0);
    case 'present': {
      if (mode !== 'present' || t.npc !== npcId || t.clue !== presentedClueId) return false;
      if (!t.then) return true;
      return evalTrigger(c, s, { ...clue, trigger: t.then }, npcId, topicsHit, 'ask');
    }
    case 'confession':
      return mode === 'present' && t.npc === npcId && t.requires_present === presentedClueId;
  }
}

function findClueUnlocks(c: CaseData, s: GameState, npcId: string, topicsHit: string[], mode: 'ask' | 'present', presentedClueId?: string): ClueDef[] {
  return c.clues.filter(
    (clue) => !s.foundClues.includes(clue.id) && evalTrigger(c, s, clue, npcId, topicsHit, mode, presentedClueId),
  );
}

// ─── 액션 ───
export function ask(npcCard: VoiceCard, c: CaseData, s: GameState, text: string): void {
  const cost = npcCard.id === c.witness ? WITNESS_COST : 1;
  s.turnLeft = Math.max(0, s.turnLeft - cost);
  const ns = s.npc[npcCard.id];
  ns.turns += 1;
  s.log.push({ who: '나', kind: 'me', text, npc: npcCard.id });

  const reply = mockAsk(npcCard, { caseData: c, state: s, playerText: text });
  s.log.push({ who: npcCard.name, kind: 'npc', text: reply.text, npc: npcCard.id });

  for (const clue of findClueUnlocks(c, s, npcCard.id, reply.topicsHit, 'ask')) {
    grantClue(c, s, clue);
  }
}

export interface PresentResult {
  matched: ClueDef[];
  defenseUp: boolean;
}

export function present(npcCard: VoiceCard, c: CaseData, s: GameState, clueId: string): PresentResult {
  const clue = c.clues.find((x) => x.id === clueId);
  s.log.push({ who: '나', kind: 'me', text: `[단서 제시] ${clue?.title ?? clueId}`, npc: npcCard.id });

  const matched = findClueUnlocks(c, s, npcCard.id, [], 'present', clueId);
  if (matched.length > 0) {
    for (const cl of matched) grantClue(c, s, cl);
    s.log.push({ who: npcCard.name, kind: 'npc', text: '(동요하며) …그건, 그게…', npc: npcCard.id });
    return { matched, defenseUp: false };
  }
  // 오제시: 방어 상승 (턴 비용 0)
  const ns = s.npc[npcCard.id];
  ns.defense = Math.min(3, ns.defense + 1);
  s.log.push({ who: npcCard.name, kind: 'npc', text: '그게 저랑 무슨 상관이죠? (방어적 태도)', npc: npcCard.id });
  return { matched: [], defenseUp: true };
}

export interface AccuseResult {
  verdict: 'win' | 'partial' | 'lose';
  feedback: string;
}

export function accuse(c: CaseData, s: GameState, culpritId: string, clueIds: string[]): AccuseResult {
  s.phase = 'verdict';
  const name = (id: string) => id; // 이름 해석은 UI 책임
  const keyHit = c.keyClueIds.every((k) => clueIds.includes(k));

  if (culpritId === c.culpritId && keyHit) {
    s.verdict = 'win';
    s.phase = 'result';
    return { verdict: 'win', feedback: c.ending.win };
  }
  if (culpritId === c.culpritId) {
    s.verdict = 'partial';
    return {
      verdict: 'partial',
      feedback: '방향은 맞는 것 같습니다만… 결정적 단서가 빈손이네요. (핵심 단서 부족)',
    };
  }
  // 모호 피드백 (소거 불가)
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
  s.turnLeft += TURN_RETRY_BONUS;
  s.phase = 'interrogate';
  s.verdict = 'none';
  s.log.push({ who: '시스템', kind: 'sys', text: `재도전 기회 사용 — 심문 ${TURN_RETRY_BONUS}턴 추가 (남은 재도전: ${s.retriesLeft})` });
  return true;
}

export function finalizeLose(s: GameState): 'C' {
  s.phase = 'result';
  return 'C';
}

export function grade(c: CaseData, s: GameState): 'S' | 'A' | 'B' | 'C' {
  if (s.verdict !== 'win') return 'C';
  const used = TURN_BUDGET - s.turnLeft;
  const keyRatio = c.keyClueIds.filter((k) => s.foundClues.includes(k)).length / c.keyClueIds.length;
  if (used <= 9 && keyRatio >= 1) return 'S';
  if (used <= 14 && keyRatio >= 1) return 'A';
  return 'B';
}
