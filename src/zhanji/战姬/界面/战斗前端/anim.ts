export type AnimType =
  | 'single_attack'
  | 'group_attack'
  | 'group_buff'
  | 'group_heal'
  | 'single_heal'
  | 'single_buff'
  | 'apply_status'
  | 'defend'
  | 'escape';

export interface AnimEvent {
  type: AnimType;
  actorId: string;
  targetIds: string[];
  actorSide: 'ally' | 'enemy';
  targetSide: 'ally' | 'enemy';
}

export function classifyAnimation(
  tags: string[],
  targetType: string,
  effectKinds: string[],
  actorId: string,
  actorSide: 'ally' | 'enemy',
  targetIds: string[],
): AnimEvent | null {
  if (!tags.length && !effectKinds.length) return null;

  const primaryTag = tags[0] ?? '';
  const primaryEffect = effectKinds[0] ?? '';
  const isMultiTarget = targetType === 'all_enemies' || targetType === 'all_allies';

  let type: AnimType;
  if (primaryTag === 'heal' || primaryEffect === 'heal' || primaryEffect === 'restore_mp') {
    type = isMultiTarget ? 'group_heal' : 'single_heal';
  } else if (primaryTag === 'buff' || primaryEffect === 'shield' || primaryEffect === 'add_modifier') {
    type = isMultiTarget ? 'group_buff' : 'single_buff';
  } else if (primaryTag === 'debuff' || primaryTag === 'control' || primaryEffect === 'apply_status') {
    type = isMultiTarget ? 'apply_status' : 'apply_status';
  } else {
    type = isMultiTarget ? 'group_attack' : 'single_attack';
  }

  const targetSide: 'ally' | 'enemy' = (() => {
    if (targetType === 'all_allies' || targetType === 'self' || targetType === 'single_ally') return actorSide;
    return actorSide === 'ally' ? 'enemy' : 'ally';
  })();

  return { type, actorId, targetIds, actorSide, targetSide };
}

export function defendAnimation(actorId: string, actorSide: 'ally' | 'enemy'): AnimEvent {
  return { type: 'defend', actorId, targetIds: [actorId], actorSide, targetSide: actorSide };
}

export function escapeAnimation(actorId: string, actorSide: 'ally' | 'enemy'): AnimEvent {
  return { type: 'escape', actorId, targetIds: [], actorSide, targetSide: actorSide };
}

export const ANIM_DURATION: Record<AnimType, number> = {
  single_attack: 600,
  group_attack: 800,
  group_buff: 700,
  group_heal: 900,
  single_heal: 800,
  single_buff: 600,
  apply_status: 600,
  defend: 400,
  escape: 350,
};
