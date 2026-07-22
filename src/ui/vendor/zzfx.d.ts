// 타입 선언 — vendor/zzfx.js (ZzFX v1.3.2, MIT, Frank Force — https://github.com/KilledByAPixel/ZzFX)
export function zzfx(...parameters: (number | undefined)[]): AudioBufferSourceNode;
export const ZZFX: {
  volume: number;
  sampleRate: number;
  audioContext: AudioContext;
  play(...parameters: (number | undefined)[]): AudioBufferSourceNode;
  playSamples(sampleChannels: number[][], volumeScale?: number, rate?: number, pan?: number, loop?: boolean): AudioBufferSourceNode;
  buildSamples(...parameters: (number | undefined)[]): number[];
  getNote(semitoneOffset?: number, rootNoteFrequency?: number): number;
};
export class ZZFXSound {
  constructor(zzfxSound?: (number | undefined)[]);
  zzfxSound: (number | undefined)[];
  randomness: number;
  samples: number[];
  play(volume?: number, pitch?: number, randomnessScale?: number, pan?: number, loop?: boolean): AudioBufferSourceNode | undefined;
}
