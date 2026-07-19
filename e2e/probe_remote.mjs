// 배포 프록시 프로브 — case1의 present→then 체인(c3)이 원격에서 해금되는지 확인.
// 게임 클라이언트가 본는 것과 동일한 페이로드로 /session → /present → /ask 순서 호출.
// 사용: node e2e/probe_remote.mjs
const BASE = 'https://nan503-proxy.apple021104.workers.dev';

const state = {
  caseId: 'case1', phase: 'interrogate', activeSuspect: 'gu',
  turnLeft: 20, turnsUsed: 4, presentWrong: 0,
  npc: {
    jeon: { defense: 0, turns: 0, fallbackIdx: 0 },
    cha: { defense: 0, turns: 2, fallbackIdx: 2 },
    ma: { defense: 0, turns: 1, fallbackIdx: 1 },
    gu: { defense: 0, turns: 0, fallbackIdx: 0 },
    ok: { defense: 0, turns: 0, fallbackIdx: 0 },
  },
  foundClues: ['c6', 'c5', 'c1', 'c7'], armedChains: {}, log: [], retriesLeft: 1,
  verdict: 'none', endChoice: null,
};

async function sse(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  const out = { status: res.status, events: [] };
  for (const block of text.split('\n\n')) {
    const ev = block.match(/^event: (.+)$/m)?.[1];
    const data = block.match(/^data: (.+)$/ms)?.[1];
    if (ev && data) {
      try { out.events.push({ ev, data: JSON.parse(data) }); } catch { out.events.push({ ev, data: data.slice(0, 120) }); }
    }
  }
  return out;
}

const sess = await fetch(`${BASE}/session`, { method: 'POST' }).then((r) => r.json());
let token = sess.token;
console.log('session ok');

// 1) present c1 → gu (체인 1단: arm 기대)
const p1 = await sse('/present', { token, state, npcId: 'gu', clueId: 'c1' });
const m1 = p1.events.find((e) => e.ev === 'meta')?.data;
console.log('\n[present c1 → gu]');
console.log('  reply:', JSON.stringify(m1?.reply ?? '').slice(0, 200));
console.log('  unlocked:', JSON.stringify(m1?.unlocked ?? null));
token = m1?.token ?? token;

// 2) 클라이언트 상태 그대로(armedChains 비어있음) ask 휴지통 → gu
const a1 = await sse('/ask', { token, state, npcId: 'gu', text: '부장실 휴지통은 누가 비웠어요? 캐러멜 소스 얘기도 있던데요.' });
const m2 = a1.events.find((e) => e.ev === 'meta')?.data;
console.log('\n[ask 휴지통/캐러멜 → gu] (armedChains 없는 클라 상태)');
console.log('  reply:', JSON.stringify(m2?.reply ?? '').slice(0, 200));
console.log('  unlocked:', JSON.stringify(m2?.unlocked ?? null));

// 3) 대조: armedChains에 c3이 있는 상태라면 해금되는지 (서버가 체인 로직 자체는 수행하는지)
const stateArmed = { ...state, armedChains: { c3: true } };
const a2 = await sse('/ask', { token: m2?.token ?? token, state: stateArmed, npcId: 'gu', text: '휴지통 비우신 거 맞죠? 캐러멜이요.' });
const m3 = a2.events.find((e) => e.ev === 'meta')?.data;
console.log('\n[ask 휴지통 → gu] (armedChains.c3=true 대조군)');
console.log('  unlocked:', JSON.stringify(m3?.unlocked ?? null));
