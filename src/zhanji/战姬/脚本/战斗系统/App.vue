<template>
  <div class="battle-shell">
    <svg class="frame-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="fg1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffe4a0"/>
          <stop offset="50%" stop-color="#c09030"/>
          <stop offset="100%" stop-color="#ffe4a0"/>
        </linearGradient>
        <pattern id="fp1" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="none"/>
          <path d="M0,10 L10,0 L20,10 L10,20 Z" fill="none" stroke="#d4a44c" stroke-width="1"/>
          <circle cx="10" cy="10" r="1.5" fill="#ffe4a0" opacity="0.5"/>
        </pattern>
      </defs>
      <!-- outer line -->
      <rect x="4" y="4" width="992" height="992" rx="3" fill="none" stroke="url(#fg1)" stroke-width="2.5" opacity="0.7"/>
      <!-- diamond pattern band - top -->
      <rect x="6" y="6" width="988" height="18" fill="url(#fp1)" opacity="0.25"/>
      <!-- diamond pattern band - bottom -->
      <rect x="6" y="976" width="988" height="18" fill="url(#fp1)" opacity="0.25"/>
      <!-- diamond pattern band - left -->
      <rect x="6" y="6" width="18" height="988" fill="url(#fp1)" opacity="0.25"/>
      <!-- diamond pattern band - right -->
      <rect x="976" y="6" width="18" height="988" fill="url(#fp1)" opacity="0.25"/>
      <!-- inner line -->
      <rect x="24" y="24" width="952" height="952" rx="2" fill="none" stroke="#d4a44c" stroke-width="1" opacity="0.35"/>
      <!-- corner diamonds -->
      <path d="M4,15 L15,4 L26,15 L15,26 Z" fill="#ffe4a0" opacity="0.55" stroke="#d4a44c" stroke-width="1"/>
      <path d="M974,4 L985,15 L974,26 L963,15 Z" fill="#ffe4a0" opacity="0.55" stroke="#d4a44c" stroke-width="1"/>
      <path d="M4,985 L15,974 L26,985 L15,996 Z" fill="#ffe4a0" opacity="0.55" stroke="#d4a44c" stroke-width="1"/>
      <path d="M974,996 L985,985 L996,974 L985,963 Z" fill="none" stroke="#d4a44c" stroke-width="0.5" opacity="0"/>
      <path d="M974,974 L985,985 L996,974 L985,963 Z" fill="#ffe4a0" opacity="0.55" stroke="#d4a44c" stroke-width="1"/>
      <path d="M4,974 L15,985 L26,974 L15,963 Z" fill="#ffe4a0" opacity="0.55" stroke="#d4a44c" stroke-width="1"/>
      <!-- edge midpoint accents -->
      <circle cx="500" cy="4" r="3" fill="#ffe4a0" opacity="0.45"/>
      <circle cx="500" cy="996" r="3" fill="#ffe4a0" opacity="0.45"/>
      <circle cx="4" cy="500" r="3" fill="#ffe4a0" opacity="0.45"/>
      <circle cx="996" cy="500" r="3" fill="#ffe4a0" opacity="0.45"/>
    </svg>
    <ItemSelect
      v-if="store.phase === 'item_select'"
      :items="store.availableItems"
      @use="onUseItem"
      @skip="store.skipItem()"
    />

    <template v-else>
      <!-- Top bar: CTB + close (now compact, inside center) -->

      <!-- Three-column layout: left(info) + center(arena) + right(skills) -->
      <div class="battle-three-col">

        <!-- LEFT: enemy + ally info -->
        <aside class="side-col">
          <div class="section-label">敌方</div>
          <div class="side-unit-list">
            <div
              v-for="unit in store.enemyTeam"
              :key="unit.name"
              class="side-unit enemy"
              :class="{
                targeted: selectedTargetName === unit.name && needsEnemyTarget,
                selectable: needsEnemyTarget && unit.HP > 0,
                dead: unit.HP <= 0,
              }"
              @click="onEnemyStripClick(unit)"
            >
              <div class="side-unit-head">
                <div class="side-unit-avatar enemy-avatar" :class="elementClass(unit.元素属性)">
                  <span class="side-avatar-char">{{ unit.name.charAt(0) }}</span>
                </div>
                <div class="side-unit-info">
                  <div class="side-unit-name">
                    {{ unit.name }}
                    <span class="unit-type-tag enemy">{{ unit.战斗类型 || '均衡' }}</span>
                    <button class="stat-toggle-btn" @click.stop="toggleStatExpand('e' + unit.name)" :title="expandedStats.has('e' + unit.name) ? '收起属性' : '展开属性'">{{ expandedStats.has('e' + unit.name) ? '▾' : '▸' }}Lv{{ unit.等级 }}</button>
                  </div>
                </div>
              </div>
              <div class="side-unit-bars">
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
              </div>
              <div v-if="unit.shield > 0" class="enemy-shield">◆ 护盾 {{ unit.shield }}</div>
              <div v-if="unit.statusEffects.length" class="party-statuses">
                <span v-for="eff in unit.statusEffects" :key="eff.type" class="status-badge" :class="statusTone(eff.type)">{{ statusLabel(eff.type) }}</span>
              </div>
              <div v-if="expandedStats.has('e' + unit.name)" class="party-compact-stats">
                <span class="stat-num atk">攻{{ effectiveStat(unit, '攻击力') }}</span>
                <span class="stat-num def">防{{ effectiveStat(unit, '防御力') }}</span>
                <span class="stat-num spa">特攻{{ effectiveStat(unit, '特攻') }}</span>
                <span class="stat-num spd">特防{{ effectiveStat(unit, '特防') }}</span>
                <span class="stat-num sp">速{{ effectiveStat(unit, '速度') }}</span>
              </div>
            </div>
          </div>

          <div class="section-label" style="margin-top: 6px;">我方</div>
          <div class="side-unit-list">
            <div
              v-for="(unit, idx) in store.allyTeam"
              :key="unit.name"
              class="side-unit ally"
              :class="{
                active: idx === store.allyActiveIndex,
                dead: unit.HP <= 0,
                selectable: needsAllyTarget && unit.HP > 0,
                targeted: selectedTargetName === unit.name && needsAllyTarget,
              }"
              @click="onPartyClick(unit, idx)"
            >
              <div class="side-unit-head">
                <div class="side-unit-avatar ally-avatar" :class="elementClass(unit.元素属性)">
                  <span class="side-avatar-char">{{ unit.name.charAt(0) }}</span>
                </div>
                <div class="side-unit-info">
                  <div class="side-unit-name">
                    {{ unit.name }}
                    <span v-if="unit.品质" class="unit-tier">{{ unit.品质 }}</span>
                    <button class="stat-toggle-btn" @click.stop="toggleStatExpand(idx)" :title="expandedStats.has(idx) ? '收起属性' : '展开属性'">{{ expandedStats.has(idx) ? '▾' : '▸' }}Lv{{ unit.等级 }}</button>
                  </div>
                  <span class="unit-type-tag">{{ unit.战斗类型 || '均衡' }}</span>
                </div>
              </div>
              <div class="side-unit-bars">
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
              </div>
              <div v-if="unit.shield > 0" class="party-shield">◆ 护盾 {{ unit.shield }}</div>
              <div v-if="unit.statusEffects.length" class="party-statuses">
                <span v-for="eff in unit.statusEffects" :key="eff.type" class="status-badge" :class="statusTone(eff.type)">{{ statusLabel(eff.type) }}</span>
              </div>
              <div v-if="expandedStats.has(idx)" class="party-compact-stats">
                <span class="stat-num atk">攻{{ effectiveStat(unit, '攻击力') }}</span>
                <span class="stat-num def">防{{ effectiveStat(unit, '防御力') }}</span>
                <span class="stat-num spa">特攻{{ effectiveStat(unit, '特攻') }}</span>
                <span class="stat-num spd">特防{{ effectiveStat(unit, '特防') }}</span>
                <span class="stat-num sp">速{{ effectiveStat(unit, '速度') }}</span>
              </div>
            </div>
          </div>
        </aside>

        <!-- CENTER: CTB + arena -->
        <main class="center-col">
          <div class="battle-top-bar">
            <TurnOrderBar
              :ctb-order="store.ctbOrder"
              :current-actor-name="currentActorName"
            />
            <div class="toolbar-btn-group">
              <button v-if="store.battleType !== 'BOSS'" class="action-btn secondary danger escape-top-btn" :disabled="!canAct" @click="onEscape">✕ 逃跑</button>
              <button class="toolbar-close-btn" title="关闭战斗界面" @click="onClose">✕ 关闭</button>
            </div>
          </div>

          <!-- Round info -->
          <div class="prompt-bar">
            <div class="round-info">
              <span class="round-info-round">R{{ store.round }}</span>
              <span v-if="currentActorName" class="round-info-actor">
                <span class="round-info-dot" :class="currentActorSide === 'ally' ? 'ally-dot' : 'enemy-dot'"></span>
                {{ currentActorName }}
              </span>
              <span v-if="store.phase === 'selecting'" class="turn-state-pill player">◈ 你的回合</span>
              <span v-else-if="store.phase === 'animating'" class="turn-state-pill system">◇ 处理中</span>
            </div>
          </div>

          <div class="battle-arena-wrap" :style="arenaWrapStyle">
            <Transition name="skill-flash">
              <div v-if="flashSkillName" class="skill-flash-overlay" :class="flashSkillSide === 'enemy' ? 'flash-enemy' : 'flash-ally'">
                <span class="skill-flash-text">{{ flashSkillName }}</span>
              </div>
            </Transition>
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
          </div>

          </main>

        <!-- RIGHT: skill list -->
        <aside class="skill-col">
          <div class="section-label">技能</div>
          <div v-if="activeAllyUnit" class="skill-scroll">
            <SkillPanel
              :skills="activeAllySkills"
              :selected-skill-name="selectedSkillName"
              :actor="activeAllyUnit"
              :can-act="canAct"
              @select-skill="onSelectSkill"
            />
          </div>
          <div v-else class="skill-empty">无出战战姬</div>
        </aside>
      </div>

      <!-- BOTTOM: log bar -->
      <div class="battle-log-bar" :class="{ expanded: logExpanded }">
        <div class="log-bar-header" @click="logExpanded = !logExpanded">
          <span class="section-label clickable">
            日志 <span class="log-toggle">{{ logExpanded ? '▾' : '▸' }}</span>
          </span>
        </div>
        <div v-if="logExpanded" class="log-scroll">
          <div v-for="(entry, i) in recentLogs" :key="i" class="log-item-sm" :class="entry.type">
            <span v-if="entry.turn" class="log-turn-sm">T{{ entry.turn }}</span>
            {{ entry.message }}
          </div>
          <div v-if="store.log.length === 0" class="empty-text">暂无日志</div>
        </div>
        <div v-else class="log-latest">
          <div v-if="store.log.length > 0" class="log-item-sm" :class="store.log[store.log.length - 1]?.type">
            <span v-if="store.log[store.log.length - 1]?.turn" class="log-turn-sm">T{{ store.log[store.log.length - 1]?.turn }}</span>
            {{ store.log[store.log.length - 1]?.message }}
          </div>
          <div v-else class="empty-text">暂无日志</div>
        </div>
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

      <div v-if="showConfirmDialog && selectedSkill && canAct" class="skill-confirm-overlay" @click.self="cancelSelection">
        <div class="skill-confirm-box">
          <div class="skill-confirm-frame-tl"></div>
          <div class="skill-confirm-frame-tr"></div>
          <div class="skill-confirm-frame-bl"></div>
          <div class="skill-confirm-frame-br"></div>
          <div class="skill-confirm-title">{{ selectedSkill.name }}</div>
          <div class="skill-confirm-info">
            <span class="skill-confirm-type">{{ targetTypeText(selectedSkill.目标类型) }}</span>
            <span class="skill-confirm-elem">{{ selectedSkill.元素属性 }}</span>
            <span class="skill-confirm-mp">MP {{ selectedSkill.消耗MP }}</span>
            <span class="skill-confirm-power">威力 {{ selectedSkill.基础威力 }}</span>
          </div>
          <div v-if="selectedSkill.描述" class="skill-confirm-desc">{{ selectedSkill.描述 }}</div>
          <div class="skill-confirm-actions">
            <button class="skill-confirm-btn go" :disabled="!canConfirm" @click="submitSkill">确认释放</button>
            <button class="skill-confirm-btn cancel" @click="cancelSelection">取消</button>
          </div>
        </div>
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
import type { BattleItem, BattleUnit, CaptureAttempt, CaptureBallItem, CaptureballType, StatusEffectType } from './types';
import { getBackgroundUrl } from './battle-assets';

