import type { NpcPublic } from '../../../src/game/types';
import { gubonsik } from './gubonsik';
import { chaminjae } from './chaminjae';
import { isangrok } from './isangrok';
import { jeonsunduk } from './jeonsunduk';
import { marupang } from './marupang';
import { obokja } from './obokja';

export { gubonsik, chaminjae, isangrok, jeonsunduk, marupang, obokja };

export const NPC_PUBLIC: Record<string, NpcPublic> = {
  gu: gubonsik, cha: chaminjae, lee: isangrok, jeon: jeonsunduk, ma: marupang, ok: obokja,
};
