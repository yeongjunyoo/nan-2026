// 게임 SFX(ZzFX 파라미터)를 영상 오버레이용 WAV로 렌더 — 게임과 영상이 동일 사운드를 공유한다.
// 실행: npx tsx e2e/capture/gen_sfx_wav.mjs   (sfx-params.ts를 읽기 위해 tsx 필요)
import fs from 'node:fs';
import path from 'node:path';

// vendor/zzfx.js가 import 시점에 AudioContext를 생성하므로 node에서는 스텁을 먼저 심는다.
// buildSamples()는 순수 함수라 스텁 메서드는 호출되지 않는다.
globalThis.AudioContext = class { resume() { return Promise.resolve(); } };

const { ZZFX } = await import('../../src/ui/vendor/zzfx.js');
const { SFX } = await import('../../src/ui/sfx-params.ts');

const OUT_DIR = path.join(import.meta.dirname, 'sfx');
fs.mkdirSync(OUT_DIR, { recursive: true });

function writeWav(file, samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

for (const [name, params] of Object.entries(SFX)) {
  // 랜덤 피치 흔들림 제거(영상 재현성): randomness 파라미터(index 1)를 0으로
  const p = [...params]; p[1] = 0;
  const samples = ZZFX.buildSamples(...p);
  const file = path.join(OUT_DIR, `${name}.wav`);
  writeWav(file, samples, ZZFX.sampleRate);
  console.log(`${name}.wav — ${(samples.length / ZZFX.sampleRate).toFixed(2)}s, ${samples.length} samples`);
}
