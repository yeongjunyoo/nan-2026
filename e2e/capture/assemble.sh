#!/usr/bin/env bash
# 사건파일 503호 — 녹화된 webm에서 30~60초 플레이 영상 mp4를 조립한다.
#
# 사용: bash e2e/capture/assemble.sh <input.webm> <segments.json> [output.mp4]
#
# segments.json 스키마 (배열, 순서대로 concat됨):
#   [
#     { "start": 10800, "end": 15200, "speed": 1.0, "caption": "심문: \"어제 몇 시에 퇴근하셨어요?\"" },
#     { "start": 26700, "end": 33700, "speed": 1.6, "caption": "단서 제시 → 해금" },
#     { "start": 36700, "end": 43000, "speed": 1.0, "caption": "" }
#   ]
#   start/end: 입력 webm 기준 ms (record.mjs가 남긴 beats.json의 tMs를 컷 좌표로 사용)
#   speed: 구간 재생 배속(1.0 = 원속도, >1 = 빨리감기)
#   caption: 하단 자막(빈 문자열/생략 시 자막 없음)
#
# 처리: 구간 트림 → setpts 배속 → drawtext 자막(도트 폰트, 없으면 맑은고딕) → concat
#       → scale=1920:1080:flags=neighbor(최근접 보간, 픽셀아트 유지) → h264 yuv420p crf18 30fps mp4
set -euo pipefail

IN_WEBM="${1:?사용법: assemble.sh <input.webm> <segments.json> [output.mp4]}"
SEGMENTS_JSON="${2:?사용법: assemble.sh <input.webm> <segments.json> [output.mp4]}"
OUT_MP4="${3:-${IN_WEBM%.*}_final.mp4}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg가 PATH에 없습니다. 아래 명령으로 설치한 뒤 새 셸에서 다시 실행하세요:"
  echo ""
  echo "  winget install -e --id Gyan.FFmpeg"
  echo ""
  exit 1
fi

if [ ! -f "$IN_WEBM" ]; then
  echo "입력 영상을 찾을 수 없습니다: $IN_WEBM" >&2
  exit 1
fi
if [ ! -f "$SEGMENTS_JSON" ]; then
  echo "세그먼트 JSON을 찾을 수 없습니다: $SEGMENTS_JSON" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 폰트 탐색: env CAPTURE_FONT 오버라이드 → 레포 내 도트 폰트(ttf/otf 우선, woff2 차선) → 맑은고딕 폴백
# 주의: woff2는 일부 ffmpeg 빌드의 drawtext에서 segfault — ttf/otf 권장 (draft1 실측 2026-07-22)
FONT="${CAPTURE_FONT:-}"
for f in "$REPO_ROOT"/src/fonts/*.ttf "$REPO_ROOT"/src/fonts/*.otf; do
  [ -z "$FONT" ] && [ -f "$f" ] && FONT="$f" && break
done
if [ -z "$FONT" ]; then
  for f in "$REPO_ROOT"/src/fonts/*.woff2; do
    [ -f "$f" ] && FONT="$f" && break
  done
fi
if [ -z "$FONT" ]; then
  for cand in /c/Windows/Fonts/malgun.ttf "C:/Windows/Fonts/malgun.ttf"; do
    [ -f "$cand" ] && FONT="$cand" && break
  done
fi
if [ -z "$FONT" ]; then
  echo "자막용 폰트를 찾지 못했습니다 (레포 내 도트 폰트도, 맑은고딕도 없음)." >&2
  exit 1
fi
echo "자막 폰트: $FONT"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

FILTER_BUILDER="$WORK_DIR/build-filter.mjs"
FILTER_SCRIPT="$WORK_DIR/filter_complex.txt"

cat > "$FILTER_BUILDER" <<'NODE_EOF'
import fs from 'node:fs';
const [segmentsPath, fontPath, outPath] = process.argv.slice(2);
const segments = JSON.parse(fs.readFileSync(segmentsPath, 'utf8'));
if (!Array.isArray(segments) || segments.length === 0) {
  throw new Error('segments.json은 최소 1개 이상의 세그먼트 배열이어야 합니다.');
}
// ffmpeg 필터 표현식 안에서 콜론/작은따옴표/퍼센트/백슬래시는 이스케이프해야 한다.
const escPath = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');
const escText = (s) => String(s ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/:/g, '\\:')
  .replace(/'/g, "\\'")
  .replace(/%/g, '\\%');
const font = escPath(fontPath);

const parts = segments.map((seg, i) => {
  const startS = (Number(seg.start) || 0) / 1000;
  const endS = (Number(seg.end) || 0) / 1000;
  const speed = Number(seg.speed) > 0 ? Number(seg.speed) : 1;
  let chain = `[0:v]trim=start=${startS}:end=${endS},setpts=(PTS-STARTPTS)/${speed}`;
  if (seg.caption) {
    chain += `,drawtext=fontfile='${font}':text='${escText(seg.caption)}':fontsize=42:fontcolor=white:borderw=3:bordercolor=black:box=1:boxcolor=black@0.55:boxborderw=14:x=(w-text_w)/2:y=h-th-56`;
  }
  chain += `[v${i}]`;
  return chain;
});
const labels = segments.map((_, i) => `[v${i}]`).join('');
const filter = `${parts.join(';')};${labels}concat=n=${segments.length}:v=1:a=0[vcat];[vcat]scale=1920:1080:flags=neighbor[vout]`;
fs.writeFileSync(outPath, filter);
console.error(`세그먼트 ${segments.length}개 → filter_complex 생성 완료`);
NODE_EOF

node "$FILTER_BUILDER" "$SEGMENTS_JSON" "$FONT" "$FILTER_SCRIPT"

ffmpeg -y -i "$IN_WEBM" \
  -filter_complex_script "$FILTER_SCRIPT" \
  -map "[vout]" \
  -r 30 -c:v libx264 -crf 18 -pix_fmt yuv420p \
  "$OUT_MP4"

echo "완료: $OUT_MP4"
