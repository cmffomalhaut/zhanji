<template>
  <div class="item-select-overlay">
    <div class="item-panel">
      <h3>⚗️ 战前道具选择</h3>
      <p class="hint">可使用一个道具，或跳过</p>
      <div class="item-list">
        <button
          v-for="item in items" :key="item.name"
          class="item-btn" :class="item.category"
          @click="$emit('use', item)"
        >
          <span class="item-icon">{{ categoryIcon(item.category) }}</span>
          <span class="item-name">{{ item.name }}</span>
          <span class="item-desc">{{ categoryDesc(item) }}</span>
          <span class="item-count">×{{ item.count }}</span>
        </button>
      </div>
      <button class="skip-btn" @click="$emit('skip')">跳过 ▶</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BattleItem, ItemCategory } from '../types';

defineProps<{ items: BattleItem[] }>();
defineEmits<{ use: [item: BattleItem]; skip: [] }>();

function categoryIcon(cat: ItemCategory): string {
  if (cat === '属性增强药') return '💎';
  if (cat === '技能增强药') return '⚡';
  return '🧪';
}

function categoryDesc(item: BattleItem): string {
  if (item.category === '属性增强药') return `${item.element ?? ''}伤害+10% 5回合`;
  if (item.category === '技能增强药') return '技能伤害+30% 3回合';
  if (item.healLevel === '初级') return '恢复20%HP';
  if (item.healLevel === '中级') return '恢复50%HP';
  return '恢复100%HP';
}
</script>

