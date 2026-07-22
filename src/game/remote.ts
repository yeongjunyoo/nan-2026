import type { GameState } from './engine';
import type { NpcPublic, ServerCaseData } from './types';

// ─── 원격 프로바이더 (Workers 프록시) ───
// REMOTE_URL이 비어 있으면 목업 모드. 설정: ?remote=<url> 또는 localStorage.nan503.remote

export let REMOTE_URL = '';
let sessionToken = '';

const DEFAULT_PROXY = 'https://nan503-proxy.apple021104.workers.dev';

// 스토리지 차단 환경 가드 (인앱 웹뷰)
const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, val: string): void { try { localStorage.setItem(key, val); } catch { /* 무시 */ } },
};

export function initRemote(): void {
  const params = new URLSearchParams(location.search);
  const q = params.get('remote');
  if (q) {
    REMOTE_URL = q;
    store.set('nan503.remote', q);
  } else if (params.get('mock') !== null) {
    REMOTE_URL = ''; // ?mock — 목업 모드 강제 (오프라인/디버그)
  } else {
    REMOTE_URL = store.get('nan503.remote') ?? DEFAULT_PROXY;
  }
  sessionToken = store.get('nan503.session') ?? '';
}

export function remoteEnabled(): boolean {
  return REMOTE_URL.length > 0;
}

async function ensureSession(): Promise<string> {
  if (sessionToken) return sessionToken;
  const res = await fetch(`${REMOTE_URL}/session`, { method: 'POST' });
  const j = (await res.json()) as { token: string };
  sessionToken = j.token;
  store.set('nan503.session', sessionToken);
  return sessionToken;
}

export interface MetaPayload {
  reply: string;
  emotion: string | null;
  defenseDelta: number;
  refuse: boolean;
  unlocked: Array<{ id: string; title: string; desc: string; reveal: string }>;
  /** 서버가 확정한 armedChains 스냅샷 (2단 체인 — 클라가 그대로 채택) */
  armedChains?: Record<string, true>;
  token: string;
  metrics: unknown;
}

export interface RemoteError {
  kind: 'llm-error' | 'network' | 'litmus';
  detail: string;
  /** 스트림 시작 전 실패일 때만 true — mid-stream 실패는 sync 재시도하지 않는다 (이중 과금 방지, H5) */
  preStream?: boolean;
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
  // ?syncall — 강제 sync 모드 (스트리밍 미지원 환경 시뮬레이션/테스트)
  if (new URLSearchParams(location.search).has('syncall')) {
    return await remoteAskSync(c, s, npc, text, presentClueId, onDelta);
  }
  try {
    return await remoteAskStream(c, s, npc, text, presentClueId, onDelta);
  } catch (e) {
    // fetch/SSE 스트리밍 자체가 안 되는 환경(인앱 웹뷰)일 때만 sync JSON 재시도
    if ((e as RemoteError)?.preStream) return await remoteAskSync(c, s, npc, text, presentClueId, onDelta);
    throw e;
  }
}

async function remoteAskStream(
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
  if (!res.ok || !res.body || typeof res.body.getReader !== 'function') {
    throw { kind: 'network', detail: `http ${res.status}`, preStream: true } as RemoteError;
  }

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
    store.set('nan503.session', sessionToken);
  }
  return meta;
}

async function remoteAskSync(
  c: ServerCaseData,
  s: GameState,
  npc: NpcPublic,
  text: string,
  presentClueId: string | null,
  onDelta: (full: string) => void,
): Promise<MetaPayload> {
  const token = await ensureSession();
  const path = presentClueId ? '/present' : '/ask';
  const res = await fetch(`${REMOTE_URL}${path}?sync=1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token,
      state: s,
      npcId: npc.id,
      ...(presentClueId ? { clueId: presentClueId } : { text }),
    }),
  });
  if (!res.ok) throw { kind: 'network', detail: `http ${res.status}` } as RemoteError;
  const meta = (await res.json()) as MetaPayload;
  if (meta.token) {
    sessionToken = meta.token;
    store.set('nan503.session', sessionToken);
  }
  // 스트리밍 불가 환경 — 타이프라이터 시뮬레이션 (모바일에서도 답변이 '쳐지는' 감각 유지)
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onDelta(meta.reply);
  } else {
    const CHUNK = 3;
    for (let i = 0; i < meta.reply.length; i += CHUNK) {
      if (typeof document !== 'undefined' && document.hidden) { onDelta(meta.reply.slice(i)); break; }
      onDelta(meta.reply.slice(i, i + CHUNK));
      await new Promise((r) => setTimeout(r, 26));
    }
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
