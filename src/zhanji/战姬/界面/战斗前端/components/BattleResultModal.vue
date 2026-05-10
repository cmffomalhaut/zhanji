<template>
  <section v-if="result" class="result-card">
    <div class="result-top-section">
      <div class="result-title">战斗结算</div>
      <div class="result-summary">{{ result.summary }}</div>
      <div class="result-winner-pill" :class="result.winner">{{ winnerText }}</div>
    </div>

    <div class="diamond-divider">✦</div>

    <div class="result-stats-grid">
      <div class="result-stat-card">
        <div class="result-stat-label">回合</div>
        <div class="result-stat-value">{{ result.rounds }}</div>
      </div>
      <div class="result-stat-card">
        <div class="result-stat-label">经验</div>
        <div class="result-stat-value">{{ result.expGain }}</div>
      </div>
      <div class="result-stat-card">
        <div class="result-stat-label">金币</div>
        <div class="result-stat-value">{{ result.goldGain }}</div>
      </div>
    </div>

    <div v-if="result.rewardTexts.length" class="result-rewards">
      <div class="result-rewards-title">战利品</div>
      <div class="result-reward-list">
        <div v-for="reward in result.rewardTexts" :key="reward" class="result-reward-item">{{ reward }}</div>
      </div>
    </div>

    <div class="result-actions">
      <button class="action-btn" @click="$emit('settle')">执行战后结算</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BattleResultSummary } from '../types';

const props = defineProps<{
  result?: BattleResultSummary | null;
}>();

defineEmits<{
  (e: 'settle'): void;
}>();

const winnerText = computed(() => {
  if (!props.result) return '';
  if (props.result.winner === 'ally') return '我方获胜';
  if (props.result.winner === 'enemy') return '敌方获胜';
  if (props.result.winner === 'escape') return '成功脱战';
  return '战斗平局';
});
</script>
