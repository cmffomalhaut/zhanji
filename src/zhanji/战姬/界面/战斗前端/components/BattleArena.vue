<template>
  <div class="battle-arena">
    <div class="arena-header">
      <span class="arena-label enemy-label">敌方</span>
      <div class="arena-divider"></div>
      <span class="arena-label ally-label">我方</span>
    </div>
    <div class="arena-grid">
      <div v-for="(col, ci) in allColumns" :key="ci" class="arena-col" :class="{ 'enemy-col': ci < 2, 'ally-col': ci >= 2 }">
        <div v-for="(entry, ri) in col" :key="ri" class="arena-slot"
          :class="slotClass(entry)"
          @click="entry && onSlotClick(entry)">
          <template v-if="entry">
            <div class="arena-orb" :class="[entry.阵营 === 'ally' ? 'ally-orb' : 'enemy-orb', orbAnimClass(entry.unitId)]">
              <span class="arena-orb-char">{{ entry.名字.charAt(0) }}</span>
            </div>
            <div class="arena-hp-mini">
              <div class="arena-hp-track"><div class="arena-hp-fill" :class="entry.阵营" :style="{ width: hpWidth(entry) }"></div></div>
            </div>
            <div class="arena-name">{{ entry.名字 }}</div>
            <div v-if="entry.当前资源.Shield > 0" class="arena-shield-badge">◆{{ entry.当前资源.Shield }}</div>
            <div v-if="entry.状态列表.length" class="arena-status-dots">
              <span v-for="s in entry.状态列表.slice(0, 3)" :key="s.statusId" class="arena-dot" :class="statusDotClass(s)"></span>
            </div>
          </template>
          <template v-else>
            <div class="arena-orb empty-orb"></div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BattleUnitState, AnimEvent } from '../types';
import type { AnimEvent as AnimEventFromAnim } from '../anim';

const DEBUFF_IDS = ['poison', 'burn', 'freeze', 'stun', 'fear', 'confuse', 'charm', 'silence', 'slow', 'blind', 'curse', 'weaken', 'vulnerability', 'taunted'];

const props = defineProps<{
  allyUnits: BattleUnitState[];
  enemyUnits: BattleUnitState[];
  currentActorId: string | null;
  selectedTargetId: string | null;
  needsEnemyTarget: boolean;
  needsAllyTarget: boolean;
  anim: AnimEventFromAnim | null;
}>();

const emit = defineEmits<{
  (e: 'select', unit: BattleUnitState): void;
}>();

function distributeColumns(units: BattleUnitState[]): [BattleUnitState | null, BattleUnitState | null, BattleUnitState | null][] {
  const left: (BattleUnitState | null)[] = [];
  const right: (BattleUnitState | null)[] = [];
  for (let i = 0; i < 3; i++) {
    left.push(units[i * 2] ?? null);
    right.push(units[i * 2 + 1] ?? null);
  }
  return [left, right] as [BattleUnitState | null, BattleUnitState | null, BattleUnitState | null][];
}

const enemyColumns = computed(() => distributeColumns(props.enemyUnits));
const allyColumns = computed(() => distributeColumns(props.allyUnits));
const allColumns = computed(() => [...enemyColumns.value, ...allyColumns.value]);

function hpWidth(unit: BattleUnitState): string {
  const pct = Math.max(0, Math.min(100, (unit.当前资源.HP / Math.max(1, unit.当前资源.HPMax)) * 100));
  return `${pct}%`;
}

const allUnitIds = computed(() => {
  const set = new Set<string>();
  for (const u of props.allyUnits) set.add(u.unitId);
  for (const u of props.enemyUnits) set.add(u.unitId);
  return set;
});

const isTarget = computed(() => {
  if (!props.anim) return new Set<string>();
  if (props.anim.targetIds.length > 0) return new Set(props.anim.targetIds);
  const side = props.anim.targetSide;
  const units = side === 'ally' ? props.allyUnits : props.enemyUnits;
  return new Set(units.filter(u => u.是否存活).map(u => u.unitId));
});

const isActor = computed(() => props.anim?.actorId ?? null);

function slotClass(unit: BattleUnitState | null): Record<string, boolean> {
  if (!unit) return { 'arena-slot-empty': true };
  const cls: Record<string, boolean> = {
    'arena-slot-alive': unit.是否存活,
    'arena-slot-dead': !unit.是否存活,
    'arena-slot-current': unit.unitId === props.currentActorId,
    'arena-slot-targeted': unit.unitId === props.selectedTargetId,
    'arena-slot-selectable-enemy': props.needsEnemyTarget && unit.阵营 === 'enemy' && unit.是否存活,
    'arena-slot-selectable-ally': props.needsAllyTarget && unit.阵营 === 'ally' && unit.是否存活,
  };
  if (props.anim && isTarget.value.has(unit.unitId)) {
    const t = props.anim.type;
    if (t === 'single_attack' || t === 'group_attack') cls['arena-slot-hit'] = true;
    if (t === 'single_heal' || t === 'group_heal') cls['arena-slot-heal'] = true;
    if (t === 'single_buff' || t === 'group_buff') cls['arena-slot-buff'] = true;
    if (t === 'apply_status') cls['arena-slot-status'] = true;
  }
  return cls;
}

function orbAnimClass(unitId: string): string {
  if (!props.anim) return '';
  if (unitId === isActor.value) {
    const t = props.anim.type;
    if (t === 'single_attack') return 'anim-actor-melee';
    if (t === 'group_attack') return 'anim-actor-aoe';
    if (t === 'defend') return 'anim-actor-defend';
    if (t === 'escape') return 'anim-actor-escape';
    if (t === 'single_heal' || t === 'group_heal') return 'anim-actor-cast';
    if (t === 'single_buff' || t === 'group_buff') return 'anim-actor-cast';
    if (t === 'apply_status') return 'anim-actor-cast';
    return 'anim-actor-cast';
  }
  return '';
}

function statusDotClass(status: { statusId: string; 名称: string }): string {
  const id = status.statusId?.toLowerCase() ?? '';
  if (DEBUFF_IDS.some(d => id.includes(d))) return 'debuff';
  const name = status.名称;
  if (name.includes('护盾') || name.includes('强化') || name.includes('祝福') || name.includes('鼓舞') || name.includes('恢复')) return 'buff';
  return 'neutral';
}

function onSlotClick(unit: BattleUnitState) {
  if (!unit.是否存活) return;
  emit('select', unit);
}
</script>