const store = useBattleStore();

const forcedSwitchOpen = ref(true);
const forcedSelectedIndex = ref(0);
const animEvent = ref<AnimEvent | null>(null);
const logExpanded = ref(false);
const flashSkillName = ref('');
const flashSkillSide = ref<'ally' | 'enemy'>('ally');
const expandedStats = ref(new Set<number | string>());
const showConfirmDialog = ref(false);

function toggleStatExpand(key: number | string) {
  if (expandedStats.value.has(key)) {
    expandedStats.value.delete(key);
  } else {
    expandedStats.value.add(key);
  }
}

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

const arenaWrapStyle = computed(() => {
  const url = getBackgroundUrl(store.location);
  if (!url) return {};
  return { backgroundImage: `url('${url}')`, backgroundSize: 'cover', backgroundPosition: 'center' };
});

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
    burn: '灼烧', poison: '中毒', freeze: '冰冻', paralyze: '麻痹', confuse: '混乱', bleed: '流血',
    atk_up: '攻↑', atk_down: '攻↓', def_up: '防↑', def_down: '防↓',
    spa_up: '特攻↑', spa_down: '特攻↓', spd_up: '特防↑', spd_down: '特防↓',
    speed_up: '速↑', speed_down: '速↓', acc_up: '命中↑', acc_down: '命中↓',
    eva_up: '闪避↑', eva_down: '闪避↓', shield: '护盾', damage_boost: '增伤', skill_boost: '技强',
    all_up: '全↑', all_down: '全↓',
  };
  return map[type] ?? type;
}

