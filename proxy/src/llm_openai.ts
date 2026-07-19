// OpenAI 호환 엔드포인트 스트리밍 호출 (Gemini / GPT / GLM 공용)
import type { LlmMetrics, LlmReply, StreamEvent } from './llm';

export interface OpenAIConfig {
  baseUrl: string; // 예: https://generativelanguage.googleapis.com/v1beta/openai
  apiKey: string;
  model: string;
  /** Gemini thinking 억제 등 부가 필드 (엔드포인트별 패스스루) */
  extraBody?: Record<string, unknown>;
}

const RESPOND_SCHEMA = {
  type: 'object',
  properties: {
    reply_text: { type: 'string', description: 'NPC 발화 (한국어 1~3문장)' },
    emotion: { type: 'string' },
    defense_delta: { type: 'integer' },
    matched_topic_ids: { type: 'array', items: { type: 'string' } },
    refuse: { type: 'boolean' },
  },
  required: ['reply_text', 'emotion', 'defense_delta', 'matched_topic_ids', 'refuse'],
  additionalProperties: false,
} as const;

export async function* streamAskOpenAI(
  cfg: OpenAIConfig,
  systemText: string,
  userText: string,
): AsyncGenerator<StreamEvent> {
  const t0 = Date.now();
  let ttft = -1;
  const metrics: LlmMetrics = { ttftMs: -1, totalMs: -1, inTok: 0, outTok: 0, cacheReadTok: 0, cacheWriteTok: 0 };

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      stream_options: { include_usage: true },
      response_format: { type: 'json_schema', json_schema: { name: 'respond', strict: true, schema: RESPOND_SCHEMA } },
      messages: [
        { role: 'system', content: systemText },
        { role: 'user', content: userText },
      ],
      ...(cfg.extraBody ?? {}),
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    yield { type: 'done', result: { ok: false, error: `openai ${res.status}: ${errText.slice(0, 200)}`, metrics } };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let acc = ''; // 누적 content (JSON 문자열)
  let sentReplyLen = 0;

  const extractReplyPrefix = (): string => {
    const m = acc.match(/"reply_text"\s*:\s*"/);
    if (!m || m.index === undefined) return '';
    let i = m.index + m[0].length;
    let out = '';
    while (i < acc.length) {
      const ch = acc[i];
      if (ch === '\\') {
        const nxt = acc[i + 1];
        if (nxt === 'n') out += '\n';
        else if (nxt === '"' || nxt === '\\') out += nxt;
        else if (nxt === 'u' && i + 5 < acc.length) {
          out += String.fromCharCode(parseInt(acc.slice(i + 2, i + 6), 16));
          i += 4;
        } else out += nxt ?? '';
        i += 2;
      } else if (ch === '"') {
        break;
      } else {
        out += ch;
        i += 1;
      }
    }
    return out;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      let ev: any;
      try { ev = JSON.parse(data); } catch { continue; }

      const delta = ev.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        if (ttft < 0) { ttft = Date.now(); metrics.ttftMs = ttft - t0; }
        acc += delta;
        const prefix = extractReplyPrefix();
        if (prefix.length > sentReplyLen) {
          yield { type: 'delta', text: prefix.slice(sentReplyLen) };
          sentReplyLen = prefix.length;
        }
      }
      if (ev.usage) {
        metrics.inTok = ev.usage.prompt_tokens ?? 0;
        metrics.outTok = ev.usage.completion_tokens ?? 0;
        metrics.cacheReadTok = ev.usage.prompt_tokens_details?.cached_tokens ?? 0;
      }
    }
  }
  metrics.totalMs = Date.now() - t0;

  try {
    const reply = JSON.parse(acc) as LlmReply;
    if (typeof reply.reply_text !== 'string') throw new Error('no reply_text');
    yield { type: 'done', result: { ok: true, reply, metrics } };
  } catch (e) {
    yield { type: 'done', result: { ok: false, error: `parse: ${String(e).slice(0, 120)} | acc=${acc.slice(0, 120)}`, metrics } };
  }
}
