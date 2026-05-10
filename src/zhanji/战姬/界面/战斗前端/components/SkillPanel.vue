<template>
  <section class="command-menu">
    <div class="command-tabs">
      <button
        class="command-tab"
        :class="{ active: localTab === 'skill' }"
        :disabled="!canAct"
        @click="localTab = 'skill'"
      >⚔ 技能</button>
      <button
        class="command-tab"
        :class="{ active: localTab === 'item' }"
        :disabled="!canAct"
        @click="localTab = 'item'"
      >✦ 道具</button>
    </div>

    <div v-if="localTab === 'skill'" class="command-content">
      <div v-if="selectionAlertText" class="panel-alert">{{ selectionAlertText }}</div>
      <div v-if="skills.length === 0" class="empty-text">当前没有已装备且可用的技能。</div>
      <template v-else>
        <div v-if="previewSkill" class="skill-preview-card">
          <div class="skill-preview-head">
            <div>
              <div class="skill-preview-title">{{ previewSkill.名称 }}</div>
              <div class="skill-preview-meta">{{ targetTypeText(previewSkill.目标类型) }} · {{ rangeText(previewSkill.射程) }} · {{ checkTypeText(previewSkill.检定.类型) }}</div>
            </div>
            <div class="skill-preview-cost">MP {{ previewSkill.消耗.MP }} / CD {{ getCooldown(previewSkill.id) }}</div>
          </div>
          <div class="skill-preview-desc">{{ previewSkill.描述 || '暂无技能说明' }}</div>
          <div class="skill-preview-effects">
            <span v-for="summary in effectSummaries(previewSkill)" :key="summary" class="effect-badge">{{ summary }}</span>
          </div>
        </div>
        <div class="skill-grid">
          <div v-for="skill in skills" :key="skill.id" class="skill-btn-wrap">
            <button
              class="cmd-btn"
              :class="{ selected: selectedSkillId === skill.id, disabled: !isSkillAvailable(skill.id, skill.消耗.MP), muted: !!activeItemId }"
              :disabled="!canAct || !isSkillAvailable(skill.id, skill.消耗.MP)"
              @click="$emit('select-skill', skill.id)"
              @mouseenter="hoveredSkillId = skill.id"
              @mouseleave="hoveredSkillId = null"
            >
              <span class="cmd-btn-name">{{ skill.名称 }}</span>
              <span class="cmd-btn-meta">MP {{ skill.消耗.MP }} · CD {{ getCooldown(skill.id) }}</span>
              <span v-if="getUnavailableReason(skill) !== '可使用'" class="cmd-btn-reason">{{ getUnavailableReason(skill) }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>

    <div v-if="localTab === 'item'" class="command-content">
      <div v-if="selectionAlertText" class="panel-alert">{{ selectionAlertText }}</div>
      <div v-if="items.length === 0" class="empty-text">当前没有可在战斗中使用的道具。</div>
      <template v-else>
        <div class="item-grid">
          <div v-for="item in items" :key="item.id" class="item-btn-wrap">
            <button
              class="cmd-btn"
              :class="{ selected: selectedItemId === item.id, disabled: !isItemAvailable(item), muted: !!activeSkillId }"
              :disabled="!canAct || !isItemAvailable(item)"
              @click="$emit('select-item', item.id)"
            >
              <span class="cmd-btn-name">{{ item.名称 }}</span>
              <span class="cmd-btn-meta">×{{ item.数量 }} · {{ targetTypeText(item.目标类型) }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BattleUnitState, SkillDefinition, InventoryItem } from '../types';

const props = defineProps<{
  skills: SkillDefinition[];
  items: InventoryItem[];
  selectedSkillId: string | null;
  selectedItemId: string | null;
  actor?: BattleUnitState | null;
  canAct: boolean;
  activeItemId?: string | null;
  activeSkillId?: string | null;
  activeTabProp?: 'skill' | 'item';
}>();

defineEmits<{
  (e: 'select-skill', skillId: string): void;
  (e: 'select-item', itemId: string): void;
}>();

const localTab = ref<'skill' | 'item'>(props.activeTabProp ?? 'skill');

const hoveredSkillId = ref<string | null>(null);

const previewSkill = computed(() => {
  const skillId = hoveredSkillId.value ?? props.selectedSkillId;
  return skillId ? (props.skills.find(skill => skill.id === skillId) ?? null) : (props.skills[0] ?? null);
});

const selectionAlertText = computed(() => {
  if (localTab.value === 'skill' && props.activeItemId) return '已选择道具，技能选择会与道具选择互斥。';
  if (localTab.value === 'item' && props.activeSkillId) return '已选择技能，道具选择会与技能选择互斥。';
  return '';
});

function getCooldown(skillId: string) {
  return props.actor?.技能栏.find(skill => skill.skillId === skillId)?.当前冷却 ?? 0;
}

function isSkillAvailable(skillId: string, mpCost: number) {
  const runtimeSkill = props.actor?.技能栏.find(skill => skill.skillId === skillId);
  if (!props.actor || !runtimeSkill) return false;
  return runtimeSkill.当前冷却 <= 0 && !runtimeSkill.已禁用 && props.actor.当前资源.MP >= mpCost;
}

function getUnavailableReason(skill: SkillDefinition) {
  const runtimeSkill = props.actor?.技能栏.find(item => item.skillId === skill.id);
  if (!props.canAct) return '当前不可操作';
  if (!props.actor || !runtimeSkill) return '运行时技能缺失';
  if (runtimeSkill.已禁用) return runtimeSkill.禁用原因 || '技能已禁用';
  if (runtimeSkill.当前冷却 > 0) return `冷却中，还需 ${runtimeSkill.当前冷却} 回合`;
  if (props.actor.当前资源.MP < skill.消耗.MP) return `MP 不足，需要 ${skill.消耗.MP}`;
  return '可使用';
}

function isItemAvailable(item: InventoryItem) {
  return item.战斗可用 && item.数量 > 0;
}

function targetTypeText(targetType: SkillDefinition['目标类型'] | InventoryItem['目标类型']) {
  const map: Record<string, string> = {
    self: '自身', single_enemy: '单体敌人', single_ally: '单体友方',
    all_enemies: '全体敌人', all_allies: '全体友方', random_enemy: '随机敌人',
  };
  return map[targetType] ?? targetType;
}

function rangeText(range: SkillDefinition['射程']) {
  const map: Record<SkillDefinition['射程'], string> = { melee: '近战', ranged: '远程', global: '全域' };
  return `射程: ${map[range]}`;
}

function checkTypeText(checkType: SkillDefinition['检定']['类型']) {
  const map: Record<SkillDefinition['检定']['类型'], string> = { attack_roll: '攻击检定', saving_throw: '豁免检定', auto_hit: '自动生效' };
  return map[checkType];
}

function effectSummaries(skill: SkillDefinition) {
  return skill.效果列表.map(ef => {
    switch (ef.kind) {
      case 'damage': return `伤害 ${ef.scale}×${ef.ratio}+${ef.flat}(${ef.damageType})`;
      case 'heal': return `治疗 ${ef.scale}×${ef.ratio}+${ef.flat}`;
      case 'restore_mp': return `回复MP ${ef.flat}`;
      case 'shield': return `护盾 ${ef.ratio}+${ef.flat} ${ef.duration}T`;
      case 'apply_status': return `状态 ${ef.statusId} ${Math.round((ef.chance ?? 0) * 100)}%`;
      case 'remove_status': return `驱散 ×${ef.count}`;
      case 'add_modifier': return `修正 ${ef.modifierId} ${ef.value} ${ef.duration}T`;
      default: return ef.kind;
    }
  });
}
</script>
