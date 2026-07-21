# 스테이지2 코드 리뷰 (적대적) — 「사건파일 503호」

- 범위: `git diff eeea718..HEAD` (13f62dd OS-as-UI + be219cf WebP/폰트/sync 폴리백). 한국어 전수 검사는 src/, content/, proxy/ 전체.
- 리뷰 일자: 2026-07-21 · 읽기 전용, 코드 수정 없음.
- 참고: 이전 실행 초안은 환각 문자열('걷기띄기', '병행놓으라고' — 실제 소스에 없음)로 오염되어 폐기. 본 문서는 전 항목 현재 소스 실측으로 재검증.

---

## 치명

없음. 기본 플레이 경로에서 무조건 재현되는 크래시/진행 불가는 확인되지 않았다.

---

## 상

### S1. 품의서(.doc)가 저뷰포트에서 클리핑 — [상 신] 버튼에 마우스로 도달 불가
- **위치**: `src/style.css:58-59` (`.main .win { height: calc(100vh - 28px) }` + `.main .win-body { overflow: hidden }`), `src/ui/app.ts:536-584`
- **문제**: accuse phase의 `.main`은 `.log`(flex:1 — 스크롤 컨테이너라 자동 최소 크기 0까지 수축) + `.doc`(일반 블록 — min-content가 전체 내용 높이라 수축 불가). doc 내용이 win-body보다 길면 하단이 `overflow: hidden`에 잘림. `overflow:hidden` 컨테이너는 마우스 휠/터치 스크롤이 안 되고 스크립트 스크롤만 가능 — `app.ts:603`의 `scrollIntoView({block:'start'})`는 doc 상단만 맞춰줄 뿐, 잘린 하단([상 신]/[← 심문으로])에는 키보드 Tab 외에 닿을 방법이 없음.
- **재현**: 데스크톱 뷰포트 높이 ~600px 이하(화면 절반 스냅, 줌 125%+) + 단서 6개 이상 → [범인 지목] → 품의서 하단 버튼이 창 밖으로 잘리고 스크롤 불가.
- **수정 제안**: `.main .win-body { overflow-y: auto }` (모바일 분기 `:63`과 동일 정책), 또는 `.doc { max-height: 100%; overflow-y: auto }`. accuse phase에서 `.log`를 렌더하지 않는 것도 방법.

### S2. `remoteEnding` 미초기화 — 이전 사건 엔딩이 다음 사건 신문 지면에 실림
- **위치**: `src/ui/app.ts:11` (선언), `:347` (원격 승리 시 set), `:665` (`remoteEnding ?? fc.ending` read). `startCase()`(`:151-160`)는 `openClueId`만 리셋.
- **문제**: 모듈 스코프 `remoteEnding`이 사건 전환/타이틀 복귀/다시 플레이 어디에서도 초기화되지 않음. 이전 사건 원격 승리 후 다음 사건을 목업 폴리백으로 승리하면(`handleAccuse` catch → 로컬 `accuse()`, `:358`) 결과 지면에 이전 사건의 엔딩·트위스트·선택지(버튼 라벨 포함, `:698-704`)가 출력됨. 게다가 프록시 `judge()`는 정적 `c.ending`을 그대로 반환(`proxy/src/clue.ts:70-74`)하므로 이 캐시는 정확성 이점 없는 순수 리스크.
- **재현**: 사건 1 원격 승리 → [다음 사건] → 사건 2 중 프록시 장애로 목업 지목 승리 → 두잇일보 지면에 사건 1 엔딩이 실림.
- **수정 제안**: `startCase()`에 `remoteEnding = null` 추가. 근본적으로는 모듈 변수 제거 + `GameState` 귀속.

