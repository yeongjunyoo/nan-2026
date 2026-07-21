import type { ServerCaseData } from '../../src/game/types';

/** 사건 서버 전용 데이터 — trigger/reveal/범인/엔딩/litmus (프록시 번들 전용)
 *  클라이언트에는 content/public/cases.ts(공개 부분집합)만 낸다. */

export const case1: ServerCaseData = {
  id: 'case1',
  title: '사라진 푸딩 한 개',
  client: 'jeon',
  briefing:
    '탕비실 냉장고에 있던 전순덕 과장의 기념일 푸딩이 어제 밤 사라졌다. 푸딩은 어제 늦은 밤에 없어진 것으로 보인다. 그 시간 회사에는 야근 중인 사람이 여럿 있었다.',
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
      reveal: '구본식: "아니 그건… 휴지통은 제가 비웠습니다만. 뭐가 들어 있었는지는, 나는 모릅니다. 모른다고요."',
    },
    {
      id: 'c4', title: '혈당 체크 앱 알림 21:47 — 수치 급등', holder: 'gu',
      desc: '구본식의 혈당 관리 앱이 어제 21:47에 기록한 수치 217. 단 것을 끊은 사람의 수치가 아니다.',
      trigger: { type: 'present', npc: 'gu', clue: 'c3' },
      reveal: '구본식: "이, 이건 사생활입니다. 혈당이 왜… 앱이 오작동하는 바람에, 그냥 그렇다고요."',
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
  accuseHints: {
    cha: '민재의 퇴근 시각은 로그가 증명합니다. 그 이후에 남아 있던 사람을 찾아야 합니다.',
    ma: '총무는 18시에 나갔습니다. 늦은 밤까지 남은 사람 쪽이 맞습니다.',
  },
  ending: {
    win: '구본식 부장은 결국 "사, 사실은…"이라며 고개를 숙였다. 전순덕 과장의 대답은 의외로 부드러웠다. "푸딩 사드리죠, 다음엔 말씀하세요." — 사건 종결. 부장의 혈당은 오늘도 무사하다(고 한다).',
    lose: '수사는 미로에 빠졌다. 503호의 첫 사건은 "미해결"로 기록됐다. 탕비실 냉장고에는 오늘도 메모가 붙어 있다: "건드리지 마시오 - 전".',
    twist: undefined,
    choice: undefined,
  },
  litmusKeywords: ['캐러멜', '혈당', '217', '소스 포장지'],
};

export const case2: ServerCaseData = {
  id: 'case2',
  title: '23만원의 행방',
  client: 'jeon',
  briefing:
    '어제 회식 법인카드 영수증(23만원)이 사라졌다. 경리 마감은 내일. 전순덕 과장은 "원본 없으면 감사에 걸린다"며 수사를 의뢰했다. 단, 그녀에게는 말 못 할 사정이 하나 있다.',
  question: '영수증을 없앤 사람은 누구인가?',
  suspects: ['lee', 'gu', 'cha'],
  witness: 'ok',
  culpritId: 'lee',
  clues: [
    {
      id: 'd0', title: '마감 공지 메일', holder: 'system',
      desc: '전순덕 과장이 어제 보낸 "경리 마감 D-1" 공지.',
      trigger: { type: 'turn', npc: 'jeon', count: 0 },
      reveal: '브리핑 시작 단서 (자동 획득)',
    },
    {
      id: 'd1', title: '카드사 승인 내역', holder: 'jeon',
      desc: '어제 19:22, 회식 장소에서 23만원 승인. 카드는 구본식 부장이 반납했다.',
      trigger: { type: 'topic', npc: 'jeon', topics: ['승인', '내역', '카드', '결제'] },
      reveal: '전순덕: "승인 내역은 카드사에 요청하면 1영업일 내로 나옵니다. 19:22, 23만원."',
    },
    {
      id: 'd2', title: '회식 메뉴 구성 — 2차 단란주방', holder: 'cha',
      desc: '회식은 1차 고깃집 + 2차 단란주방. 인원 대비 메뉴가 과다했다.',
      trigger: { type: 'topic', npc: 'cha', topics: ['메뉴', '2차', '단란주방', '회식', '노래방'] },
      reveal: '차민재: "1차 고기, 2차 단란주방이요. 근데 인원 대비 좀 많이 시키긴 했어요. 부장님이."',
    },
    {
      id: 'd3', title: '파쇄함 조각', holder: 'lee',
      desc: '파쇄함에 영수증 조각이 섞여 있다. 영수증은 "실종"이 아니라 "파쇄"됐다.',
      trigger: {
        type: 'topic', npc: 'lee', topics: ['어제 뭐', '정리', '당번'],
        then: { type: 'topic', npc: 'lee', topics: ['뭘 버렸', '버린', '버렸', '버리셨', '파쇄'] },
      },
      reveal: '이상록: "어제 제가 문서 정리 당번이었어요. 오래된 서류는 파쇄했는데… 파쇄함에 영수증 조각이 섞여 있다고요?"',
    },
    {
      id: 'd4', title: '조각에 섞인 이상록의 정리 더미', holder: 'lee',
      desc: '파쇄 조각들 사이에 전단지·오래된 회의 자료 — 이상록 책상의 "정리" 더미와 동일 묶음. 파쇄 맥락이 이상록의 정리 작업에 귀속.',
      trigger: { type: 'present', npc: 'lee', clue: 'd3' },
      reveal: '이상록: "그거… 제 책상 정리 더미랑 같네요. 전단지랑 오래된 회의 자료요."',
    },
    {
      id: 'd5', title: '이상록의 시인', holder: 'lee',
      desc: '"그거 영수증이었어요?" — 그는 자기 행위가 무슨 의미인지 몰랐다.',
      trigger: { type: 'confession', npc: 'lee', requires_present: 'd3' },
      reveal: '이상록: "아… 그거 영수증이었어요? 상식적으로 3년 지난 쓰레기인 줄…"',
    },
    {
      id: 'd6', title: '구본식의 메신저 "영수증 꼭 찾아주세요"', holder: 'gu',
      desc: '구본식은 영수증이 사라진 걸 쫓는 쪽이다. 그에게도 영수증이 필요하다.',
      trigger: { type: 'topic', npc: 'gu', topics: ['영수증', '찾', '없어졌'] },
      reveal: '구본식: "전순덕 과장한테 메신저 좀 했지. 『영수증 꼭 찾아주세요』라고. 찾아야 하니까, 그냥… 찾아야 하니까."',
    },
    {
      id: 'd7', title: '전순덕의 사본 파일', holder: 'system',
      desc: '모든 영수증의 사본을 보관한 그녀의 폴리시. 사본의 23만원 내역에는 개인 접대비가 섞여 있다.',
      trigger: { type: 'turn', npc: 'jeon', count: 99 },
      reveal: '전순덕이 사본을 공개한다: "근데 이 영수증, 원래 이상하면 안 됐어요."',
    },
  ],
  keyClueIds: ['d3'],
  keyClueChoices: [['d4', 'd5']],
  partialClueSets: [['d3', 'd5'], ['d3', 'd1']],
  accuseHints: {
    gu: '영수증을 찾아달라고 조른 사람이 스스로 없앴을까요? 부탁한 사람과 손댄 사람은 다를 수 있습니다.',
    cha: '민재에게는 동기가 없습니다 — 그의 카드도, 그의 회식도 아니었습니다.',
  },
  ending: {
    win: '이상록은 파쇄기 앞에서 얼었다. "상식적으로 생각해보면, 저는 쓰레기를 버린 건 맞는데…" 전순덕 과장이 마감을 연장했다. 사건은 일단락됐다 — 그녀가 사본 파일을 꺼내기 전까지는.',
    lose: '영수증의 행방은 묘연해졌다. 전순덕 과장은 결국 자비로 23만원을 메웠다는 소문이 돌았다. 503호의 두 번째 사건은 "미해결"로.',
    twist: '전순덕이 사본을 꺼냈다. "23만원 중 8만원은 회식과 무관한 개인 접대 내역입니다. 구본식 부장의." — 규정대로라면 보고 대상이다.',
    choice: {
      a: { label: '규정대로 보고한다', text: '전순덕은 사본을 공식 경로로 올렸다. 구본식 부장은 경고를 받았다. 회의실에서 그의 목소리가 한 톤 낮아졌다는 소문. "원칙은 있으셔야지." — 전순덕.' },
      b: { label: '이번만 덮고 기회를 준다', text: '전순덕은 사본을 찢었다. 다음 날 탕비실에 고급 푸딩이 놓여 있었다. 메모는 이렇다: "고맙습니다 - 구".' },
    },
  },
  litmusKeywords: ['사본', '접대비', '파쇄 조각', '8만원'],
};

