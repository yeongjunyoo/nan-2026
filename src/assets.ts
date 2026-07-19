// 게임 에셋 URL 매핑 (vite ?url 번들)
import gubonsikBase from '../assets/npc/gubonsik_base.png?url';
import gubonsikSmile from '../assets/npc/gubonsik_smile.png?url';
import gubonsikBreakdown from '../assets/npc/gubonsik_breakdown.png?url';
import chaminjaeBase from '../assets/npc/chaminjae_base.png?url';
import chaminjaeSmile from '../assets/npc/chaminjae_smile.png?url';
import chaminjaeBreakdown from '../assets/npc/chaminjae_breakdown.png?url';
import isangrokBase from '../assets/npc/isangrok_base.png?url';
import isangrokSmile from '../assets/npc/isangrok_smile.png?url';
import isangrokBreakdown from '../assets/npc/isangrok_breakdown.png?url';
import jeonsundukBase from '../assets/npc/jeonsunduk_base.png?url';
import jeonsundukSmile from '../assets/npc/jeonsunduk_smile.png?url';
import jeonsundukBreakdown from '../assets/npc/jeonsunduk_breakdown.png?url';
import marupangBase from '../assets/npc/marupang_base.png?url';
import marupangSmile from '../assets/npc/marupang_smile.png?url';
import marupangBreakdown from '../assets/npc/marupang_breakdown.png?url';
import obokjaBase from '../assets/npc/obokja_base.png?url';
import obokjaSmile from '../assets/npc/obokja_smile.png?url';
import obokjaBreakdown from '../assets/npc/obokja_breakdown.png?url';
import officeWallpaper from '../assets/bg/office_wallpaper.png?url';
import case1Card from '../assets/cards/case1_pudding.png?url';
import case2Card from '../assets/cards/case2_shredder.png?url';
import case3Card from '../assets/cards/case3_afterhours.png?url';
import logoImg from '../assets/title/logo.png?url';

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
