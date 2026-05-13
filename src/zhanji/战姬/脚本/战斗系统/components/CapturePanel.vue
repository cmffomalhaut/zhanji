<template>
  <div class="capture-overlay">
    <div class="capture-panel">
      <div class="capture-header">
        <div class="capture-header-glow"></div>
        <div class="capture-title">捕捉战姬</div>
        <div class="capture-subtitle">{{ enemyName }} · 品质 {{ enemyQuality }}</div>
      </div>

      <div v-if="!rolling && !rolledResult" class="capture-body">
        <div class="capture-target-orb">
          <div class="capture-orb-ring"></div>
          <div class="capture-orb-inner" :class="enemyQualityClass">
            <span class="capture-orb-char">{{ enemyInitial }}</span>
          </div>
          <div class="capture-orb-particles">
            <span v-for="i in 6" :key="i" class="capture-particle" :style="{ animationDelay: `${i * 0.15}s` }"></span>
          </div>
        </div>

        <div class="capture-ball-section">
          <div class="section-label">选择捕捉球</div>
          <div class="capture-ball-grid">
            <button
              v-for="ball in balls"
              :key="ball.type"
              class="capture-ball-btn"
              :class="{ selected: selectedBall === ball.type, disabled: ball.count <= 0 }"
              :disabled="ball.count <= 0"
              @click="onSelectBall(ball.type)"
            >
              <span class="ball-icon" :class="ballClass(ball.type)">{{ ballEmoji(ball.type) }}</span>
              <span class="ball-name">{{ ball.type }}</span>
              <span class="ball-mult">×{{ ballMultiplier(ball.type) }}</span>
              <span class="ball-count">×{{ ball.count }}</span>
            </button>
          </div>
          <div v-if="balls.length === 0" class="empty-text">没有可用的捕捉球</div>
        </div>

        <div v-if="preview" class="capture-preview">
          <div class="preview-row">
            <span class="preview-label">基础率</span>
            <span class="preview-value">{{ pct(preview.baseRate) }}</span>
            <span class="preview-detail">({{ enemyQuality }}级)</span>
          </div>
          <div class="preview-row">
            <span class="preview-label">球倍率</span>
            <span class="preview-value accent">×{{ preview.ballMultiplier.toFixed(1) }}</span>
          </div>
          <div v-if="preview.techMod > 0" class="preview-row">
            <span class="preview-label">道具加成</span>
            <span class="preview-value buff">+{{ pct(preview.techMod) }}</span>
          </div>
          <div v-if="preview.resistMod > 0" class="preview-row">
            <span class="preview-label">抵抗修正</span>
            <span class="preview-value debuff">-{{ pct(preview.resistMod) }}</span>
          </div>
          <div v-if="preview.statusMod > 0" class="preview-row">
            <span class="preview-label">状态加成</span>
            <span class="preview-value buff">+{{ pct(preview.statusMod) }}</span>
          </div>
          <div v-if="preview.sRankHardLock" class="preview-row hard-lock">
            <span class="preview-label">S级硬锁</span>
            <span class="preview-value warning">仅骰出1成功</span>
          </div>
          <div class="preview-divider"></div>
          <div class="preview-row final">
            <span class="preview-label final-label">最终成功率</span>
            <span class="preview-value final-value" :class="rateColor(preview.finalRate)">{{ pct(preview.finalRate) }}</span>
          </div>
        </div>

        <div class="capture-actions">
          <button
            class="capture-cast-btn"
            :disabled="!selectedBall || !canCast"
            @click="onCast"
          >
            <span class="cast-icon">◎</span>
            投球捕捉
          </button>
          <button class="capture-skip-btn" @click="$emit('skip')">放弃捕捉</button>
        </div>
      </div>

      <div v-else-if="rolling" class="capture-rolling">
        <div class="dice-sphere">
          <div class="dice-sphere-ring"></div>
          <div class="dice-number" :class="diceColor">{{ displayDice }}</div>
        </div>
        <div class="rolling-text">命运之轮转动中...</div>
      </div>

      <div v-else class="capture-result">
        <template v-if="displayResult">
          <div class="result-orb" :class="rolledResult.success ? 'success' : 'fail'">
            <div class="result-orb-inner">
              <span class="result-char">{{ enemyInitial }}</span>
            </div>
          </div>

          <div class="dice-row-result">
            <div class="dice-orb" :class="{ success: displayResult.success, fail: !displayResult.success }">
              {{ displayResult.diceRoll }}
            </div>
            <div class="dice-vs">{{ displayResult.success ? '≤' : '>' }}</div>
            <div class="dice-target">{{ pct(displayResult.finalRate) }}</div>
          </div>

          <div v-if="displayResult.sRankHardLock" class="hard-lock-notice">
            S级硬锁：仅骰出1成功
          </div>

          <div class="result-message" :class="displayResult.success ? 'success-text' : 'fail-text'">
            {{ displayResult.success ? '捕捉成功!' : '捕捉失败...' }}
          </div>

          <div v-if="!displayResult.success" class="penalty-notice">
            己方战姬受到反噬伤害
          </div>

          <div class="result-detail">{{ displayResult.detailText }}</div>

          <div class="result-actions">
            <button v-if="!displayResult.success && hasBallsLeft" class="retry-btn" @click="onRetry">
              重新捕捉
            </button>
            <button v-if="!displayResult.success" class="capture-skip-btn" @click="$emit('skip')">放弃捕捉</button>
            <button v-if="displayResult.success" class="confirm-capture-btn" @click="$emit('confirm')">确认</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BattleUnit, CaptureAttempt, CaptureBallItem, CaptureRollResult } from '../types';