function effectiveStat(unit: BattleUnit, stat: '攻击力' | '防御力' | '特攻' | '特防' | '速度'): number {
  const statMap: Record<string, [StatusEffectType, StatusEffectType]> = {
    攻击力: ['atk_up', 'atk_down'],
    防御力: ['def_up', 'def_down'],
    特攻: ['spa_up', 'spa_down'],
    特防: ['spd_up', 'spd_down'],
    速度: ['speed_up', 'speed_down'],
  };
  const [upType, downType] = statMap[stat];
  let base = unit[stat];
  for (const eff of unit.statusEffects) {
    if (eff.type === upType) base = Math.floor(base * (1 + eff.value));
    if (eff.type === downType) base = Math.floor(base * (1 - eff.value));
  }
  return Math.max(1, base);
}

function elementClass(elem: string | undefined): string {
  if (!elem) return '';
  const map: Record<string, string> = {
    '火': 'elem-fire', '水': 'elem-water', '草': 'elem-grass', '风': 'elem-grass',
    '电': 'elem-thunder', '冰': 'elem-ice', '格斗': 'elem-fight',
    '毒': 'elem-poison', '地面': 'elem-ground', '土': 'elem-ground', '飞行': 'elem-fly',
    '超能': 'elem-psychic', '虫': 'elem-bug', '岩石': 'elem-rock',
    '幽灵': 'elem-ghost', '龙': 'elem-dragon', '恶': 'elem-dark',
    '钢': 'elem-steel', '妖精': 'elem-fairy', '光': 'elem-light',
    '暗': 'elem-dark2', '无': '',
  };
  return map[elem] ?? '';
}

