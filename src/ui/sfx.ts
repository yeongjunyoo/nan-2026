// 레트로 SFX 시스템 — ZzFX(MIT) 런타임 합성. 사운드 에셋 파일 0개, 외부 요청 0회.
// - 동적 import: AudioContext 미지원/차단 환경(구형 웹뷰 등)에서 로드 실패해도 게임은 무음으로 정상 동작
// - 자동재생 정책: 첫 사용자 제스처(pointerdown/keydown)에서 AudioContext.resume()
// - 토글: 우하단 「사운드: 켬/끔」 (CRT 토글과 동일 관례), localStorage 저장
import { SFX, type SfxName } from './sfx-params';

type ZzfxModule = typeof import('./vendor/zzfx.js');

let mod: ZzfxModule | null = null;
void import('./vendor/zzfx.js')
  .then((m) => { mod = m; })
  .catch(() => { /* 오디오 미지원 환경 — 무음 진행 */ });

// 스토리지 가드 (app.ts storage 패턴과 동일 — 차단 환경에서도 죽지 않게)
const lsGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* noop */ } };

const SFX_KEY = 'nan503.sfx';
let muted = lsGet(SFX_KEY) === 'off';

/** 첫 제스처에서 오디오 컨텍스트 해제 (브라우저 자동재생 정책) */
const unlockAudio = (): void => { void mod?.ZZFX.audioContext.resume().catch(() => { /* noop */ }); };
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);

export function sfxPlay(name: SfxName): void {
  if (muted || !mod) return;
  try {
    if (mod.ZZFX.audioContext.state !== 'running') return; // 제스처 전 — 조용히 스킵
    mod.ZZFX.play(...SFX[name]);
  } catch { /* 재생 실패는 게임에 영향 없음 */ }
}

// ─── 사운드 토글 (우하단, CRT 토글 왼쪽) ───
(function sfxToggle(): void {
  const btn = document.createElement('button');
  btn.className = 'sfx-toggle';
  const apply = (): void => { btn.textContent = `사운드: ${muted ? '끔' : '켬'}`; };
  btn.onclick = () => {
    muted = !muted;
    lsSet(SFX_KEY, muted ? 'off' : 'on');
    apply();
    if (!muted) sfxPlay('send'); // 켤 때 즉시 피드백
  };
  apply();
  document.body.append(btn);
})();
