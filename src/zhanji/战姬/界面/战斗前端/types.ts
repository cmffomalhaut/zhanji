// 状态栏 UI 使用的类型定义，适配战姬项目的数据结构

export interface BattleUnitState {
  unitId: string;
  名字: string;
  阵营: 'ally' | 'enemy';
  是否存活: boolean;
  是否可行动: boolean;
  当前资源: {
    HP: number;
    HPMax: number;
    MP: number;
    MPMax: number;
    Shield: number;
  };
  当前属性: {
    力量: number;
    敏捷: number;
    体质: number;
    智力: number;
    感知: number;
    魅力: number;
    幸运: number;
    物理防御: number;
    精神防御: number;
    先攻: number;
    命中加值: number;
    闪避加值: number;
    生命层次: number;
  };
  状态列表: StatusState[];
  技能栏: SkillSlotState[];
  行动计数器: number;
}

export interface StatusState {
  statusId: string;
  名称: string;
  剩余回合: number;
  层数: number;
  来源单位Id?: string;
}

export interface SkillSlotState {
  skillId: string;
  当前冷却: number;
  已禁用: boolean;
  禁用原因?: string;
}

export interface SkillDefinition {
  id: string;
  名称: string;
  类型: '主动' | '被动' | '光环' | '天赋';
  标签: string[];
  消耗: { MP: number };
  冷却回合: number;
  目标类型: 'self' | 'single_enemy' | 'single_ally' | 'all_enemies' | 'all_allies' | 'random_enemy';
  射程: 'melee' | 'ranged' | 'global';
  检定: { 类型: 'attack_roll' | 'saving_throw' | 'auto_hit' };
  描述: string;
  效果列表: EffectDef[];
}

export interface EffectDef {
  kind: string;
  scale?: string;
  ratio?: number;
  flat?: number;
  damageType?: string;
  duration?: number;
  statusId?: string;
  chance?: number;
  count?: number;
  modifierId?: string;
  value?: number;
}

export interface InventoryItem {
  id: string;
  名称: string;
  数量: number;
  目标类型: 'self' | 'single_enemy' | 'single_ally' | 'all_enemies' | 'all_allies' | 'random_enemy';
  效果列表: EffectDef[];
  战斗可用: boolean;
}

export interface PendingCommand {
  actorId: string;
  actionType: 'skill' | 'item' | 'defend' | 'escape';
  skillId?: string;
  itemId?: string;
  targetIds?: string[];
  clientHint?: { source: string };
}

export interface BattleLogEntry {
  id: string;
  turn: number;
  text: string;
  type: 'damage' | 'heal' | 'shield' | 'victory' | 'system' | 'action' | 'buff' | 'debuff' | 'status' | 'miss';
}

export interface BattleState {
  参战方: {
    ally: { 单位列表: BattleUnitState[] };
    enemy: { 单位列表: BattleUnitState[] };
  };
  当前行动单位Id: string | null;
  回合数: number;
  玩家输入态: {
    可操作: boolean;
    待选技能Id?: string;
    待选目标Id?: string;
  };
  状态: 'active' | 'ended' | 'idle';
  待处理指令?: PendingCommand;
  日志: BattleLogEntry[];
  结算结果?: BattleResultSummary | null;
}

export interface BattleResultSummary {
  winner: 'ally' | 'enemy' | 'escape' | 'draw';
  summary: string;
  rounds: number;
  expGain: number;
  goldGain: number;
  rewardTexts: string[];
}

export interface StatData {
  战斗状态: BattleState | null;
  世界: { 剧情状态: string };
  角色档案: {
    hero: {
      可用道具栏: string[];
    } | null;
  };
  背包: Record<string, InventoryItem>;
  技能定义表: Record<string, SkillDefinition>;
}
