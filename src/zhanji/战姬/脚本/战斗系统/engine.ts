// ====================================================================
// 战斗引擎 - 宝可梦风格3v3（可选目标/命中闪避/换人/逃跑）
// ====================================================================

import type {
  ActionResult,
  BattleCommand,
  BattleItem,
  ItemUseResult,
  BattleLogEntry,
  BattleResult,
  BattleUnit,
  CaptureAttempt,
  CaptureRollResult,
  EffectFormula,
  Element,
  EnemyAiPersona,
  EnemyAiTuning,
  EnemyTrainerArchetype,
  EnemyTrainerProfile,
  EscapeResult,
  FieldBuff,
  ForcedSwitchState,
  SkillData,
  SkillParams,
  SkillTargetType,
  StatusEffect,
  StatusEffectType,
  TeamUnitState,
  TurnEffectResult,
} from './types';

// ====================================================================
// 常量与克制
// ====================================================================

const ELEMENT_CHART: Record<string, string[]> = {
  火: ['风'],
  风: ['地'],
  地: ['水'],
  水: ['火'],
  光: ['暗'],
  暗: ['光'],
  无: [],
};

const SUPER_EFFECTIVE = 1.5;
const NOT_EFFECTIVE = 0.67;
const SAME_TYPE = 0.5;
const STAB_BONUS = 1.35;
const BASE_CRIT_RATE = 0.0625;
const CRIT_MULTIPLIER = 1.5;
const DAMAGE_SCALE = 1.15;
const MAX_ROUNDS = 80;
const SPEED_EXTRA_ACTION_CAP = 0.45;



const ENEMY_AI_TUNING: Record<EnemyAiPersona, EnemyAiTuning> = {
  激进: {
    switchThreshold: 0.08,
    escapeBaseLowHp: 0.02,
    escapeBaseCriticalHp: 0.05,
    skillWeights: {
      power: 1.2,
      hit: 0.8,
      status: 0.9,
      heal: 0.55,
      selfBuff: 0.6,
      finish: 1.35,
    },
  },
  均衡: {
    switchThreshold: 0.12,
    escapeBaseLowHp: 0.05,
    escapeBaseCriticalHp: 0.09,
    skillWeights: {
      power: 1,
      hit: 1,
      status: 1,
      heal: 1,
      selfBuff: 1,
      finish: 1,
    },
  },
  保守: {
    switchThreshold: 0.18,
    escapeBaseLowHp: 0.09,
    escapeBaseCriticalHp: 0.16,
    skillWeights: {
      power: 0.82,
      hit: 1.15,
      status: 1.1,
      heal: 1.35,
      selfBuff: 1.3,
      finish: 0.8,
    },
  },
};

const DEFAULT_ATTACK_SKILL: SkillData = {
  name: '普通攻击',
  类型: '主动',
  稀有度: 'N',
  元素属性: '无',
  消耗MP: 0,
  冷却回合: 0,
  基础威力: 42,
  描述: '基础物理攻击，不消耗MP。',
  效果公式: 'physical_damage',
  目标类型: 'single_enemy',
  数值参数: { 伤害类型: 0, 命中率: 0.98 },
};

const FIELD_BUFF_STATUS_TYPES: StatusEffectType[] = [
  'atk_up',
  'def_up',
  'spa_up',
  'spd_up',
  'speed_up',
  'acc_up',
  'eva_up',
  'damage_boost',
  'skill_boost',
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function calcResistMod(affection?: number, corruption?: number, nature?: string): number {
  let a = 0;
  if (affection != null) {
    if (affection >= 150) a = -0.10;
    else if (affection >= 100) a = -0.05;
    else if (affection >= 50) a = 0;
    else if (affection >= 0) a = 0.05;
    else if (affection > -50) a = 0.15;
    else a = 0.25;
  }
  let c = 0;
  if (corruption != null) {
    if (corruption >= 80) c = -0.05;
    else if (corruption >= 50) c = 0;
    else if (corruption >= 20) c = 0.05;
    else c = 0.10;
  }
  let n = 0;
  if (nature) {
    const strongWills = ['固执', '勇敢', '大胆', '慎重', '内敛', '冷静', '认真'];
    const weakWills = ['胆小', '温和', '害羞', '悠闲', '天真'];
    if (strongWills.includes(nature)) n = 0.05;
    else if (weakWills.includes(nature)) n = -0.05;
  }
  return clamp(a + c + n, 0, 0.35);
}

function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function getTypeEffectiveness(atkElement: Element, defElement: Element): number {
  if (atkElement === '无' || defElement === '无') return 1.0;
  if (atkElement === defElement) return SAME_TYPE;
  if (ELEMENT_CHART[atkElement]?.includes(defElement)) return SUPER_EFFECTIVE;
  if (ELEMENT_CHART[defElement]?.includes(atkElement)) return NOT_EFFECTIVE;
  return 1.0;
}

function inferFormula(skill: SkillData): EffectFormula {
  const f = skill.效果公式?.toLowerCase?.() ?? '';
  if (['physical_damage', 'magic_damage', 'heal', 'buff', 'debuff', 'drain_physical', 'drain_magic', 'shield_damage'].includes(f)) {
    return f as EffectFormula;
  }
  const p = skill.数值参数 ?? {};
  if (p.治疗量 || p.治疗比例) return 'heal';
  if (p.攻击加成 || p.防御加成 || p.特攻加成 || p.特防加成 || p.速度加成 || p.命中加成 || p.闪避加成) {
    const sum =
      (p.攻击加成 ?? 0) +
      (p.防御加成 ?? 0) +
      (p.特攻加成 ?? 0) +
      (p.特防加成 ?? 0) +
      (p.速度加成 ?? 0) +
      (p.命中加成 ?? 0) +
      (p.闪避加成 ?? 0);
    return sum >= 0 ? 'buff' : 'debuff';
  }
  if (p.吸血比例) return p.伤害类型 === 1 ? 'drain_magic' : 'drain_physical';
  if (skill.基础威力 > 0) return p.伤害类型 === 1 ? 'magic_damage' : 'physical_damage';
  return 'physical_damage';
}

function resolveSkillTargetType(skill: SkillData): SkillTargetType {
  if (skill.目标类型 && ['single_enemy', 'self', 'ally', 'all_enemies', 'all_allies'].includes(skill.目标类型)) {
    return skill.目标类型;
  }
  const formula = inferFormula(skill);
  if (formula === 'heal' || formula === 'buff') return 'self';
  return 'single_enemy';
}

function collectBuffEffectsFromParams(params: SkillParams, duration: number, source: string): FieldBuff[] {
  const buffMap: Array<[keyof SkillParams, FieldBuff['type']]> = [
    ['攻击加成', 'atk_up'],
    ['防御加成', 'def_up'],
    ['特攻加成', 'spa_up'],
    ['特防加成', 'spd_up'],
    ['速度加成', 'speed_up'],
    ['命中加成', 'acc_up'],
    ['闪避加成', 'eva_up'],
  ];

  const effects: FieldBuff[] = [];
  for (const [key, type] of buffMap) {
    const value = params[key];
    if (value && value > 0 && FIELD_BUFF_STATUS_TYPES.includes(type)) {
      effects.push({ type, value, remainingTurns: duration, source });
    }
  }
  return effects;
}

function getEffectiveStat(
  unit: BattleUnit,
  stat: '攻击力' | '防御力' | '特攻' | '特防' | '速度',
  extraEffects: StatusEffect[] = [],
): number {
  let base = unit[stat];

  const affection = unit.好感度;
  if (affection != null) {
    if (affection < 0) base = Math.floor(base * 0.70);
    else if (affection < 50) base = Math.floor(base * 0.85);
    else if (affection < 100) base = Math.floor(base * 1.0);
    else if (affection < 150) base = Math.floor(base * 1.10);
    else base = Math.floor(base * 1.20);
  }

  const statMap: Record<string, StatusEffectType[]> = {
    攻击力: ['atk_up', 'atk_down'],
    防御力: ['def_up', 'def_down'],
    特攻: ['spa_up', 'spa_down'],
    特防: ['spd_up', 'spd_down'],
    速度: ['speed_up', 'speed_down'],
  };
  const [upType, downType] = statMap[stat];
  const allEffects = [...unit.statusEffects, ...extraEffects];
  for (const eff of allEffects) {
    if (eff.type === upType) base = Math.floor(base * (1 + eff.value));
    if (eff.type === downType) base = Math.floor(base * (1 - eff.value));
  }
  return Math.max(1, base);
}

function getAccEvaMultiplier(unit: BattleUnit, extraEffects: StatusEffect[] = []): { acc: number; eva: number } {
  let acc = 1;
  let eva = 1;
  const allEffects = [...unit.statusEffects, ...extraEffects];
  for (const eff of allEffects) {
    if (eff.type === 'acc_up') acc += eff.value;
    if (eff.type === 'acc_down') acc -= eff.value;
    if (eff.type === 'eva_up') eva += eff.value;
    if (eff.type === 'eva_down') eva -= eff.value;
  }
  return { acc: clamp(acc, 0.6, 1.8), eva: clamp(eva, 0.6, 1.8) };
}

function getDamageBoostMultiplier(unit: BattleUnit, extraEffects: StatusEffect[] = []): number {
  let mult = 1.0;
  const allEffects = [...unit.statusEffects, ...extraEffects];
  for (const eff of allEffects) {
    if (eff.type === 'damage_boost') mult += eff.value;
    if (eff.type === 'skill_boost') mult += eff.value;
  }
  return Math.max(0.2, mult);
}

function consumeSkillBoost(unit: BattleUnit): void {
  const idx = unit.statusEffects.findIndex(e => e.type === 'skill_boost');
  if (idx >= 0) {
    unit.statusEffects[idx].remainingTurns--;
    if (unit.statusEffects[idx].remainingTurns <= 0) {
      unit.statusEffects.splice(idx, 1);
    }
  }
}

function getHitRate(
  attacker: BattleUnit,
  defender: BattleUnit,
  skill: SkillData,
  attackerExtraEffects: StatusEffect[] = [],
  defenderExtraEffects: StatusEffect[] = [],
): number {
  const base = clamp(skill.数值参数?.命中率 ?? 0.95, 0.35, 1.0);
  const atkAcc = getAccEvaMultiplier(attacker, attackerExtraEffects).acc;
  const defEva = getAccEvaMultiplier(defender, defenderExtraEffects).eva;
  return clamp(base * (atkAcc / defEva), 0.3, 1.0);
}

function calcDamage(
  level: number,
  basePower: number,
  atk: number,
  def: number,
  atkElement: Element,
  defElement: Element,
  skillElement: Element,
  extraCritRate: number,
  damageBoost: number,
  defenderHPMax: number,
  skillCoefficient: number = 0,
): { damage: number; isCritical: boolean; effectiveness: 'super' | 'normal' | 'resist' | 'same' } {
  // 技能原则公式: (ATK × 系数 + 威力) × 防御减免 × 全局缩放
  // 目标: 史诗技能单次约占HP 10~15%，碾压局5~8回合，势均力敌15~25回合
  let base: number;
  if (skillCoefficient > 0) {
    const rawDmg = atk * skillCoefficient + basePower;
    const defMitigation = def / Math.max(1, def + atk * 0.5);
    base = rawDmg * (1 - defMitigation * 0.6) * 0.55;
  } else {
    const ratio = Math.pow(atk / Math.max(1, def), 0.92);
    base = (((2 * level) / 5 + 2) * Math.max(1, basePower) * ratio) / 60 + 2;
  }

  const typeMod = getTypeEffectiveness(skillElement, defElement);
  let effectiveness: 'super' | 'normal' | 'resist' | 'same' = 'normal';
  if (typeMod >= SUPER_EFFECTIVE) effectiveness = 'super';
  else if (typeMod <= SAME_TYPE) effectiveness = 'same';
  else if (typeMod < 1.0) effectiveness = 'resist';

  const stab = skillElement === atkElement ? STAB_BONUS : 1.0;
  const critRate = Math.min(0.5, BASE_CRIT_RATE + (extraCritRate || 0));
  const isCritical = Math.random() < critRate;
  const critMod = isCritical ? CRIT_MULTIPLIER : 1.0;
  const random = randFloat(0.92, 1.0);

  let damage = Math.max(1, Math.floor(base * typeMod * stab * critMod * random * DAMAGE_SCALE * damageBoost));

  const hasCoe = skillCoefficient > 0;
  const capRate =
    effectiveness === 'super'
      ? hasCoe
        ? 0.38
        : 0.28
      : effectiveness === 'normal'
        ? hasCoe
          ? 0.22
          : 0.18
        : effectiveness === 'resist'
          ? hasCoe
            ? 0.16
            : 0.14
          : hasCoe
            ? 0.13
            : 0.12;
  const cap = Math.max(6, Math.floor(defenderHPMax * capRate));
  damage = Math.min(damage, cap);

  return { damage, isCritical, effectiveness };
}

function tryApplyStatus(
  target: BattleUnit,
  type: StatusEffectType,
  probability: number,
  duration: number,
  value: number,
  source?: string,
): string | undefined {
  if (Math.random() >= probability) return undefined;
  const existing = target.statusEffects.find(e => e.type === type && (source ? e.source === source : true));
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, duration);
    existing.value = Math.max(existing.value, value);
    if (source) existing.source = source;
  } else {
    target.statusEffects.push({ type, remainingTurns: duration, value, source });
  }

  const nameMap: Record<string, string> = {
    burn: '灼烧',
    poison: '中毒',
    freeze: '冰冻',
    paralyze: '麻痹',
    confuse: '混乱',
    atk_up: '攻击↑',
    atk_down: '攻击↓',
    def_up: '防御↑',
    def_down: '防御↓',
    spa_up: '特攻↑',
    spa_down: '特攻↓',
    spd_up: '特防↑',
    spd_down: '特防↓',
    speed_up: '速度↑',
    speed_down: '速度↓',
    acc_up: '命中↑',
    acc_down: '命中↓',
    eva_up: '闪避↑',
    eva_down: '闪避↓',
    shield: '护盾',
    damage_boost: '增伤',
    skill_boost: '技能强化',
  };
  return nameMap[type] ?? type;
}

