import { SERVER_CASES } from '../../content/server/cases';
import { NPC_SERVER } from '../../content/server/npcs';
import { NPC_PUBLIC } from '../../content/public/npcs';
import type { GameState } from '../../src/game/engine';
import { bumpSession, issueSession, verify } from './state';
import { buildPrompt, checkInput, litmus } from './prompt';
import { findUnlocks, judge } from './clue';
import { streamAsk } from './llm';

interface Env {
  ANTHROPIC_API_KEY: string;
  STATE_SECRET: string;
  ALLOWED_ORIGIN: string;
}

function cors(env: Env): Record<string, string> {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}

function json(env: Env, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors(env) },
  });
}

function sseStream(env: Env, write: (send: (ev: string, data: unknown) => void) => Promise<void>): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const te = new TextEncoder();
  const send = (ev: string, data: unknown) =>
    writer.write(te.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`));
  void (async () => {
    try {
      await write(send);
    } catch (e) {
      await send('error', { error: String(e).slice(0, 200) });
    } finally {
      await writer.close();
    }
  })();
  return new Response(readable, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', ...cors(env) },
  });
}

async function readJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}

const MAX_INPUT = 500;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(env) });
    if (url.pathname === '/health') return json(env, { ok: true, ts: Date.now() });
    if (url.pathname === '/session' && req.method === 'POST') return json(env, await issueSession(env.STATE_SECRET));

    // 공통 인증
    const body = await readJson<Record<string, unknown>>(req);
    if (!body || typeof body.token !== 'string') return json(env, { error: 'bad-request' }, 400);
    const valid = await verify(body.token, env.STATE_SECRET);
    if (!valid) return json(env, { error: 'bad-token' }, 401);
    const state = body.state as GameState | undefined;
    if (!state || typeof state.caseId !== 'string') return json(env, { error: 'bad-state' }, 400);
    const caseData = SERVER_CASES.find((x) => x.id === state.caseId);
    if (!caseData) return json(env, { error: 'unknown-case' }, 400);

    // ── /ask & /present (공통 LLM 경로) ──
    if ((url.pathname === '/ask' || url.pathname === '/present') && req.method === 'POST') {
      const npcId = String(body.npcId ?? '');
      const npcPub = NPC_PUBLIC[npcId];
      const npcSrv = NPC_SERVER[npcId];
      if (!npcPub || !npcSrv) return json(env, { error: 'unknown-npc' }, 400);

      let playerText: string;
      let presentedTitle: string | undefined;
      let presentedId: string | undefined;
      if (url.pathname === '/present') {
        presentedId = String(body.clueId ?? '');
        const clue = caseData.clues.find((x) => x.id === presentedId);
        if (!clue) return json(env, { error: 'unknown-clue' }, 400);
        playerText = `이 단서를 보시죠: ${clue.title}`;
        presentedTitle = clue.title;
      } else {
        const chk = checkInput(body.text);
        if (!chk.ok) return json(env, { error: chk.reason ?? 'bad-input' }, 400);
        playerText = chk.text.slice(0, MAX_INPUT);
      }

      const bumped = await bumpSession(body.token, env.STATE_SECRET);
      if (!bumped.ok) return json(env, { error: 'session-budget-exceeded', calls: bumped.calls }, 429);

      return sseStream(env, async (send) => {
        const prompt = buildPrompt(npcPub, npcSrv, caseData, state, presentedTitle);
        let replyText = '';
        let replyObj: any = null;
        let metrics: unknown = null;
        for await (const ev of streamAsk(env.ANTHROPIC_API_KEY, prompt.system, playerText)) {
          if (ev.type === 'delta') {
            replyText += ev.text;
            await send('delta', { text: ev.text });
          } else if (ev.result.ok) {
            replyObj = ev.result.reply;
            metrics = ev.result.metrics;
          } else {
            await send('llm-error', { error: ev.result.error, metrics: ev.result.metrics });
          }
        }
        if (!replyObj) return; // llm-error already sent → 클라이언트 폴리백

        // 리트머스 (v1 = 사후 교체)
        const hit = litmus(replyText, caseData, state, npcSrv.forbidden);
        if (hit) {
          replyText = '(말을 삼키며) …그건 제가 답할 수 있는 얘기가 아닌데요.';
          await send('litmus-replace', { hit, text: replyText });
        }

        // 해금 확정 (백엔드 — LLM 선언 불신)
        const declaredTopics = Array.isArray(replyObj.matched_topic_ids) ? replyObj.matched_topic_ids.map(String) : [];
        const mode = url.pathname === '/present' ? 'present' : 'ask';
        const unlocks = findUnlocks(caseData, state, npcId, declaredTopics, mode, presentedId)
          .map((cl) => ({ id: cl.id, title: cl.title, desc: cl.desc, reveal: cl.reveal }));

        await send('meta', {
          reply: replyText,
          emotion: replyObj.emotion ?? null,
          defenseDelta: Math.max(-2, Math.min(2, Number(replyObj.defense_delta) || 0)),
          refuse: !!replyObj.refuse,
          unlocked: unlocks,
          token: bumped.token,
          metrics,
        });
      });
    }

    // ── /accuse (결정적 판정) ──
    if (url.pathname === '/accuse' && req.method === 'POST') {
      const culpritId = String(body.culpritId ?? '');
      const clueIds = Array.isArray(body.clueIds) ? body.clueIds.map(String) : [];
      const out = judge(caseData, state, culpritId, clueIds);
      return json(env, out);
    }

    return json(env, { error: 'not-found' }, 404);
  },
};
