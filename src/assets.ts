// 게임 에셋 URL 매핑 (vite ?url 번들)
import gubonsikBase from '../assets/npc/gubonsik_base.webp?url';
import gubonsikSmile from '../assets/npc/gubonsik_smile.webp?url';
import gubonsikBreakdown from '../assets/npc/gubonsik_breakdown.webp?url';
import chaminjaeBase from '../assets/npc/chaminjae_base.webp?url';
import chaminjaeSmile from '../assets/npc/chaminjae_smile.webp?url';
import chaminjaeBreakdown from '../assets/npc/chaminjae_breakdown.webp?url';
import isangrokBase from '../assets/npc/isangrok_base.webp?url';
import isangrokSmile from '../assets/npc/isangrok_smile.webp?url';
import isangrokBreakdown from '../assets/npc/isangrok_breakdown.webp?url';
import jeonsundukBase from '../assets/npc/jeonsunduk_base.webp?url';
import jeonsundukSmile from '../assets/npc/jeonsunduk_smile.webp?url';
import jeonsundukBreakdown from '../assets/npc/jeonsunduk_breakdown.webp?url';
import marupangBase from '../assets/npc/marupang_base.webp?url';
import marupangSmile from '../assets/npc/marupang_smile.webp?url';
import marupangBreakdown from '../assets/npc/marupang_breakdown.webp?url';
import obokjaBase from '../assets/npc/obokja_base.webp?url';
import obokjaSmile from '../assets/npc/obokja_smile.webp?url';
import obokjaBreakdown from '../assets/npc/obokja_breakdown.webp?url';
import officeWallpaper from '../assets/bg/office_wallpaper.webp?url';
import case1Card from '../assets/cards/case1_pudding.webp?url';
import case2Card from '../assets/cards/case2_shredder.webp?url';
import case3Card from '../assets/cards/case3_afterhours.webp?url';
import logoImg from '../assets/title/logo.webp?url';

export const NPC_AVATAR: Record<string, string> = {
  gu: gubonsikBase,
  cha: chaminjaeBase,
  lee: isangrokBase,
  jeon: jeonsundukBase,
  ma: marupangBase,
  ok: obokjaBase,
};

// 표정 변형 3종 전량 확정 (베이스 레퍼런스 편집 방식, identity 유지 확인 완료)
export const NPC_VARIANT: Record<string, { base: string; smile: string; breakdown: string }> = {
  gu: { base: gubonsikBase, smile: gubonsikSmile, breakdown: gubonsikBreakdown },
  cha: { base: chaminjaeBase, smile: chaminjaeSmile, breakdown: chaminjaeBreakdown },
  lee: { base: isangrokBase, smile: isangrokSmile, breakdown: isangrokBreakdown },
  jeon: { base: jeonsundukBase, smile: jeonsundukSmile, breakdown: jeonsundukBreakdown },
  ma: { base: marupangBase, smile: marupangSmile, breakdown: marupangBreakdown },
  ok: { base: obokjaBase, smile: obokjaSmile, breakdown: obokjaBreakdown },
};

export const CASE_CARD: Record<string, string> = {
  case1: case1Card,
  case2: case2Card,
  case3: case3Card,
};

export const WALLPAPER = officeWallpaper;
export const LOGO = logoImg;