function checkPassives(unit: BattleUnit, trigger: 'on_hit' | 'on_attack' | 'on_low_hp'): string[] {
  const triggered: string[] = [];
  for (const passive of unit.passives) {
    const p = passive.数值参数 ?? {};
    if (trigger === 'on_low_hp' && unit.HP < unit.HPMax * 0.3) {
      if (p.防御加成 && p.防御加成 > 0) {
        const existing = unit.statusEffects.find(e => e.type === 'def_up' && e.source === passive.name);
        if (!existing) {
          unit.statusEffects.push({ type: 'def_up', remainingTurns: 99, value: p.防御加成, source: passive.name });
          triggered.push(`${passive.name}: 防御↑`);
        }
      }
    }
    if (trigger === 'on_attack' && p.暴击率加成) {
      triggered.push(`${passive.name}: 暴击率+${Math.floor(p.暴击率加成 * 100)}%`);
    }
    if (trigger === 'on_hit' && p.护盾触发概率 && p.护盾触发概率 > 0) {
      if (Math.random() < p.护盾触发概率) {
        const byValue = p.护盾值 ?? 0;
        const byRate = Math.floor(unit.HPMax * (p.护盾比例 ?? 0));
        const shieldGranted = Math.max(0, byValue + byRate);
        if (shieldGranted > 0) {
          const cap = unit.shieldMax > 0 ? unit.shieldMax : unit.HPMax;
          unit.shield = Math.min(Math.max(0, unit.shield + shieldGranted), cap);
          tryApplyStatus(unit, 'shield', 1.0, Math.max(1, p.持续回合 ?? 2), unit.shield, passive.name);
          triggered.push(`${passive.name}: 护盾+${shieldGranted}`);
        }
      }
    }
  }
  return triggered;
}

function buildStatusMessage(defender: BattleUnit, skill: SkillData, params: SkillParams, attacker?: BattleUnit): string | undefined {
  const statusApplied: string[] = [];
  const source = skill.name;
  const formula = inferFormula(skill);
  const duration = params.持续回合 ?? 2;

  if (params.灼烧概率) {
    const s = tryApplyStatus(defender, 'burn', params.灼烧概率, params.灼烧回合 ?? 3, params.灼烧伤害 ?? 0.05, source);
    if (s) statusApplied.push(s);
  }
  if (params.中毒概率) {
    const s = tryApplyStatus(
      defender,
      'poison',
      params.中毒概率,
      params.中毒回合 ?? 3,
      params.中毒伤害 ?? 0.06,
      source,
    );
    if (s) statusApplied.push(s);
  }
  if (params.冰冻概率) {
    const s = tryApplyStatus(defender, 'freeze', params.冰冻概率, params.冰冻回合 ?? 1, 0, source);
    if (s) statusApplied.push(s);
  }
  if (params.麻痹概率) {
    const s = tryApplyStatus(defender, 'paralyze', params.麻痹概率, params.麻痹回合 ?? 2, 0.25, source);
    if (s) statusApplied.push(s);
  }
  if (params.混乱概率) {
    const s = tryApplyStatus(defender, 'confuse', params.混乱概率, params.混乱回合 ?? 2, 0.35, source);
    if (s) statusApplied.push(s);
  }
  if (params.流血概率) {
    const s = tryApplyStatus(defender, 'bleed', params.流血概率, params.流血回合 ?? 3, params.流血伤害 ?? 0.04, source);
    if (s) statusApplied.push(s);
  }

  const buffMap: [keyof SkillParams, StatusEffectType][] = [
    ['攻击加成', 'atk_up'],
    ['防御加成', 'def_up'],
    ['特攻加成', 'spa_up'],
    ['特防加成', 'spd_up'],
    ['速度加成', 'speed_up'],
    ['命中加成', 'acc_up'],
    ['闪避加成', 'eva_up'],
    ['全属性加成', 'all_up'],
  ];

  const debuffMap: [keyof SkillParams, StatusEffectType][] = [
    ['攻击加成', 'atk_down'],
    ['防御加成', 'def_down'],
    ['特攻加成', 'spa_down'],
    ['特防加成', 'spd_down'],
    ['速度加成', 'speed_down'],
    ['命中加成', 'acc_down'],
    ['闪避加成', 'eva_down'],
    ['全属性加成', 'all_down'],
  ];

  for (const [key, type] of buffMap) {
    const v = params[key];
    if (v && v > 0 && formula !== 'debuff') {
      const target = formula === 'buff' ? defender : (attacker ?? defender);
      const s = tryApplyStatus(target, type, 1.0, duration, v, source);
      if (s) statusApplied.push(s);
    }
  }
  for (const [key, type] of debuffMap) {
    const v = params[key];
    if (v && v > 0 && formula === 'debuff') {
      const target = defender;
      const s = tryApplyStatus(target, type, 1.0, duration, v, source);
      if (s) statusApplied.push(s);
    }
  }

  return statusApplied.length ? statusApplied.join('/') : undefined;
}

