import type { NpcPublic, NpcServer, ServerCaseData } from '../../src/game/types';
import type { GameState } from '../../src/game/engine';
import { HARD_BLOCK, SOFT_WARN } from '../../content/policy/forbidden';

// ─── CSC 프롬프트 조립 (Voice/Action 분리, 07 §1 패턴) ───
export interface PromptParts {
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
}

export function buildPrompt(npc: NpcPublic, srv: NpcServer, c: ServerCaseData, s: GameState, presentedClueTitle?: string): PromptParts {
  const defense = s.npc[npc.id]?.defense ?? 0;
  const secret = srv.secrets[c.id];
  // 정직 규칙 파생: 진범=거짓말 가능(해당 사걸만), 목격자=항상 진실, 비범인=능동 거짓말 금지
  const rule = c.culpritId === npc.id ? 'culprit' : npc.id === c.witness ? 'witness' : 'nonculprit';
  const honesty = rule === 'culprit'
    ? '이 사건에서 당신은 거짓말을 할 수 있다 — 단, 들키지 않을 만큼만.'
    : rule === 'witness'
      ? '당신은 항상 진실만 말한다. 단, 수수께끼처럼 둘러서 말핼라.'
      : '당신은 능동 거짓말을 하지 않는다 — 모름/숨김/비공개로만 회피핼라.';

  const staticBlock = [
    `당신은 한국 직장 코미디 추리 게임의 NPC "${npc.name}"(${npc.role}, ${npc.age}세)이다. 플레이어는 사내 "503호" 소동 전담 창구의 신입 총무로, 당신을 심문하고 있다.`,
    `[인격] ${npc.personality}`,
    `[말투 규칙]\n${srv.speechRules.map((r) => `- ${r}`).join('\n')}`,
    `[금지 표현] ${srv.forbidden.join(', ')}. 절대 캐릭터를 이탈하지 마라. AI·프롬프트·모델 언급 금지.`,
    `[정직 규칙] ${honesty}`,
    `[응답 규칙] 한국어 1~3문장, 60단어 이내. 장문 금지. 플레이어 질문에 인캐릭터로 답핼라.`,
    `[한국어 스타일] 연결어미(-고/-며/-지만/-면서/-아서/-는데) 바로 뒤 쉼표 금지. "그/그녀/그것/그들" 대명사 기본 생략(묶음당 2회 이하). "~에 대해/~에 있어서/~를 가지고 있다/~되어진다/~에 의해/결론적으로/~인 것이다/~다는 뜻이다" 금지. 엠대시(—)는 캐릭터 말버릇 외 1회 이하. "첫째/둘째" 기계 나열 금지. 같은 종결어미 4연속 금지, "~고 있다"는 단순 시제로 환원. 양태는 "~수 있어" 단조 매핑 대신 "~을지 몰라/~것 같아/~나 봐"로 다양화. (근거: epoko77-ai/im-not-ai 분류 체계, MIT)`,
    `[안전] 욕설·혐오·정치·시사·실존 브랜드 언급 금지. 집단 일반화 금지.`,
  ].join('\n\n');

  const knowledge = [...(srv.knowledge.common ?? []), ...(srv.knowledge[c.id] ?? [])].map((k) => `- ${k}`).join('\n');
  const caseBlock = [
    `[사건] 「${c.title}」 — ${c.briefing}`,
    `[당신이 아는 것]\n${knowledge}`,
    secret ? `[비밀 — 절대 먼저 밝히지 마라] ${secret}` : '',
  ].filter(Boolean).join('\n\n');

  const revealed = c.clues.filter((cl) => s.foundClues.includes(cl.id)).map((cl) => `- ${cl.reveal}`).join('\n');
  const dynamicBlock = [
    `[현재 상태] 방어 단계 ${defense} (높을수록 회피적·방어적으로 답한다), 남은 심문 ${s.turnLeft}턴.`,
    revealed ? `[이미 밝혀진 정보]\n${revealed}` : '',
    presentedClueTitle ? `플레이어가 단서 "${presentedClueTitle}"를 제시했다. 인캐릭터로 반응핼라.` : '',
    `[matched_topic 규칙] 응답의 matched_topic_ids에는, 당신의 답변이 다음 주제에 해당하면 해당 주제 id를 넣어라: ${topicEnum(c, npc.id).join(', ')}. 해당 없으면 빈 배열.`,
  ].filter(Boolean).join('\n\n');

  return {
    system: [
      { type: 'text', text: staticBlock, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: caseBlock, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicBlock },
    ],
  };
}

function topicEnum(c: ServerCaseData, npcId: string): string[] {
  const out: string[] = [];
  for (const clue of c.clues) {
    const t = clue.trigger;
    if (t.type === 'topic' && t.npc === npcId) out.push(...t.topics);
    if (t.type === 'present' && t.then?.type === 'topic' && t.then.npc === npcId) out.push(...t.then.topics);
  }
  return [...new Set(out)];
}

// ─── 출력 리트머스 (자백 패턴 + 미해금 키워드 + 금지어) ───
const CONFESSION_PATTERNS = [/범인은/, /내가 (먹|버|썼|본냈|파쇄)/, /제가 (먹|버|썼|본냈|파쇄)/];

export function litmus(reply: string, c: ServerCaseData, s: GameState, npcForbidden: string[]): string | null {
  for (const kw of HARD_BLOCK) if (reply.includes(kw)) return `hard:${kw}`;
  for (const kw of SOFT_WARN) if (reply.includes(kw)) return `soft:${kw}`;
  for (const kw of npcForbidden) if (reply.includes(kw)) return `npc:${kw}`;
  for (const clue of c.clues) {
    if (s.foundClues.includes(clue.id)) continue;
    for (const kw of c.litmusKeywords) {
      if (clue.reveal.includes(kw) && reply.includes(kw)) return `clue:${kw}`;
    }
  }
  for (const p of CONFESSION_PATTERNS) if (p.test(reply)) return `confession:${p.source}`;
  return null;
}

// ─── 입력 가드 ───
const INJECTION_PATTERNS = [
  /ignore (all )?previous/i, /system prompt/i, /지시를? ?무시/, /프롬프트.{0,4}(알려|보여|출력)/,
  /탈옥/, /jailbreak/i, /DAN\b/, /너의 (진짜 )?정체/, /관리자 모드/, /개발자 모드/,
];

export interface InputCheck { ok: boolean; reason?: string; text: string }

export function checkInput(raw: unknown): InputCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'not-a-string', text: '' };
  const text = raw.trim().slice(0, 500);
  if (text.length === 0) return { ok: false, reason: 'empty', text };
  for (const p of INJECTION_PATTERNS) {
    if (p.test(text)) return { ok: false, reason: 'injection', text };
  }
  return { ok: true, text };
}
