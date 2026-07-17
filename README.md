# NAN 2026 — 사전과제 (작업명)

> NHN Game × AI Hackathon 사전과제: **A1 싱글 플레이 AI 심문·추리, 한국 일상 코미디** (확정 2026-07-17).
> 요강·도시에·리서치 = vault `01 Projects/공모전 파이프라인/NAN 2026/`.

## 상태
- v0 목업: LLM 연동 전 **코어 루프 검증용** (캔드 응답으로 심문→단서→지목→판정 전체 루프 동작)
- 다음: GDD(vault, 도시에 3축 기반) → 콘텐츠 v1(사건 3개) → LLM 프록시 연동 → 영준 플레이 체크

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