function isFrozen(unit: BattleUnit): boolean {
  return unit.statusEffects.some(e => e.type === 'freeze');
}

function processStatusStartTurn(unit: BattleUnit): TurnEffectResult[] {
  const results: TurnEffectResult[] = [];

  for (const eff of unit.statusEffects) {
    if (eff.type === 'freeze') {
      results.push({
        unit: unit.name,
        type: '冰冻',
        damage: 0,
        message: `${unit.name} 处于冰冻状态`,
      });
      continue;
    }
    if (eff.type === 'paralyze') {
      results.push({
        unit: unit.name,
        type: '麻痹',
        damage: 0,
        message: `${unit.name} 处于麻痹状态`,
      });
      continue;
    }
    if (eff.type === 'confuse') {
      results.push({
        unit: unit.name,
        type: '混乱',
        damage: 0,
        message: `${unit.name} 陷入混乱`,
      });
    }
  }

  return results;
}

function syncShieldStatus(unit: BattleUnit): void {
  const shieldEffect = unit.statusEffects.find(e => e.type === 'shield');
  if (!shieldEffect) return;

  if (unit.shield <= 0) {
    unit.shield = 0;
    shieldEffect.value = 0;
    shieldEffect.remainingTurns = 0;
    return;
  }

  shieldEffect.value = unit.shield;
}

function processStatusEndTurn(unit: BattleUnit): TurnEffectResult[] {
  const results: TurnEffectResult[] = [];

  for (const eff of unit.statusEffects) {
    if (eff.type === 'burn' || eff.type === 'poison') {
      const dot = Math.max(1, Math.floor(unit.HPMax * eff.value));
      unit.HP = Math.max(0, unit.HP - dot);
      const label = eff.type === 'burn' ? '灼烧' : '中毒';
      results.push({
        unit: unit.name,
        type: label,
        damage: dot,
        message: `${unit.name} 受到${label}伤害 ${dot}`,
      });
    }

    if (eff.type === 'shield') {
      syncShieldStatus(unit);
    }

    eff.remainingTurns--;
    if (eff.remainingTurns === 0) {
      const endedLabelMap: Record<string, string> = {
        burn: '灼烧',
        poison: '中毒',
        freeze: '冰冻',
        paralyze: '麻痹',
        confuse: '混乱',
        atk_up: '攻击提升',
        atk_down: '攻击下降',
        def_up: '防御提升',
        def_down: '防御下降',
        spa_up: '特攻提升',
        spa_down: '特攻下降',
        spd_up: '特防提升',
        spd_down: '特防下降',
        speed_up: '速度提升',
        speed_down: '速度下降',
        acc_up: '命中提升',
        acc_down: '命中下降',
        eva_up: '闪避提升',
        eva_down: '闪避下降',
        shield: '护盾强化',
        damage_boost: '增伤',
        skill_boost: '技能强化',
      };
      const label = endedLabelMap[eff.type] ?? eff.type;
      results.push({
        unit: unit.name,
        type: '结束',
        damage: 0,
        message: `${unit.name} 的${label}效果结束`,
      });
      if (eff.type === 'shield') {
        unit.shield = 0;
      }
    }
  }

  unit.statusEffects = unit.statusEffects.filter(e => e.remainingTurns > 0);
  return results;
}

function executeSkill(
  attacker: BattleUnit,
  defender: BattleUnit,
  skill: SkillData,
  attackerExtraEffects: StatusEffect[] = [],
  defenderExtraEffects: StatusEffect[] = [],
): ActionResult {
  const params: SkillParams = skill.数值参数 ?? {};
  const formula = inferFormula(skill);

  let damage = 0;
  let shieldDamage = 0;
  let healed = 0;
  let isCritical = false;
  let effectiveness: 'super' | 'normal' | 'resist' | 'same' = 'normal';
  const passiveTriggered: string[] = [];

  const hitRate = getHitRate(attacker, defender, skill, attackerExtraEffects, defenderExtraEffects);

  // 按稀有度固定MP消耗：普通5/稀有12/史诗20/传说32/神话45
  const RARITY_MP_COST: Record<string, number> = { N: 0, 普通: 5, 稀有: 12, 史诗: 20, 传说: 32, 神话: 45 };
  const mpCost = RARITY_MP_COST[skill.稀有度] ?? 0;
  attacker.MP = Math.max(0, attacker.MP - mpCost);
  if (skill.冷却回合 > 0) {
    attacker.cooldowns[skill.name] = skill.冷却回合 + 1;
  }

  passiveTriggered.push(...checkPassives(attacker, 'on_attack'));
  const extraCrit = attacker.passives.reduce((sum, p) => sum + (p.数值参数?.暴击率加成 ?? 0), 0);
  const damageBoost = getDamageBoostMultiplier(attacker, attackerExtraEffects);

  const isDamageSkill = ['physical_damage', 'magic_damage', 'drain_physical', 'drain_magic', 'shield_damage'].includes(formula);
  const isHit = !isDamageSkill || Math.random() <= hitRate;

  if (!isHit) {
    return {
      attacker: attacker.name,
      defender: defender.name,
      skillName: skill.name,
      damage: 0,
      shieldDamage: 0,
      healed: 0,
      isCritical: false,
      isMissed: true,
      hitRate,
      effectiveness: 'normal',
      message: `${attacker.name} 使用了 ${skill.name}，但未命中！`,
      passiveTriggered: passiveTriggered.length ? passiveTriggered : undefined,
    };
  }

  switch (formula) {
    case 'physical_damage': {
      const atk = getEffectiveStat(attacker, '攻击力', attackerExtraEffects);
      const def = getEffectiveStat(defender, '防御力', defenderExtraEffects);
      const r = calcDamage(
        attacker.等级,
        skill.基础威力,
        atk,
        def,
        attacker.元素属性,
        defender.元素属性,
        skill.元素属性,
        (params.暴击率加成 ?? 0) + extraCrit,
        damageBoost,
        defender.HPMax,
        params.系数 ?? 0,
      );
      damage = r.damage;
      isCritical = r.isCritical;
      effectiveness = r.effectiveness;
      break;
    }
    case 'magic_damage': {
      const spa = getEffectiveStat(attacker, '特攻', attackerExtraEffects);
      const spd = getEffectiveStat(defender, '特防', defenderExtraEffects);
      const r = calcDamage(
        attacker.等级,
        skill.基础威力,
        spa,
        spd,
        attacker.元素属性,
        defender.元素属性,
        skill.元素属性,
        (params.暴击率加成 ?? 0) + extraCrit,
        damageBoost,
        defender.HPMax,
        params.系数 ?? 0,
      );
      damage = r.damage;
      isCritical = r.isCritical;
      effectiveness = r.effectiveness;
      break;
    }
    case 'drain_physical':
    case 'drain_magic': {
      const isPhys = formula === 'drain_physical';
      const atkStat = getEffectiveStat(attacker, isPhys ? '攻击力' : '特攻', attackerExtraEffects);
      const defStat = getEffectiveStat(defender, isPhys ? '防御力' : '特防', defenderExtraEffects);
      const r = calcDamage(
        attacker.等级,
        skill.基础威力,
        atkStat,
        defStat,
        attacker.元素属性,
        defender.元素属性,
        skill.元素属性,
        (params.暴击率加成 ?? 0) + extraCrit,
        damageBoost,
        defender.HPMax,
        params.系数 ?? 0,
      );
      damage = r.damage;
      isCritical = r.isCritical;
      effectiveness = r.effectiveness;
      const drainRatio = clamp(params.吸血比例 ?? 0.4, 0.1, 1.0);
      healed = Math.min(Math.floor(damage * drainRatio), attacker.HPMax - attacker.HP);
      attacker.HP += healed;
      break;
    }
    case 'shield_damage': {
      const defAsAtk = getEffectiveStat(attacker, '防御力', attackerExtraEffects);
      const shieldBonus = params.护盾倍率 ? Math.floor(attacker.shield * params.护盾倍率) : 0;
      const def = getEffectiveStat(defender, '防御力', defenderExtraEffects);
      const r = calcDamage(
        attacker.等级,
        skill.基础威力 + shieldBonus,
        defAsAtk,
        def,
        attacker.元素属性,
        defender.元素属性,
        skill.元素属性,
        (params.暴击率加成 ?? 0) + extraCrit,
        damageBoost,
        defender.HPMax,
        params.系数 ?? 0,
      );
      damage = r.damage;
      isCritical = r.isCritical;
      effectiveness = r.effectiveness;
      break;
    }
    case 'heal': {
      const healAmt = params.治疗量 ?? Math.floor(defender.HPMax * (params.治疗比例 ?? 0.25));
      healed = Math.max(0, Math.min(healAmt, defender.HPMax - defender.HP));
      defender.HP += healed;
      break;
    }
    case 'buff':
    case 'debuff':
      break;
  }

  if (damage > 0 && defender.shield > 0) {
    shieldDamage = Math.min(damage, defender.shield);
    defender.shield -= shieldDamage;
    damage -= shieldDamage;
  }
  // 魔导型特色：元素技能伤害+20%
  if (damage > 0 && attacker.战斗类型 === '魔导型' && skill.元素属性 !== '无') {
    damage = Math.floor(damage * 1.2);
  }

  if (damage > 0) {
    defender.HP = Math.max(0, defender.HP - damage);
  }

  // 强攻型特色：造成伤害后回复伤害×15%的MP
  if (damage > 0 && attacker.战斗类型 === '强攻型') {
    attacker.MP = Math.min(attacker.MPMax, attacker.MP + Math.floor(damage * 0.15));
  }

  consumeSkillBoost(attacker);

  let shieldGranted = 0;
  if (params.护盾值 || params.护盾比例) {
    const byValue = params.护盾值 ?? 0;
    const byRate = Math.floor(defender.HPMax * (params.护盾比例 ?? 0));
    shieldGranted = Math.max(0, byValue + byRate);
    if (shieldGranted > 0) {
      const shieldCap = defender.shieldMax > 0 ? defender.shieldMax : defender.HPMax;
      defender.shield = clamp(defender.shield + shieldGranted, 0, shieldCap);
      const shieldDuration = Math.max(1, params.持续回合 ?? 2);
      tryApplyStatus(defender, 'shield', 1.0, shieldDuration, defender.shield, skill.name);
    }
  }

  syncShieldStatus(defender);

  if (damage > 0 || shieldDamage > 0) {
    passiveTriggered.push(...checkPassives(defender, 'on_hit'));
    passiveTriggered.push(...checkPassives(defender, 'on_low_hp'));
  }

  const statusApplied = buildStatusMessage(defender, skill, params, attacker);

  const effText =
    effectiveness === 'super'
      ? '效果拔群！'
      : effectiveness === 'resist'
        ? '效果不佳...'
        : effectiveness === 'same'
          ? '同属性抵消...'
          : '';

  let msg = `${attacker.name} 使用了 ${skill.name}`;
  if (damage > 0 || shieldDamage > 0) msg += `，造成 ${damage + shieldDamage} 点伤害`;
  if (shieldDamage > 0) msg += `（护盾吸收${shieldDamage}）`;
  if (healed > 0 && formula === 'heal') msg += `，恢复 ${healed} HP`;
  else if (healed > 0) msg += `，吸取 ${healed} HP`;
  if (shieldGranted > 0) msg += `，获得 ${shieldGranted} 护盾`;
  if (isCritical) msg += ' 暴击！';
  if (effText) msg += ` ${effText}`;
  if (statusApplied) msg += ` 附加${statusApplied}`;

  return {
    attacker: attacker.name,
    defender: defender.name,
    skillName: skill.name,
    damage,
    shieldDamage,
    healed,
    isCritical,
    effectiveness,
    isMissed: false,
    hitRate,
    statusApplied,
    passiveTriggered: passiveTriggered.length ? passiveTriggered : undefined,
    message: msg,
  };
}

