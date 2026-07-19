// ─── GDD v1.1 §4 Trigger DSL ───
export type Trigger =
  | { type: 'topic'; npc: string; topics: string[]; note?: string; then?: Trigger }
  | { type: 'present'; npc: string; clue: string; then?: Trigger }
  | { type: 'turn'; npc: string; count: number }
  | { type: 'confession'; npc: string; requires_present: string };

// ─── 공개 단서 (클리이언트) ───
export interface PublicClue {
  id: string;
  title: string;
  desc: string;
  holder: string;
}

// ─── 서버 전용 단서 (프록시: trigger + reveal) ───
export interface ServerClue extends PublicClue {
  trigger: Trigger;
  /** 백엔드가 해금 확정 후 다음 턴 컨텍스트에 주입하는 텍스트 (미해금 시 프롬프트 물리 비포함) */
  reveal: string;
}

// ─── NPC 공개 프로필 (클리이언트 표시용) ───
export interface NpcPublic {
  id: string;
  name: string;
  role: string;
  age: number;
  color: string;
  oneLiner: string;
  personality: string;
  greeting: string;
  /** 폴리백 대사 — 사건 무관 공통 + 사걍별 분리 (인격 붕괴 방지, reveal 문장 재사용 금지) */
  fallback: {
    common: string[];
    byCase: Record<string, string[]>;
  };
}

// ─── NPC 서버 전용 (프롬프트 조립용) ───
export interface NpcServer {
  id: string;
  speechRules: string[];
  forbidden: string[];
  secrets: Record<string, string>;
  /** 사걸별 스코프 필수 (common + 사건 id) — 미스코프 지식 주입 시 다른 사건 내용 누설 사고 있었음 */
  knowledge: Record<string, string[]>;
}

// ─── 사건 공개 데이터 (클리이언트) ───
export interface PublicCaseData {
  id: string;
  title: string;
  client: string;
  briefing: string;
  question: string;
  suspects: string[];
  witness?: string;
  clues: PublicClue[];
}

// ─── 사건 서버 전용 데이터 (프록시) ───
export interface ServerCaseData extends Omit<PublicCaseData, 'clues'> {
  culpritId: string;
  clues: ServerClue[];
  keyClueIds: string[];
  /** 각 그룹에서 1개 이상 필요 (OR 조합 — 사건2: {d3,(d4 OR d5)}) */
  keyClueChoices?: string[][];
  partialClueSets: string[][];
  /** 오지목 시 지목 인물별 힌트 한 줄 (재도전 방향 유도) */
  accuseHints?: Record<string, string>;
  ending: {
    win: string;
    lose: string;
    twist?: string;
    choice?: { a: { label: string; text: string }; b: { label: string; text: string } };
  };
  litmusKeywords: string[];
}

// ─── 레거시 호환 (mock/구버전 참조 제거용) ───
/** @deprecated PublicCaseData 사용 */
export type CaseData = ServerCaseData;
/** @deprecated NpcPublic 사용 */
export type VoiceCard = NpcPublic & NpcServer;
