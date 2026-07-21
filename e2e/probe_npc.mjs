// NPC 프로브 하니스 — 라이브 프록시에 질문 시리즈를 던지고 답변을 수집한다.
// 사용: node e2e/probe_npc.mjs --npc jeon --case case1 --qs "질문1|질문2|질문3" [--defense 0] [--out e2e/probes/jeon.json]
const PROXY = 'https://nan503-proxy.apple021104.workers.dev';
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const NPC = args.npc;
const CASE = args.case;
const QS = (args.qs ?? '').split('|').filter(Boolean);
const DEFENSE = Number(args.defense ?? 0);
import fs from 'node:fs';

const CASE_NPCS = { case1: ['jeon', 'cha', 'ma', 'gu', 'ok'], case2: ['jeon', 'lee', 'gu', 'cha', 'ok'], case3: ['cha', 'ma', 'gu', 'lee', 'ok'] };
const npcState = {};
for (const id of CASE_NPCS[CASE] ?? [NPC]) npcState[id] = { defense: 0, turns: 0, fallbackIdx: 0 };
npcState[NPC].defense = DEFENSE;

const t = await (await fetch(`${PROXY}/session`, { method: 'POST' })).json();
const st = {
  caseId: CASE, phase: 'interrogate', activeSuspect: NPC,
  turnLeft: 24, turnsUsed: 0, presentWrong: 0,
  npc: npcState, foundClues: [], armedChains: {}, log: [], retriesLeft: 1, verdict: 'none', endChoice: null,
};

const out = { npc: NPC, case: CASE, defense: DEFENSE, exchanges: [] };
for (const q of QS) {
  const res = await fetch(`${PROXY}/ask?sync=1`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: t.token, state: st, npcId: NPC, text: q }),
  });
  const meta = await res.json();
  if (meta.token) t.token = meta.token;
  st.npc[NPC].turns += 1;
  st.npc[NPC].defense = Math.max(-3, Math.min(3, st.npc[NPC].defense + (meta.defenseDelta ?? 0)));
  for (const u of meta.unlocked ?? []) if (!st.foundClues.includes(u.id)) st.foundClues.push(u.id);
  out.exchanges.push({
    q: q, a: meta.reply ?? `(ERROR ${res.status}: ${JSON.stringify(meta)})`,
    defenseAfter: st.npc[NPC].defense,
    unlocked: (meta.unlocked ?? []).map((u) => u.id),
  });
}
if (args.out) {
  fs.mkdirSync(args.out.replace(/\/[^/]+$/, ''), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(out, null, 2));
}
for (const ex of out.exchanges) {
  console.log(`\nQ: ${ex.q}\nA: ${ex.a}${ex.unlocked.length ? `\n[해금: ${ex.unlocked.join(',')}]` : ''}`);
}