// ====================================================================
// BattleEngine - 3v3
// ====================================================================

export class BattleEngine {
  allyTeam: BattleUnit[];
  enemyTeam: BattleUnit[];
  allyActiveIndex = 0;
  enemyActiveIndex = 0;

  round = 0;
  log: BattleLogEntry[] = [];
  battleOver = false;
  winner: 'ally' | 'enemy' | 'escape' | null = null;
  escapeAttempts = 0;
  itemUsed = false;
  lastItemUseResult: ItemUseResult | null = null;
  consecutiveExtraCount: Record<'ally' | 'enemy', number> = { ally: 0, enemy: 0 };

  allyFieldBuffs: FieldBuff[] = [];
  enemyFieldBuffs: FieldBuff[] = [];
  pendingForcedSwitch: ForcedSwitchState | null = null;

  enemyPlannedCommand: BattleCommand | null = null;
  enemyTrainerProfile: EnemyTrainerProfile;
  enemyAiPersona: EnemyAiPersona;
  enemyPostAction: 'continue' | 'retreat' | 'surrender' | undefined;

  constructor(allyTeam: BattleUnit[], enemyTeam: BattleUnit[], enemyTrainerProfile?: EnemyTrainerProfile) {
    this.allyTeam = allyTeam;
    this.enemyTeam = enemyTeam;
    this.enemyTrainerProfile = enemyTrainerProfile ?? {
      类型: '未知',
      意志状态: '未知',
      持有捕捉球: true,
      捕捉球类型: '普通球',
      战斗人格: '均衡',
      人格来源: '默认',
    };
    this.enemyAiPersona = this.enemyTrainerProfile.战斗人格 ?? '均衡';
    this.enemyTrainerProfile.战斗人格 = this.enemyAiPersona;
    this.enemyTrainerProfile.人格来源 = this.enemyTrainerProfile.人格来源 ?? '默认';

    this.allyActiveIndex = this.findFirstAliveIndex('ally');
    this.enemyActiveIndex = this.findFirstAliveIndex('enemy');

    this.addLog('system', `战斗开始！${this.ally.name} vs ${this.enemy.name}`);
    if (this.enemyTrainerProfile.类型) {
      this.addLog('system', `敌方训练家类型：${this.enemyTrainerProfile.类型}`);
    }
    this.addLog(
      'system',
      `敌方AI人格：${this.enemyAiPersona}（${this.enemyTrainerProfile.人格来源 === '映射随机' ? '按训练家态度映射随机' : '默认'}）`,
    );
  }

  get ally(): BattleUnit {
    return this.allyTeam[this.allyActiveIndex];
  }

  get enemy(): BattleUnit {
    return this.enemyTeam[this.enemyActiveIndex];
  }

  private addLog(type: BattleLogEntry['type'], message: string): void {
    this.log.push({ type, message, turn: this.round });
  }

  getPendingForcedSwitch(): ForcedSwitchState | null {
    return this.pendingForcedSwitch;
  }

  setCaptureTarget(index: number): boolean {
    if (!this.enemyTeam[index]) return false;
    this.enemyActiveIndex = index;
    return true;
  }

  getDefeatedEnemyIndices(): number[] {
    return this.enemyTeam
      .map((u, index) => ({ unit: u, index }))
      .filter(x => this.isDefeated(x.unit))
      .map(x => x.index);
  }

  private getTeam(side: 'ally' | 'enemy'): BattleUnit[] {
    return side === 'ally' ? this.allyTeam : this.enemyTeam;
  }

  private getActiveIndex(side: 'ally' | 'enemy'): number {
    return side === 'ally' ? this.allyActiveIndex : this.enemyActiveIndex;
  }

  private setActiveIndex(side: 'ally' | 'enemy', index: number): void {
    if (side === 'ally') this.allyActiveIndex = index;
    else this.enemyActiveIndex = index;
  }

  private getActive(side: 'ally' | 'enemy'): BattleUnit {
    return this.getTeam(side)[this.getActiveIndex(side)];
  }

  private isDefeated(unit: BattleUnit): boolean {
    return unit.HP <= 0;
  }

  private findFirstAliveIndex(side: 'ally' | 'enemy'): number {
    const team = this.getTeam(side);
    const idx = team.findIndex(u => !this.isDefeated(u));
    return idx >= 0 ? idx : 0;
  }

  private getBenchAliveIndices(side: 'ally' | 'enemy'): number[] {
    const team = this.getTeam(side);
    const active = this.getActiveIndex(side);
    const result: number[] = [];
    team.forEach((u, i) => {
      if (i !== active && !this.isDefeated(u)) result.push(i);
    });
    return result;
  }

  private hasAnyAlive(side: 'ally' | 'enemy'): boolean {
    return this.getTeam(side).some(u => !this.isDefeated(u));
  }

  private totalTeamHP(side: 'ally' | 'enemy'): number {
    return this.getTeam(side).reduce((sum, u) => sum + Math.max(0, u.HP), 0);
  }

  private getEnemyArchetype(): EnemyTrainerArchetype {
    return this.enemyTrainerProfile.类型 ?? '未知';
  }

  private getFieldBuffs(side: 'ally' | 'enemy'): FieldBuff[] {
    return side === 'ally' ? this.allyFieldBuffs : this.enemyFieldBuffs;
  }