### S3. 리트머스 자백 패턴/키워드 사문화 — 오타가 기능 버그로 증식
- **위치**: `proxy/src/prompt.ts:67`, `content/server/cases.ts:231`
- **문제 ①**: 자백 패턴의 "메신저를 보냈다" 항목이 오타(부록 A-2)로 작성돼, LLM이 case3에서 올바른 철자로 실토해도 정규식이 매칭되지 않음 → 사후 교체(`(말을 삼키며) …`, index.ts:149) 미발동. case3의 핵심 자백 유형이 정확히 이 동사.
- **문제 ②**: `content/server/cases.ts:231` litmusKeywords의 e4 키워드(부록 A-3과 같은 철자)는 어느 `clue.reveal`에도 부분 문자열로 존재하지 않음(204행 reveal과 받침이 다름). `litmus()`가 `clue.reveal.includes(kw)`를 요구하므로 해당 키워드는 영구 사문화.
- **수정 제안**: 부록 A대로 일괄 정정 + `litmusKeywords` 전원이 어떤 reveal에도 매칭되는지 검증하는 단위 테스트 추가.

### S4. 스트림 실패 → sync 무조건 재시도 — 세션 예산·LLM 비용 건당 2배
- **위치**: `src/game/remote.ts:65-70` (모든 throw를 sync 재시도), `proxy/src/index.ts:124` (bumpSession은 시도마다 차감)
- **문제**: 스트림 요청이 서버에서 예산 차감+LLM 생성까지 간 뒤 실패(mid-stream 절단, `no-meta`, JSON 파싱 실패 — remote.ts:103-127의 모든 throw 지점이 재시도 트리거)해도 sync가 동일 요청을 재전송. 행동 1회에 예산 2 차감 + LLM 2회 생성. LLM 제공자 장애 시에도 2연속 실패 호출 후에야 목업 폴리백 → 지연 2배.
- **재현**: 스트리밍이 자주 끊기는 환경(인앱 웹뷰, 프록시 버퍼링)에서 예산 한계의 절반 시점에 조기 `session-budget-exceeded` → 목업 강등.
- **수정 제안**: 응답 헤더 수신 전 실패(`!res.ok`, `getReader` 부재)일 때만 sync 재시도. mid-stream 실패는 기존처럼 목업 폴리백. 또는 프록시 idempotency 키(동일 state+입력 해시 시 재차감 면제).

### S5. 전순덕 case1 대사가 핵심 단서(c5) 타임라인과 정면충돌
- **위치**: `content/public/npcs/jeonsunduk.ts:23` — `'어제 밤이요? 사라진 건 퇴근 전에 확인했어요. 아침에는 없더군요.'`
- **문제**: 문자 그대로면 "퇴근 전에 소실을 확인" = 저녁 퇴근 시각 이전 소실. 그러나 c5(차민재 21:30 퇴근 시 냉장고에 푸딩 있음)와 c4(21:47 혈당 급등)가 범행 21:30 이후를 확정. 의뢰인 진술이 결정적 단서와 모순되어 플레이어가 의뢰인을 거짓말로 의심하는 잘못된 분기를 유도. 의도는 "퇴근 전엔 (있던 걸) 확인, 다음 날 아침엔 없었다".
- **수정 제안**: `'있던 건 퇴근 전에 확인했어요. 다음 날 아침에는 없더군요.'`

---

## 중

### M1. 품의서 3번째 단서 클릭 시 picked 스타일 데싱크
- **위치**: `src/ui/app.ts:566-570`
- **문제**: `pickedClues.size < 2`라 3번째 단서는 Set에 추가되지 않는데 `b.classList.toggle('picked')`는 무조건 실행 → 선택 안 된 단서가 선택된 것처럼 표시. 재클릭 시 Set에 없으니 delete도 안 되고 토글만 꺼짐.
- **재현**: 단서 A·B 선택 → C 클릭 → C에 붉은 picked 아웃라인, 그러나 상신 제출은 A·B만.
- **수정 제안**: `b.classList.toggle('picked', pickedClues.has(cid))`.

