// ====================================================================
// 战斗系统类型定义 - 宝可梦风格3v3
// ====================================================================

/** 元素类型 */
export type Element = '地' | '火' | '水' | '风' | '光' | '暗' | '无';

/** 效果公式枚举 */
export type EffectFormula =
  | 'physical_damage'
  | 'magic_damage'
  | 'heal'
  | 'buff'
  | 'debuff'
  | 'drain_physical'
  | 'drain_magic';

/** 技能目标类型 */
export type SkillTargetType = 'single_enemy' | 'self' | 'ally' | 'all_enemies' | 'all_allies';

/** 技能数值参数 */
export interface SkillParams {
  伤害类型?: number;
  暴击率加成?: number;
  吸血比例?: number;
  命中率?: number;
  灼烧概率?: number;
  灼烧伤害?: number;
  灼烧回合?: number;
  中毒概率?: number;
  中毒伤害?: number;
  中毒回合?: number;
  冰冻概率?: number;
  冰冻回合?: number;
  麻痹概率?: number;
  麻痹回合?: number;
  混乱概率?: number;
  混乱回合?: number;
  攻击加成?: number;
  防御加成?: number;
  特攻加成?: number;
  特防加成?: number;
  速度加成?: number;
  命中加成?: number;
  闪避加成?: number;
  持续回合?: number;
  治疗量?: number;
  治疗比例?: number;
  护盾值?: number;
  护盾比例?: number;
  [key: string]: number | undefined;
}

/** 技能数据 */
export interface SkillData {
  name: string;
  类型: '主动' | '被动' | '光环' | '天赋';
  稀有度: string;
  元素属性: Element;
  消耗MP: number;
  冷却回合: number;
  基础威力: number;
  描述: string;
  效果公式: string;
  目标类型?: SkillTargetType;
  数值参数: SkillParams;
}

/** 被动技能数据 */
export interface PassiveSkillData {
  name: string;
  类型: '被动' | '天赋' | '光环';
  描述: string;
  效果公式: string;
  数值参数: SkillParams;
}

/** 状态效果类型 */
export type StatusEffectType =
  | 'burn'
  | 'poison'
  | 'freeze'
  | 'paralyze'
  | 'confuse'
  | 'atk_up'
  | 'atk_down'
  | 'def_up'
  | 'def_down'
  | 'spa_up'
  | 'spa_down'
  | 'spd_up'
  | 'spd_down'
  | 'speed_up'
  | 'speed_down'
  | 'acc_up'
  | 'acc_down'
  | 'eva_up'
  | 'eva_down'
  | 'shield'
  | 'damage_boost'
  | 'skill_boost';

/** 状态效果 */
export interface StatusEffect {
  type: StatusEffectType;
  remainingTurns: number;
  /** DoT伤害/buff比例/护盾值/增伤比例 */
  value: number;
  /** 来源标记 */
  source?: string;
}

/** 场地Buff（只作用当前前排，换人继承） */
export interface FieldBuff {
  type: Extract<
    StatusEffectType,
    'atk_up' | 'def_up' | 'spa_up' | 'spd_up' | 'speed_up' | 'acc_up' | 'eva_up' | 'damage_boost' | 'skill_boost'
  >;
  remainingTurns: number;
  value: number;
  source: string;
}

/** 战姬品质等级 */
export type UnitQuality = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

/** 战斗单位 */
export interface BattleUnit {
  name: string;
  性格?: string;
  好感度?: number;
  堕落值?: number;
  等级: number;
  稀有度?: string;
  品质?: UnitQuality;
  战斗类型?: string;
  元素属性: Element;
  攻击力: number;
  防御力: number;
  特攻: number;
  特防: number;
  速度: number;
  HP: number;
  HPMax: number;
  MP: number;
  MPMax: number;
  shield: number;
  shieldMax: number;
  skills: SkillData[];
  passives: PassiveSkillData[];
  cooldowns: Record<string, number>;
  statusEffects: StatusEffect[];
  /** 本回合刚换上场（用于防止换人后立即逃跑） */
  justSwitchedIn?: number;
}

export interface TeamUnitState {
  name: string;
  HP: number;
  MP: number;
  isDefeated: boolean;
}

export interface TeamSnapshot {
  activeIndex: number;
  units: BattleUnit[];
}

export interface BattleTeamsSnapshot {
  ally: TeamSnapshot;
  enemy: TeamSnapshot;
}

// ====================================================================
// 道具系统
// ====================================================================

/** 道具类型 */
export type ItemCategory = '属性增强药' | '技能增强药' | '伤药' | '捕捉球';

/** 道具数据 */
export interface BattleItem {
  name: string;
  category: ItemCategory;
  element?: Element;
  healLevel?: '初级' | '中级' | '高级';
  count: number;
}

// ====================================================================
// 战斗日志
// ====================================================================

/** 日志条目类型 */
export type LogEntryType =
  | 'system'
  | 'damage'
  | 'heal'
  | 'buff'
  | 'debuff'
  | 'status'
  | 'crit'
  | 'effective'
  | 'resist'
  | 'miss'
  | 'passive'
  | 'shield'
  | 'item'
  | 'defeat'
  | 'victory'
  | 'switch'
  | 'cooldown'
  | 'mp'
  | 'speed';