  private getFieldEffectStatuses(side: 'ally' | 'enemy'): StatusEffect[] {
    return this.getFieldBuffs(side).map(buff => ({
      type: buff.type,
      remainingTurns: buff.remainingTurns,
      value: buff.value,
      source: buff.source,
    }));
  }

  private applyFieldBuff(side: 'ally' | 'enemy', buffs: FieldBuff[]): void {
    if (!buffs.length) return;
    const target = this.getFieldBuffs(side);
    for (const buff of buffs) {
      const existed = target.find(b => b.type === buff.type && b.source === buff.source);
      if (existed) {
        existed.value = Math.max(existed.value, buff.value);
        existed.remainingTurns = Math.max(existed.remainingTurns, buff.remainingTurns);
      } else {
        target.push({ ...buff });
      }
    }
  }

  private tickFieldBuffs(): void {
    for (const side of ['ally', 'enemy'] as const) {
      const pool = this.getFieldBuffs(side);
      pool.forEach(buff => {
        buff.remainingTurns--;
      });
      const remained = pool.filter(buff => buff.remainingTurns > 0);
      if (side === 'ally') this.allyFieldBuffs = remained;
      else this.enemyFieldBuffs = remained;
    }
  }

  

  private getEnemyAiTuning(): EnemyAiTuning {
    return ENEMY_AI_TUNING[this.enemyAiPersona] ?? ENEMY_AI_TUNING.均衡;
  }

  

  getAvailableSkills(unit: BattleUnit): SkillData[] {
    const skills = unit.skills.filter(s => {
      if (s.类型 !== '主动') return false;
      if ((unit.cooldowns[s.name] ?? 0) > 0) return false;
      if (s.消耗MP > unit.MP) return false;
      return true;
    });
    // 兜底：无MP/全CD时仍可行动
    return skills.length > 0 ? skills : [DEFAULT_ATTACK_SKILL];
  }

  getAllySwitchCandidates(): number[] {
    return this.getBenchAliveIndices('ally');
  }

  private pickEnemySkillAndTarget(): { command: BattleCommand; reason: string } {
    const unit = this.enemy;
    const hpRate = unit.HP / Math.max(1, unit.HPMax);
    const bench = this.getBenchAliveIndices('enemy');

    const justSwitched = unit.justSwitchedIn === this.round;
    if (!justSwitched && hpRate < 0.15 && bench.length > 0) {
      const best = bench
        .map(i => ({
          i,
          hpRate: this.enemyTeam[i].HP / Math.max(1, this.enemyTeam[i].HPMax),
          speed: getEffectiveStat(this.enemyTeam[i], '速度', this.getFieldEffectStatuses('enemy')),
        }))
        .sort((a, b) => b.hpRate - a.hpRate || b.speed - a.speed)[0];
      return {
        command: { action: 'switch', switchToIndex: best.i },
        reason: `HP比例${Math.round(hpRate * 100)}% 低于换人阈值，且有替补`,
      };
    }

    const tuning = this.getEnemyAiTuning();
    const available = this.getAvailableSkills(unit);
    let bestScore = -Infinity;
    let bestSkill = available[0] ?? DEFAULT_ATTACK_SKILL;

    for (const skill of available) {
      const params = skill.数值参数 ?? {};
      const formula = inferFormula(skill);
      const targetType = resolveSkillTargetType(skill);
      const typeMod = getTypeEffectiveness(skill.元素属性, this.ally.元素属性);
      const powerScore = (skill.基础威力 || 40) * typeMod;
      const hitScore = clamp(params.命中率 ?? 0.95, 0.35, 1.0);
      const statusScore =
        (params.灼烧概率 ?? 0) +
        (params.中毒概率 ?? 0) +
        (params.冰冻概率 ?? 0) +
        (params.麻痹概率 ?? 0) +
        (params.混乱概率 ?? 0);
      const healScore = params.治疗量 ? params.治疗量 / 20 : (params.治疗比例 ?? 0) * 4;
      const selfBuffScore =
        formula === 'buff' && (targetType === 'self' || targetType === 'ally' || targetType === 'all_allies') ? 28 : 0;
      const finishScore = this.ally.HP < this.ally.HPMax * 0.25 ? 18 : 0;
      const total =
        powerScore * hitScore * tuning.skillWeights.power * tuning.skillWeights.hit +
        statusScore * 20 * tuning.skillWeights.status +
        healScore * tuning.skillWeights.heal +
        selfBuffScore * tuning.skillWeights.selfBuff +
        finishScore * tuning.skillWeights.finish;
      if (total > bestScore) {
        bestScore = total;
        bestSkill = skill;
      }
    }

    return {
      command: {
        action: 'skill',
        skillName: bestSkill.name,
        targetIndex: this.allyActiveIndex,
      },
      reason: `技能评分最优：${bestSkill.name}（评分${bestScore.toFixed(1)}）`,
    };
  }

  planEnemyAction(): void {
    const planned = this.pickEnemySkillAndTarget();
    this.enemyPlannedCommand = planned.command;
    const hpRate = Math.round((this.enemy.HP / Math.max(1, this.enemy.HPMax)) * 100);
    const bench = this.getBenchAliveIndices('enemy').length;
    this.addLog('system', `[AI决策] 人格=${this.enemyAiPersona} HP=${hpRate}% 替补=${bench} -> ${planned.reason}`);
  }

  private resolveSkillByName(unit: BattleUnit, skillName?: string): SkillData {
    const available = this.getAvailableSkills(unit);
    if (!skillName) return available[0] ?? DEFAULT_ATTACK_SKILL;
    return available.find(s => s.name === skillName) ?? available[0] ?? DEFAULT_ATTACK_SKILL;
  }

  private canSwitch(side: 'ally' | 'enemy', toIndex?: number): boolean {
    if (toIndex === undefined || toIndex < 0) return false;
    const team = this.getTeam(side);
    const active = this.getActiveIndex(side);
    if (toIndex === active) return false;
    if (!team[toIndex]) return false;
    if (this.isDefeated(team[toIndex])) return false;
    return true;
  }

  private doSwitch(side: 'ally' | 'enemy', toIndex: number, reason = '主动换人'): void {
    const from = this.getActive(side);
    this.setActiveIndex(side, toIndex);
    const to = this.getActive(side);
    to.justSwitchedIn = this.round;
    this.addLog('switch', `${side === 'ally' ? '己方' : '敌方'}换人：${from.name} → ${to.name}（${reason}）`);
  }

  private requestForcedSwitch(side: 'ally' | 'enemy', reason: 'defeated' | 'script' = 'defeated'): void {
    if (this.pendingForcedSwitch) return;
    const candidates = this.getBenchAliveIndices(side);
    if (candidates.length <= 0) return;
    this.pendingForcedSwitch = { side, reason };
    this.addLog('switch', `${side === 'ally' ? '己方' : '敌方'}需要强制换人`);
  }

  getForcedSwitchCandidates(side: 'ally' | 'enemy'): number[] {
    return this.getBenchAliveIndices(side);
  }

  private resolveEnemyForcedSwitchIfNeeded(): void {
    if (!this.pendingForcedSwitch || this.pendingForcedSwitch.side !== 'enemy') return;
    const candidates = this.getBenchAliveIndices('enemy');
    if (candidates.length <= 0) {
      this.pendingForcedSwitch = null;
      return;
    }

    const best = candidates
      .map(i => ({
        i,
        hpRate: this.enemyTeam[i].HP / Math.max(1, this.enemyTeam[i].HPMax),
        speed: getEffectiveStat(this.enemyTeam[i], '速度', this.getFieldEffectStatuses('enemy')),
      }))
      .sort((a, b) => b.hpRate - a.hpRate || b.speed - a.speed)[0];

    this.doSwitch('enemy', best.i, '强制换人');
    this.pendingForcedSwitch = null;
  }

  confirmForcedSwitch(toIndex: number): boolean {
    if (!this.pendingForcedSwitch) return false;
    const side = this.pendingForcedSwitch.side;
    if (!this.canSwitch(side, toIndex)) return false;
    this.doSwitch(side, toIndex, '强制换人');
    this.pendingForcedSwitch = null;
    return true;
  }

  private consumeActionCooldowns(unit: BattleUnit): void {
    for (const key of Object.keys(unit.cooldowns)) {
      if (unit.cooldowns[key] > 0) unit.cooldowns[key]--;
    }
  }

  private checkWinner(): void {
    const allyAlive = this.hasAnyAlive('ally');
    const enemyAlive = this.hasAnyAlive('enemy');

    if (!enemyAlive && allyAlive) {
      this.battleOver = true;
      this.winner = 'ally';
      this.pendingForcedSwitch = null;
      this.addLog('victory', `敌方全员倒下！己方获胜！`);
      return;
    }
    if (!allyAlive && enemyAlive) {
      this.battleOver = true;
      this.winner = 'enemy';
      this.pendingForcedSwitch = null;
      this.addLog('defeat', `己方全员倒下...战斗失败`);
      return;
    }

    if (this.round >= MAX_ROUNDS) {
      const allyHp = this.totalTeamHP('ally');
      const enemyHp = this.totalTeamHP('enemy');
      this.battleOver = true;
      this.pendingForcedSwitch = null;
      this.winner = allyHp >= enemyHp ? 'ally' : 'enemy';
      this.addLog('system', `达到最大回合数(${MAX_ROUNDS})，按剩余总HP判定胜负`);
      this.addLog(
        this.winner === 'ally' ? 'victory' : 'defeat',
        this.winner === 'ally' ? '己方判定胜利' : '敌方判定胜利',
      );
    }
  }