### M2. 열어둔 증거 파일 창(z15)이 판정/결과 오버레이(z10) 위에 뜬다
- **위치**: `src/style.css:221` (overlay z10), `:335` (file-win z15), `src/ui/app.ts:637-661`
- **문제**: accuse phase에서도 단서 카드 클릭으로 파일 창을 열 수 있고, 상신 후에도 `openClueId`가 유지되어 전면 오버레이가 파일 창 아래로 깔림. 뷰포트 ~900px 이하에서는 오버레이 패널(`min(560px,94vw)`) 우반부를 파일 창(`min(400px,92vw)`)이 가려 재도전/포기/선택지 조작 방해. z-index 지도(overlay 10 < file-win 15 < crt 20 < takeover 40 < boot 50)의 유일한 역전 케이스.
- **재현**: 단서 파일 열기 → [범인 지목] → 용의자 선택 → [상 신] → 판정 오버레이 위에 파일 창이 겹쳐 뜸.
- **수정 제안**: `render()` 초입에 `if (st.phase !== 'interrogate' && st.phase !== 'accuse') openClueId = null;` 또는 z-index 역전.

### M3. `mockNoticeShown`이 사건을 넘어 영구 — 2번째 사건부터 목업 무고지
- **위치**: `src/ui/app.ts:79-84`, `startCase()` 미리셋
- **문제**: 주석 취지("목업 은폐 방지")는 새 컨텍스트에서 첫 폴리백마다 알려야 성립. 사건 1에서 1회 고지 후 사건 2·3에서 프록시가 계속 죽어 있어도 무고지로 기본 답변. 또 고지문이 `st.log`에 push되어 persist → 원격 회복 후에도 "기본 답변으로 응답합니다" 경고가 로그에 영구 잔존(회복 안내 없음).
- **수정 제안**: `startCase`에서 `mockNoticeShown = false`. 회복 감지 시 1회 "실시간 AI 연결이 복구됐습니다" 고지.

### M4. `openClueId`가 타이틀 복귀 → 이어하기에서 유지됨
- **위치**: `src/ui/app.ts:731` (타이틀로), `:162-171` (resumeCase 리셋 없음)
- **재현**: 파일 창 열어둔 채 지목 → 결과 → [타이틀로] → [이어하기] → 이전 파일 창이 뜬 채 복귀. (사건 간 오염은 없음 — clue id가 c/d/e prefix라 다른 사건에선 find 실패로 미표시.)
- **수정 제안**: `renderTitle()` 또는 `resumeCase()`에서 `openClueId = null`.

### M5. 부팅 IIFE의 sessionStorage 무가드 — 스토리지 차단 환경 백색 화면
- **위치**: `src/ui/app.ts:759,761`
- **문제**: 스토리지 차단 모드/일부 인앱 웹뷰에서 `sessionStorage` 접근이 SecurityError → IIFE throw → 그 아래 `renderTitle()`(`:798`) 미실행 → 빈 화면. 같은 커밋(be219cf)이 "인앱 웹뷰 대응" sync 폴리백을 넣었으면서 정작 진입점을 죽일 수 있는 무가드 스토리지를 추가(기존 `:741` crtToggle localStorage도 동일 패턴).
- **수정 제안**: `try { … } catch { return; }`. 스토리지 접근 헬퍼 통일 권장.

### M6. 한국어 오탈자 — 플레이어 노출 문자열
- 확정 6종(부팅 힌트, e4 desc×2, e4 reveal, 이상록 case3, 전순덕 case2, 이상록 말버릇 ×4)은 **부록 A** 참조.
- 의심 2건(작가 확인 필요):
  - `content/public/npcs/gubonsik.ts:29` — `'그러니 팀이 안 굴리지.'` — "팀이 안 굴러가지"의 오기로 보임. 현재형은 의미 미성립.
  - `content/public/npcs/chaminjae.ts:13` — `'점심이 좀 기시던데.'` — "기시던데"는 성립 형태 없음. 의도 확인 필요(후보: "끼시던데", "가시던데").

