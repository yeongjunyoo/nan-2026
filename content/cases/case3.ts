import type { CaseData } from '../../src/game/types';

/** 사건 3 「금요일 17:55의 급톡」 — 지시자(구본식)/발신자(마루팡) 분리. 발신자 = 마루팡 */
export const case3: CaseData = {
  id: 'case3',
  title: '금요일 17:55의 급톡',
  client: 'cha',
  briefing:
    '금요일 17:55, 퇴근 5분 전. 부재중이던 차민재 대리의 사내 메신저 계정으로 팀 전체에 "이거 오늘까지 가능할까요?"가 발신됐다. 차민재 본인은 보낸 적이 없다고 한다.',
  question: '메신저를 발신한 사람은 누구인가?',
  suspects: ['ma', 'gu', 'lee'],
  witness: 'ok',
  culpritId: 'ma',
  clues: [
    {
      id: 'e0', title: '문제의 메시지 캡처', holder: 'system',
      desc: '17:55, 차민재 계정 발신 "이거 오늘까지 가능할까요?" — 그는 이 시간 자리에 없었다.',
      trigger: { type: 'turn', npc: 'cha', count: 0 },
      reveal: '브리핑 시작 단서 (자동 획득)',
    },
    {
      id: 'e1', title: '차민재 외출 기록 15:00', holder: 'cha',
      desc: '차민재는 어제 15:00에 외출 후 미귀가. 사유는 "개인적인 일".',
      trigger: { type: 'topic', npc: 'cha', topics: ['어제', '자리', '부재', '외출', '어디'] },
      reveal: '차민재: "어제요? 3시에 외출했어요. 개인적인 일이라서요, 그 이상은…"',
    },
    {
      id: 'e2', title: '차민재 PC 활성 로그 17:52~17:58', holder: 'system',
      desc: '부재중인 차민재의 자리 PC가 17:52~17:58에 활성화됐다. 그 시간 누군가 그 자리에 앉았다.',
      trigger: { type: 'topic', npc: 'gu', topics: ['로그', '기록', '확인', 'IT'] },
      reveal: 'IT 협조로 확인: 차민재 자리 PC가 17:52에 깨어나 17:58에 다시 잠겼다 — 그는 15시에 나갔는데.',
    },
    {
      id: 'e3', title: '마루팡 PC 지글러 기록', holder: 'ma',
      desc: '마루팡의 자리 PC는 17:30부터 마우스 지글러만 동작. 그 시간 그는 자기 자리에 없었다.',
      trigger: {
        type: 'topic', npc: 'ma', topics: ['지글러', '자리', '컴퓨터', '마우스'],
      },
      reveal: '마루팡 자리의 PC는 17:30 이후 움직임이 없다 — 지글러만. "자리를 지키는" 그의 PC만이 자리에 있었다.',
    },
    {
      id: 'e4', title: '구본식의 실토 "나는 시켰을 뿐이야"', holder: 'gu',
      desc: '구본식이 마루팡에게 지시했다: "차민재 PC로 급한 거 보낸놔."',
      trigger: {
        type: 'present', npc: 'gu', clue: 'e2',
        then: { type: 'topic', npc: 'gu', topics: ['시켰', '지시', '보낸'] },
      },
      reveal: '차민재 PC 활성 로그(e2)를 들이대자 구본식: "아니, 나는 시켰을 뿐이야. 마루팡 과장한테, 차민재 PC로 급한 거 보낸놓으라고."',
    },
    {
      id: 'e5', title: '이상록의 목격 — "뭘 뽑아가시던데요"', holder: 'lee',
      desc: '이상록은 17:50경 마루팡이 차민재 자리에서 "뭘 뽑아가는" 걸 봤다. 프린터인 줄 알았다.',
      trigger: { type: 'topic', npc: 'lee', topics: ['봤', '목격', '누구', '마루팡'] },
      reveal: '이상록: "마루팡 과장님이 차민재 대리님 자리에서 뭘 뽑아가시던데요. 프린터인 줄 알았죠."',
    },
    {
      id: 'e6', title: '회의록 — "잠깐"의 진짜 의미', holder: 'gu',
      desc: '회의록에 부장의 발언: "이건 잠깐이야, 다음 주 금요일까지면 돼." 그의 "오늘"은 애초에 다음 주였다.',
      trigger: { type: 'topic', npc: 'gu', topics: ['회의', '마감', '언제까지', '다음 주'] },
      reveal: '회의록 14:20: 구본식 "그 보고서? 잠깐이야, 다음 주 금요일까지면 돼." — 그의 "오늘까지"는 다음 주 금요일이었다.',
    },
  ],
  keyClueIds: ['e2', 'e3'],
  partialClueSets: [['e2', 'e5'], ['e3', 'e5']],
  ending: {
    win: '마루팡은 끝까지 능글거렸다. "그건 뭐~ 대충 보낸 겁니다." 그리고 회의록이 공개되자 사무실은 웃음바다 — "오늘까지"의 "오늘"은 다음 주 금요일이었다. 다들 어제 왜 야근했지?',
    lose: '급톡의 주범은 끝내 밝혀지지 않았다. 다음 금요일 17:55, 또 한 통이 도착했다: "이번엔 진짜 오늘까지 가능할까요?"',
    twist: undefined,
    choice: undefined,
  },
  litmusKeywords: ['지글러', '17:52', '보낸놔', '다음 주 금요일'],
};