  private processEndOfTurn(): void {
    for (const t of processStatusEndTurn(this.ally)) this.addLog('status', t.message);
    for (const t of processStatusEndTurn(this.enemy)) this.addLog('status', t.message);

    // 回合结束状态伤害可能导致死亡，需触发强制换人
    for (const side of ['ally', 'enemy'] as const) {
      const unit = this.getActive(side);
      if (this.isDefeated(unit)) {
        this.addLog('defeat', `${unit.name} 倒下了！`);
        this.requestForcedSwitch(side, 'defeated');
        this.resolveEnemyForcedSwitchIfNeeded();
      }
    }

    // 战斗类型特色：回合结束触发
    for (const unit of [this.ally, this.enemy]) {
      if (unit.HP <= 0) continue;
      if (unit.战斗类型 === '重盾型') {
        const regen = Math.floor(unit.HPMax * 0.03);
        unit.HP = Math.min(unit.HPMax, unit.HP + regen);
        this.addLog('status', `${unit.name} 重盾再生，恢复 ${regen} HP`);
      } else if (unit.战斗类型 === '均衡型') {
        const mpRegen = Math.floor(unit.MPMax * 0.05);
        unit.MP = Math.min(unit.MPMax, unit.MP + mpRegen);
      }
    }

    this.tickFieldBuffs();
    this.resolveEnemyForcedSwitchIfNeeded();
    this.checkWinner();
  }

  private normalizePlayerCommand(command: BattleCommand): BattleCommand {
    if (command.action === 'item') {
      return { action: 'item', item: command.item };
    }

    if (command.action === 'switch') {
      if (this.canSwitch('ally', command.switchToIndex)) return command;
      return { action: 'skill', skillName: DEFAULT_ATTACK_SKILL.name, targetIndex: this.enemyActiveIndex };
    }

    if (command.action === 'escape') {
      return { action: 'escape' };
    }

    const unit = this.ally;
    const desired = unit.skills.find(s => s.name === command.skillName);

    if (desired && desired.类型 === '主动') {
      const cd = unit.cooldowns[desired.name] ?? 0;
      if (cd > 0) {
        this.addLog('cooldown', `${unit.name} 的 ${desired.name} 冷却中（剩余 ${cd}）`);
      } else if (unit.MP < desired.消耗MP) {
        this.addLog('mp', `${unit.name} 的 MP 不足，无法释放 ${desired.name}`);
      } else {
        const targetType = resolveSkillTargetType(desired);
        const targetIndex =
          targetType === 'self' || targetType === 'ally' || targetType === 'all_allies'
            ? this.allyActiveIndex
            : this.enemyActiveIndex;
        return { action: 'skill', skillName: desired.name, targetIndex };
      }
    }

    const fallback = this.getAvailableSkills(unit)[0] ?? DEFAULT_ATTACK_SKILL;
    if (fallback.name !== command.skillName) {
      this.addLog('system', `${unit.name} 改为使用 ${fallback.name}`);
    }

    return {
      action: 'skill',
      skillName: fallback.name,
      targetIndex: this.enemyActiveIndex,
    };
  }

  private resolveTargetIndex(side: 'ally' | 'enemy'): number {
    return this.getActiveIndex(side);
  }

  private getExtraActionChance(attacker: BattleUnit, defender: BattleUnit): number {
    const attackerSpeed = getEffectiveStat(attacker, '速度');
    const defenderSpeed = getEffectiveStat(defender, '速度');
    if (attackerSpeed <= defenderSpeed) return 0;

    const speedBonus = Math.min((attackerSpeed - defenderSpeed) / 300, 0.20);
    // 敏捷型：20%保底 + 速度差加成，上限40%；其他类型：纯速度差加成，上限15%
    if (attacker.战斗类型 === '敏捷型') return Math.min(0.20 + speedBonus, 0.40);
    return Math.min(speedBonus, 0.15);
  }