/** 战斗日志条目 */
export interface BattleLogEntry {
  type: LogEntryType;
  message: string;
  turn?: number;
}

// ====================================================================
// 行动与回合结果
// ====================================================================

/** 玩家指令 */
export interface BattleCommand {
  action: 'skill' | 'switch' | 'escape';
  skillName?: string;
  targetIndex?: number;
  switchToIndex?: number;
}

/** 强制换人上下文 */
export interface ForcedSwitchState {
  side: 'ally' | 'enemy';
  reason: 'defeated' | 'script';
}

/** 单个行动结果 */
export interface ActionResult {
  attacker: string;
  defender: string;
  skillName: string;
  damage: number;
  shieldDamage: number;
  healed: number;
  isCritical: boolean;
  isMissed?: boolean;
  hitRate?: number;
  effectiveness: 'super' | 'normal' | 'resist' | 'same';
  statusApplied?: string;
  passiveTriggered?: string[];
  attackerSide?: 'ally' | 'enemy';
  defenderSide?: 'ally' | 'enemy';
  message: string;
}

/** 回合末状态效果结算 */
export interface TurnEffectResult {
  unit: string;
  type: string;
  damage: number;
  message: string;
}

/** 逃跑结果 */
export interface EscapeResult {
  success: boolean;
  message: string;
  enemyAction?: ActionResult;
}

/** 捕捉球类型 */
export type CaptureballType = '普通球' | '高级球' | '超级球' | '魅惑之球';

/** 捕捉尝试参数 */
export interface CaptureAttempt {
  ballType: CaptureballType;
  /** 训练师技能加成（如 0.15 = +15%） */
  trainerSkillBonus?: number;
  /** 是否使用捕捉辅助器道具 (+15%) */
  useTechAssist?: boolean;
  /** 敌方好感度（用于抵抗修正） */
  enemyAffection?: number;
  /** 敌方堕落值（用于抵抗修正） */
  enemyCorruption?: number;
  /** 敌方性格（用于抵抗修正） */
  enemyNature?: string;
}

/** 捕捉球库存项 */
export interface CaptureBallItem {
  type: CaptureballType;
  count: number;
}

/** 战斗最终结果 */
export interface CaptureRollResult {
  attempted: boolean;
  success: boolean;
  finalRate: number;
  roll?: number;
  /** 展示用：实际掷出的骰子点数（1-100） */
  diceRoll?: number;
  baseRate: number;
  ballMultiplier: number;
  techMod: number;
  statusMod: number;
  resistMod: number;
  /** S级硬锁：仅骰出1成功，且其他加成无效 */
  sRankHardLock?: boolean;
  detailText: string;
}

export interface BattleResult {
  winner: 'ally' | 'enemy' | 'escape';
  allyHP: number;
  allyMP: number;
  enemyHP: number;
  enemyMP: number;
  allyTeamState: TeamUnitState[];
  enemyTeamState: TeamUnitState[];
  expGained: number;
  goldGained: number;
  rounds: number;
  log: BattleLogEntry[];
  enemyPostAction?: 'continue' | 'retreat' | 'surrender';
  capture?: CaptureRollResult;
  /** 敌方在捕获失败后逃跑 */
  enemyEscaped?: boolean;
  /** 敌方训练家捕获了我方战姬 */
  enemyCaptureAlly?: CaptureRollResult;
}

export type EnemyTrainerArchetype =
  | '骄傲型'
  | '复仇型'
  | '理智型'
  | '胆小型'
  | '宠爱独占型'
  | '工具使用型'
  | '虐待调教型'
  | '共享轮用型'
  | '展示炫耀型'
  | '洗脑奴化型'
  | '放置忽视型'
  | '未知';

/** 敌方AI人格（仅战斗脚本内存） */
export type EnemyAiPersona = '激进' | '均衡' | '保守';

/** 敌方AI判定参数（按人格） */
export interface EnemyAiTuning {
  switchThreshold: number;
  escapeBaseLowHp: number;
  escapeBaseCriticalHp: number;
  skillWeights: {
    power: number;
    hit: number;
    status: number;
    heal: number;
    selfBuff: number;
    finish: number;
  };
}

export interface EnemyTrainerProfile {
  名字?: string;
  类型?: EnemyTrainerArchetype;
  意志状态?: '坚定' | '动摇' | '崩溃' | '未知';
  持有捕捉球?: boolean;
  捕捉球类型?: '普通球' | '高级球' | '超级球' | '魅惑之球';
  捕捉辅助器?: boolean;
  战斗人格?: EnemyAiPersona;
  人格来源?: '映射随机' | '默认';
}

/** 战斗控制台 MVU 变量结构 */
export interface BattleConsole {
  进行中: boolean;
  己方出战: string | string[];
  敌方出战: string | string[];
  己方队伍?: string[];
  敌方队伍?: string[];
  战斗类型: '普通' | '捕获' | 'BOSS';
  敌方训练家信息?: EnemyTrainerProfile;
}

/** 战斗阶段 */
export type BattlePhase =
  | 'item_select'
  | 'selecting'
  | 'animating'
  | 'forced_switch'
  | 'capture_prompt'
  | 'result'
  | 'idle';
