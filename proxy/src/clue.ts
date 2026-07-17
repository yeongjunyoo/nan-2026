import type { ServerCaseData, ServerClue, Trigger } from '../../src/game/types';
import type { GameState } from '../../src/game/engine';

// ─── 트리거 평가 (서버측 진실 — 백엔드 확정 원칙, armedChains 2단 체인) ───
interface EvalCtx {
  mode: 'ask' | 'present';
  npcId: string;
  topicsHit: string[];
  presentedClueId?: string;
}

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

export function findUnlocks(c: ServerCaseData, s: GameState, ctx: EvalCtx): ServerClue[] {
  const out: ServerClue[] = [];
  for (const clue of c.clues) {
    if (s.foundClues.includes(clue.id)) continue;
    const t = clue.trigger;
    // armed 체인 2단 완료 (ask 모드에서 then.topic 매칭)
    if (s.armedChains?.[clue.id] && 'then' in t && t.then && ctx.mode === 'ask') {
      if (evalTrigger(c, s, t.then, ctx) === 'unlock') {
        delete s.armedChains[clue.id];
        out.push(clue);
      }
      continue;
    }
    const r = evalTrigger(c, s, t, ctx);
    if (r === 'unlock') out.push(clue);
    else if (r === 'arm') {
      if (!s.armedChains) s.armedChains = {};
      s.armedChains[clue.id] = true;
    }
  }
  return out;
}

// ─── 판정 (결정적 — LLM 불사용) ───
export interface VerdictOut {
  verdict: 'win' | 'partial' | 'lose';
  feedback: string;
  ending?: ServerCaseData['ending'];
  postUnlock?: string[]; // 판정 후 해금 (turn≥99)
}

export function keyComboHit(c: ServerCaseData, clueIds: string[]): boolean {
  if (!c.keyClueIds.every((k) => clueIds.includes(k))) return false;
  for (const group of c.keyClueChoices ?? []) {
    if (!group.some((k) => clueIds.includes(k))) return false;
  }
  return true;
}

export function judge(c: ServerCaseData, s: GameState, culpritId: string, clueIds: string[]): VerdictOut {
  if (culpritId === c.culpritId && keyComboHit(c, clueIds)) {
    const postUnlock = c.clues
      .filter((cl) => cl.trigger.type === 'turn' && cl.trigger.count >= 99 && !s.foundClues.includes(cl.id))
      .map((cl) => cl.id);
    return { verdict: 'win', feedback: c.ending.win, ending: c.ending, postUnlock };
  }
  if (culpritId === c.culpritId) {
    return {
      verdict: 'partial',
      feedback: '방향은 맞는 것 같습니다만… 결정적 단서가 빈손이네요. (핵심 단서 부족)',
    };
  }
  const partial = c.partialClueSets.some((set) => set.every((k) => clueIds.includes(k)));
  return {
    verdict: 'lose',
    feedback: partial
      ? '단서 조합은 그럴듯한데, 뭔가 하나 어긋납니다. 그 사람도 숨기는 게 있긴 합니다만… 이 사건이랑 직결인지는 확신이 안 서네요.'
      : '그 사람도 뭔가 숨기는 게 있긴 합니다만… 이 사건이랑 직결인지는 확신이 안 서네요.',
  };
}
