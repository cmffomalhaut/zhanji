<template>
  <div class="turn-order-bar">
    <div class="ctb-scroll">
      <div
        v-for="unit in ctbOrder"
        :key="unit.name"
        class="ctb-pill"
        :class="[unit.side, { current: unit.name === currentActorName, dead: unit.hp <= 0 }]"
        @mouseenter="hoveredName = unit.name"
        @mouseleave="hoveredName = null"
      >
        <span class="ctb-dot" :class="unit.side === 'ally' ? 'ally-dot' : 'enemy-dot'"></span>
        <span class="ctb-name">{{ unit.name }}</span>
        <span class="ctb-num">{{ unit.speed }}</span>
        <div v-if="hoveredName === unit.name" class="ctb-tip">
          <div>{{ unit.name }} · {{ unit.side === 'ally' ? '我方' : '敌方' }}</div>
          <div>HP {{ unit.hp }}/{{ unit.hpMax }} · 速度 {{ unit.speed }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  ctbOrder: Array<{ name: string; side: 'ally' | 'enemy'; hp: number; hpMax: number; level: number; speed: number }>;
  currentActorName: string | null;
}>();

const hoveredName = ref<string | null>(null);
</script>
