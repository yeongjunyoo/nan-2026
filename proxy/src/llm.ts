// Anthropic Claude 스트리밍 호출 + 증분 reply_text 추출 (스트리밍×구조화 출력)
export interface LlmReply {
  reply_text: string;
  emotion?: string;
  defense_delta?: number;
  matched_topic_ids?: string[];
  refuse?: boolean;
}

export interface LlmMetrics {
  ttftMs: number;
  totalMs: number;
  inTok: number;
  outTok: number;
  cacheReadTok: number;
  cacheWriteTok: number;
}

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; result: { ok: true; reply: LlmReply; metrics: LlmMetrics } | { ok: false; error: string; metrics: LlmMetrics } };

const RESPOND_TOOL = {
  name: 'respond',
  description: 'NPC 응답 구조화 출력',
  input_schema: {
    type: 'object',
    properties: {
      reply_text: { type: 'string', description: 'NPC 발화 (한국어 1~3문장)' },
      emotion: { type: 'string', description: '감정 상태 한 단어' },
      defense_delta: { type: 'integer', description: '방어 단계 변화 (-2..+2)' },
      matched_topic_ids: { type: 'array', items: { type: 'string' }, description: '이번 답변이 해당하는 주제 id' },
      refuse: { type: 'boolean', description: '답변 거부 시 true' },
    },
    required: ['reply_text', 'matched_topic_ids', 'refuse'],
    additionalProperties: false,
  },
};

export async function* streamAsk(
  apiKey: string,
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>,
  userText: string,
): AsyncGenerator<StreamEvent> {
  const t0 = Date.now();
  let ttft = -1;
  const metrics: LlmMetrics = { ttftMs: -1, totalMs: -1, inTok: 0, outTok: 0, cacheReadTok: 0, cacheWriteTok: 0 };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      temperature: 0.85,
      stream: true,
      system,
      tools: [RESPOND_TOOL],
      tool_choice: { type: 'tool', name: 'respond' },
      messages: [{ role: 'user', content: userText }],
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    yield { type: 'done', result: { ok: false, error: `anthropic ${res.status}: ${errText.slice(0, 200)}`, metrics } };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let acc = ''; // 누적 partial_json
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

      if (ev.type === 'message_start') {
        metrics.inTok = ev.message?.usage?.input_tokens ?? 0;
        metrics.cacheReadTok = ev.message?.usage?.cache_read_input_tokens ?? 0;
        metrics.cacheWriteTok = ev.message?.usage?.cache_creation_input_tokens ?? 0;
      } else if (ev.type === 'content_block_delta') {
        const pj = ev.delta?.partial_json;
        if (typeof pj === 'string') {
          if (ttft < 0) { ttft = Date.now(); metrics.ttftMs = ttft - t0; }
          acc += pj;
          const prefix = extractReplyPrefix();
          if (prefix.length > sentReplyLen) {
            yield { type: 'delta', text: prefix.slice(sentReplyLen) };
            sentReplyLen = prefix.length;
          }
        }
      } else if (ev.type === 'message_delta') {
        metrics.outTok = ev.usage?.output_tokens ?? metrics.outTok;
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
