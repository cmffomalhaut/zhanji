<template>
  <section class="command-menu">
    <div class="command-content">
      <div v-if="skills.length === 0" class="empty-text">当前没有可用的主动技能。</div>
      <template v-else>
        <div v-if="previewSkill" class="skill-preview-card">
          <div class="skill-preview-head">
            <div>
              <div class="skill-preview-title">{{ previewSkill.name }}</div>
              <div class="skill-preview-meta">{{ targetTypeText(previewSkill.目标类型) }} · 威力 {{ previewSkill.基础威力 }} · {{ previewSkill.元素属性 }}</div>
            </div>
            <div class="skill-preview-cost">MP {{ previewSkill.消耗MP }} · CD {{ getCooldown(previewSkill.name) }}</div>
          </div>
          <div class="skill-preview-desc">{{ previewSkill.描述 || '暂无技能说明' }}</div>
          <div class="skill-preview-effects">
            <span class="effect-badge">{{ formulaText(previewSkill.效果公式) }}</span>
            <span v-if="previewSkill.数值参数?.命中率" class="effect-badge">命中 {{ Math.round((previewSkill.数值参数.命中率 ?? 0) * 100) }}%</span>
            <span v-if="previewSkill.数值参数?.暴击率加成" class="effect-badge">暴击 +{{ Math.round((previewSkill.数值参数.暴击率加成 ?? 0) * 100) }}%</span>
          </div>
        </div>
        <div class="skill-grid">
          <div v-for="skill in skills" :key="skill.name" class="skill-btn-wrap">
            <button
              class="cmd-btn"
              :class="{ selected: selectedSkillName === skill.name, disabled: !isSkillAvailable(skill) }"
              :disabled="!canAct || !isSkillAvailable(skill)"
              @click="$emit('select-skill', skill.name)"
              @mouseenter="hoveredSkillName = skill.name"
              @mouseleave="hoveredSkillName = null"
            >
              <span class="cmd-btn-name">{{ skill.name }}</span>
              <span class="cmd-btn-meta">MP {{ skill.消耗MP }} · CD {{ getCooldown(skill.name) }} · 威力 {{ skill.基础威力 }}</span>
              <span v-if="getUnavailableReason(skill) !== '可使用'" class="cmd-btn-reason">{{ getUnavailableReason(skill) }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BattleUnit, SkillData, SkillTargetType } from '../types';

const props = defineProps<{
  skills: SkillData[];
  selectedSkillName: string | null;
  actor: BattleUnit | null;
  canAct: boolean;
}>();

defineEmits<{
  (e: 'select-skill', skillName: string): void;
}>();

const hoveredSkillName = ref<string | null>(null);

const previewSkill = computed(() => {
  const name = hoveredSkillName.value ?? props.selectedSkillName;
  return name ? (props.skills.find(s => s.name === name) ?? props.skills[0] ?? null) : (props.skills[0] ?? null);
});

function getCooldown(skillName: string) {
  const baseCd = props.skills.find(s => s.name === skillName)?.冷却回合 ?? 0;
  const currentCd = props.actor?.cooldowns[skillName] ?? 0;
  if (baseCd <= 0) return '0';
  if (currentCd > 0) return `${baseCd} (剩${currentCd})`;
  return String(baseCd);
}

function isSkillAvailable(skill: SkillData) {
  if (!props.actor) return false;
  if (props.actor.HP <= 0) return false;
  const cd = props.actor.cooldowns[skill.name] ?? 0;
  if (cd > 0) return false;
  if (props.actor.MP < skill.消耗MP) return false;
  return true;
}

function getUnavailableReason(skill: SkillData) {
  if (!props.canAct) return '当前不可操作';
  if (!props.actor) return '无出战单位';
  if (props.actor.HP <= 0) return '单位已倒下';
  const cd = props.actor.cooldowns[skill.name] ?? 0;
  if (cd > 0) return `冷却中，还需 ${cd} 回合`;
  if (props.actor.MP < skill.消耗MP) return `MP 不足，需要 ${skill.消耗MP}`;
  return '可使用';
}

function targetTypeText(tt: SkillTargetType | undefined): string {
  const map: Record<string, string> = {
    single_enemy: '单体敌人', self: '自身', ally: '单体友方',
    all_enemies: '全体敌人', all_allies: '全体友方',
  };
  return map[tt ?? ''] ?? tt ?? '—';
}

function formulaText(formula: string): string {
  const map: Record<string, string> = {
    physical_damage: '物理伤害', magic_damage: '魔法伤害',
    heal: '治疗', buff: '增益', debuff: '减益',
    drain_physical: '物理吸血', drain_magic: '魔法吸血',
  };
  return map[formula] ?? formula;
}
</script>
