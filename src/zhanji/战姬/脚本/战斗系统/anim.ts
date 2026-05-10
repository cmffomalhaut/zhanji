// 战斗动画分类系统（适配 zhanji 技能数据）

import type { SkillData, SkillTargetType } from './types';

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

function isHealFormula(formula: string): boolean {
  return formula === 'heal';
}

function isDamageFormula(formula: string): boolean {
  return formula === 'physical_damage' || formula === 'magic_damage' || formula === 'drain_physical' || formula === 'drain_magic';
}

function isBuffFormula(formula: string): boolean {
  return formula === 'buff';
}

function isDebuffFormula(formula: string): boolean {
  return formula === 'debuff';
}

export function classifyAnimation(
  skill: SkillData,
  actorId: string,
  actorSide: 'ally' | 'enemy',
  targetIds: string[],
): AnimEvent | null {
  const formula = skill.效果公式 ?? '';
  const targetType: SkillTargetType | undefined = skill.目标类型;
  const isMultiTarget = targetType === 'all_enemies' || targetType === 'all_allies';

  let type: AnimType;
  if (isHealFormula(formula)) {
    type = isMultiTarget ? 'group_heal' : 'single_heal';
  } else if (isBuffFormula(formula)) {
    type = isMultiTarget ? 'group_buff' : 'single_buff';
  } else if (isDebuffFormula(formula)) {
    type = 'apply_status';
  } else {
    // damage or default
    type = isMultiTarget ? 'group_attack' : 'single_attack';
  }

  const targetSide: 'ally' | 'enemy' = (() => {
    if (targetType === 'all_allies' || targetType === 'self' || targetType === 'ally') return actorSide;
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