const BALL_MULTIPLIER: Record<string, number> = { 普通球: 1, 高级球: 1.5, 超级球: 2, 魅惑之球: 1.2 };
const BALL_EMOJI: Record<string, string> = { 普通球: '⚪', 高级球: '🔵', 超级球: '🟢', 魅惑之球: '💜' };

const props = defineProps<{
  enemy: BattleUnit;
  balls: CaptureBallItem[];
  preview: CaptureRollResult | null;
  rolledResult: CaptureRollResult | null;
  lastBallUsed: string | null;
}>();

const emit = defineEmits<{
  selectBall: [ballType: string];
  cast: [attempt: CaptureAttempt];
  skip: [];
  confirm: [];
  retry: [];
}>();

const selectedBall = ref<string | null>(null);
const rolling = ref(false);
const rolledResult = ref<CaptureRollResult | null>(null);
const displayDice = ref(50);

watch(() => props.rolledResult, (val) => {
  if (val) {
    rolledResult.value = val;
    rolling.value = false;
  }
});

const enemyName = computed(() => props.enemy.name ?? '???');
const enemyInitial = computed(() => props.enemy.name?.charAt(0) ?? '?');
const enemyQuality = computed(() => props.enemy.品质 ?? props.enemy.稀有度 ?? 'C');
const enemyQualityClass = computed(() => `quality-${(enemyQuality.value || 'C').toLowerCase()}`);

const canCast = computed(() => {
  if (!selectedBall.value) return false;
  const ball = props.balls.find(b => b.type === selectedBall.value);
  return !!ball && ball.count > 0;
});

const hasBallsLeft = computed(() => props.balls.some(b => b.count > 0));

const displayResult = computed(() => rolledResult.value ?? props.rolledResult);

const diceColor = computed(() => {
  if (rolling.value) return 'rolling';
  return '';
});

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function ballMultiplier(type: string): string {
  return `×${BALL_MULTIPLIER[type] ?? 1}`;
}

function ballEmoji(type: string): string {
  return BALL_EMOJI[type] ?? '⚪';
}

function ballClass(type: string): string {
  const map: Record<string, string> = { 普通球: 'ball-normal', 高级球: 'ball-super', 超级球: 'ball-ultra', 魅惑之球: 'ball-charm' };
  return map[type] ?? 'ball-normal';
}

function rateColor(rate: number): string {
  if (rate >= 0.7) return 'rate-high';
  if (rate >= 0.3) return 'rate-mid';
  return 'rate-low';
}

function onSelectBall(type: string) {
  selectedBall.value = type;
  emit('selectBall', type);
}

function onCast() {
  if (!selectedBall.value || !canCast.value) return;
  rolling.value = true;
  rolledResult.value = null;
  displayDice.value = Math.floor(Math.random() * 100) + 1;

  const interval = setInterval(() => {
    displayDice.value = Math.floor(Math.random() * 100) + 1;
  }, 60);

  setTimeout(() => {
    clearInterval(interval);
    displayDice.value = props.preview?.diceRoll ?? Math.floor(Math.random() * 100) + 1;
    const attempt: CaptureAttempt = { ballType: selectedBall.value as any };
    emit('cast', attempt);
  }, 900);
}

function onRetry() {
  selectedBall.value = null;
  rolledResult.value = null;
  rolling.value = false;
  displayDice.value = 50;
  emit('retry');
}
</script>