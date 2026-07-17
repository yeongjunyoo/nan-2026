// ─── GDD v1.1 §4 Trigger DSL ───
export type Trigger =
  | { type: 'topic'; npc: string; topics: string[]; note?: string; then?: Trigger }
  | { type: 'present'; npc: string; clue: string; then?: Trigger }
  | { type: 'turn'; npc: string; count: number }
  | { type: 'confession'; npc: string; requires_present: string };

// ─── 단서 (GDD v1.1: {clue_id, holder_npc, trigger, reveal_text}) ───
export interface ClueDef {
  id: string;
  title: string;
  desc: string;
  holder: string; // npc id or 'system'
  trigger: Trigger;
  /** 백엔드가 해금 확정 후 다음 턴 컨텍스트에 주입하는 텍스트 (미해금 시 프롬프트 물리 비포함) */
  reveal: string;
}

// ─── NPC Voice 카드 (CSC: Voice/Action 분리) ───
export interface VoiceCard {
  id: string;
  name: string;
  role: string;
  age: number;
  color: string;
  oneLiner: string;
  personality: string;
  /** 말투 규칙 — Voice 카드 본체 */
  speechRules: string[];
  /** 이 캐릭터가 절대 안 하는 표현 (출력 리트머스에 병합) */
  forbidden: string[];
  /** caseId -> 최소 비밀. 진범인 사건에만 존재 ("당신은 X를 했다. 절대 인정하지 마라" 수준) */
  secrets: Record<string, string>;
  /** 크라임씬 룰: culprit=거짓말 가능(해당 사걸만), nonculprit=능동 거짓말 금지, witness=항상 진실 */
  honestyRule: 'culprit' | 'nonculprit' | 'witness';
  /** 사건 상관없는 개인 배경지식 (이 NPC가 아는 것만) */
  knowledge: string[];
  greeting: string;
  /** 폴리백 대사 ≥10 (인캐릭터, 물반복 로테이션) */
  fallbackLines: string[];
}

// ─── 사건 ───
export interface EndingChoice {
  a: { label: string; text: string };
  b: { label: string; text: string };
}

export interface CaseData {
  id: string;
  title: string;
  client: string; // 의뢰인 npc id
  briefing: string; // 앵커 포함
  question: string; // 판정 질문 (지목 화면)
  suspects: string[]; // 심문 대상 3 (지목 가능 집합)
  witness?: string; // 오복자 (턴 비용 2)
  culpritId: string;
  clues: ClueDef[];
  keyClueIds: string[]; // 핵심 단서 (판정 조합)
  partialClueSets: string[][]; // 부분 정답 세트
  ending: {
    win: string;
    lose: string; // 재도전 실패 시 C등급 문구
    twist?: string; // 반전 (판정 후)
    choice?: EndingChoice; // 사건2 엔딩 선택
  };
  /** 미해금 키워드 — 출력 리트머스 대상 */
  litmusKeywords: string[];
}
