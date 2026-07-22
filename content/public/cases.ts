import type { PublicCaseData } from '../../src/game/types';

/** 사건 공개 데이터 — 클라이언트 번들용 (trigger/reveal/범인/엔딩/litmus는 content/server/cases.ts에만) */

export const case1: PublicCaseData = {
  id: 'case1',
  title: '사라진 푸딩 한 개',
  client: 'jeon',
  briefing:
    '어젯밤, 탕비실 냉장고에서 전순덕 과장의 기념일 푸딩이 사라졌다. 그 시간 회사에는 야근 중인 사람이 여럿 있었다.',
  clientVoice: '푸딩이 없어졌습니다. 기념일 푸딩이었다고요.',
  question: '푸딩을 먹은 사람은 누구인가?',
  suspects: ['cha', 'ma', 'gu'],
  witness: 'ok',
  clues: [
    { id: 'c6', title: '냉장고 메모 「건드리지 마시오 — 전」', holder: 'system', desc: '냉장고에 붙어 있던 메모. 전순덕 과장의 필체다.' },
    { id: 'c5', title: '차민재 21:30 퇴근 기록', holder: 'cha', desc: '차민재 대리는 어제 21:30에 퇴근했다. 퇴근할 때 냉장고에 푸딩이 있었다.' },
    { id: 'c1', title: '쓰레기통 빈 푸딩 용기', holder: 'cha', desc: '탕비실 쓰레기통에서 나온 유명 베이커리 푸딩의 빈 용기.' },
    { id: 'c2', title: '목격: 어젯밤 10시 부장실 불', holder: 'ok', desc: '오복자 씨의 증언. 어제 밤 10시 가까이 부장실 불이 켜져 있었다.' },
    { id: 'c3', title: '부장실 휴지통의 캐러멜 소스', holder: 'gu', desc: '부장실 휴지통에서 발견한 캐러멜 소스 포장지.' },
    { id: 'c4', title: '혈당 체크 앱 알림 21:47 — 수치 급등', holder: 'gu', desc: '구본식의 혈당 관리 앱이 어제 21:47에 기록한 급등 수치.' },
    { id: 'c7', title: '마루팡 18:02 정시 퇴근 기록', holder: 'ma', desc: '마루팡 과장은 어제 18:02(정확히 18:00:47)에 퇴근했다.' },
  ],
};

export const case2: PublicCaseData = {
  id: 'case2',
  title: '23만원의 행방',
  client: 'jeon',
  briefing:
    '어제 회식 법인카드 영수증(23만원)이 사라졌다. 경리 마감은 내일. 전순덕 과장은 「원본 없으면 감사에 걸린다」며 수사를 의뢰했다.',
  clientVoice: '원본 영수증이 없으면 감사에 걸립니다. 내일이 마감이에요.',
  question: '영수증을 없앤 사람은 누구인가?',
  suspects: ['lee', 'gu', 'cha'],
  witness: 'ok',
  clues: [
    { id: 'd0', title: '마감 공지 메일', holder: 'system', desc: '전순덕 과장이 어제 보낸 「경리 마감 D-1」 공지.' },
    { id: 'd1', title: '카드사 승인 내역', holder: 'jeon', desc: '어제 19:22, 회식 장소에서 23만원 승인.' },
    { id: 'd2', title: '회식 메뉴 구성 — 2차 단란주방', holder: 'cha', desc: '회식은 1차 고깃집 + 2차 단란주방. 인원 대비 메뉴가 과다했다.' },
    { id: 'd3', title: '파쇄함 조각', holder: 'lee', desc: '파쇄함에 영수증 조각이 섞여 있다.' },
    { id: 'd4', title: '조각에 섞인 이상록의 정리 더미', holder: 'lee', desc: '파쇄 조각들 사이에 이상록 책상의 「정리」 더미와 동일한 묶음.' },
    { id: 'd5', title: '이상록의 시인', holder: 'lee', desc: '「그거 영수증이었어요?」 — 그는 자기 행위가 무슨 의미인지 몰랐다.' },
    { id: 'd6', title: '구본식의 메신저 「영수증 꼭 찾아주세요」', holder: 'gu', desc: '구본식은 영수증이 사라진 걸 쫓는 쪽이다.' },
    { id: 'd7', title: '전순덕의 사본 파일', holder: 'system', desc: '모든 영수증의 사본을 보관한 그녀의 폴리시.' },
  ],
};

export const case3: PublicCaseData = {
  id: 'case3',
  title: '금요일 17:55의 급톡',
  client: 'cha',
  briefing:
    '금요일 17:55, 퇴근 5분 전. 부재중이던 차민재 대리의 사내 메신저 계정으로 팀 전체에 「이거 오늘까지 가능할까요?」가 발신됐다. 차민재 본인은 보낸 적이 없다고 한다.',
  clientVoice: '제 계정으로 그런 메시지가 갔다니… 전 그 시간에 자리에 없었어요.',
  question: '메신저를 발신한 사람은 누구인가?',
  suspects: ['ma', 'gu', 'lee'],
  witness: 'ok',
  clues: [
    { id: 'e0', title: '문제의 메시지 캡처', holder: 'system', desc: '17:55, 차민재 계정 발신 「이거 오늘까지 가능할까요?」 — 그는 이 시간 자리에 없었다.' },
    { id: 'e1', title: '차민재 외출 기록 15:00', holder: 'cha', desc: '차민재는 어제 15:00에 외출 후 미귀가. 사유는 「개인적인 일」.' },
    { id: 'e2', title: '차민재 PC 활성 로그 17:52~17:58', holder: 'system', desc: '부재중인 차민재의 자리 PC가 17:52~17:58에 활성화됐다.' },
    { id: 'e3', title: '마루팡 PC 지글러 기록', holder: 'ma', desc: '마루팡의 자리 PC는 17:30부터 마우스 지글러만 동작.' },
    { id: 'e4', title: '구본식의 실토 「나는 시켰을 뿐이야」', holder: 'gu', desc: '구본식이 마루팡에게 지시했다: 「차민재 PC로 급한 거 보내놔.」' },
    { id: 'e5', title: '이상록의 목격 — 「뭘 뽑아가시던데요」', holder: 'lee', desc: '이상록은 17:50경 마루팡이 차민재 자리에서 「뭘 뽑아가는」 걸 봤다.' },
    { id: 'e6', title: '회의록 — 「잠깐」의 진짜 의미', holder: 'gu', desc: '회의록에 부장의 발언: 「이건 잠깐이야, 다음 주 금요일까지면 돼.」' },
  ],
};

export const PUBLIC_CASES: PublicCaseData[] = [case1, case2, case3];