function fireAnim(event: AnimEvent | null) {
  if (!event) return;
  animEvent.value = event;
  const dur = ANIM_DURATION[event.type] ?? 500;
  nextTick(() => {
    setTimeout(() => { animEvent.value = null; }, dur + 100);
  });
}

function showSkillFlash(name: string, side: 'ally' | 'enemy') {
  flashSkillName.value = name;
  flashSkillSide.value = side;
  setTimeout(() => { flashSkillName.value = ''; }, 2200);
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
  showConfirmDialog.value = true;
}

function cancelSelection() {
  selectedSkillName.value = null;
  showConfirmDialog.value = false;
}

function submitSkill() {
  const cmd = buildCommand();
  if (!cmd) return;

  showConfirmDialog.value = false;
  const allyAnim = skillAnim();
  fireAnim(allyAnim);
  cancelSelection();

  if (cmd.action === 'skill' && selectedSkill.value) {
    showSkillFlash(selectedSkill.value.name, 'ally');
  }

  if (cmd.action === 'skill') {
    store.executeRound({ action: 'skill', skillName: cmd.skillName });
  }

  const allyDur = (allyAnim ? ANIM_DURATION[allyAnim.type] : 400) + 50;
  const ENEMY_DELAY = 800;
  setTimeout(() => {
    const enemyActs = store.lastActions.filter(a => a.attackerSide === 'enemy');
    if (enemyActs.length > 0) {
      const ea = enemyActs[0];
      if (ea.skillName) showSkillFlash(ea.skillName, 'enemy');
      const enemyAnimType = ea.damage > 0 && !ea.isMissed ? 'single_attack'
        : ea.healed > 0 ? 'single_heal'
        : 'apply_status';
      fireAnim({
        type: enemyAnimType,
        actorId: ea.attacker,
        targetIds: [ea.defender],
        actorSide: 'enemy',
        targetSide: 'ally',
      });
    }
  }, allyDur + ENEMY_DELAY);
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
  window.parent.postMessage({ type: 'battle-close', source: 'th-battle-ui' }, '*');
  const el = window.frameElement as HTMLElement | null;
  if (el) el.style.display = 'none';
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