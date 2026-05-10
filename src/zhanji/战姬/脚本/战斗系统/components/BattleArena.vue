<template>
  <div class="battle-arena battle-arena-1v1">
    <!-- Enemy slot -->
    <div class="arena-col enemy-col-single">
      <div class="arena-slot"
        :class="enemySlotClass"
        @click="onClick(enemyUnit, 'enemy')">
        <template v-if="enemyUnit && enemyUnit.HP > 0">
          <div class="arena-orb enemy-orb" :class="orbAnimClass(enemyUnit.name)">
            <span class="arena-orb-char">{{ enemyUnit.name.charAt(0) }}</span>
          </div>
          <div class="arena-body">
            <div class="arena-name">{{ enemyUnit.name }}</div>
            <div class="arena-hp-mini">
              <div class="arena-hp-track"><div class="arena-hp-fill enemy" :style="{ width: hpWidth(enemyUnit) }"></div></div>
              <span class="arena-hp-text">{{ Math.max(0, enemyUnit.HP) }}/{{ enemyUnit.HPMax }}</span>
            </div>
            <div class="arena-tags">
              <span v-if="enemyUnit.shield > 0" class="arena-shield-badge">◆{{ enemyUnit.shield }}</span>
              <span v-for="s in statusList(enemyUnit).slice(0, 3)" :key="s.key" class="arena-dot" :class="s.tone"></span>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="arena-orb empty-orb"></div>
          <div class="arena-body"><div class="arena-name dead-name">—</div></div>
        </template>
      </div>
    </div>

    <!-- VS divider -->
    <div class="arena-vs">VS</div>

    <!-- Ally slot -->
    <div class="arena-col ally-col-single">
      <div class="arena-slot"
        :class="allySlotClass"
        @click="onClick(allyUnit, 'ally')">
        <template v-if="allyUnit && allyUnit.HP > 0">
          <div class="arena-orb ally-orb" :class="orbAnimClass(allyUnit.name)">
            <span class="arena-orb-char">{{ allyUnit.name.charAt(0) }}</span>
          </div>
          <div class="arena-body">
            <div class="arena-name">{{ allyUnit.name }}</div>
            <div class="arena-hp-mini">
              <div class="arena-hp-track"><div class="arena-hp-fill ally" :style="{ width: hpWidth(allyUnit) }"></div></div>
              <span class="arena-hp-text">{{ Math.max(0, allyUnit.HP) }}/{{ allyUnit.HPMax }}</span>
            </div>
            <div class="arena-tags">
              <span v-if="allyUnit.shield > 0" class="arena-shield-badge">◆{{ allyUnit.shield }}</span>
              <span v-for="s in statusList(allyUnit).slice(0, 3)" :key="s.key" class="arena-dot" :class="s.tone"></span>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="arena-orb empty-orb"></div>
          <div class="arena-body"><div class="arena-name dead-name">—</div></div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BattleUnit, StatusEffectType } from '../types';
import type { AnimEvent } from '../anim';

const DEBUFF_TYPES: StatusEffectType[] = ['burn', 'poison', 'freeze', 'paralyze', 'confuse'];

const props = defineProps<{
  allyUnit: BattleUnit | null;
  enemyUnit: BattleUnit | null;
  currentActorName: string | null;
  selectedTargetName: string | null;
  needsEnemyTarget: boolean;
  needsAllyTarget: boolean;
  anim: AnimEvent | null;
}>();

const emit = defineEmits<{
  (e: 'select', unit: { name: string; side: 'ally' | 'enemy'; isAlive: boolean }): void;
}>();

function statusList(u: BattleUnit): Array<{ key: string; tone: string }> {
  return u.statusEffects.map(eff => ({
    key: `${eff.type}-${eff.source ?? ''}`,
    tone: DEBUFF_TYPES.includes(eff.type) ? 'debuff'
      : (eff.type.includes('up') || eff.type === 'shield' || eff.type.includes('boost') ? 'buff' : 'neutral'),
  }));
}

function hpWidth(u: BattleUnit): string {
  return `${Math.max(0, Math.min(100, (u.HP / Math.max(1, u.HPMax)) * 100))}%`;
}

const isActor = computed(() => props.anim?.actorId ?? null);
const isTarget = computed(() => {
  if (!props.anim) return new Set<string>();
  if (props.anim.targetIds.length > 0) return new Set(props.anim.targetIds);
  return new Set<string>();
});

function enemySlotClass(): Record<string, boolean> {
  const u = props.enemyUnit;
  const cls: Record<string, boolean> = {};
  if (!u || u.HP <= 0) cls['arena-slot-dead'] = true;
  else cls['arena-slot-alive'] = true;
  if (u && u.name === props.currentActorName) cls['arena-slot-current'] = true;
  if (u && u.name === props.selectedTargetName && props.needsEnemyTarget) cls['arena-slot-targeted'] = true;
  if (props.needsEnemyTarget && u && u.HP > 0) cls['arena-slot-selectable'] = true;
  if (props.anim && u && isTarget.value.has(u.name)) {
    const t = props.anim.type;
    if (t === 'single_attack' || t === 'group_attack') cls['arena-slot-hit'] = true;
    if (t === 'single_heal' || t === 'group_heal') cls['arena-slot-heal'] = true;
    if (t === 'single_buff' || t === 'group_buff') cls['arena-slot-buff'] = true;
    if (t === 'apply_status') cls['arena-slot-status'] = true;
  }
  return cls;
}

function allySlotClass(): Record<string, boolean> {
  const u = props.allyUnit;
  const cls: Record<string, boolean> = {};
  if (!u || u.HP <= 0) cls['arena-slot-dead'] = true;
  else cls['arena-slot-alive'] = true;
  if (u && u.name === props.currentActorName) cls['arena-slot-current'] = true;
  if (u && u.name === props.selectedTargetName && props.needsAllyTarget) cls['arena-slot-targeted'] = true;
  if (props.needsAllyTarget && u && u.HP > 0) cls['arena-slot-selectable'] = true;
  if (props.anim && u && isTarget.value.has(u.name)) {
    const t = props.anim.type;
    if (t === 'single_attack' || t === 'group_attack') cls['arena-slot-hit'] = true;
    if (t === 'single_heal' || t === 'group_heal') cls['arena-slot-heal'] = true;
    if (t === 'single_buff' || t === 'group_buff') cls['arena-slot-buff'] = true;
    if (t === 'apply_status') cls['arena-slot-status'] = true;
  }
  return cls;
}

function orbAnimClass(unitName: string): string {
  if (!props.anim) return '';
  if (unitName === isActor.value) {
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

function onClick(unit: BattleUnit | null, side: 'ally' | 'enemy') {
  if (!unit || unit.HP <= 0) return;
  emit('select', { name: unit.name, side, isAlive: true });
}
</script>