export const case3: ServerCaseData = {
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
      reveal: 'IT 협조 확인 — 차민재 자리 PC가 17:52에 깨어나 17:58에 다시 잠겼다. 그는 15시에 외출 중이었다.',
    },
    {
      id: 'e3', title: '마루팡 PC 지글러 기록', holder: 'ma',
      desc: '마루팡의 자리 PC는 17:30부터 마우스 지글러만 동작. 그 시간 그는 자기 자리에 없었다.',
      trigger: {
        type: 'topic', npc: 'ma', topics: ['지글러', '자리', '컴퓨터', '마우스'],
      },
      reveal: '마루팡: "제 PC요? 아 그거… 절전 모드가 고장 냈나 봐요. 알아서 깨어 있더라고요. (웃음)"',
    },
    {
      id: 'e4', title: '구본식의 실토 "나는 시켰을 뿐이야"', holder: 'gu',
      desc: '구본식이 마루팡에게 지시했다: "차민재 PC로 급한 거 보내놔."',
      trigger: {
        type: 'present', npc: 'gu', clue: 'e2',
        then: { type: 'topic', npc: 'gu', topics: ['시켰', '지시', '보낸'] },
      },
      reveal: '구본식: "아니, 나는 시켰을 뿐이야. 마루팡 과장한테, 차민재 PC로 급한 거 보내 놓으라고."',
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
      reveal: '구본식: "아니, 회의에서도 말했잖나. 『잠깐이야, 다음 주 금요일까지면 돼』라고. …어?"',
    },
  ],
  keyClueIds: ['e2', 'e3'],
  partialClueSets: [['e2', 'e5'], ['e3', 'e5']],
  accuseHints: {
    gu: '시킨 사람과 직접 눌러친 사람은 다를 수 있습니다. 발신 버튼을 누른 손가락을 찾아야 합니다.',
    lee: '상록은 본 것을 말했을 뿐입니다. 그가 자기 덜미를 스스로 잡을 이유가 없습니다.',
  },
  ending: {
    win: '마루팡은 끝까지 능글거렸다. "그건 뭐~ 대충 보낸 겁니다." 그리고 회의록이 공개되자 사무실은 웃음바다 — "오늘까지"의 "오늘"은 다음 주 금요일이었다. 다들 어제 왜 야근했지?',
    lose: '급톡의 주범은 끝내 밝혀지지 않았다. 다음 금요일 17:55, 또 한 통이 도착했다: "이번엔 진짜 오늘까지 가능할까요?"',
    twist: undefined,
    choice: undefined,
  },
  litmusKeywords: ['지글러', '17:52', '보내놔', '다음 주 금요일'],
};

export const SERVER_CASES: ServerCaseData[] = [case1, case2, case3];
