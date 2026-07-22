# e2e/capture — 플레이 영상 촬영·편집 파이프라인

「사건파일 503호」공식 제출 영상(30~60초, 실플레이 화면 그대로, AI 합성·생성 영상 불가)을
녹화(`record.mjs`)하고 컷편집(`assemble.sh`)해서 최종 mp4를 만드는 파이프라인.

## 파일 구성

- `record.mjs` — playwright-core로 실제 브라우저를 조작해 webm으로 녹화하고, 컷편집용
  타임스탬프를 `beats.json`에 남긴다. 부팅 시퀀스를 스킵하지 않는다(실플레이 그대로 촬영).
- `beats-case1.json` — 사건1 「사라진 푸딩」 액션 대본(부팅 관찰 → 심문 문답 → 단서 해금 →
  범인 지목 → 엔딩). `e2e/play.mjs`/`e2e/actions/*.json`과 동일한 액션 문법을 사용한다.
- `assemble.sh` — webm + 세그먼트 정의 JSON(구간 ms, 배속, 자막)을 받아 트림 → 배속 →
  자막(도트 폰트, 없으면 맑은고딕) → concat → 1920x1080 최근접 스케일 → h264 mp4로 조립한다.
  ffmpeg가 PATH에 없으면 설치 안내 후 종료한다.

## 실행 (3단계)

```bash
# 1. 촬영 — 목업 모드(비용 0, 기본값). 라이브 촬영 시 --url로 실제 배포 URL(?mock 제거)을 넘긴다.
node e2e/capture/record.mjs --actions e2e/capture/beats-case1.json --out e2e/capture/out/case1
#   라이브 예: node e2e/capture/record.mjs --actions e2e/capture/beats-case1.json --out e2e/capture/out/case1_live \
#              --url "https://yeongjunyoo.github.io/nan-2026/"

# 2. 편집 — record.mjs가 출력한 webm과 beats.json의 tMs를 참고해 세그먼트 JSON을 직접 작성한 뒤 조립
bash e2e/capture/assemble.sh e2e/capture/out/case1/page@<hash>.webm e2e/capture/segments-case1.json e2e/capture/out/case1_final.mp4

# 3. 확인 — 30~60초 분량인지, 화면이 실제 플레이 그대로인지 재생 확인 후 YouTube 업로드
```

## 참고

- `record.mjs`는 playwright의 내장 ffmpeg(`npx playwright install ffmpeg`, 영상 인코딩용)가
  필요하다. 최초 1회만 설치하면 된다.
- `assemble.sh`는 별도의 시스템 ffmpeg CLI가 필요하다(`winget install -e --id Gyan.FFmpeg`).
- 세그먼트 JSON 스키마와 예시는 `assemble.sh` 상단 주석 참고.
