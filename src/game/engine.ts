import type { CaseData, GameState } from './types';

/** LLM 연동 전 루프 검증용 목업 — 캔드 응답 + 단서 해금 규칙만 실제 동작 */
export function createInitialState(c: CaseData): GameState {
  return {
    phase: 'briefing',
    activeSuspect: c.suspects[0].id,
    log: [],
    foundClues: [],
    askCounts: {},
    accused: null,
    verdict: 'none',
  };
}

export function mockReply(c: CaseData, suspectId: string, playerText: string, count: number): string {
  const lines = c.mockLines[suspectId] ?? ['(무응답)'];
  const base = lines[(count - 1) % lines.length];
  // 플레이어 입력의 첫 단어를 언급해 "듣고 있다"는 느낌만 주는 목업
  const first = playerText.trim().split(/\s+/)[0] ?? '';
  return base.replaceAll('{q}', first.slice(0, 12));
}

export interface AskResult {
  reply: string;
  newClue: string | null;
}

export function ask(c: CaseData, s: GameState, text: string): AskResult {
  const sid = s.activeSuspect;
  const n = (s.askCounts[sid] ?? 0) + 1;
  s.askCounts[sid] = n;
  s.log.push({ who: '나', kind: 'me', text });

  const reply = mockReply(c, sid, text, n);
  const suspect = c.suspects.find((x) => x.id === sid);
  s.log.push({ who: suspect?.name ?? sid, kind: 'npc', text: reply });

  let newClue: string | null = null;
  const unlock = c.clueUnlocks[sid];
  if (unlock && n >= unlock.after && !s.foundClues.includes(unlock.clueId)) {
    s.foundClues.push(unlock.clueId);
    newClue = unlock.clueId;
    const clue = c.clues.find((x) => x.id === unlock.clueId);
    s.log.push({ who: '시스템', kind: 'sys', text: `🔎 단서 획득: ${clue?.title ?? unlock.clueId}` });
  }
  return { reply, newClue };
}

export function accuse(c: CaseData, s: GameState, suspectId: string): void {
  s.accused = suspectId;
  s.phase = 'verdict';
  s.verdict = suspectId === c.culpritId ? 'win' : 'lose';
  const found = s.foundClues.filter((id) => c.keyClueIds.includes(id)).length;
  const total = c.keyClueIds.length;
  const name = c.suspects.find((x) => x.id === suspectId)?.name ?? suspectId;
  if (s.verdict === 'win') {
    s.log.push({
      who: '시스템', kind: 'sys',
      text: `✅ 정답! 범인은 ${name}이 맞다. 핵심 단서 ${found}/${total} 확보${found < total ? ' — 단서를 더 모았으면 더 확실했을 것' : ' — 완벽한 추리!'}`,
    });
  } else {
    const culprit = c.suspects.find((x) => x.id === c.culpritId)?.name;
    s.log.push({ who: '시스템', kind: 'sys', text: `❌ 오답. ${name}은 범인이 아니다. 진범은 ${culprit}. (핵심 단서 ${found}/${total})` });
  }
}
