<template>
  <div class="battle-shell">
    <button class="close-btn" title="关闭战斗界面" @click="onClose">✕</button>

    <ItemSelect
      v-if="store.phase === 'item_select'"
      :items="store.availableItems"
      @use="onUseItem"
      @skip="store.skipItem()"
    />

    <template v-else>
      <div class="battle-top-bar">
        <TurnOrderBar
          :ctb-order="store.ctbOrder"
          :current-actor-name="currentActorName"
        />
      </div>

      <div class="enemy-strip">
        <div class="section-label">敌方</div>
        <div class="enemy-strip-list">
          <div
            v-for="unit in store.enemyTeam"
            :key="unit.name"
            class="enemy-strip-item"
            :class="{
              targeted: selectedTargetName === unit.name && needsEnemyTarget,
              selectable: needsEnemyTarget && unit.HP > 0,
              dead: unit.HP <= 0,
            }"
            @click="onEnemyStripClick(unit)"
          >
            <div class="enemy-strip-head">
              <span class="enemy-strip-name">{{ unit.name }}</span>
              <span class="unit-type-tag enemy">{{ unit.战斗类型 || '均衡' }}</span>
              <span class="unit-level-enemy">Lv{{ unit.等级 }}</span>
            </div>
            <div class="enemy-stats-row-slim">
              <span class="stat-num atk">A{{ unit.攻击力 }}</span>
              <span class="stat-num def">D{{ unit.防御力 }}</span>
              <span class="stat-num spa">SA{{ unit.特攻 }}</span>
              <span class="stat-num spd">SD{{ unit.特防 }}</span>
              <span class="stat-num sp">SP{{ unit.速度 }}</span>
            </div>
            <div class="enemy-strip-bar-row">
              <div class="bar-track enemy-bar-track">
                <div class="bar-fill hp" :style="{ width: barWidth(unit.HP, unit.HPMax) }"></div>
              </div>
              <span class="bar-val">{{ Math.max(0, unit.HP) }}/{{ unit.HPMax }}</span>
            </div>
            <div v-if="unit.shield > 0" class="enemy-shield">◆ 护盾 {{ unit.shield }}</div>
            <div v-if="unit.statusEffects.length" class="party-statuses">
              <span v-for="eff in unit.statusEffects" :key="eff.type" class="status-badge" :class="statusTone(eff.type)">{{ statusLabel(eff.type) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="battle-main">
        <aside class="left-col">
          <div class="round-info">
            <span class="round-info-round">R{{ store.round }}</span>
            <span v-if="currentActorName" class="round-info-actor">
              <span class="round-info-dot" :class="currentActorSide === 'ally' ? 'ally-dot' : 'enemy-dot'"></span>
              {{ currentActorName }}
            </span>
            <span v-if="store.phase === 'selecting'" class="turn-state-pill player">◈ 你的回合</span>
            <span v-else-if="store.phase === 'animating'" class="turn-state-pill system">◇ 系统处理中</span>
          </div>

          <section class="party-section">
            <div class="section-label">我方</div>
            <div class="party-list">
              <div
                v-for="(unit, idx) in store.allyTeam"
                :key="unit.name"
                class="party-row"
                :class="{
                  active: idx === store.allyActiveIndex,
                  dead: unit.HP <= 0,
                  selectable: needsAllyTarget && unit.HP > 0,
                  targeted: selectedTargetName === unit.name && needsAllyTarget,
                }"
                @click="onPartyClick(unit, idx)"
              >
                <div class="party-avatar-sm">{{ unit.name.charAt(0) }}</div>
                <div class="party-row-info">
                  <div class="party-row-name">
                    {{ unit.name }}
                    <span v-if="unit.品质" class="unit-tier"> {{ unit.品质 }}</span>
                    <span class="unit-type-tag">{{ unit.战斗类型 || '均衡' }}</span>
                    <span class="unit-level">Lv{{ unit.等级 }}</span>
                  </div>
                  <div class="party-stats-row-slim">
                    <span class="stat-num atk">A{{ unit.攻击力 }}</span>
                    <span class="stat-num def">D{{ unit.防御力 }}</span>
                    <span class="stat-num spa">SA{{ unit.特攻 }}</span>
                    <span class="stat-num spd">SD{{ unit.特防 }}</span>
                    <span class="stat-num sp">SP{{ unit.速度 }}</span>
                  </div>
                  <div class="party-bar-row">
                    <span class="bar-lbl hp">HP</span>
                    <div class="bar-track"><div class="bar-fill hp" :style="{ width: barWidth(unit.HP, unit.HPMax) }"></div></div>
                    <span class="bar-val">{{ Math.max(0, unit.HP) }}/{{ unit.HPMax }}</span>
                  </div>
                  <div class="party-bar-row">
                    <span class="bar-lbl mp">MP</span>
                    <div class="bar-track"><div class="bar-fill mp" :style="{ width: barWidth(unit.MP, unit.MPMax) }"></div></div>
                    <span class="bar-val">{{ unit.MP }}/{{ unit.MPMax }}</span>
                  </div>
                  <div v-if="unit.shield > 0" class="party-shield">◆ 护盾 {{ unit.shield }}</div>
                  <div v-if="unit.statusEffects.length" class="party-statuses">
                    <span v-for="eff in unit.statusEffects" :key="eff.type" class="status-badge" :class="statusTone(eff.type)">{{ statusLabel(eff.type) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="log-strip">
            <div class="section-label">日志</div>
            <div class="log-scroll">
              <div v-for="(entry, i) in recentLogs" :key="i" class="log-item-sm" :class="entry.type">
                <span v-if="entry.turn" class="log-turn-sm">T{{ entry.turn }}</span>
                {{ entry.message }}
              </div>
              <div v-if="store.log.length === 0" class="empty-text">暂无日志</div>
            </div>
          </section>
        </aside>

        <main class="center-col">
          <BattleArena
            :ally-unit="store.ally"
            :enemy-unit="store.enemy"
            :current-actor-name="currentActorName"
            :selected-target-name="needsEnemyTarget || needsAllyTarget ? selectedTargetName : null"
            :needs-enemy-target="needsEnemyTarget"
            :needs-ally-target="needsAllyTarget"
            :anim="animEvent"
            @select="onArenaSelect"
          />

          <div v-if="activeAllyUnit" class="actor-status-bar">
            <div class="actor-status-name">{{ activeAllyUnit.name }} · 我方</div>
            <div class="actor-status-badges">
              <span v-if="activeAllyUnit.shield > 0" class="status-badge buff">◆ 护盾 {{ activeAllyUnit.shield }}</span>
              <span v-for="eff in activeAllyUnit.statusEffects" :key="eff.type" class="status-badge" :class="statusTone(eff.type)">{{ statusLabel(eff.type) }} {{ eff.remainingTurns }}T</span>
              <span v-if="activeAllyUnit.statusEffects.length === 0 && activeAllyUnit.shield <= 0" class="status-badge neutral">状态正常</span>
            </div>
          </div>

          <div v-if="targetHintText" class="target-hint">{{ targetHintText }}</div>

          <div v-if="confirmBarText" class="confirm-bar">
            <div class="confirm-info">{{ confirmBarText }}</div>
            <button class="confirm-btn" :disabled="!canConfirm" @click="submitSkill">确认使用技能</button>
            <button class="confirm-btn cancel" @click="cancelSelection">取消</button>
          </div>

          <div class="command-area">
            <div class="command-buttons">
              <button class="action-btn" :class="{ expanded: showSkillPanel }" :disabled="!canAct" @click="showSkillPanel = !showSkillPanel">⚔ 技能</button>
              <button v-if="store.battleType !== 'BOSS'" class="action-btn secondary danger" :disabled="!canAct" @click="onEscape">✕ 逃跑</button>
            </div>

            <SkillPanel
              v-if="showSkillPanel && activeAllyUnit"
              :skills="activeAllySkills"
              :selected-skill-name="selectedSkillName"
              :actor="activeAllyUnit"
              :can-act="canAct"
              @select-skill="onSelectSkill"
            />
          </div>

          <BattleResultModal
            v-if="store.finalResult && store.phase === 'result'"
            :result="store.finalResult"
            :can-capture="canCaptureResult"
            @close="onConfirmResult"
            @restart="onRestart"
            @capture="onStartCapture"
          />

          <CapturePanel
            v-if="store.phase === 'capture_prompt' && store.enemy"
            :enemy="store.enemy"
            :balls="store.captureBalls"
            :preview="store.capturePreview"
            :rolled-result="store.capturePreview?.attempted ? store.capturePreview : null"
            :last-ball-used="store.captureLastBallUsed"
            @select-ball="onSelectCaptureBall"
            @cast="onCastCapture"
            @skip="onSkipCapture"
            @retry="onRetryCapture"
            @confirm="onConfirmResult"
          />
        </main>
      </div>

      <div v-if="store.phase === 'forced_switch' && forcedSwitchOpen" class="forced-switch-mask">
        <div class="forced-switch-dialog">
          <div class="dialog-title">当前战姬已倒下，必须换人</div>
          <div class="dialog-tip">本回合无法出招，请选择下一位出战战姬</div>
          <div class="forced-switch-list">
            <button
              v-for="(u, idx) in store.allyTeam"
              :key="u.name"
              class="forced-switch-unit"
              :class="{ selected: idx === forcedSelectedIndex, defeated: u.HP <= 0 }"
              :disabled="u.HP <= 0 || idx === store.allyActiveIndex"
              @click="forcedSelectedIndex = idx"
            >
              <span>{{ u.name }}</span>
              <span class="unit-hp">HP {{ Math.max(0, u.HP) }}/{{ u.HPMax }}</span>
            </button>
          </div>
          <div class="dialog-actions">
            <button class="dialog-btn confirm" @click="confirmForcedSwitch">确认换人</button>
            <button class="dialog-btn restart" @click="onRestart">重新开始战斗</button>
            <button class="dialog-btn close" @click="forcedSwitchOpen = false">关闭选项框</button>
          </div>
        </div>
      </div>

      <div v-if="store.phase === 'forced_switch'" class="waiting-panel" style="position:absolute;bottom:10px;left:10px;right:10px;">
        <div class="waiting">等待你完成强制换人</div>
        <button v-if="!forcedSwitchOpen" class="reopen-switch-btn" @click="forcedSwitchOpen = true">
          打开换人选项框
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { useBattleStore } from './store';
import { useBattleCommand } from './useBattleCommand';
import { classifyAnimation, defendAnimation, escapeAnimation, ANIM_DURATION } from './anim';
import type { AnimEvent } from './anim';
import TurnOrderBar from './components/TurnOrderBar.vue';
import BattleArena from './components/BattleArena.vue';
import SkillPanel from './components/SkillPanel.vue';
import BattleResultModal from './components/BattleResultModal.vue';
import ItemSelect from './components/ItemSelect.vue';
import CapturePanel from './components/CapturePanel.vue';
import type { BattleItem, BattleUnit, BattleCommand, CaptureAttempt, CaptureBallItem, CaptureballType, StatusEffectType } from './types';

const store = useBattleStore();

const showSkillPanel = ref(false);
const forcedSwitchOpen = ref(true);
const forcedSelectedIndex = ref(0);
const animEvent = ref<AnimEvent | null>(null);
const canCaptureResult = computed(() => {
  if (!store.finalResult) return false;
  return store.finalResult.winner === 'ally' && store.battleType !== 'BOSS';
});

const selectedBallType = ref<CaptureballType | null>(null);

const canAct = computed(() => store.phase === 'selecting');

const currentActorName = computed(() => {
  if (store.phase === 'selecting') return store.ally?.name ?? null;
  return store.ally?.name ?? store.enemy?.name ?? null;
});

const currentActorSide = computed<'ally' | 'enemy'>(() => {
  if (store.phase === 'selecting') return 'ally';
  return store.ally ? 'ally' : 'enemy';
});

const activeAllyUnit = computed(() => store.ally);

const activeAllySkills = computed(() => {
  const unit = store.ally;
  if (!unit) return [];
  return unit.skills.filter(s => s.类型 === '主动');
});

const {
  selectedSkillName, selectedTargetName, selectedSkill,
  activeTargetType, requiresExplicitTarget, isSelfTarget,
  selectSkill, getCooldown, isSkillAvailable, getUnavailableReason, targetTypeText, buildCommand,
} = useBattleCommand(
  computed(() => store.ally),
  canAct,
);

const needsEnemyTarget = computed(() => canAct.value && activeTargetType.value === 'single_enemy');
const needsAllyTarget = computed(() => canAct.value && activeTargetType.value === 'ally');

const canConfirm = computed(() => {
  if (!canAct.value) return false;
  if (!selectedSkill.value) return false;
  const tt = activeTargetType.value;
  if (tt === 'single_enemy' || tt === 'ally') return !!selectedTargetName.value;
  return true;
});

const targetHintText = computed(() => {
  if (!canAct.value || !activeTargetType.value) return '';
  const tt = activeTargetType.value;
  if (tt === 'single_enemy') return '→ 攻击当前敌方出战单位';
  if (tt === 'ally') return '→ 点击友方单位选择目标';
  if (tt === 'all_enemies') return '→ 群体技能，影响所有敌方';
  if (tt === 'all_allies') return '→ 群体技能，影响所有友方';
  if (tt === 'self') return '→ 自身目标';
  return '';
});

const confirmBarText = computed(() => {
  if (!selectedSkill.value) return '';
  const name = selectedSkill.value.name;
  const tt = activeTargetType.value;
  const target = selectedTargetName.value;
  if (tt === 'single_enemy') return `${name} → ${target ?? store.enemy?.name ?? '敌方'}`;
  if (tt === 'ally' || tt === 'self') return `${name} → ${target ?? store.ally?.name ?? '自身'}`;
  if (tt === 'all_enemies') return `${name} → 全体敌人`;
  if (tt === 'all_allies') return `${name} → 全体友方`;
  return `${name}`;
});

const recentLogs = computed(() => store.log.slice(-20));

function barWidth(current: number, max: number) {
  return `${Math.max(0, Math.min(100, (current / Math.max(1, max)) * 100))}%`;
}

function statusTone(type: StatusEffectType): string {
  const debuffs: StatusEffectType[] = ['burn', 'poison', 'freeze', 'paralyze', 'confuse'];
  if (debuffs.includes(type)) return 'debuff';
  if (type.includes('up') || type === 'shield' || type.includes('boost')) return 'buff';
  if (type.includes('down')) return 'debuff';
  return 'neutral';
}

function statusLabel(type: StatusEffectType): string {
  const map: Record<string, string> = {
    burn: '灼烧', poison: '中毒', freeze: '冰冻', paralyze: '麻痹', confuse: '混乱',
    atk_up: '攻↑', atk_down: '攻↓', def_up: '防↑', def_down: '防↓',
    spa_up: '特攻↑', spa_down: '特攻↓', spd_up: '特防↑', spd_down: '特防↓',
    speed_up: '速↑', speed_down: '速↓', acc_up: '命中↑', acc_down: '命中↓',
    eva_up: '闪避↑', eva_down: '闪避↓', shield: '护盾', damage_boost: '增伤', skill_boost: '技强',
  };
  return map[type] ?? type;
}

function fireAnim(event: AnimEvent | null) {
  if (!event) return;
  animEvent.value = event;
  const dur = ANIM_DURATION[event.type] ?? 500;
  nextTick(() => {
    setTimeout(() => { animEvent.value = null; }, dur + 100);
  });
}

function skillAnim(): AnimEvent | null {
  const actor = store.ally;
  const skill = selectedSkill.value;
  if (!actor || !skill) return null;
  const tt = skill.目标类型;
  const targetIds: string[] = [];
  if (tt === 'single_enemy' && store.enemy) targetIds.push(store.enemy.name);
  if ((tt === 'ally' || tt === 'self') && store.ally) targetIds.push(store.ally.name);
  return classifyAnimation(skill, actor.name, 'ally', targetIds);
}

function onSelectSkill(skillName: string) {
  selectSkill(skillName);
}

function cancelSelection() {
  selectedSkillName.value = null;
}

function submitSkill() {
  const cmd = buildCommand();
  if (!cmd) return;

  fireAnim(skillAnim());
  cancelSelection();
  showSkillPanel.value = false;

  if (cmd.action === 'skill') {
    store.executeRound({ action: 'skill', skillName: cmd.skillName });
  }
}

function onEscape() {
  if (store.phase !== 'selecting') return;
  const actor = store.ally;
  if (actor) fireAnim(escapeAnimation(actor.name, 'ally'));
  store.tryEscape();
}

function onUseItem(item: BattleItem) {
  store.useItem(item);
}

function onEnemyStripClick(unit: BattleUnit) {
  if (needsEnemyTarget.value && unit.HP > 0) {
    selectedTargetName.value = unit.name;
  }
}

function onPartyClick(unit: BattleUnit, idx: number) {
  if (needsAllyTarget.value && unit.HP > 0) {
    selectedTargetName.value = unit.name;
    return;
  }
  if (idx !== store.allyActiveIndex && unit.HP > 0) {
    store.executeRound({ action: 'switch', switchToIndex: idx });
  }
}

function onArenaSelect(unit: { name: string; side: string; isAlive: boolean }) {
  if (unit.side === 'enemy' && needsEnemyTarget.value && unit.isAlive) {
    selectedTargetName.value = unit.name;
  } else if (unit.side === 'ally' && needsAllyTarget.value && unit.isAlive) {
    selectedTargetName.value = unit.name;
  }
}

function confirmForcedSwitch() {
  if (store.phase !== 'forced_switch') return;
  store.confirmForcedSwitch(forcedSelectedIndex.value);
  forcedSwitchOpen.value = true;
}

function onConfirmResult() {
  store.emitBattleEnd();
}

function onRestart() {
  store.restartBattle();
}

function onStartCapture() {
  store.phase = 'capture_prompt';
}

function onSelectCaptureBall(ballType: string) {
  selectedBallType.value = ballType as CaptureballType;
  store.previewCapture({ ballType: selectedBallType.value! });
}

function onCastCapture(attempt: CaptureAttempt) {
  selectedBallType.value = attempt.ballType as CaptureballType;
  store.rollCapture(attempt);
}

function onSkipCapture() {
  store.skipCapture();
}

function onRetryCapture() {
  store.resetCapturePreview();
}

function onClose() {
  document.body.style.display = 'none';
  window.parent.postMessage({ type: 'battle-close', source: 'th-battle-ui' }, '*');
}

watch(
  activeTargetType,
  tt => {
    if (tt === 'single_enemy' && store.enemy) {
      selectedTargetName.value = store.enemy.name;
    } else if (tt === 'ally' && store.ally) {
      selectedTargetName.value = store.ally.name;
    } else if (tt === 'self' && store.ally) {
      selectedTargetName.value = store.ally.name;
    }
  },
  { immediate: true },
);

watch(
  () => store.phase,
  phase => {
    if (phase === 'forced_switch') {
      forcedSwitchOpen.value = true;
      forcedSelectedIndex.value = store.allyTeam.findIndex((u, idx) => idx !== store.allyActiveIndex && u.HP > 0);
      if (forcedSelectedIndex.value < 0) forcedSelectedIndex.value = 0;
    }
  },
  { immediate: true },
);
</script>
