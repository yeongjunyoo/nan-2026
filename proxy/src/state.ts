// HMAC-SHA256 서명/검증 (Web Crypto) — 세션 토큰 + 상태 블롭
const te = new TextEncoder();

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function sign(payload: unknown, secret: string): Promise<string> {
  const data = te.encode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('HMAC', await key(secret), data);
  return `${btoa(String.fromCharCode(...new Uint8Array(data)))}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
}

export async function verify<T>(blob: string, secret: string): Promise<T | null> {
  const dot = blob.lastIndexOf('.');
  if (dot < 0) return null;
  const dataB64 = blob.slice(0, dot);
  const sigB64 = blob.slice(dot + 1);
  try {
    const data = Uint8Array.from(atob(dataB64), (c) => c.charCodeAt(0));
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('HMAC', await key(secret), sig, data);
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(data)) as T;
  } catch {
    return null;
  }
}

export interface SessionToken {
  sid: string;
  iat: number;
  calls: number; // 세션당 LLM 호출 예산
}

export const SESSION_CALL_BUDGET = 60;

export async function issueSession(secret: string): Promise<{ token: string }> {
  const t: SessionToken = { sid: crypto.randomUUID(), iat: Date.now(), calls: 0 };
  return { token: await sign(t, secret) };
}

export async function bumpSession(token: string, secret: string): Promise<{ ok: boolean; token: string; calls: number }> {
  const t = await verify<SessionToken>(token, secret);
  if (!t) return { ok: false, token, calls: -1 };
  if (t.calls >= SESSION_CALL_BUDGET) return { ok: false, token, calls: t.calls };
  t.calls += 1;
  return { ok: true, token: await sign(t, secret), calls: t.calls };
}
