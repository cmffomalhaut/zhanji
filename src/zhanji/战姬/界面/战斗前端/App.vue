<template>
  <div class="battle-shell">
    <div v-if="battleState" class="battle-top-bar">
      <TurnOrderBar :battle-state="battleState" />
    </div>

    <div v-if="battleState" class="enemy-strip">
      <div class="section-label">敌方</div>
      <div class="enemy-strip-list">
        <div v-for="unit in enemyUnits" :key="unit.unitId" class="enemy-strip-item"
          :class="{ targeted: selectedTargetId === unit.unitId, selectable: needsEnemyTarget && unit.是否存活, dead: !unit.是否存活 }"
          @click="onEnemyClick(unit)">
          <div class="enemy-strip-name">{{ unit.名字 }}</div>
          <div class="enemy-strip-bar-row">
            <div class="bar-track enemy-bar-track"><div class="bar-fill hp" :style="{ width: barWidth(unit.当前资源.HP, unit.当前资源.HPMax) }"></div></div>
            <span class="bar-val">{{ unit.当前资源.HP }}/{{ unit.当前资源.HPMax }}</span>
          </div>
          <button class="detail-toggle enemy-strip-toggle" @click.stop="expandedEnemy = expandedEnemy === unit.unitId ? null : unit.unitId">{{ expandedEnemy === unit.unitId ? '▾' : '▸' }}</button>
          <div v-if="expandedEnemy === unit.unitId" class="detail-panel enemy-detail" @click.stop>
            <div class="detail-grid">
              <span>力量 {{ unit.当前属性.力量 }}</span>
              <span>敏捷 {{ unit.当前属性.敏捷 }}</span>
              <span>体质 {{ unit.当前属性.体质 }}</span>
              <span>智力 {{ unit.当前属性.智力 }}</span>
              <span>感知 {{ unit.当前属性.感知 }}</span>
              <span>魅力 {{ unit.当前属性.魅力 }}</span>
              <span>物防 {{ unit.当前属性.物理防御 }}</span>
              <span>精防 {{ unit.当前属性.精神防御 }}</span>
              <span>先攻 {{ unit.当前属性.先攻 }}</span>
              <span>命中 {{ unit.当前属性.命中加值 }}</span>
              <span>闪避 {{ unit.当前属性.闪避加值 }}</span>
              <span>层次 {{ unit.当前属性.生命层次 }}</span>
            </div>
            <div v-if="unit.状态列表.length" class="detail-section">
              <div class="detail-section-title">状态</div>
              <div v-for="s in unit.状态列表" :key="`${s.statusId}-${s.来源单位Id ?? 'self'}`" class="detail-line">
                <span class="status-badge" :class="statusClass(s)">{{ s.名称 }} {{ s.剩余回合 }}T{{ s.层数 > 1 ? ` ×${s.层数}` : '' }}</span>
              </div>
            </div>
            <div v-if="unit.技能栏.length" class="detail-section">
              <div class="detail-section-title">技能</div>
              <div v-for="sk in unit.技能栏" :key="sk.skillId" class="detail-line">{{ skillName(sk.skillId) }}{{ sk.当前冷却 > 0 ? ` CD:${sk.当前冷却}` : '' }}{{ sk.已禁用 ? ' [禁用]' : '' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="battle-main">
      <aside class="left-col">
        <div class="round-info" v-if="battleState">
          <span class="round-info-round">R{{ battleState.回合数 }}</span>
          <span v-if="currentActor" class="round-info-actor">
            <span class="round-info-dot" :class="currentActor.阵营 === 'ally' ? 'ally-dot' : 'enemy-dot'"></span>
            {{ currentActor.名字 }}
          </span>
          <span v-if="battleState.玩家输入态.可操作 && battleState.状态 !== 'ended'" class="turn-state-pill player">◈ 你的回合</span>
          <span v-else-if="battleState.状态 !== 'ended'" class="turn-state-pill system">◇ 系统处理中</span>
        </div>

        <section class="party-section">
          <div class="section-label">我方</div>
          <div class="party-list">
            <div v-for="unit in allyUnits" :key="unit.unitId" class="party-row"
              :class="{ active: unit.unitId === activeAllyId, dead: !unit.是否存活, selectable: needsAllyTarget && unit.是否存活, targeted: selectedTargetId === unit.unitId }"
              @click="onAllyClick(unit)">
              <div class="party-avatar-sm">{{ unit.名字.charAt(0) }}</div>
              <div class="party-row-info">
                <div class="party-row-name">{{ unit.名字 }}<span v-if="unit.当前属性.生命层次 > 1" class="unit-tier"> {{ '★'.repeat(unit.当前属性.生命层次 - 1) }}</span>
                  <span v-if="unit.unitId === (battleState?.当前行动单位Id) && unit.阵营 === 'ally'" class="turn-badge">▸</span>
                </div>
                <div class="party-bar-row">
                  <span class="bar-lbl hp">HP</span>
                  <div class="bar-track"><div class="bar-fill hp" :style="{ width: barWidth(unit.当前资源.HP, unit.当前资源.HPMax) }"></div></div>
                  <span class="bar-val">{{ unit.当前资源.HP }}/{{ unit.当前资源.HPMax }}</span>
                </div>
                <div class="party-bar-row">
                  <span class="bar-lbl mp">MP</span>
                  <div class="bar-track"><div class="bar-fill mp" :style="{ width: barWidth(unit.当前资源.MP, unit.当前资源.MPMax) }"></div></div>
                  <span class="bar-val">{{ unit.当前资源.MP }}/{{ unit.当前资源.MPMax }}</span>
                </div>
                <div v-if="unit.当前资源.Shield > 0" class="party-shield">◆ 护盾 {{ unit.当前资源.Shield }}</div>
                <div v-if="unit.状态列表.length" class="party-statuses">
                  <span v-for="s in unit.状态列表" :key="`${s.statusId}-${s.来源单位Id ?? 'self'}`" class="status-badge" :class="statusClass(s)">{{ s.名称 }}{{ s.剩余回合 }}T</span>
                </div>
              </div>
              <button class="detail-toggle" @click.stop="expandedAlly = expandedAlly === unit.unitId ? null : unit.unitId" :title="expandedAlly === unit.unitId ? '收起' : '详情'">{{ expandedAlly === unit.unitId ? '▾' : '▸' }}</button>
            </div>
            <div v-if="expandedAlly && expandedAllyUnit" class="detail-panel" @click.stop>
              <div class="detail-grid">
                <span>力量 {{ expandedAllyUnit.当前属性.力量 }}</span>
                <span>敏捷 {{ expandedAllyUnit.当前属性.敏捷 }}</span>
                <span>体质 {{ expandedAllyUnit.当前属性.体质 }}</span>
                <span>智力 {{ expandedAllyUnit.当前属性.智力 }}</span>
                <span>感知 {{ expandedAllyUnit.当前属性.感知 }}</span>
                <span>魅力 {{ expandedAllyUnit.当前属性.魅力 }}</span>
                <span>幸运 {{ expandedAllyUnit.当前属性.幸运 }}</span>
                <span>物防 {{ expandedAllyUnit.当前属性.物理防御 }}</span>
                <span>精防 {{ expandedAllyUnit.当前属性.精神防御 }}</span>
                <span>命中 {{ expandedAllyUnit.当前属性.命中加值 }}</span>
                <span>闪避 {{ expandedAllyUnit.当前属性.闪避加值 }}</span>
                <span>先攻 {{ expandedAllyUnit.当前属性.先攻 }}</span>
              </div>
              <div v-if="allyPassives.length" class="detail-section">
                <div class="detail-section-title">被动效果</div>
                <div v-for="p in allyPassives" :key="p.id" class="detail-line">{{ p.名称 }}：{{ p.描述 || '—' }}</div>
              </div>
            </div>
            <div v-if="!battleState" class="empty-text">战斗未开始</div>
          </div>
        </section>

        <section class="log-strip">
          <div class="section-label">日志</div>
          <div class="log-scroll">
            <div v-for="entry in recentLogs" :key="entry.id" class="log-item-sm" :class="entry.type">
              <span class="log-turn-sm">T{{ entry.turn }}</span> {{ entry.text }}
            </div>
            <div v-if="recentLogs.length === 0" class="empty-text">暂无日志</div>
          </div>
        </section>
      </aside>

      <main class="center-col">
        <template v-if="battleState">
          <BattleArena
            :ally-units="allyUnits"
            :enemy-units="enemyUnits"
            :current-actor-id="battleState.当前行动单位Id"
            :selected-target-id="selectedTargetId"
            :needs-enemy-target="needsEnemyTarget"
            :needs-ally-target="needsAllyTarget"
            :anim="animEvent"
            @select="onArenaSelect"
          />

          <div v-if="currentActor && !confirmBarText" class="actor-status-bar">
            <div class="actor-status-name">{{ currentActor.名字 }} · {{ currentActor.阵营 === 'ally' ? '我方' : '敌方' }}</div>
            <div class="actor-status-badges">
              <span v-if="currentActor.当前资源.Shield > 0" class="status-badge buff">◆ 护盾 {{ currentActor.当前资源.Shield }}</span>
              <span v-for="s in currentActor.状态列表" :key="`${s.statusId}-actor`" class="status-badge" :class="statusClass(s)">{{ s.名称 }} {{ s.剩余回合 }}T{{ s.层数 > 1 ? ` ×${s.层数}` : '' }}</span>
              <span v-if="currentActor.状态列表.length === 0 && currentActor.当前资源.Shield <= 0" class="status-badge neutral">状态正常</span>
            </div>
            <div v-if="!currentActor.是否可行动" class="status-badge debuff">不可行动</div>
          </div>

          <div v-if="targetHintText" class="target-hint">{{ targetHintText }}</div>

          <div v-if="confirmBarText" class="confirm-bar">
            <div class="confirm-info">{{ confirmBarText }}</div>
            <button v-if="activeMode === 'skill'" class="confirm-btn" :disabled="!canSubmitSkill" @click="submitSkill">确认使用技能</button>
            <button v-if="activeMode === 'item'" class="confirm-btn" :disabled="!canSubmitItem" @click="submitItem">确认使用道具</button>
            <button class="confirm-btn cancel" @click="cancelSelection">取消</button>
          </div>

          <div class="command-area">
            <div class="command-buttons">
              <button class="action-btn" :class="{ expanded: expandedPanel === 'skill' }" :disabled="!canAct" @click="togglePanel('skill')">⚔ 技能</button>
              <button class="action-btn secondary" :class="{ expanded: expandedPanel === 'item' }" :disabled="!canAct" @click="togglePanel('item')">✦ 道具</button>
              <button class="action-btn secondary" :disabled="!canAct" @click="submitDefend">◆ 防御</button>
              <button class="action-btn secondary danger" :disabled="!canAct" @click="submitEscape">✕ 逃跑</button>
              <button class="action-btn secondary" @click="advanceEnemy">▸ 推进</button>
              <button class="action-btn secondary" style="margin-left:auto;font-size:11px;" @click="startBattle">初始化</button>
            </div>

            <SkillPanel
              v-if="expandedPanel && activeAllyUnit"
              :skills="activeAllySkills"
              :items="availableItems"
              :selected-skill-id="selectedSkillId"
              :selected-item-id="selectedItemId"
              :actor="activeAllyUnit"
              :can-act="canAct"
              :active-item-id="selectedItemId"
              :active-skill-id="selectedSkillId"
              :active-tab-prop="expandedPanel === 'item' ? 'item' : 'skill'"
              @select-skill="onSelectSkill"
              @select-item="onSelectItem"
            />
          </div>

          <BattleResultModal :result="battleState?.结算结果" @settle="settleBattle" />
        </template>

        <div v-else class="no-battle-state">
          <template v-if="encounterDetected">
            <div class="no-battle-icon">⚔</div>
            <div class="no-battle-text">遭遇敌人！战斗即将开始...</div>
            <div class="encounter-loading-spinner"></div>
          </template>
          <template v-else>
            <div class="no-battle-icon">⚔</div>
            <div class="no-battle-text">点击「初始化」开始战斗</div>
            <button class="action-btn" @click="startBattle">⚔ 开始战斗</button>
          </template>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from 'vue';
import { useDataStore } from './store';
import BattleArena from './components/BattleArena.vue';
import BattleResultModal from './components/BattleResultModal.vue';
import SkillPanel from './components/SkillPanel.vue';
import TurnOrderBar from './components/TurnOrderBar.vue';
import { useBattleCommand } from './useBattleCommand';
import { classifyAnimation, defendAnimation, escapeAnimation, ANIM_DURATION } from './anim';
import type { AnimEvent } from './anim';
import { useAutoBattle } from './useAutoBattle';

const DEBUFF_IDS = ['poison', 'burn', 'freeze', 'stun', 'fear', 'confuse', 'charm', 'silence', 'slow', 'blind', 'curse', 'weaken', 'vulnerability', 'taunted'];

const store = useDataStore();

const autoBattleCleanup = useAutoBattle(store);
onUnmounted(() => { autoBattleCleanup(); });

const data = computed(() => store.data);
const battleState = computed(() => data.value.战斗状态);
const encounterDetected = computed(() => {
  const phase = data.value.世界.剧情状态;
  return (phase === '战斗' || phase === '偷袭') && !data.value.战斗状态;
});
const allyUnits = computed(() => battleState.value?.参战方.ally.单位列表 ?? []);
const enemyUnits = computed(() => battleState.value?.参战方.enemy.单位列表 ?? []);
const activeAllyId = ref<string | null>(null);
const expandedPanel = ref<'skill' | 'item' | null>(null);
const expandedAlly = ref<string | null>(null);
const expandedEnemy = ref<string | null>(null);
const animEvent = ref<AnimEvent | null>(null);

const currentActor = computed(() => {
  if (!battleState.value?.当前行动单位Id) return null;
  return [...(battleState.value?.参战方.ally.单位列表 ?? []), ...(battleState.value?.参战方.enemy.单位列表 ?? [])].find(u => u.unitId === battleState.value!.当前行动单位Id) ?? null;
});

const expandedAllyUnit = computed(() => {
  if (!expandedAlly.value || !battleState.value) return null;
  return [...battleState.value.参战方.ally.单位列表, ...battleState.value.参战方.enemy.单位列表].find(u => u.unitId === expandedAlly.value) ?? null;
});

const allyPassives = computed(() => {
  const unit = expandedAllyUnit.value;
  if (!unit) return [];
  return unit.技能栏.filter(s => { const def = data.value.技能定义表[s.skillId]; return def && def.类型 === '被动'; }).map(s => data.value.技能定义表[s.skillId]).filter(Boolean);
});

const activeAllyUnit = computed(() => {
  if (!battleState.value) return null;
  const units = battleState.value.参战方.ally.单位列表;
  if (activeAllyId.value) {
    const found = units.find(u => u.unitId === activeAllyId.value);
    if (found && found.是否存活) return found;
  }
  const currentId = battleState.value.当前行动单位Id;
  if (currentId) {
    const currentActor = units.find(u => u.unitId === currentId && u.是否存活);
    if (currentActor) return currentActor;
  }
  return units.find(u => u.是否存活) ?? null;
});

watch(() => battleState.value?.当前行动单位Id, (newId) => {
  if (newId) {
    const ally = battleState.value?.参战方.ally.单位列表.find(u => u.unitId === newId && u.是否存活);
    if (ally) activeAllyId.value = ally.unitId;
  }
}, { immediate: true });

const activeAllySkills = computed(() => {
  const unit = activeAllyUnit.value;
  if (!unit) return [];
  return unit.技能栏.filter(s => !s.已禁用).map(s => data.value.技能定义表[s.skillId]).filter(Boolean);
});

const availableItems = computed(() => {
  const hero = data.value.角色档案.hero;
  return (hero?.可用道具栏 ?? []).map(itemId => data.value.背包[itemId]).filter(Boolean);
});

const {
  selectedSkillId, selectedItemId, selectedTargetId,
  selectedSkill, selectedItem, activeMode, activeTargetType,
  requiresExplicitTarget, activeSelectionLabel,
  selectSkill, selectItem, buildPendingCommand,
} = useBattleCommand({ battleState, activeAllyUnit, allAllySkills: activeAllySkills, availableItems });

const recentLogs = computed(() => battleState.value?.日志.slice(-23) ?? []);
const canAct = computed(() => !!battleState.value?.玩家输入态.可操作 && battleState.value?.状态 !== 'ended');
const needsEnemyTarget = computed(() => canAct.value && activeTargetType.value === 'single_enemy');
const needsAllyTarget = computed(() => canAct.value && (activeTargetType.value === 'single_ally' || activeTargetType.value === 'self'));

const canSubmitSkill = computed(() => {
  if (!canAct.value || !selectedSkill.value) return false;
  if (selectedItem.value) return false;
  return requiresExplicitTarget.value ? !!selectedTargetId.value : true;
});
const canSubmitItem = computed(() => {
  if (!canAct.value || !selectedItem.value) return false;
  if (selectedSkill.value) return false;
  return requiresExplicitTarget.value ? !!selectedTargetId.value : true;
});

const selectedTargetName = computed(() => {
  if (!battleState.value || !selectedTargetId.value) return '';
  return [...battleState.value.参战方.ally.单位列表, ...battleState.value.参战方.enemy.单位列表].find(u => u.unitId === selectedTargetId.value)?.名字 ?? '';
});

const targetHintText = computed(() => {
  if (!canAct.value || !activeTargetType.value) return '';
  const tt = activeTargetType.value;
  if (tt === 'single_enemy') return '↑ 点击战斗场中敌方单位选择目标';
  if (tt === 'single_ally') return '↑ 点击战斗场中我方单位或左侧列表选择目标';
  if (tt === 'all_enemies') return '↑ 群体技能，影响所有敌方，直接确认即可';
  if (tt === 'all_allies') return '↑ 群体技能，影响所有友方，直接确认即可';
  if (tt === 'random_enemy') return '↑ 随机目标，直接确认即可';
  if (tt === 'self') return '↑ 自身目标，直接确认即可';
  return '';
});

const confirmBarText = computed(() => {
  if (!activeMode.value) return '';
  if (activeMode.value === 'skill' && selectedSkill.value) {
    const name = selectedSkill.value.名称;
    const tt = activeTargetType.value;
    if (!requiresExplicitTarget.value) {
      const td = tt === 'all_enemies' ? '全体敌人' : tt === 'all_allies' ? '全体友方' : tt === 'random_enemy' ? '随机敌人' : tt === 'self' ? '自身' : '';
      return `${name} → ${td}`;
    }
    return selectedTargetId.value && selectedTargetName.value ? `${name} → ${selectedTargetName.value}` : `${name} → 请选择目标`;
  }
  if (activeMode.value === 'item' && selectedItem.value) {
    const name = selectedItem.value.名称;
    const tt = activeTargetType.value;
    if (!requiresExplicitTarget.value) {
      const td = tt === 'all_enemies' ? '全体敌人' : tt === 'all_allies' ? '全体友方' : tt === 'random_enemy' ? '随机敌人' : tt === 'self' ? '自身' : '';
      return `${name} → ${td}`;
    }
    return selectedTargetId.value && selectedTargetName.value ? `${name} → ${selectedTargetName.value}` : `${name} → 请选择目标`;
  }
  return '';
});

function barWidth(current: number, max: number) { return `${Math.max(0, Math.min(100, (current / Math.max(1, max)) * 100))}%`; }

function statusClass(status: { statusId: string; 名称: string }) {
  const id = status.statusId?.toLowerCase() ?? '';
  if (DEBUFF_IDS.some(d => id.includes(d))) return 'debuff';
  const name = status.名称;
  if (name.includes('护盾') || name.includes('强化') || name.includes('祝福') || name.includes('鼓舞') || name.includes('恢复')) return 'buff';
  return 'neutral';
}

function skillName(skillId: string) { return data.value.技能定义表[skillId]?.名称 ?? skillId; }

function togglePanel(panel: 'skill' | 'item') { expandedPanel.value = expandedPanel.value === panel ? null : panel; }
function onSelectSkill(skillId: string) { selectSkill(skillId); expandedPanel.value = 'skill'; }
function onSelectItem(itemId: string) { selectItem(itemId); expandedPanel.value = 'item'; }
function onEnemyClick(unit: { unitId: string }) { if (needsEnemyTarget.value) selectedTargetId.value = unit.unitId; }
function onAllyClick(unit: { unitId: string; 是否存活: boolean }) {
  if (needsAllyTarget.value && unit.是否存活) { selectedTargetId.value = unit.unitId; }
  else { activeAllyId.value = unit.unitId; }
}
function onArenaSelect(unit: { unitId: string; 阵营: string; 是否存活: boolean }) {
  if (unit.阵营 === 'enemy' && needsEnemyTarget.value) { selectedTargetId.value = unit.unitId; }
  else if (unit.阵营 === 'ally' && needsAllyTarget.value && unit.是否存活) { selectedTargetId.value = unit.unitId; }
}
function cancelSelection() { selectedSkillId.value = null; selectedItemId.value = null; selectedTargetId.value = null; expandedPanel.value = null; }

function fireAnim(event: AnimEvent | null) {
  if (!event) return;
  animEvent.value = event;
  const dur = ANIM_DURATION[event.type] ?? 500;
  nextTick(() => {
    setTimeout(() => { animEvent.value = null; }, dur + 100);
  });
}

function skillAnim(): AnimEvent | null {
  const actor = activeAllyUnit.value;
  const skill = selectedSkill.value;
  if (!actor || !skill) return null;
  const targetIds = selectedTargetId.value ? [selectedTargetId.value] : [];
  return classifyAnimation(
    skill.标签 ?? [],
    skill.目标类型,
    (skill.效果列表 ?? []).map(e => e.kind),
    actor.unitId,
    actor.阵营,
    targetIds,
  );
}

async function writePendingCommand(command: Record<string, unknown>) {
  if (!battleState.value) return;
  store.data.战斗状态!.待处理指令 = command as never;
  store.data.战斗状态!.玩家输入态.待选技能Id = (command.skillId as string | undefined) ?? undefined;
  store.data.战斗状态!.玩家输入态.待选目标Id = (command.targetIds as string[] | undefined)?.[0];
}
async function triggerButton(name: string) { emitEvent(getButtonEvent(name)); }
async function startBattle() { await triggerButton('开始战斗'); }
async function submitSkill() { fireAnim(skillAnim()); const c = buildPendingCommand('skill'); if (!c) return; await writePendingCommand(c); cancelSelection(); await triggerButton('推进战斗'); }
async function submitItem() { const item = selectedItem.value; const actor = activeAllyUnit.value; if (actor && item) { const targetIds = selectedTargetId.value ? [selectedTargetId.value] : []; let tags: string[] = []; let effectKinds: string[] = []; if (item.效果列表) { effectKinds = item.效果列表.map((e: any) => e.kind); if (effectKinds.includes('heal') || effectKinds.includes('restore_mp')) tags = ['heal']; else if (effectKinds.includes('shield') || effectKinds.includes('add_modifier')) tags = ['buff']; else if (effectKinds.includes('damage')) tags = ['physical']; else tags = ['support']; } fireAnim(classifyAnimation(tags, (item.目标类型 as any) ?? 'self', effectKinds, actor.unitId, actor.阵营, targetIds)); } const c = buildPendingCommand('item'); if (!c) return; await writePendingCommand(c); cancelSelection(); await triggerButton('推进战斗'); }
async function submitDefend() { const actor = activeAllyUnit.value; if (actor) fireAnim(defendAnimation(actor.unitId, actor.阵营)); const c = buildPendingCommand('defend'); if (!c) return; await writePendingCommand(c); cancelSelection(); await triggerButton('推进战斗'); }
async function submitEscape() { const actor = activeAllyUnit.value; if (actor) fireAnim(escapeAnimation(actor.unitId, actor.阵营)); const c = buildPendingCommand('escape'); if (!c) return; await writePendingCommand(c); cancelSelection(); await triggerButton('推进战斗'); }
async function advanceEnemy() { await triggerButton('推进战斗'); }
async function settleBattle() { await triggerButton('战斗结算'); }
</script>
