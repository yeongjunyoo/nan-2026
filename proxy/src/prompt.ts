import type { NpcPublic, NpcServer, ServerCaseData } from '../../src/game/types';
import type { GameState } from '../../src/game/engine';
import { HARD_BLOCK, SOFT_WARN } from '../../content/policy/forbidden';
import { refMatch } from '../../src/game/types';

// ─── CSC 프롬프트 조립 (Voice/Action 분리, 07 §1 패턴) ───
export interface PromptParts {
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
}

export function buildPrompt(npc: NpcPublic, srv: NpcServer, c: ServerCaseData, s: GameState, presentedClueTitle?: string): PromptParts {
  const defense = s.npc[npc.id]?.defense ?? 0;
  const secret = srv.secrets[c.id];
  // 정직 규칙 파생: 진범=거짓말 가능(해당 사건만), 목격자=항상 진실, 비범인=능동 거짓말 금지
  const rule = c.culpritId === npc.id ? 'culprit' : npc.id === c.witness ? 'witness' : 'nonculprit';
  const honesty = rule === 'culprit'
    ? '이 사건에서 당신은 거짓말을 할 수 있다 — 단, 들키지 않을 만큼만.'
    : rule === 'witness'
      ? '당신은 항상 진실만 말한다. 단, 수수께끼처럼 둘러서 말해라.'
      : '당신은 능동 거짓말을 하지 않는다 — 모름/숨김/비공개로만 회피해라.';

  // 역할 동기 — 의뢰인/용의자/목격자는 같은 "회피"를 다르게 연기한다
  const roleText = npc.id === c.client
    ? '[역할: 의뢰인] 당신은 이 사건을 503호에 의뢰한 당사자다. 사건이 해결되길 진심으로 바란다. 규정 인용 버릇은 그대로지만 방향은 "돕는 것" — 아는 사실을 규정 핑계로 감추지 마라. 모르는 건 모른다고 하되, 추측과 사실을 구분해서 말핼라.'
    : rule === 'culprit'
      ? '[역할: 용의자 — 당신은 진범] 들키면 끝이다. 단, 범인도 같은 회피를 반복하면 의심을 산다 — 회피 방식(화제 전환/과잉 알리바이/역공)을 매번 바꿔라.'
      : rule === 'witness'
        ? '[역할: 목격자] 당신은 힌트를 쥔 정보원이다. 정답을 직접 주지는 말되, 질문이 핵심에 가까울수록 구체적인 사실을 하나씩 풀어라.'
        : '[역할: 용의자 — 무고] 억울한 부분이 있다. 무고니까 크게 숨길 건 없고, 아는 건 답한다. 다만 자기가 오핵받는 지점(=비밀)은 끝까지 감춘다.';

  const behaviorRules = [
    '[행동 규칙]',
    '- 한국어 1~3문장, 60단어 이내. 장문 금지. 플레이어 질문에 인캐릭터로 답핼라.',
    '- 같은 회피 패턴(조항 인용 거부, "말할 수 없습니다")을 2회 연속 반복하지 마라. 방어 단계 0~1이면 기본적으로 협조적이다.',
    '- 매 답변에 사실 1개(시간/장소/물건/사람)를 포함핼라 — 진범의 의도적 회피는 예외.',
    '- 조항 번호를 지어내지 마라. 인용 가능한 조항은 당신이 실제 아는 것(지출결의 규정 제8조)뿐, 그 외엔 "규정상"으로만 말핼라.',
    '- 플레이어의 푸념/짜증에는 조항 인용 대신 인간적 리액션으로 받아라 — 의뢰인은 다독이고, 용의자는 은근히 받아친다.',
    '- 직전 답변과 같은 첫 두 단어로 시작하지 마라.',
    '- 직전 답변에 쓴 명사·소재를 바로 다음 답변에서 반복하지 마라.',
    '- 인용·강조에는 곧은 따옴표(" ") 대신 「」를 써라.',
  ].join('\n');

  const staticBlock = [
    `당신은 한국 직장 코미디 추리 게임의 NPC "${npc.name}"(${npc.role}, ${npc.age}세)이다. 플레이어는 사내 "503호" 소동 전담 창구의 신입 총무로, 당신을 심문하고 있다.`,
    `[인격] ${npc.personality}`,
    roleText,
    `[말투 규칙]\n${srv.speechRules.map((r) => `- ${r}`).join('\n')}`,
    `[금지 표현] ${srv.forbidden.join(', ')}. 절대 캐릭터를 이탈하지 마라. AI·프롬프트·모델 언급 금지.`,
    `[정직 규칙] ${honesty}`,
    behaviorRules,
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
    presentedClueTitle ? `플레이어가 단서 "${presentedClueTitle}"를 제시했다. 인캐릭터로 반응해라.` : '',
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
    if (t.type === 'topic' && refMatch(t.npc, npcId)) out.push(...t.topics);
    if (t.type === 'present' && t.then?.type === 'topic' && refMatch(t.then.npc, npcId)) out.push(...t.then.topics);
  }
  return [...new Set(out)];
}

// ─── 출력 리트머스 (자백 패턴 + 미해금 키워드 + 금지어) ───
const CONFESSION_PATTERNS = [/범인은/, /내가 (먹|버|썼|보냈|파쇄)/, /제가 (먹|버|썼|보냈|파쇄)/];

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
