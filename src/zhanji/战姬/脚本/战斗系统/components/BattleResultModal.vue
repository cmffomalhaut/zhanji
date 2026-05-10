<template>
  <div v-if="result" class="result-overlay" :class="result.winner">
    <div class="result-box">
      <div class="result-title">
        {{ result.winner === 'ally' ? '胜利' : result.winner === 'escape' ? '逃跑成功' : '战败' }}
      </div>

      <div class="result-stats-grid">
        <div class="result-stat-card">
          <div class="result-stat-label">回合数</div>
          <div class="result-stat-value">{{ result.rounds }}</div>
        </div>
        <div class="result-stat-card">
          <div class="result-stat-label">己方 HP</div>
          <div class="result-stat-value">{{ result.allyHP }}</div>
        </div>
        <div class="result-stat-card">
          <div class="result-stat-label">敌方 HP</div>
          <div class="result-stat-value">{{ result.enemyHP }}</div>
        </div>
      </div>

      <div v-if="result.expGained || result.goldGained" class="result-rewards">
        <div class="result-rewards-title">获得</div>
        <div class="result-reward-list">
          <span v-if="result.expGained" class="result-reward-item">经验 +{{ result.expGained }}</span>
          <span v-if="result.goldGained" class="result-reward-item">金币 +{{ result.goldGained }}</span>
        </div>
      </div>

      <div v-if="result.enemyPostAction" class="result-summary">
        敌方战后决策: {{ postActionText }}
      </div>

      <div v-if="result.capture || result.enemyCaptureAlly || result.enemyEscaped" class="capture-section">
        <template v-if="result.capture">
          <div class="capture-box">
            <div class="capture-title">我方捕捉掷骰判定</div>
            <div class="capture-formula">{{ result.capture.detailText }}</div>
            <template v-if="result.capture.attempted">
              <div class="dice-row">
                <div class="dice-orb" :class="{ success: result.capture.success, fail: !result.capture.success }">
                  {{ result.capture.diceRoll ?? '—' }}
                </div>
                <div class="dice-vs">{{ result.capture.success ? '≤' : '>' }}</div>
                <div class="dice-target">{{ pct(result.capture.finalRate) }}</div>
              </div>
              <div v-if="result.capture.sRankHardLock" style="font-size:11px;color:#ffd700;margin-top:4px;">S级硬锁：仅骰出1成功</div>
              <div class="capture-result" :class="result.capture.success ? 'ok' : 'bad'">
                {{ result.capture.success ? '捕捉成功!' : '捕捉失败...' }}
              </div>
            </template>
          </div>
        </template>

        <template v-if="result.enemyEscaped">
          <div class="capture-box escape">
            <div class="capture-title">敌方逃跑</div>
            <div class="capture-result bad">敌方战姬挣脱束缚逃跑了！</div>
          </div>
        </template>

        <template v-if="result.enemyCaptureAlly">
          <div class="capture-box enemy-capture">
            <div class="capture-title">敌方捕捉判定</div>
            <div class="capture-formula">{{ result.enemyCaptureAlly.detailText }}</div>
            <template v-if="result.enemyCaptureAlly.attempted">
              <div class="dice-row">
                <div class="dice-orb" :class="{ success: result.enemyCaptureAlly.success, fail: !result.enemyCaptureAlly.success }">
                  {{ result.enemyCaptureAlly.diceRoll ?? '—' }}
                </div>
                <div class="dice-vs">{{ result.enemyCaptureAlly.success ? '≤' : '>' }}</div>
                <div class="dice-target">{{ pct(result.enemyCaptureAlly.finalRate) }}</div>
              </div>
              <div class="capture-result" :class="result.enemyCaptureAlly.success ? 'bad' : 'ok'">
                {{ result.enemyCaptureAlly.success ? '我方战姬被捉走了！' : '敌方捕捉失败' }}
              </div>
            </template>
          </div>
        </template>
      </div>

      <div class="result-actions">
        <button v-if="canCapture && !result.capture" class="capture-action-btn" @click="$emit('capture')">◎ 捕捉战姬</button>
        <button class="restart-btn" @click="$emit('restart')">重新战斗</button>
        <button class="close-btn" @click="$emit('close')">确认</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  result: import('../types').BattleResult | null;
  canCapture: boolean;
}>();

defineEmits<{ close: []; restart: []; capture: [] }>();

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

const postActionText = computed(() => {
  if (!props.result?.enemyPostAction) return '';
  const map: Record<string, string> = {
    continue: '继续纠缠/再次挑战',
    retreat: '撤退离场',
    surrender: '心理崩溃，放弃抵抗',
  };
  return map[props.result.enemyPostAction] ?? '未知';
});
</script>
