import type { CaseData } from '../../src/game/types';

/** 사건 1 「사라진 푸딩 한 개」 — 튜토리얼 겸. 진범 = 구본식 */
export const case1: CaseData = {
  id: 'case1',
  title: '사라진 푸딩 한 개',
  client: 'jeon',
  briefing:
    '탕비실 냉장고에 있던 전순덕 과장의 기념일 푸딩이 어제 밤 사라졌다. 푸딩은 어제 늦은 밤에 없어진 것으로 보인다. 구본식 부장은 어제 야근했고, 요즘 단 것을 끊었다고 공언해 왔다.',
  question: '푸딩을 먹은 사람은 누구인가?',
  suspects: ['cha', 'ma', 'gu'],
  witness: 'ok',
  culpritId: 'gu',
  clues: [
    {
      id: 'c6', title: '냉장고 메모 "건드리지 마시오 - 전"', holder: 'system',
      desc: '냉장고에 붙어 있던 메모. 전순덕 과장의 필체다.',
      trigger: { type: 'turn', npc: 'cha', count: 0 },
      reveal: '브리핑 시작 단서 (자동 획득, Present 튜토리얼용)',
    },
    {
      id: 'c5', title: '차민재 21:30 퇴근 기록', holder: 'cha',
      desc: '차민재 대리는 어제 21:30에 퇴근했다. 퇴근할 때 냉장고에 푸딩이 있었다. → 범행은 21:30 이후, 차민재는 배제.',
      trigger: { type: 'topic', npc: 'cha', topics: ['퇴근', '몇 시', '나갔', '야근'] },
      reveal: '차민재: "저 21시 30분에 퇴근했어요. 로그 있어요. 퇴근할 때까진 푸딩 있었어요, 냉장고에."',
    },
    {
      id: 'c1', title: '쓰레기통 빈 푸딩 용기', holder: 'cha',
      desc: '탕비실 쓰레기통에서 나온 유명 베이커리 푸딩의 빈 용기.',
      trigger: { type: 'topic', npc: 'cha', topics: ['쓰레기통', '용기', '버렸', '빈 상자'] },
      reveal: '차민재: "아, 아침에 쓰레기통에 빈 용기 있었어요. 그 베이커리 거."',
    },
    {
      id: 'c2', title: '목격: 어젯밤 10시 부장실 불', holder: 'ok',
      desc: '오복자 씨의 증언. 어제 밤 10시 가까이 부장실 불이 켜져 있었다.',
      trigger: { type: 'turn', npc: 'ok', count: 1 },
      reveal: '오복자: "밤에 불이 꺼져야 절약이지. 근데 어제는 10시 가까이 부장실 불이 켜져 있더라고."',
    },
    {
      id: 'c3', title: '부장실 휴지통의 캐러멜 소스', holder: 'gu',
      desc: '부장실 휴지통에서 발견한 캐러멜 소스 포장지 — 푸딩에 뿌려 먹는 그 소스.',
      trigger: {
        type: 'present', npc: 'gu', clue: 'c1',
        then: { type: 'topic', npc: 'gu', topics: ['휴지통', '비웠', '캐러멜'] },
      },
      reveal: '구본식이 빈 용기(c1)를 보고 동요하다가 "휴지통은… 제가 비웠습니다만"이라고 실토성 발언. 부장실 휴지통에서 캐러멜 소스 포장지 확인.',
    },
    {
      id: 'c4', title: '혈당 체크 앱 알림 21:47 — 수치 217 (급등)', holder: 'gu',
      desc: '구본식의 혈당 관리 앱이 어제 21:47에 기록한 수치 217. 단 것을 끊은 사람의 수치가 아니다.',
      trigger: { type: 'present', npc: 'gu', clue: 'c3' },
      reveal: '캐러멜 소스(c3)를 들이대자 구본식의 스마트워치가 보인다. 혈당 알림 21:47 — 217. "단 것 끊었다"던 그 시간대에, 급등.',
    },
    {
      id: 'c7', title: '마루팡 18:02 정시 퇴근 기록', holder: 'ma',
      desc: '마루팡 과장은 어제 18:02(정확히 18:00:47)에 퇴근했다. 밤 범행과 무관.',
      trigger: { type: 'topic', npc: 'ma', topics: ['퇴근', '어제', '몇 시'] },
      reveal: '마루팡: "저는 어제 18시 02분에 퇴근했습니다. 카드 기록 보시면 나와요. 정확히 47초요."',
    },
  ],
  keyClueIds: ['c3', 'c4'],
  partialClueSets: [['c3', 'c1'], ['c3', 'c2']],
  ending: {
    win: '구본식 부장은 결국 "사, 사실은…"이라며 고개를 숙였다. 전순덕 과장의 대답은 의외로 부드러웠다. "푸딩 사드리죠, 다음엔 말씀하세요." — 사건 종결. 부장의 혈당은 오늘도 무사하다(고 한다).',
    lose: '수사는 미로에 빠졌다. 503호의 첫 사건은 "미해결"로 기록됐다. 탕비실 냉장고에는 오늘도 메모가 붙어 있다: "건드리지 마시오 - 전".',
    twist: undefined,
    choice: undefined,
  },
  litmusKeywords: ['캐러멜', '혈당', '217', '소스 포장지'],
};
