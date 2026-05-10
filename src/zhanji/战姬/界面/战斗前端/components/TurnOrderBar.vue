<template>
  <div class="turn-order-bar">
    <div class="ctb-scroll">
      <div
        v-for="unit in orderedUnits"
        :key="unit.unitId"
        class="ctb-pill"
        :class="[unit.阵营, { current: unit.unitId === currentActorId, dead: !unit.是否存活 }]"
        @mouseenter="hoveredId = unit.unitId"
        @mouseleave="hoveredId = null"
      >
        <span class="ctb-dot" :class="unit.阵营 === 'ally' ? 'ally-dot' : 'enemy-dot'"></span>
        <span class="ctb-name">{{ unit.名字 }}</span>
        <span class="ctb-num">{{ unit.行动计数器 }}</span>
        <div v-if="hoveredId === unit.unitId" class="ctb-tip">
          <div>{{ unit.名字 }} · {{ unit.阵营 === 'ally' ? '我方' : '敌方' }}</div>
          <div>HP {{ unit.当前资源.HP }}/{{ unit.当前资源.HPMax }} · 先攻 {{ unit.当前属性.先攻 }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BattleState } from '../types';

const props = defineProps<{
  battleState: BattleState;
}>();

const hoveredId = ref<string | null>(null);

const currentActorId = computed(() => props.battleState.当前行动单位Id);

const orderedUnits = computed(() => {
  const allUnits = [
    ...props.battleState.参战方.ally.单位列表,
    ...props.battleState.参战方.enemy.单位列表,
  ];
  return [...allUnits].sort((a, b) => a.行动计数器 - b.行动计数器);
});
</script>
