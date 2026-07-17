// 엔진 승리 경로 시뮬레이션 — npx tsx test/sim.ts
import { SERVER_CASES } from '../content/server/cases';
import { NPC_PUBLIC } from '../content/public/npcs';
import { accuse, applyRetry, ask, createGame, grade, present } from '../src/game/engine';

let failures = 0;
function expect(cond: boolean, label: string): void {
  if (cond) console.log('  ✅', label);
  else { failures += 1; console.log('  ❌ FAIL:', label); }
}

const [case1, case2, case3] = SERVER_CASES;

// ─── 사건 1: 푸딩 — 승리 경로 (H1 수정 검증) ───
console.log('\n[사건1]');
{
  const s = createGame(case1);
  expect(s.foundClues.includes('c6'), 'c6 자동 해금 (브리핑)');
  ask(NPC_PUBLIC.cha, case1, s, '아침에 쓰레기통에 뭐 있었어요?');
  expect(s.foundClues.includes('c1'), 'c1 해금 (쓰레기통 키워드)');
  ask(NPC_PUBLIC.cha, case1, s, '어제 몇 시에 퇴근했어요?');
  expect(s.foundClues.includes('c5'), 'c5 해금 (시간 앵커)');
  const p1 = present(NPC_PUBLIC.gu, case1, s, 'c1');
  expect(p1.armed.includes('c3'), 'c3 armed (c1 제시 → 동요)');
  expect(!s.foundClues.includes('c3'), 'c3 아직 미해금 (체인 1단)');
  ask(NPC_PUBLIC.gu, case1, s, '휴지통 비우셨어요?');
  expect(s.foundClues.includes('c3'), 'c3 해금 (체인 2단 완료)');
  const p3 = present(NPC_PUBLIC.gu, case1, s, 'c3');
  expect(s.foundClues.includes('c4'), 'c4 해금 (c3 제시)');
  expect(s.turnsUsed === 3, `턴 사용 3 (실측 ${s.turnsUsed})`);
  const r = accuse(case1, s, 'gu', ['c3', 'c4']);
  expect(r.verdict === 'win', '승리 판정 (구본식 + 핵심 2)');
  expect(grade(case1, s) === 'S', `S 등급 (실측 ${grade(case1, s)})`);
}

// ─── 사건 1 변형: 오제시 + 재도전 등급 역설 방지 ───
console.log('\n[사건1-변형]');
{
  const s = createGame(case1);
  const p = present(NPC_PUBLIC.cha, case1, s, 'c6');
  expect(p.defenseUp && s.presentWrong === 1, '오제시 방어+1 (턴 비용 0)');
  const used0 = s.turnsUsed;
  applyRetry(s);
  expect(s.turnsUsed === used0, '재도전 후 turnsUsed 불변');
}

// ─── 사건 2: 영수증 — topic.then 2단 체인 + OR 조합 + confession ───
console.log('\n[사건2]');
{
  const s = createGame(case2);
  ask(NPC_PUBLIC.lee, case2, s, '어제 뭐 하셨어요?');
  expect(!s.foundClues.includes('d3') && s.armedChains['d3'], 'd3 armed (1단, 즉시 해금 아님)');
  ask(NPC_PUBLIC.lee, case2, s, '뭘 버렸는데요?');
  expect(s.foundClues.includes('d3'), 'd3 해금 (2단 완료)');
  present(NPC_PUBLIC.lee, case2, s, 'd3');
  expect(s.foundClues.includes('d4'), 'd4 해금 (present)');
  expect(s.foundClues.includes('d5'), 'd5 해금 (confession)');
  const r = accuse(case2, s, 'lee', ['d3', 'd5']); // d4 OR d5 — d5만으로도 승리해야 함 (keyClueChoices 필요)
  expect(r.verdict === 'win', `OR 조합 승리 (d3+d5) — 실측 ${r.verdict}`);
  expect(s.foundClues.includes('d7'), 'd7 판정 후 해금');
}

// ─── 사건 3: 급톡 — 승리 경로 + 의뢰인 심문 ───
console.log('\n[사건3]');
{
  const s = createGame(case3);
  ask(NPC_PUBLIC.gu, case3, s, '차민재 PC 로그 확인핵볼까요?');
  expect(s.foundClues.includes('e2'), 'e2 해금');
  ask(NPC_PUBLIC.ma, case3, s, '어제 자리에 계셨어요?');
  expect(s.foundClues.includes('e3'), 'e3 해금 (지글러)');
  const r = accuse(case3, s, 'ma', ['e2', 'e3']);
  expect(r.verdict === 'win', '승리 판정 (마루팡)');
}

console.log(failures === 0 ? '\n전체 PASS' : `\n${failures}건 FAIL`);
process.exit(failures === 0 ? 0 : 1);
