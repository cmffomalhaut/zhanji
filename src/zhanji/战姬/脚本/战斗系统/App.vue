<template>
  <div class="battle-shell">
    <div class="arena-ground"></div>

    <ItemSelect
      v-if="store.phase === 'item_select'"
      :items="store.availableItems"
      @use="onUseItem"
      @skip="store.skipItem()"
    />

    <CapturePanel
      v-if="store.phase === 'capture_prompt' && store.enemy"
      :key="`${store.enemy.name}-${store.completedCaptures.length}`"
      :enemy="store.enemy"
      :balls="store.captureBalls"
      :preview="store.capturePreview"
      :rolled-result="store.capturePreview?.attempted ? store.capturePreview : null"
      :last-ball-used="store.captureLastBallUsed ?? null"
      :enemy-escaped="store.enemyEscapedDuringCapture"
      @select-ball="onSelectCaptureBall"
      @cast="onCastCapture"
      @skip="onSkipCapture"
      @retry="onRetryCapture"
      @confirm="onConfirmCapture"
    />

    <template v-if="store.phase !== 'item_select' && store.phase !== 'capture_prompt'">
      <!-- TOP HUD -->
      <div class="top-hud">
        <div class="hud-left">
          <div class="glass hud-badge">
            <Swords :size="14" color="#a78bfa" />
            <span style="font-family:var(--font-display);font-size:12px;font-weight:700;letter-spacing:0.08em;color:var(--accent-light);">BATTLE</span>
          </div>
          <div class="glass hud-round-info">
            <span class="round-label">ROUND</span>
            <span class="round-num">{{ store.round }}</span>
          </div>
          <div class="hud-ctb-wrap">
            <div class="hud-ctb-scroll">
              <div
                v-for="unit in store.ctbOrder"
                :key="unit.name"
                class="ctb-hud-pill"
                :class="[unit.side, { current: unit.name === currentActorName, dead: unit.hp <= 0 }]"
              >
                <span class="ctb-hud-dot" :class="unit.side"></span>
                <span>{{ unit.name }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="hud-center">
          <div class="hud-vs-label">VS</div>
          <div class="hud-vs-sub" v-if="enemyTrainerText">{{ enemyTrainerText }}</div>
          <div class="hud-vs-sub" v-else>
            {{ store.battleType === '捕获' ? 'WILD ENCOUNTER' : store.battleType === 'BOSS' ? 'BOSS BATTLE' : 'TRAINER BATTLE' }}
          </div>
        </div>

        <div class="hud-right">
          <button v-if="store.battleType !== 'BOSS'" class="glass hud-btn danger" :disabled="!canAct" @click="onEscape">
            <LogOut :size="14" color="#f87171" />
            <span>逃跑</span>
          </button>
          <button class="glass hud-btn" @click="onClose">
            <X :size="14" color="#94a3b8" />
            <span>关闭</span>
          </button>
          <button class="glass hud-btn" @click="onRestart">
            <RotateCcw :size="14" color="#94a3b8" />
            <span>重来</span>
          </button>
        </div>
      </div>

      <!-- BATTLE FIELD -->
      <div class="battle-field">
        <Transition name="skill-flash">
          <div v-if="flashSkillName" class="skill-flash-overlay" :class="flashSkillSide === 'enemy' ? 'flash-enemy' : 'flash-ally'">
            <span class="skill-flash-text">{{ flashSkillName }}</span>
          </div>
        </Transition>

        <div class="field-vs">VS</div>

        <!-- Enemy sprite -->
        <div
          class="field-sprite-wrap enemy-side"
          :class="{
            selectable: needsEnemyTarget && (enemyUnit?.HP ?? 0) > 0,
            targeted: selectedTargetName === enemyUnit?.name && needsEnemyTarget,
            dead: !enemyUnit || enemyUnit.HP <= 0
          }"
          @click="onFieldClick('enemy')"
        >
          <div class="field-sprite-inner" :class="[enemyAnimClass]">
            <div class="aura-ring" style="width:160px;height:46px;top:78%;left:50%;transform:translate(-50%,-50%);--ring-color:rgba(239,68,68,0.35);"></div>
            <div class="aura-ring" style="width:140px;height:38px;top:78%;left:50%;transform:translate(-50%,-50%);--ring-color:rgba(239,68,68,0.5);animation-delay:0.7s;"></div>
            <img
              class="field-sprite-img"
              :src="enemyPortrait"
              :alt="enemyUnit?.name"
            />
          </div>
          <div class="platform-shadow" style="width:180px;height:30px;bottom:-10px;left:50%;transform:translateX(-50%);"></div>
          <div class="field-sprite-name">{{ enemyUnit?.name ?? '—' }}</div>
        </div>

        <!-- Ally sprite -->
        <div
          class="field-sprite-wrap ally-side"
          :class="{
            selectable: needsAllyTarget && (allyUnit?.HP ?? 0) > 0,
            targeted: selectedTargetName === allyUnit?.name && needsAllyTarget,
            dead: !allyUnit || allyUnit.HP <= 0
          }"
          @click="onFieldClick('ally')"
        >
          <div class="field-sprite-inner" :class="[allyAnimClass]">
            <div class="aura-ring" style="width:160px;height:44px;top:80%;left:50%;transform:translate(-50%,-50%);--ring-color:rgba(52,211,153,0.35);animation-delay:0.3s;"></div>
            <div class="aura-ring" style="width:140px;height:36px;top:80%;left:50%;transform:translate(-50%,-50%);--ring-color:rgba(52,211,153,0.5);animation-delay:1s;"></div>
            <img
              class="field-sprite-img"
              :src="allyPortrait"
              :alt="allyUnit?.name"
            />
          </div>
          <div class="platform-shadow" style="width:220px;height:35px;bottom:-12px;left:50%;transform:translateX(-50%);"></div>
          <div class="field-sprite-name">{{ allyUnit?.name ?? '—' }}</div>
        </div>
      </div>

      <!-- ENEMY INFO CARD -->
      <div v-if="enemyUnit" class="info-card enemy-card glass-bold">
        <div class="attack-flash" id="enemy-flash"></div>
        <div class="info-card-head">
          <div>
            <div class="info-card-name-row">
              <span class="info-card-name">{{ enemyUnit.name }}</span>
              <span v-if="enemyUnit.品质" class="type-badge" :class="qualityBadgeClass(enemyUnit.品质)">{{ enemyUnit.品质 }}</span>
            </div>
            <div class="info-card-types">
              <span class="type-badge" :class="elementBadgeClass(enemyUnit.元素属性)">{{ enemyUnit.元素属性 || '无' }}</span>
              <span v-for="s in statusList(enemyUnit).slice(0, 2)" :key="s.key" class="status-badge" :class="s.tone">{{ s.text }}</span>
            </div>
            <div v-if="enemyTrainerText" class="info-card-trainer">训练家: {{ enemyTrainerText }}</div>
          </div>
          <div class="info-card-level-wrap">
            <div class="info-card-level-label">LV</div>
            <div class="info-card-level-val">{{ enemyUnit.等级 }}</div>
            <button class="stat-toggle-btn" @click="toggleStatExpand(`enemy-${enemyUnit.name}`)">
              {{ isStatExpanded(`enemy-${enemyUnit.name}`) ? '收起' : '属性' }}
            </button>
          </div>
        </div>
        <div class="info-card-bars">
          <div class="info-card-bar-row">
            <span class="info-card-bar-label hp">HP</span>
            <div class="info-card-bar-track">
              <div class="info-card-bar-fill hp" :class="hpColor(enemyUnit)" :style="{ width: barWidth(enemyUnit.HP, enemyUnit.HPMax) }"></div>
            </div>
            <span class="info-card-bar-val">{{ Math.max(0, enemyUnit.HP) }} / {{ enemyUnit.HPMax }}</span>
          </div>
          <div class="info-card-bar-row">
            <span class="info-card-bar-label mp">MP</span>
            <div class="info-card-bar-track">
              <div class="info-card-bar-fill mp" :style="{ width: barWidth(enemyUnit.MP, enemyUnit.MPMax) }"></div>
            </div>
            <span class="info-card-bar-val">{{ enemyUnit.MP }} / {{ enemyUnit.MPMax }}</span>
          </div>
        </div>
        <div v-if="isStatExpanded(`enemy-${enemyUnit.name}`)" class="info-card-stats">
          <span>攻 {{ effectiveStat(enemyUnit, '攻击力') }}</span>
          <span>防 {{ effectiveStat(enemyUnit, '防御力') }}</span>
          <span>特攻 {{ effectiveStat(enemyUnit, '特攻') }}</span>
          <span>特防 {{ effectiveStat(enemyUnit, '特防') }}</span>
          <span>速 {{ effectiveStat(enemyUnit, '速度') }}</span>
          <span v-if="damageBoostMultiplier(enemyUnit) !== 1">伤害 x{{ damageBoostMultiplier(enemyUnit).toFixed(2) }}</span>
        </div>
        <div v-if="enemyUnit.shield > 0" class="info-card-shield">◆ 护盾 {{ enemyUnit.shield }}</div>
        <div v-if="enemyUnit.statusEffects.length > 2" class="info-card-statuses">
          <span v-for="eff in enemyUnit.statusEffects" :key="eff.type" class="status-badge" :class="statusTone(eff.type)">{{ statusText(eff) }}</span>
        </div>
      </div>

      <!-- BOTTOM PANEL -->
      <div class="bottom-panel">
        <div class="bottom-left">
          <div class="tab-bar">
            <button class="tab-btn" :class="{ active: activeTab === '技能' }" @click="activeTab = '技能'">技能</button>
            <button class="tab-btn" :class="{ active: activeTab === '道具' }" @click="activeTab = '道具'">道具</button>
            <button class="tab-btn" :class="{ active: activeTab === '队伍' }" @click="activeTab = '队伍'">队伍</button>
            <button class="tab-btn" :class="{ active: activeTab === '撤退' }" @click="activeTab = '撤退'">撤退</button>
          </div>

          <div class="tab-content">
            <!-- 技能 Tab -->
            <template v-if="activeTab === '技能'">
              <div v-if="currentPageSkills.length === 0" class="empty-text">当前无可用的主动技能</div>
              <template v-else>
                <div class="skill-grid-2x2">
                  <button
                    v-for="skill in currentPageSkills"
                    :key="skill.name"
                    class="move-btn"
                    :class="{
                      selected: selectedSkillName === skill.name && canAct,
                      [elementBadgeClass(skill.元素属性)]: true,
                    }"
                    :disabled="!canAct || !isSkillAvailable(allyUnit, skill)"
                    @click="onSelectSkill(skill.name)"
                    @mouseenter="hoveredSkillName = skill.name"
                    @mouseleave="hoveredSkillName = null"
                  >
                    <div v-if="!canAct || !isSkillAvailable(allyUnit, skill)" class="disabled-overlay">
                      {{ getUnavailableReason(allyUnit, skill) }}
                    </div>
                    <div class="move-btn-head">
                      <div>
                        <div class="move-btn-name">{{ skill.name }}</div>
                        <span class="type-badge" :class="elementBadgeClass(skill.元素属性)">{{ skill.元素属性 || '无' }}</span>
                      </div>
                      <div style="text-align:right;">
                        <div style="font-size:10px;color:var(--text-muted);font-weight:600;margin-bottom:2px;">PWR</div>
                        <div class="move-btn-power" :class="elementPowerColor(skill.元素属性)">{{ skill.基础威力 }}</div>
                      </div>
                    </div>
                    <div class="move-btn-cost" :class="allyUnit && allyUnit.MP >= skill.消耗MP ? 'move-btn-cost-ok' : 'move-btn-cost-nomoney'">
                      MP {{ skill.消耗MP }}
                      <template v-if="getCooldown(allyUnit, skill.name) > 0">
                        · CD {{ skill.冷却回合 }} (剩{{ getCooldown(allyUnit, skill.name) }})
                      </template>
                    </div>
                  </button>
                </div>
                <div v-if="totalSkillPages > 1" class="skill-page-nav">
                  <button class="page-nav-btn" :disabled="skillPage <= 0" @click="skillPage--">◀</button>
                  <span class="page-nav-label">{{ skillPage + 1 }} / {{ totalSkillPages }}</span>
                  <button class="page-nav-btn" :disabled="skillPage >= totalSkillPages - 1" @click="skillPage++">▶</button>
                </div>
              </template>
            </template>

            <!-- 道具 Tab -->
            <template v-if="activeTab === '道具'">
              <div v-if="store.availableItems.length === 0" class="empty-text">暂无可用道具</div>
              <div v-else class="item-grid">
                <button
                  v-for="item in store.availableItems"
                  :key="item.name"
                  class="item-card"
                  @click="onUseItem(item)"
                >
                  <div class="item-card-icon">{{ categoryIcon(item.category) }}</div>
                  <div class="item-card-name" style="color:var(--accent-light);">{{ item.name }}</div>
                  <div class="item-card-count">×{{ item.count }}</div>
                </button>
              </div>
            </template>

            <!-- 队伍 Tab -->
            <template v-if="activeTab === '队伍'">
              <div class="team-list">
                <div
                  v-for="(unit, idx) in store.allyTeam"
                  :key="unit.name"
                  class="team-row"
                  :class="{
                    active: idx === store.allyActiveIndex,
                    dead: unit.HP <= 0,
                  }"
                  @click="onTeamSwitch(unit, idx)"
                >
                  <div class="team-row-avatar">{{ unit.name.charAt(0) }}</div>
                  <div class="team-row-info">
                    <div class="team-row-name-row">
                      <span class="team-row-name">{{ unit.name }}</span>
                      <div class="team-row-meta">
                        <span v-if="unit.品质" class="team-row-quality">{{ unit.品质 }}</span>
                        <span v-if="idx === store.allyActiveIndex" class="team-row-active-tag">出战</span>
                      </div>
                    </div>
                    <div class="team-row-bar-track">
                      <div class="team-row-bar-fill hp" :class="unit.HP / Math.max(1, unit.HPMax) <= 0.25 ? 'hp-low' : ''" :style="{ width: barWidth(unit.HP, unit.HPMax) }"></div>
                    </div>
                    <div class="team-row-hp-text">{{ Math.max(0, unit.HP) }} / {{ unit.HPMax }} HP</div>
                  </div>
                </div>
              </div>
            </template>

            <!-- 撤退 Tab -->
            <template v-if="activeTab === '撤退'">
              <div class="retreat-confirm">
                <div class="retreat-icon">🏃</div>
                <div class="retreat-title">确定要逃跑吗？</div>
                <div class="retreat-sub">{{ store.battleType === '捕获' ? '野生战姬可能阻止你逃跑' : '对手可能会追击' }}</div>
                <div class="retreat-actions">
                  <button class="retreat-btn-flee" @click="onEscapeFromTab">逃跑</button>
                  <button class="retreat-btn-cancel" @click="activeTab = '技能'">取消</button>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div class="bottom-right">
          <!-- ALLY INFO CARD -->
          <div v-if="allyUnit" class="info-card ally-card glass-bold">
            <div class="attack-flash" id="ally-flash"></div>
            <div class="info-card-head">
              <div>
                <div class="info-card-name-row">
                  <span class="info-card-name">{{ allyUnit.name }}</span>
                  <span v-if="allyUnit.品质" class="type-badge" :class="qualityBadgeClass(allyUnit.品质)">{{ allyUnit.品质 }}</span>
                </div>
                <div class="info-card-types">
                  <span class="type-badge" :class="elementBadgeClass(allyUnit.元素属性)">{{ allyUnit.元素属性 || '无' }}</span>
                  <span v-for="s in statusList(allyUnit).slice(0, 2)" :key="s.key" class="status-badge" :class="s.tone">{{ s.text }}</span>
                </div>
              </div>
              <div class="info-card-level-wrap">
                <div class="info-card-level-label">LV</div>
                <div class="info-card-level-val">{{ allyUnit.等级 }}</div>
                <button class="stat-toggle-btn" @click="toggleStatExpand(`ally-${allyUnit.name}`)">
                  {{ isStatExpanded(`ally-${allyUnit.name}`) ? '收起' : '属性' }}
                </button>
              </div>
            </div>
            <div class="info-card-bars">
              <div class="info-card-bar-row">
                <span class="info-card-bar-label hp">HP</span>
                <div class="info-card-bar-track">
                  <div class="info-card-bar-fill hp" :class="hpColor(allyUnit)" :style="{ width: barWidth(allyUnit.HP, allyUnit.HPMax) }"></div>
                </div>
                <span class="info-card-bar-val">{{ Math.max(0, allyUnit.HP) }} / {{ allyUnit.HPMax }}</span>
              </div>
              <div class="info-card-bar-row">
                <span class="info-card-bar-label mp">MP</span>
                <div class="info-card-bar-track">
                  <div class="info-card-bar-fill mp" :style="{ width: barWidth(allyUnit.MP, allyUnit.MPMax) }"></div>
                </div>
                <span class="info-card-bar-val">{{ allyUnit.MP }} / {{ allyUnit.MPMax }}</span>
              </div>
            </div>
            <div v-if="isStatExpanded(`ally-${allyUnit.name}`)" class="info-card-stats">
              <span>攻 {{ effectiveStat(allyUnit, '攻击力') }}</span>
              <span>防 {{ effectiveStat(allyUnit, '防御力') }}</span>
              <span>特攻 {{ effectiveStat(allyUnit, '特攻') }}</span>
              <span>特防 {{ effectiveStat(allyUnit, '特防') }}</span>
              <span>速 {{ effectiveStat(allyUnit, '速度') }}</span>
              <span v-if="damageBoostMultiplier(allyUnit) !== 1">伤害 x{{ damageBoostMultiplier(allyUnit).toFixed(2) }}</span>
            </div>
            <div v-if="allyUnit.shield > 0" class="info-card-shield">◆ 护盾 {{ allyUnit.shield }}</div>
            <div v-if="allyUnit.statusEffects.length > 2" class="info-card-statuses">
              <span v-for="eff in allyUnit.statusEffects" :key="eff.type" class="status-badge" :class="statusTone(eff.type)">{{ statusText(eff) }}</span>
            </div>
          </div>

          <!-- BATTLE LOG (right) -->
          <div class="battle-log-panel dialog-glass">
            <div class="log-panel-header">
              <div style="display:flex;align-items:center;gap:6px;">
                <ScrollText :size="13" color="#a78bfa" />
                <span class="section-label">战斗日志</span>
              </div>
            </div>
            <div class="log-scroll">
              <div v-for="(entry, i) in recentLogs" :key="i" class="log-item" :class="entry.type">
                <span v-if="entry.turn" class="log-turn-badge">T{{ entry.turn }}</span>
                {{ entry.message }}
              </div>
              <div v-if="store.log.length === 0" class="empty-text" style="padding:8px 0;">暂无日志</div>
            </div>
            <div class="log-current-action">
              <p class="log-action-text">{{ statusMessage }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- SKILL CONFIRM DIALOG -->
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

      <!-- FORCED SWITCH -->
      <div v-if="store.phase === 'forced_switch' && forcedSwitchOpen" class="forced-switch-mask">
        <div class="forced-switch-dialog">
          <div class="forced-switch-title">当前战姬已倒下，必须换人</div>
          <div class="forced-switch-tip">本回合无法出招，请选择下一位出战战姬</div>
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
              <span class="unit-hp-text">HP {{ Math.max(0, u.HP) }} / {{ u.HPMax }}</span>
            </button>
          </div>
          <div class="dialog-actions">
            <button class="dialog-btn confirm" @click="confirmForcedSwitch">确认换人</button>
            <button class="dialog-btn restart" @click="onRestart">重新开始战斗</button>
            <button class="dialog-btn close-btn" @click="forcedSwitchOpen = false">关闭选项框</button>
          </div>
        </div>
      </div>

      <div v-if="store.phase === 'forced_switch'" class="waiting-panel">
        <div class="waiting-text">等待你完成强制换人</div>
        <button v-if="!forcedSwitchOpen" class="reopen-btn" @click="forcedSwitchOpen = true">打开换人选项框</button>
      </div>

      <!-- BATTLE RESULT -->
      <BattleResultModal
        v-if="store.finalResult && store.phase === 'result'"
        :result="store.finalResult"
        :can-capture="canCaptureResult"
        @close="onConfirmResult"
        @restart="onRestart"
        @capture="onStartCapture"
      />
    </template>

    <!-- ITEM CONFIRM DIALOG -->
    <div v-if="showItemConfirmDialog && selectedItem && canUseItem" class="skill-confirm-overlay" @click.self="cancelItemUse">
      <div class="skill-confirm-box">
        <div class="skill-confirm-frame-tl"></div>
        <div class="skill-confirm-frame-tr"></div>
        <div class="skill-confirm-frame-bl"></div>
        <div class="skill-confirm-frame-br"></div>
        <div class="skill-confirm-title">{{ selectedItem.name }}</div>
        <div class="skill-confirm-info">
          <span class="skill-confirm-type">{{ selectedItem.category }}</span>
          <span class="skill-confirm-mp">持有 {{ selectedItem.count }}</span>
        </div>
        <div class="skill-confirm-desc">确认使用该道具？使用后将消耗本回合。</div>
        <div class="skill-confirm-actions">
          <button class="skill-confirm-btn go" @click="confirmItemUse">确认使用</button>
          <button class="skill-confirm-btn cancel" @click="cancelItemUse">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { Swords, LogOut, X, RotateCcw, ScrollText } from 'lucide-vue-next';
import { useBattleStore } from './store';
import { useBattleCommand } from './useBattleCommand';
import { classifyAnimation, defendAnimation, escapeAnimation, ANIM_DURATION } from './anim';
import type { AnimEvent } from './anim';
import BattleResultModal from './components/BattleResultModal.vue';
import ItemSelect from './components/ItemSelect.vue';
import CapturePanel from './components/CapturePanel.vue';
import type { BattleItem, BattleUnit, CaptureAttempt, CaptureballType, StatusEffect, StatusEffectType } from './types';
import { getPortraitUrl } from './battle-assets';

const store = useBattleStore();

const activeTab = ref<'技能' | '道具' | '队伍' | '撤退'>('技能');
const skillPage = ref(0);
const forcedSwitchOpen = ref(true);
const forcedSelectedIndex = ref(0);
const animEvent = ref<AnimEvent | null>(null);
const flashSkillName = ref('');
const flashSkillSide = ref<'ally' | 'enemy'>('ally');
const showConfirmDialog = ref(false);
const hoveredSkillName = ref<string | null>(null);
const selectedBallType = ref<string | null>(null);
const showItemConfirmDialog = ref(false);
const selectedItem = ref<BattleItem | null>(null);
const expandedStats = ref<Set<string>>(new Set());

const allyUnit = computed(() => store.ally);
const enemyUnit = computed(() => store.enemy);

const canAct = computed(() => store.phase === 'selecting');
const canUseItem = computed(() => store.phase === 'selecting' || store.phase === 'item_select');

const currentActorName = computed(() => {
  if (store.phase === 'selecting') return store.ally?.name ?? null;
  return store.ally?.name ?? store.enemy?.name ?? null;
});

const canCaptureResult = computed(() => {
  if (!store.finalResult) return false;
  return store.finalResult.winner === 'ally';
});

const enemyTrainerText = computed(() => '');

const statusMessage = computed(() => {
  if (store.phase === 'selecting') return '请选择行动！';
  if (store.phase === 'animating') return '行动处理中...';
  if (store.phase === 'forced_switch') return '当前战姬已倒下，请换人！';
  if (store.phase === 'capture_prompt') return '捕捉中...';
  return '';
});

const activeAllySkills = computed(() => {
  const unit = store.ally;
  if (!unit) return [];
  return unit.skills.filter(s => s.类型 === '主动');
});

const totalSkillPages = computed(() => Math.max(1, Math.ceil(activeAllySkills.value.length / 4)));

const currentPageSkills = computed(() => {
  const start = skillPage.value * 4;
  return activeAllySkills.value.slice(start, start + 4);
});

const {
  selectedSkillName, selectedTargetName, selectedSkill,
  activeTargetType,
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

const recentLogs = computed(() => store.log.slice(-20));

const allyPortrait = computed(() => allyUnit.value ? getPortraitUrl(allyUnit.value.name, allyUnit.value.性格, 'ally') : '');
const enemyPortrait = computed(() => enemyUnit.value ? getPortraitUrl(enemyUnit.value.name, enemyUnit.value.性格, 'enemy') : '');

const isActor = computed(() => animEvent.value?.actorId ?? null);
const isTargetSet = computed(() => {
  if (!animEvent.value) return new Set<string>();
  if (animEvent.value.targetIds.length > 0) return new Set(animEvent.value.targetIds);
  return new Set<string>();
});

const allyAnimClass = computed(() => {
  if (!animEvent.value || !allyUnit.value) return '';
  const u = allyUnit.value;
  if (u.name === isActor.value) return 'animate-float anim-actor-melee';
  if (isTargetSet.value.has(u.name)) return 'animate-float anim-hit';
  return 'animate-float';
});

const enemyAnimClass = computed(() => {
  if (!animEvent.value || !enemyUnit.value) return '';
  const u = enemyUnit.value;
  if (u.name === isActor.value) return 'animate-float-slow anim-actor-melee';
  if (isTargetSet.value.has(u.name)) return 'animate-float-slow anim-hit';
  return 'animate-float-slow';
});

const DEBUFF_TYPES: StatusEffectType[] = ['burn', 'poison', 'freeze', 'paralyze', 'confuse'];

function barWidth(current: number, max: number) {
  return `${Math.max(0, Math.min(100, (current / Math.max(1, max)) * 100))}%`;
}

function hpColor(unit: BattleUnit): string {
  const pct = unit.HP / Math.max(1, unit.HPMax);
  if (pct > 0.6) return 'hp-high';
  if (pct > 0.25) return 'hp-mid';
  return 'hp-low';
}

function toggleStatExpand(key: string) {
  const next = new Set(expandedStats.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedStats.value = next;
}

function isStatExpanded(key: string): boolean {
  return expandedStats.value.has(key);
}

function effectiveStat(unit: BattleUnit, stat: '攻击力' | '防御力' | '特攻' | '特防' | '速度'): number {
  let base = unit[stat];
  const map: Record<typeof stat, [StatusEffectType, StatusEffectType]> = {
    攻击力: ['atk_up', 'atk_down'],
    防御力: ['def_up', 'def_down'],
    特攻: ['spa_up', 'spa_down'],
    特防: ['spd_up', 'spd_down'],
    速度: ['speed_up', 'speed_down'],
  };
  const [upType, downType] = map[stat];
  for (const eff of unit.statusEffects) {
    if (eff.type === upType) base = Math.floor(base * (1 + eff.value));
    if (eff.type === downType) base = Math.floor(base * (1 - eff.value));
  }
  return Math.max(1, base);
}

function statusList(u: BattleUnit): Array<{ key: string; tone: string; text: string; type: StatusEffectType }> {
  return u.statusEffects.map(eff => ({
    key: `${eff.type}-${eff.source ?? ''}`,
    tone: DEBUFF_TYPES.includes(eff.type) ? 'debuff'
      : (eff.type.includes('up') || eff.type === 'shield' || eff.type.includes('boost') ? 'buff' : 'neutral'),
    text: statusText(eff),
    type: eff.type,
  }));
}

function statusTone(type: StatusEffectType): string {
  if (DEBUFF_TYPES.includes(type)) return 'debuff';
  if (type.includes('up') || type === 'shield' || type.includes('boost')) return 'buff';
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

function statusText(eff: StatusEffect): string {
  const label = statusLabel(eff.type);
  const turns = eff.remainingTurns > 0 ? ` ${eff.remainingTurns}T` : '';
  if (eff.type === 'damage_boost' || eff.type === 'skill_boost') {
    return `${label}+${Math.round(eff.value * 100)}%${turns}`;
  }
  if (eff.type.includes('up') || eff.type.includes('down')) {
    return `${label}${Math.round(eff.value * 100)}%${turns}`;
  }
  if (eff.type === 'shield') {
    return `${label} ${Math.round(eff.value)}${turns}`;
  }
  return `${label}${turns}`;
}

function damageBoostMultiplier(unit: BattleUnit): number {
  return unit.statusEffects.reduce((mult, eff) => {
    if (eff.type === 'damage_boost' || eff.type === 'skill_boost') return mult + eff.value;
    return mult;
  }, 1);
}

function elementBadgeClass(elem: string | undefined): string {
  if (!elem) return '';
  const map: Record<string, string> = {
    '火': 'type-fire', '水': 'type-water', '草': 'type-grass', '风': 'type-air',
    '电': 'type-thunder', '冰': 'type-ice', '格斗': 'type-fight',
    '毒': 'type-poison', '地面': 'type-ground', '土': 'type-ground', '飞行': 'type-fly',
    '超能': 'type-psychic', '虫': 'type-bug', '岩石': 'type-rock',
    '幽灵': 'type-ghost', '龙': 'type-dragon', '恶': 'type-dark',
    '钢': 'type-steel', '妖精': 'type-fairy', '光': 'type-light',
    '暗': 'type-dark', '无': 'type-normal',
  };
  return map[elem] ?? 'type-normal';
}

function elementPowerColor(elem: string | undefined): string {
  if (!elem) return 'color:var(--text-secondary)';
  const map: Record<string, string> = {
    '火': 'color:#fb923c', '水': 'color:#60a5fa', '草': 'color:#4ade80',
    '电': 'color:#fbbf24', '冰': 'color:#67e8f9', '格斗': 'color:#e0746e',
    '毒': 'color:#c084fc', '地面': 'color:#c8a060', '飞行': 'color:#80b8e8',
    '超能': 'color:#f472b6', '虫': 'color:#a2d060', '岩石': 'color:#c8b888',
    '幽灵': 'color:#a880e0', '龙': 'color:#818cf8', '恶': 'color:#b0b0c0',
    '钢': 'color:#cbd5e1', '妖精': 'color:#f472b6', '光': 'color:#fde047',
    '暗': 'color:#b0b0c0', '风': 'color:#a5f3fc',
  };
  return map[elem] ? `color:${map[elem].replace('color:', '')}` : '';
}

function qualityBadgeClass(quality: string): string {
  const map: Record<string, string> = {
    'S': 'type-fire', 'A': 'type-dragon', 'B': 'type-thunder',
    'C': 'type-steel', 'D': 'type-normal',
    'SS': 'type-psychic', 'SSS': 'type-light',
  };
  return map[quality] ?? 'type-steel';
}

function categoryIcon(cat: string): string {
  if (cat === '属性增强药') return '💎';
  if (cat === '技能增强药') return '⚡';
  return '🧪';
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

  const usedSkill = selectedSkill.value;
  showConfirmDialog.value = false;
  const allyAnim = skillAnim();
  fireAnim(allyAnim);
  cancelSelection();

  if (cmd.action === 'skill' && usedSkill) {
    showSkillFlash(usedSkill.name, 'ally');
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

function onEscapeFromTab() {
  onEscape();
  activeTab.value = '技能';
}

function onUseItem(item: BattleItem) {
  if (!canUseItem.value) return;
  selectedItem.value = item;
  showItemConfirmDialog.value = true;
}

function cancelItemUse() {
  selectedItem.value = null;
  showItemConfirmDialog.value = false;
}

function confirmItemUse() {
  if (!selectedItem.value || !canUseItem.value) return;
  const item = selectedItem.value;
  cancelItemUse();
  store.useItem(item);
}

function onFieldClick(side: 'ally' | 'enemy') {
  if (needsEnemyTarget.value && side === 'enemy' && enemyUnit.value && enemyUnit.value.HP > 0) {
    selectedTargetName.value = enemyUnit.value.name;
  } else if (needsAllyTarget.value && side === 'ally' && allyUnit.value && allyUnit.value.HP > 0) {
    selectedTargetName.value = allyUnit.value.name;
  }
}

function onTeamSwitch(unit: BattleUnit, idx: number) {
  if (idx !== store.allyActiveIndex && unit.HP > 0 && store.phase === 'selecting') {
    store.executeRound({ action: 'switch', switchToIndex: idx });
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

function onConfirmCapture() {
  store.confirmCaptureStep();
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
    if (phase === 'selecting') {
      skillPage.value = 0;
      activeTab.value = '技能';
    }
  },
  { immediate: true },
);
</script>
