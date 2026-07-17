export interface Clue {
  id: string;
  title: string;
  desc: string;
}

export interface Suspect {
  id: string;
  name: string;
  role: string;
  oneLiner: string;
  color: string;
}

export interface CaseData {
  id: string;
  title: string;
  briefing: string;
  suspects: Suspect[];
  clues: Clue[];
  culpritId: string;
  keyClueIds: string[];
  /** suspectId -> canned mock lines (cycled) */
  mockLines: Record<string, string[]>;
  /** suspectId -> clueId unlocked after N player messages to that suspect */
  clueUnlocks: Record<string, { after: number; clueId: string }>;
}

export type ChatKind = 'me' | 'npc' | 'sys';

export interface ChatEntry {
  who: string;
  kind: ChatKind;
  text: string;
}

export type Phase = 'briefing' | 'interrogate' | 'accuse' | 'verdict';

export interface GameState {
  phase: Phase;
  activeSuspect: string;
  log: ChatEntry[];
  foundClues: string[];
  askCounts: Record<string, number>;
  accused: string | null;
  verdict: 'none' | 'win' | 'lose';
}