  executeRound(playerCommandRaw: BattleCommand): ActionResult[] {
    if (this.battleOver) return [];

    this.resolveEnemyForcedSwitchIfNeeded();
    if (this.pendingForcedSwitch?.side === 'ally') {
      this.addLog('system', '己方需要先强制换人，回合暂停');
      return [];
    }

    this.round++;
    this.consecutiveExtraCount = { ally: 0, enemy: 0 };
    const actions: ActionResult[] = [];

    const playerCommand = this.normalizePlayerCommand(playerCommandRaw);
    const enemyCommand = this.enemyPlannedCommand ?? this.pickEnemySkillAndTarget().command;
    this.enemyPlannedCommand = null;
    this.lastItemUseResult = null;

    for (const t of processStatusStartTurn(this.ally)) this.addLog('status', t.message);
    for (const t of processStatusStartTurn(this.enemy)) this.addLog('status', t.message);

    if (playerCommand.action === 'escape') {
      const esc = this.tryEscape('普通');
      if (!esc.success) this.processEndOfTurn();
      return actions;
    }

    const allyUsesItem = playerCommand.action === 'item';
    if (allyUsesItem) {
      if (playerCommand.item) {
        this.useItem(playerCommand.item);
      } else {
        this.addLog('system', '没有选择道具');
      }
    }

    const sideSkippedBySwitch: Record<'ally' | 'enemy', boolean> = { ally: false, enemy: false };

    if (playerCommand.action === 'switch' && this.canSwitch('ally', playerCommand.switchToIndex)) {
      this.doSwitch('ally', playerCommand.switchToIndex!, '玩家指令');
      sideSkippedBySwitch.ally = true;
    }
    if (enemyCommand.action === 'switch' && this.canSwitch('enemy', enemyCommand.switchToIndex)) {
      this.doSwitch('enemy', enemyCommand.switchToIndex!, 'AI指令');
      sideSkippedBySwitch.enemy = true;
    }

    this.checkWinner();
    if (this.battleOver) return actions;

    const allyUnit = this.ally;
    const enemyUnit = this.enemy;
    const allySkill = sideSkippedBySwitch.ally || allyUsesItem ? null : this.resolveSkillByName(allyUnit, playerCommand.skillName);
    const enemySkill = sideSkippedBySwitch.enemy ? null : this.resolveSkillByName(enemyUnit, enemyCommand.skillName);

    const allySpeed = getEffectiveStat(allyUnit, '速度', this.getFieldEffectStatuses('ally'));
    const enemySpeed = getEffectiveStat(enemyUnit, '速度', this.getFieldEffectStatuses('enemy'));
    const allyFirst = allySpeed > enemySpeed || (allySpeed === enemySpeed && Math.random() < 0.5);
    const order: Array<'ally' | 'enemy'> = allyFirst ? ['ally', 'enemy'] : ['enemy', 'ally'];

    for (const side of order) {
      if (this.battleOver) break;
      if (this.pendingForcedSwitch?.side === side) continue;

      const attackerSide = side;
      const defenderSide = side === 'ally' ? 'enemy' : 'ally';
      if (sideSkippedBySwitch[attackerSide]) continue;

      const attacker = this.getActive(attackerSide);
      if (attackerSide === 'ally' && allyUsesItem) {
        this.consumeActionCooldowns(attacker);
        continue;
      }
      if (this.isDefeated(attacker)) {
        this.requestForcedSwitch(attackerSide, 'defeated');
        this.checkWinner();
        continue;
      }

      const chosenSkill = side === 'ally' ? allySkill : enemySkill;
      if (!chosenSkill) continue;

      if (isFrozen(attacker)) {
        this.addLog('status', `${attacker.name} 被冰冻，无法行动！`);
        this.consumeActionCooldowns(attacker);
        continue;
      }

      const paralyze = attacker.statusEffects.find(e => e.type === 'paralyze');
      if (paralyze) {
        const skipRate = clamp(paralyze.value || 0.25, 0.1, 0.8);
        if (Math.random() < skipRate) {
          this.addLog('status', `${attacker.name} 因麻痹无法行动！`);
          this.consumeActionCooldowns(attacker);
          continue;
        }
      }

      const confuse = attacker.statusEffects.find(e => e.type === 'confuse');
      if (confuse) {
        const selfHitRate = clamp(confuse.value || 0.35, 0.1, 0.9);
        if (Math.random() < selfHitRate) {
          const selfDamage = Math.max(1, Math.floor(attacker.HPMax * 0.06));
          attacker.HP = Math.max(0, attacker.HP - selfDamage);
          this.addLog('status', `${attacker.name} 混乱中误伤自己，受到 ${selfDamage} 点伤害！`);
          if (this.isDefeated(attacker)) {
            this.addLog('defeat', `${attacker.name} 倒下了！`);
            this.requestForcedSwitch(attackerSide, 'defeated');
            this.checkWinner();
          }
          this.consumeActionCooldowns(attacker);
          continue;
        }
      }

      const formula = inferFormula(chosenSkill);
      const targetType = resolveSkillTargetType(chosenSkill);
      const attackerField = this.getFieldEffectStatuses(attackerSide);
      const defenderField = this.getFieldEffectStatuses(defenderSide);
      let result: ActionResult;

      if (targetType === 'all_allies' && formula === 'buff') {
        const duration = chosenSkill.数值参数?.持续回合 ?? 2;
        const buffs = collectBuffEffectsFromParams(chosenSkill.数值参数 ?? {}, duration, chosenSkill.name);
        this.applyFieldBuff(attackerSide, buffs);
        // 按稀有度固定MP消耗
        const RARITY_MP: Record<string, number> = { N: 0, 普通: 5, 稀有: 12, 史诗: 20, 传说: 32, 神话: 45 };
        attacker.MP = Math.max(0, attacker.MP - (RARITY_MP[chosenSkill.稀有度] ?? 0));
        if (chosenSkill.冷却回合 > 0) attacker.cooldowns[chosenSkill.name] = chosenSkill.冷却回合 + 1;
        result = {
          attacker: attacker.name,
          defender: attackerSide === 'ally' ? '己方前排' : '敌方前排',
          skillName: chosenSkill.name,
          damage: 0,
          shieldDamage: 0,
          healed: 0,
          isCritical: false,
          effectiveness: 'normal',
          isMissed: false,
          attackerSide,
          defenderSide: attackerSide,
          message: `${attacker.name} 使用了 ${chosenSkill.name}，为己方前排施加场地增益`,
        };
      } else if (targetType === 'all_allies' && formula === 'heal') {
        const primary = executeSkill(attacker, attacker, chosenSkill, attackerField, attackerField);
        let totalHealed = primary.healed;
        const team = this.getTeam(attackerSide);
        team.forEach((unit, idx) => {
          if (idx === this.getActiveIndex(attackerSide) || this.isDefeated(unit)) return;
          const healAmt =
            chosenSkill.数值参数?.治疗量 ?? Math.floor(unit.HPMax * (chosenSkill.数值参数?.治疗比例 ?? 0.25));
          const actual = Math.min(healAmt, unit.HPMax - unit.HP);
          unit.HP += actual;
          totalHealed += actual;
        });
        result = {
          ...primary,
          healed: totalHealed,
          defender: attackerSide === 'ally' ? '己方全队' : '敌方全队',
          attackerSide,
          defenderSide: attackerSide,
          message: `${attacker.name} 使用了 ${chosenSkill.name}，为全队恢复 ${totalHealed} HP`,
        };
      } else {
        const defender =
          targetType === 'self' || targetType === 'ally'
            ? attacker
            : this.getTeam(defenderSide)[this.resolveTargetIndex(defenderSide)];
        const defEffects = targetType === 'self' || targetType === 'ally' ? attackerField : defenderField;
        result = executeSkill(attacker, defender, chosenSkill, attackerField, defEffects);
        result.attackerSide = attackerSide;
        result.defenderSide = targetType === 'self' || targetType === 'ally' ? attackerSide : defenderSide;
      }

      result.attackerSide = result.attackerSide ?? attackerSide;
      result.defenderSide = result.defenderSide ?? defenderSide;
      actions.push(result);

      if (result.isMissed) this.addLog('miss', result.message);
      else if (result.isCritical) this.addLog('crit', result.message);
      else this.addLog('damage', result.message);

      if (result.statusApplied) this.addLog('status', `${result.defender} 状态变化：${result.statusApplied}`);
      if (result.passiveTriggered) {
        for (const p of result.passiveTriggered) this.addLog('passive', `被动触发: ${p}`);
      }

      if (targetType === 'single_enemy' || targetType === 'all_enemies') {
        const defender = this.getActive(defenderSide);
        if (this.isDefeated(defender)) {
          this.addLog('defeat', `${defender.name} 倒下了！`);
          this.requestForcedSwitch(defenderSide, 'defeated');
          this.resolveEnemyForcedSwitchIfNeeded();
        }
      }

      this.consumeActionCooldowns(attacker);
      this.checkWinner();
      if (this.battleOver || this.isDefeated(attacker) || this.pendingForcedSwitch) continue;

      if (targetType !== 'single_enemy') continue;
      if (this.consecutiveExtraCount[attackerSide] >= 1) {
        this.addLog('speed', `${attacker.name} 本回合已追加行动，无法再次追加`);
        continue;
      }
      const currentDefender = this.getActive(defenderSide);
      const extraChance = this.getExtraActionChance(attacker, currentDefender);
      if (extraChance <= 0) continue;

      const roll = Math.random();
      this.addLog(
        'speed',
        `${attacker.name} 速度追加行动判定：${Math.round(extraChance * 100)}%（掷骰 ${Math.round(roll * 100)}）`,
      );
      if (roll > extraChance) continue;

      this.addLog('speed', `${attacker.name} 获得速度追加行动！`);
      this.consecutiveExtraCount[attackerSide]++;
      const extraResult = executeSkill(attacker, currentDefender, chosenSkill, attackerField, defenderField);
      extraResult.attackerSide = attackerSide;
      extraResult.defenderSide = defenderSide;
      actions.push(extraResult);

      if (extraResult.isMissed) this.addLog('miss', extraResult.message);
      else if (extraResult.isCritical) this.addLog('crit', extraResult.message);
      else this.addLog('damage', extraResult.message);

      if (extraResult.statusApplied)
        this.addLog('status', `${currentDefender.name} 状态变化：${extraResult.statusApplied}`);
      if (extraResult.passiveTriggered) {
        for (const p of extraResult.passiveTriggered) this.addLog('passive', `被动触发: ${p}`);
      }

      if (this.isDefeated(currentDefender)) {
        this.addLog('defeat', `${currentDefender.name} 倒下了！`);
        this.requestForcedSwitch(defenderSide, 'defeated');
        this.resolveEnemyForcedSwitchIfNeeded();
      }

      this.consumeActionCooldowns(attacker);
      this.checkWinner();
    }

    if (!this.battleOver) this.processEndOfTurn();
    return actions;
  }

  getStatusEffectsWithField(side: 'ally' | 'enemy'): StatusEffect[] {
    const unit = this.getActive(side);
    return [...unit.statusEffects.map(e => ({ ...e })), ...this.getFieldEffectStatuses(side).map(e => ({ ...e }))];
  }

  useItem(item: BattleItem): ItemUseResult {
    this.itemUsed = true;

    switch (item.category) {
      case '属性增强药': {
        tryApplyStatus(this.ally, 'damage_boost', 1.0, 5, 0.1, item.name);
        const msg = `使用了 ${item.name}，最终伤害提升10%，持续5回合`;
        this.addLog('item', msg);
        this.lastItemUseResult = { ok: true, message: msg, itemName: item.name };
        return this.lastItemUseResult;
      }
      case '技能增强药': {
        tryApplyStatus(this.ally, 'skill_boost', 1.0, 3, 0.3, item.name);
        const msg = `使用了 ${item.name}，技能伤害提升30%，持续3回合`;
        this.addLog('item', msg);
        this.lastItemUseResult = { ok: true, message: msg, itemName: item.name };
        return this.lastItemUseResult;
      }
      case '伤药': {
        const ratioMap = { 初级: 0.2, 中级: 0.5, 高级: 1.0 };
        const ratio = ratioMap[item.healLevel ?? '初级'];
        const healAmt = Math.floor(this.ally.HPMax * ratio);
        const actual = Math.min(healAmt, this.ally.HPMax - this.ally.HP);
        this.ally.HP += actual;
        const msg = `使用了 ${item.name}，恢复了 ${actual} HP`;
        this.addLog('item', msg);
        this.lastItemUseResult = { ok: true, message: msg, itemName: item.name };
        return this.lastItemUseResult;
      }
      default:
        this.lastItemUseResult = { ok: false, message: '未知道具' };
        return this.lastItemUseResult;
    }
  }

  tryEscape(battleType: '普通' | '捕获' | 'BOSS'): EscapeResult {
    if (battleType === 'BOSS') {
      this.addLog('system', 'BOSS战无法逃跑！');
      return { success: false, message: 'BOSS战无法逃跑！' };
    }

    this.escapeAttempts++;
    const allySpeed = getEffectiveStat(this.ally, '速度');
    const enemySpeed = getEffectiveStat(this.enemy, '速度');
    const rate = Math.min(0.95, 0.3 + 0.1 * this.escapeAttempts + (allySpeed - enemySpeed) / 220);

    if (Math.random() < rate) {
      this.battleOver = true;
      this.winner = 'escape';
      this.addLog('system', `${this.ally.name} 成功逃跑了！`);
      return { success: true, message: `${this.ally.name} 成功逃跑了！` };
    }

    this.addLog('system', `${this.ally.name} 逃跑失败！`);

    // 失败后敌方反击一次
    const enemySkill = this.resolveSkillByName(this.enemy);
    let enemyAction: ActionResult | undefined;
    if (!isFrozen(this.enemy) && !this.isDefeated(this.enemy)) {
      enemyAction = executeSkill(
        this.enemy,
        this.ally,
        enemySkill,
        this.getFieldEffectStatuses('enemy'),
        this.getFieldEffectStatuses('ally'),
      );
      enemyAction.attackerSide = 'enemy';
      enemyAction.defenderSide = 'ally';
      this.addLog(enemyAction.isMissed ? 'miss' : 'damage', enemyAction.message);
      if (this.isDefeated(this.ally)) {
        this.addLog('defeat', `${this.ally.name} 倒下了！`);
        this.requestForcedSwitch('ally', 'defeated');
      }
    }

    this.round++;
    this.processEndOfTurn();
    return { success: false, message: '逃跑失败！', enemyAction };
  }

