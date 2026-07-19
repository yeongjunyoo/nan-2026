import type { GameState } from './engine';
import type { NpcPublic, ServerCaseData } from './types';

// ─── 원격 프로바이더 (Workers 프록시) ───
// REMOTE_URL이 비어 있으면 목업 모드. 설정: ?remote=<url> 또는 localStorage.nan503.remote

export let REMOTE_URL = '';
let sessionToken = '';

const DEFAULT_PROXY = 'https://nan503-proxy.apple021104.workers.dev';

export function initRemote(): void {
  const params = new URLSearchParams(location.search);
  const q = params.get('remote');
  if (q) {
    REMOTE_URL = q;
    localStorage.setItem('nan503.remote', q);
  } else if (params.get('mock') !== null) {
    REMOTE_URL = ''; // ?mock — 목업 모드 강제 (오프라인/디버그)
  } else {
    REMOTE_URL = localStorage.getItem('nan503.remote') ?? DEFAULT_PROXY;
  }
  sessionToken = localStorage.getItem('nan503.session') ?? '';
}

export function remoteEnabled(): boolean {
  return REMOTE_URL.length > 0;
}

async function ensureSession(): Promise<string> {
  if (sessionToken) return sessionToken;
  const res = await fetch(`${REMOTE_URL}/session`, { method: 'POST' });
  const j = (await res.json()) as { token: string };
  sessionToken = j.token;
  localStorage.setItem('nan503.session', sessionToken);
  return sessionToken;
}

export interface MetaPayload {
  reply: string;
  emotion: string | null;
  defenseDelta: number;
  refuse: boolean;
  unlocked: Array<{ id: string; title: string; desc: string; reveal: string }>;
  token: string;
  metrics: unknown;
}

export interface RemoteError {
  kind: 'llm-error' | 'network' | 'litmus';
  detail: string;
}

/** SSE 스트리밍 ask/present. 실패 시 RemoteError throw (호출부가 목업 폴리백). */
export async function remoteAsk(
  c: ServerCaseData,
  s: GameState,
  npc: NpcPublic,
  text: string,
  presentClueId: string | null,
  onDelta: (full: string) => void,
): Promise<MetaPayload> {
  const token = await ensureSession();
  const path = presentClueId ? '/present' : '/ask';
  const res = await fetch(`${REMOTE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token,
      state: s,
      npcId: npc.id,
      ...(presentClueId ? { clueId: presentClueId } : { text }),
    }),
  });
  if (!res.ok || !res.body) throw { kind: 'network', detail: `http ${res.status}` } as RemoteError;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let meta: MetaPayload | null = null;
  let llmErr: RemoteError | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split('\n\n');
    buf = blocks.pop() ?? '';
    for (const block of blocks) {
      const evMatch = block.match(/^event: (.+)$/m);
      const dataMatch = block.match(/^data: (.+)$/ms);
      if (!evMatch || !dataMatch) continue;
      const ev = evMatch[1];
      const data = JSON.parse(dataMatch[1]) as Record<string, unknown>;
      if (ev === 'delta') {
        onDelta(data.text as string);
      } else if (ev === 'meta') {
        meta = data as unknown as MetaPayload;
      } else if (ev === 'llm-error' || ev === 'error') {
        llmErr = { kind: 'llm-error', detail: String(data.error ?? 'unknown') };
      } else if (ev === 'litmus-replace') {
        onDelta(`\n${data.text as string}`);
      }
    }
  }
  if (llmErr) throw llmErr;
  if (!meta) throw { kind: 'network', detail: 'no-meta' } as RemoteError;
  if (meta.token) {
    sessionToken = meta.token;
    localStorage.setItem('nan503.session', sessionToken);
  }
  return meta;
}

export interface AccuseResponse {
  verdict: 'win' | 'partial' | 'lose';
  feedback: string;
  ending?: ServerCaseData['ending'];
  postUnlock?: string[];
}

export async function remoteAccuse(c: ServerCaseData, s: GameState, culpritId: string, clueIds: string[]): Promise<AccuseResponse> {
  const token = await ensureSession();
  const res = await fetch(`${REMOTE_URL}/accuse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, state: s, culpritId, clueIds }),
  });
  if (!res.ok) throw { kind: 'network', detail: `http ${res.status}` } as RemoteError;
  return (await res.json()) as AccuseResponse;
}
