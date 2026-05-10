import { computed, ref, watch, type Ref } from 'vue';
import type { BattleUnit, SkillData, SkillTargetType } from './types';

export function useBattleCommand(
  activeUnit: Ref<BattleUnit | null>,
  canAct: Ref<boolean>,
) {
  const selectedSkillName = ref<string | null>(null);
  const selectedTargetName = ref<string | null>(null);

  const activeSkills = computed(() => {
    const unit = activeUnit.value;
    if (!unit) return [];
    return unit.skills.filter(s => s.类型 === '主动');
  });

  const selectedSkill = computed(() => {
    if (!selectedSkillName.value) return null;
    return activeSkills.value.find(s => s.name === selectedSkillName.value) ?? null;
  });

  const activeTargetType = computed<SkillTargetType | undefined>(() => {
    return selectedSkill.value?.目标类型;
  });

  const requiresExplicitTarget = computed(() => {
    const tt = activeTargetType.value;
    return tt === 'single_enemy' || tt === 'ally';
  });

  const isSelfTarget = computed(() => activeTargetType.value === 'self');

  watch(
    activeSkills,
    skills => {
      if (!skills.length) {
        selectedSkillName.value = null;
        return;
      }
      const currentExists = !!selectedSkillName.value && skills.some(s => s.name === selectedSkillName.value);
      if (!selectedSkillName.value || !currentExists) {
        selectedSkillName.value = skills[0].name;
      }
    },
    { immediate: true },
  );

  watch(
    [() => activeUnit.value?.name],
    () => {
      selectedSkillName.value = null;
      selectedTargetName.value = null;
    },
  );

  watch(
    [activeTargetType, activeUnit],
    ([targetType, actor]) => {
      if (!targetType) return;
      if (targetType === 'self' && actor) {
        selectedTargetName.value = actor.name;
        return;
      }
      selectedTargetName.value = null;
    },
    { immediate: true },
  );

  function selectSkill(skillName: string) {
    selectedSkillName.value = skillName;
  }

  function getCooldown(unit: BattleUnit | null, skillName: string): number {
    return unit?.cooldowns[skillName] ?? 0;
  }

  function isSkillAvailable(unit: BattleUnit | null, skill: SkillData): boolean {
    if (!unit || unit.HP <= 0) return false;
    if (getCooldown(unit, skill.name) > 0) return false;
    if (unit.MP < skill.消耗MP) return false;
    return true;
  }

  function getUnavailableReason(unit: BattleUnit | null, skill: SkillData): string {
    if (!canAct.value) return '当前不可操作';
    if (!unit) return '无出战单位';
    if (unit.HP <= 0) return '单位已倒下';
    const cd = getCooldown(unit, skill.name);
    if (cd > 0) return `冷却中，还需 ${cd} 回合`;
    if (unit.MP < skill.消耗MP) return `MP 不足，需要 ${skill.消耗MP}`;
    return '可使用';
  }

  function targetTypeText(tt: SkillTargetType | undefined): string {
    const map: Record<string, string> = {
      single_enemy: '单体敌人', self: '自身', ally: '单体友方',
      all_enemies: '全体敌人', all_allies: '全体友方',
    };
    return map[tt ?? ''] ?? tt ?? '—';
  }

  function buildCommand(): { action: 'skill'; skillName: string } | null {
    if (!selectedSkill.value) return null;
    return { action: 'skill', skillName: selectedSkill.value.name };
  }

  return {
    selectedSkillName,
    selectedTargetName,
    selectedSkill,
    activeSkills,
    activeTargetType,
    requiresExplicitTarget,
    isSelfTarget,
    selectSkill,
    getCooldown,
    isSkillAvailable,
    getUnavailableReason,
    targetTypeText,
    buildCommand,
  };
}