### M7. Galmuri11 서브셋의 구두점/기호 결손 — →/←/✓는 비도트 폰트로 추락
- **위치**: `src/fonts/Galmuri11.woff2` (11,267 glyphs), `src/style.css:20-21`
- **문제**: 서브셋에서 `… 「 」 『 』 · ● ○ ◀ ─` 전부 빠짐. 이들은 NeoDGM이 보유해 글자별 폴백으로 렌더는 되나, NPC 대사(말줄임표 상시)에서 문장 안 서체가 섞임. 더 나쁜 건 `→ ← ✓` — **두 폰트 모두 미보유**라 시스템(비도트) 폰트로 떨어짐:
  - `src/ui/app.ts:124` 타이틀 `'심문하고 → 단서를 들이대고 → 범인을 지목하세요'`
  - `src/ui/app.ts:580` `'← 심문으로'`
  - `src/ui/app.ts:719` `'복사됨 ✓'`
- **수정 제안**: 서브셋에 일반 구두점(U+2026, U+300C-300F)/기하 기호(U+25xx)/화살표(U+2190-2199) 포함 재생성, 또는 텍스트 대체("심문하고 · 단서를 들이대고 · 범인을 지목하세요").

### M8. 단서 카드가 div+onclick — 입력 중 질문 소실 + 키보드 접근 불가
- **위치**: `src/ui/app.ts:454-457`
- **재현 A(소실)**: 입력창에 질문을 타이핑하다가 단서 클릭 → `render()`가 form을 통째로 재생성 → 타이핑 내용 증발(스트리밍 중 input 소실 기존 결함과 동일 계열, 단서 클릭이 신규 트리거).
- **재현 B(접근성)**: `.clue.clickable`은 div라 Tab 포커스/Enter 활성화 불가 — 파일 창 기능이 키보드·스크린리더 사용자에게 없는 기능.
- **수정 제안**: input 값을 render 생명주기 밖에 보관/복원, `.clue`를 `<button type="button">`으로(제시 버튼과 분리) 또는 `tabindex="0"` + keydown.