  private decideEnemyPostAction(): 'continue' | 'retreat' | 'surrender' | undefined {
    if (this.winner === 'enemy') return 'continue';
    if (this.winner === 'escape') return 'retreat';
    if (this.winner !== 'ally') return undefined;
    return 'continue';
  }

  buildCapturePreview(attempt: CaptureAttempt): CaptureRollResult {
    const target = this.enemy;

    const quality = target.品质 ?? 'C';
    const qualityBaseMap: Record<string, number> = { E: 0.9, D: 0.75, C: 0.5, B: 0.25, A: 0.1, S: 0.01 };
    const baseRate = qualityBaseMap[quality] ?? 0.5;

    if (quality === 'S') {
      const detailText = `基础率1%(S级硬锁)；仅当掷骰=1时成功，球倍率/状态加成均无效`;
      return {
        attempted: false,
        success: false,
        finalRate: 0.01,
        baseRate: 0.01,
        ballMultiplier: 1,
        techMod: 0,
        statusMod: 0,
        resistMod: 0,
        sRankHardLock: true,
        detailText,
      };
    }

    const ballMultiplierMap: Record<string, number> = { 普通球: 1, 高级球: 1.5, 超级球: 2, 魅惑之球: 1.2 };
    const ballMultiplier = ballMultiplierMap[attempt.ballType] ?? 1;

    const hpRate = target.HP / Math.max(1, target.HPMax);
    let statusMod = 0;
    if (hpRate < 0.05) statusMod += 0.2;
    else if (hpRate <= 0.2) statusMod += 0.1;
    if (target.statusEffects.some(s => s.type === 'paralyze' || s.type === 'freeze' || s.type === 'confuse')) {
      statusMod += 0.15;
    }

    const techMod = attempt.useTechAssist ? 0.15 : 0;
    const mihunxiangMod = attempt.useMihunxiang ? 0.15 : 0;
    const resistMod = calcResistMod(attempt.enemyAffection, attempt.enemyCorruption, attempt.enemyNature);

    const finalRate = clamp(baseRate * ballMultiplier + techMod + mihunxiangMod + statusMod - resistMod, 0, 1);

    const parts: string[] = [];
    parts.push(`基础率${Math.round(baseRate * 100)}%(${quality}级)`);
    parts.push(`×球${ballMultiplier}`);
    if (techMod) parts.push(`+辅助器${Math.round(techMod * 100)}%`);
    if (mihunxiangMod) parts.push(`+迷魂香${Math.round(mihunxiangMod * 100)}%`);
    if (statusMod) parts.push(`+状态${Math.round(statusMod * 100)}%`);
    if (resistMod) parts.push(`-抵抗${Math.round(resistMod * 100)}%`);
    parts.push(`=最终${Math.round(finalRate * 100)}%`);
    const detailText = parts.join(' ');

    return {
      attempted: false,
      success: false,
      finalRate,
      baseRate,
      ballMultiplier,
      techMod,
      mihunxiangMod,
      statusMod,
      resistMod,
      detailText,
    };
  }

  /** 玩家投骰后调用，传入 1-100 的骰子结果 */
  rollCapture(capture: CaptureRollResult, diceRoll: number): CaptureRollResult {
    const roll = clamp(diceRoll, 1, 100) / 100;
    const isSLock = capture.sRankHardLock === true;
    const success = isSLock ? diceRoll === 1 : roll <= capture.finalRate;
    const detailText = `${capture.detailText}；掷骰${diceRoll}/100 → ${success ? '✅捕捉成功' : '❌捕捉失败'}`;
    this.addLog('system', detailText);
    return { ...capture, attempted: true, success, roll, diceRoll, detailText };
  }

  /** 投球失败惩罚：己方出战战姬受轻伤（损失50%当前HP） */
  applyCaptureFail(): void {
    const damage = Math.max(1, Math.floor(this.ally.HP * 0.5));
    this.ally.HP = Math.max(0, this.ally.HP - damage);
    this.addLog('damage', `捕捉失败！${this.ally.name} 受到反噬，损失 ${damage} HP！`);
  }

  /** 捕获失败后敌方逃跑概率判定 */
  tryEnemyEscapeAfterFail(): boolean {
    const quality = this.enemy.品质 ?? 'C';
    const qualityEscapeMap: Record<string, number> = { E: 0.05, D: 0.1, C: 0.2, B: 0.35, A: 0.5, S: 0.7 };
    const baseChance = qualityEscapeMap[quality] ?? 0.2;
    const hpRate = this.enemy.HP / Math.max(1, this.enemy.HPMax);
    const hpBonus = hpRate > 0.3 ? 0.15 : 0;
    const chance = clamp(baseChance + hpBonus, 0.05, 0.8);
    const escaped = Math.random() < chance;

    if (escaped) {
      this.addLog('system', `${this.enemy.name} 挣脱了捕捉球的束缚，趁机逃跑了！`);
    }
    return escaped;
  }

  /** 敌方训练家尝试捕捉我方战姬（我方战败后自动判定） */
  buildEnemyCaptureAlly(): { preview: CaptureRollResult; ballType: CaptureballType } {
    const target = this.ally;
    const quality = target.品质 ?? 'C';
    const qualityBaseMap: Record<string, number> = { E: 0.9, D: 0.75, C: 0.5, B: 0.25, A: 0.1, S: 0.01 };
    const baseRate = qualityBaseMap[quality] ?? 0.5;

    const ballTypes: CaptureballType[] = ['普通球', '高级球'];
    const ballType = ballTypes[Math.floor(Math.random() * ballTypes.length)];
    const ballMultiplierMap: Record<string, number> = { 普通球: 1, 高级球: 1.5 };
    const ballMultiplier = ballMultiplierMap[ballType] ?? 1;

    const hpRate = target.HP / Math.max(1, target.HPMax);
    let statusMod = 0;
    if (hpRate < 0.05) statusMod += 0.2;
    else if (hpRate <= 0.2) statusMod += 0.1;
    if (target.statusEffects.some(s => s.type === 'paralyze' || s.type === 'freeze' || s.type === 'confuse')) {
      statusMod += 0.15;
    }

    const finalRate = quality === 'S' ? 0.01 : clamp(baseRate * ballMultiplier + statusMod, 0, 1);
    const detailText =
      `[敌方捕获] 基础率${Math.round(baseRate * 100)}%(${quality}级)` +
      ` × ${ballType}倍率${ballMultiplier}` +
      (statusMod ? ` +状态${Math.round(statusMod * 100)}%` : '') +
      ` = 最终${Math.round(finalRate * 100)}%`;

    return {
      ballType,
      preview: {
        attempted: false,
        success: false,
        finalRate,
        baseRate: quality === 'S' ? 0.01 : baseRate,
        ballMultiplier,
        techMod: 0,
        statusMod,
        resistMod: 0,
        sRankHardLock: quality === 'S',
        detailText,
      },
    };
  }

  getResult(battleType: '普通' | '捕获' | 'BOSS'): BattleResult {
    const bossMultiplier = battleType === 'BOSS' ? 3 : 1;
    const expGained =
      this.winner === 'ally' ? this.enemyTeam.reduce((sum, u) => sum + u.等级 * 10, 0) * bossMultiplier : 0;
    const goldGained =
      this.winner === 'ally' ? this.enemyTeam.reduce((sum, u) => sum + u.等级 * 5, 0) * bossMultiplier : 0;

    const allyTeamState: TeamUnitState[] = this.allyTeam.map(u => ({
      name: u.name,
      HP: u.HP,
      HPMax: u.HPMax,
      MP: u.MP,
      MPMax: u.MPMax,
      isDefeated: u.HP <= 0,
    }));

    const enemyTeamState: TeamUnitState[] = this.enemyTeam.map(u => ({
      name: u.name,
      HP: u.HP,
      HPMax: u.HPMax,
      MP: u.MP,
      MPMax: u.MPMax,
      isDefeated: u.HP <= 0,
    }));

    this.enemyPostAction = this.decideEnemyPostAction();

    return {
      winner: this.winner ?? 'enemy',
      allyHP: this.ally.HP,
      allyMP: this.ally.MP,
      enemyHP: this.enemy.HP,
      enemyMP: this.enemy.MP,
      allyTeamState,
      enemyTeamState,
      expGained,
      goldGained,
      rounds: this.round,
      log: [...this.log],
      enemyPostAction: this.enemyPostAction,
    };
  }
}
