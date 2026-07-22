# NAN 2026 — 사전과제 (작업명)

> NHN Game × AI Hackathon 사전과제: **A1 싱글 플레이 AI 심문·추리, 한국 일상 코미디** (확정 2026-07-17).
> 요강·도시에·리서치 = vault `01 Projects/공모전 파이프라인/NAN 2026/`.

## 상태
- **플레이어블 라이브**: https://yeongjunyoo.github.io/nan-2026/ — 기본값이 라이브 LLM 프록시(`nan503-proxy`, gemini-3.1-flash-lite), `?mock`으로 오프라인 목업 모드 강제 가능
- Stage 2 완료: 인트라넷 503 OS-as-UI(창 프레임·부팅 시퀀스·품의서·사내신문) + 레트로 도트 UI + NPC 6인×표정 3종 에셋 + 크리틱 5라운드 반영
- 남은 것: 제출물 ② 플레이 영상 30~60초 ③ 게임 소개 PDF ④ AI 활용 기술 문서 PDF → 구글폼 제출 (마감 2026-08-10 23:59:59 KST)

## 구조
- `content/cases/*.ts` — 사건 데이터 (용의자/단서/목업 대사/해금 규칙) — 콘텐츠는 코드와 분리
- `src/game/types.ts, engine.ts` — 상태·판정 로직 (LLM 무관, 순수 TS)
- `src/ui/app.ts` — 화면 렌더 (바닐라 DOM, 의존성 제로)
- `.github/workflows/deploy.yml` — push 시 GitHub Pages 자동 배포

## 개발
```bash
npm install
npm run dev      # 로컬
npm run build    # 타입체크 + 번들
```

## 설계 원칙 (vault 05 브리프에서)
1. 발화 자유도는 높게, **판정 스키마는 좁게** (범인 지목+핵심 단서 매칭)
2. 사건 다수(3개), 세션 3~5분
3. 심사자 무설정 즉시 플레이 (GitHub Pages 링크)
4. AI 활용 기술 문서에 들어갈 수치(레이턴시/캐시/비용)를 개발 초기부터 로깅