### M9. 가짜 창 버튼(`<i>` 3개) — 닫을 수 있는 file-win에서 빨간 버튼이 묵묵부답
- **위치**: `src/ui/app.ts:42-44`, `src/style.css:50-51` (`i:last-child`가 붉은 #5c2f2f)
- **문제**: 실제로 닫을 수 있는 창(file-win)의 타이틀바에도 동일 장식 버튼 — 사용자가 빨간 버튼을 닫기로 인식해 헛클릭. 진짜 닫기는 본문 안 [닫기]. 장식 `<i>`에 `aria-hidden`도 없음.
- **수정 제안**: file-win에서는 마지막 `<i>`를 실제 닫기 `<button aria-label="닫기">`로. 장식 유지 시 최소 `aria-hidden="true"`.

### M10. e2e 첫 액션이 부팅 오버레이에 흡수될 수 있음
- **위치**: `e2e/play.mjs` + `src/ui/app.ts:758-796`
- **문제**: 새 Playwright 컨텍스트는 sessionStorage가 비어 매 실행 부팅 ~2.9초 재생. 초반 click 액션은 오버레이(스킵)에 흡수되고 초반 shot은 BIOS 화면이 찍힘. 대부분 actionability 재시도로 자가 회복되나 실행 지연 + 스크린샷 오염.
- **수정 제안**: `addInitScript`로 `sessionStorage.setItem('nan503.booted','1')` 주입.

---

## 하

| # | 위치 | 내용 | 수정 제안 |
|---|---|---|---|
| L1 | `app.ts:674` | `renderResult`가 렌더 중 `st.shaken` 변이 — persist 안 돼 재개 시 소실, render 순수성 위반 | 변이를 handleAccuse로 이동 |
| L2 | `app.ts:601` | 매 render마다 `log.scrollTop = scrollHeight` — 단서 파일 열기/토글 시에도 읽던 위치 소실 | 새 메시지/스트리밍 시에만 |
| L3 | `style.css:342-347` | `.side::-webkit-scrollbar*` 사장 CSS — 실제 스크롤은 `.side .win-body`(`:56`) | 셀렉터 교체 |
| L4 | `style.css:301` vs `:216` | `.paper img.verdict-portrait`가 `.breakdown`과 동일 specificity(0,2,1)+후선언이라 승리 지면 붉은 테두리가 카키로 덮임 | `.paper img.verdict-portrait.breakdown` 명시 |
| L5 | `app.ts:657-659` | 파일 창에 `role="dialog"`/Esc 닫기/포커스 이동/포커스 복귀 없음 | 대화 상자 패턴 적용 |
| L6 | `app.ts:778-795` | 부팅: ① 스킵 후 320ms 페이드 동안 투명 오버레이가 클릭 차단(`.boot-out`에 pointer-events:none 없음) ② 페이드 중 재클릭 시 done() 2회(무해) ③ Tab·수정자 키에도 skip 반응 | ① `.boot-out { pointer-events: none }` ③ key 필터 |
| L7 | `app.ts:236-245` | 700ms 내 연속 적중 시 `.takeover` div 중첩 부착 — pointer-events:none+자가 제거라 시각 이중 점멸 외 무해. verdict 연속 2회는 phase 게이팅으로 불가 | 싱글턴 가드(선택) |
| L8 | `app.ts:241`, `style.css:322` | `body.shake`의 transform이 애니메이션 중 fixed 자손(file-win/crt-toggle)의 containing block을 body로 변경 — 모바일 스크롤 상태에서 위치 점프 가능 | shake 대상을 `#app`으로 한정 |
| L9 | `style.css:245,335` | crt-toggle(z20)이 file-win(z15) 위로 — 긴 단서 설명 시 파일 창 우하단과 겹침 | 조건 희박, 기록만 |
| L10 | `app.ts:524-529` | 응답 대기 중 중복 제출 미차단 — Enter 연타 시 턴 중복 차감 + 응답 interleave (diff 이전부터 존재) | 전송 중 input/form disabled |
| L11 | `style.css:273-278` | `.btn.stamp` 실효 높이 ~40-42px(<44px 권장), 모바일 터치 타깃 상향(`.chip,.btn.mini`)에 미포함 | 패딩 상향 또는 분기 추가 |
| L12 | `style.css:303-309` | `.grade-stamp`(absolute 우상단)가 ~320px 폭 지면에서 마스트헤드 '두잇일보' 끝글자와 겹침 가능 | 미디어쿼리 축소(모바일은 이미 static) |
| L13 | `content/server/cases.ts:11` | case1 server briefing이 구버전 — public(`content/public/cases.ts:10`) 개편과 drift, "사라졌다 … 없어진 것으로 보인다" 중복 문장 잔존(프롬프트 투입 텍스트) | public과 동기화 |
| L14 | 프롬프트/주석 | `proxy/src/prompt.ts:18,19,27,43` `-핼라` 계열(부록 A-5), `prompt.ts:13` 주석 `사걸만`(→사건만), `src/game/types.ts:8` 주석 `클리이언트`(→클라이언트), `src/game/engine.ts:24` 주석(부록 A-11) | 부록 A대로 정정 |
| L15 | `app.ts:75` | `logAll`은 사건 전환 후에도 유지(뷰 선호로 의도 해석 가능)하나 localStorage 미저장 — CRT 토글은 persist, 정책 불일치 | 의도라면 persist 일관화 |
| L16 | `app.ts:692` vs `:717` | 도장 '고과 X' vs 공유 카드 '등급 X' 용어 불일치 | 통일 |

---

## 부록 A. 오탈자 확정표 (전수 검사 — 소스 실측값)

| # | 위치 | 현재(틀림) | 정정 | 비고 |
|---|---|---|---|---|
| A-1 | `src/ui/app.ts:764` 부팅 힌트 | 건너띠기 | 건너뛰기 | 전원 노출 |
| A-2 | `proxy/src/prompt.ts:67` 자백 패턴 ×2 | 본냈 | 보냈 | S3 기능 버그 원인 |
| A-3 | `content/public/cases.ts:63`, `content/server/cases.ts:199` (e4 desc) | 보낸놔 | 보내놔 | 파일 창 노출 |
| A-4 | `content/server/cases.ts:204` (e4 reveal) | 보낸놓으라고 | 보내 놓으라고 | reveal 대사 |
| A-5 | `proxy/src/prompt.ts:18,19,27,43` | 말핼라 / 회피핼라 / 답핼라 / 반응핼라 | 말해라 / 회피해라 / 답해라 / 반응해라 | 프롬프트 |
| A-6 | `content/public/npcs/isangrok.ts:38` | 본냈어요 / 본냈다면 | 보냈어요 / 보냈다면 | 플레이어 노출 |
| A-7 | `content/public/npcs/jeonsunduk.ts:28` | 본냈습니다 | 보냈습니다 | 플레이어 노출 |
| A-8 | `content/public/npcs/isangrok.ts:7,10,24,39` | 생각핵볼면 | 생각해보면 | 말버릇 4회 |
| A-9 | `proxy/src/prompt.ts:13` 주석 | 사걸만 | 사건만 | 주석 |
| A-10 | `src/game/types.ts:8` 주석 | 클리이언트 | 클라이언트 | 주석 |
| A-11 | `src/game/engine.ts:24` 주석 | 본너스 | 보너스 | 주석 |

---

## 검증 완료 — 문제 없음으로 확인된 사항 (의심 해소 기록)

- `render()` 재진입 시 file-win/overlay 중복 부착 없음 — 둘 다 `#app` 하위 부착, `app.innerHTML = ''`(app.ts:370)이 매번 정리.
- windowFrame 래핑 후에도 기존 셀렉터 유효 — aside.side/main.main 태그 유지, e2e 로케이터(`main button.btn.stamp`, `.grade-stamp, .grade`, `aside h2.sec`) 전부 일치.
- 부팅 타이머 잔존 없음 — skip이 clearTimeout + keydown 리스너 제거, sessionStorage setItem이 오버레이 부착 전 동기 실행이라 레이스 없음. reduced-motion은 조기 return.
- `.log`는 스크롤 컨테이너라 flex 자동 최소 크기 0 — 로그가 길어져도 입력 폼이 밀려나지 않음(style.css:116).
- 모바일 sticky 입력창: `.main .win-body { overflow: visible }`(style.css:63)로 조상 overflow 트랩 회피, #app에 overflow 없음 — 실제로 고착됨.
- `.doc`/`.paper` 고정색: doc-pick/doc-clue/stamp/warn/twist-box/dim/verdict-caption 전부 라이트 테마용 오버라이드 존재. [← 심문으로] 등 기본 .btn은 어두운 배경+밝은 글자라 라이트 지면 위에서도 가독.
- `grade-stamp` + `grade-S/A/B/C` 색상 클래스 정합(currentColor 테두리 정상 발동).
- 오복자 '비우다 보면 보면…'은 더듬기 연출 의도 — 오타 아님(구버전 '병행' 오타는 eeea718에서 이미 교정됨).
- WebP 전환은 assets.ts와 실제 파일명 일치.
- 가이드 턴수는 `${TURN_BUDGET}` 바인딩(app.ts:421) — 하드코드 아님.
- engine/clue의 지목 실패 피드백 문구('직결되는 선은')는 이미 교정된 상태.
