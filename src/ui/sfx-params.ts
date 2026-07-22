// SFX 파라미터 정의 — ZzFX(MIT) 합성 파라미터. 에셋 파일 없음: 이 숫자 배열이 곧 사운드 원본이다.
// 게임(src/ui/sfx.ts)과 영상 오버레이용 WAV 생성(e2e/capture/gen_sfx_wav.mjs)이 동일 정의를 공유한다.
// 프리셋 출처: ZzFX README 공식 예제(Heart/Drum) + ZzFX Sound Designer 표준 프리셋(pickup/explosion/powerup) + 자체 조정.

export type SfxParams = (number | undefined)[];

export const SFX: Record<string, SfxParams> = {
  // 전송/버튼 — 짧은 사인 블립 (자체 조정)
  send: [0.4, undefined, 900, undefined, 0.01, 0.03, undefined, 1.5, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 0.6, 0.01],
  // NPC 답변 도착 — ZzFX README "Heart" 프리셋 (부드러운 하강 블립)
  receive: [0.35, undefined, 537, 0.02, 0.02, 0.22, 1, 1.59, -6.98, 4.97],
  // 단서 획득 — Sound Designer 표준 pickup/coin 프리셋 (상승 칭)
  unlock: [0.7, undefined, 1675, undefined, 0.06, 0.24, 1, 1.82, undefined, undefined, 837, 0.06],
  // 동요(단서 armed) — 하강 톱니 스팅 (자체 조정)
  arm: [0.7, undefined, 270, 0.01, 0.06, 0.18, 2, 1.8, -8, undefined, undefined, undefined, undefined, 0.2, undefined, undefined, undefined, 0.7, 0.05],
  // 폭로 테이크오버 — Sound Designer 표준 explosion 프리셋 축소판
  hit: [0.8, undefined, 333, 0.01, 0, 0.5, 4, 1.9, undefined, undefined, undefined, undefined, undefined, 0.5, undefined, 0.4],
  // 판정 테이크오버 — explosion 풀버전 (셰이크 동반 임팩트)
  verdict: [1.2, undefined, 333, 0.01, 0, 0.9, 4, 1.9, undefined, undefined, undefined, undefined, undefined, 0.5, undefined, 0.6],
  // 신문 지면/고과 — Sound Designer 표준 powerup 프리셋 (상승 팡파레)
  fanfare: [0.9, undefined, 539, 0, 0.04, 0.29, 1, 1.92, undefined, undefined, 567, 0.02, 0.02, undefined, undefined, undefined, 0.04],
  // 상신 도장 — ZzFX README "Drum" 프리셋 (둔탁한 쿵)
  stamp: [1, undefined, 129, 0.01, undefined, 0.15, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 5],
  // 부팅 라인 출력 — 아주 짧고 조용한 단말 비프 (자체 조정)
  bootBlip: [0.15, undefined, 340, undefined, 0.004, 0.02, 1, 1.2, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 0.5, 0.005],
  // 부팅 로고 슬램 — explosion 축소판 재사용 (자체 조정 볼륨)
  slam: [0.7, undefined, 333, 0.01, 0, 0.5, 4, 1.9, undefined, undefined, undefined, undefined, undefined, 0.5, undefined, 0.4],
};

export type SfxName = keyof typeof SFX;
