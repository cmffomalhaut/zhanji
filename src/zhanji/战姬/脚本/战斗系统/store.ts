import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { BattleEngine } from './engine';
import type {
  ActionResult,
  BattleCommand,
  BattleConsole,
  BattleItem,
  BattleLogEntry,
  BattlePhase,
  BattleResult,
  BattleUnit,
  CaptureAttempt,
  CaptureBallItem,
  CaptureRollResult,
  EnemyAiPersona,
  EnemyTrainerArchetype,
  EnemyTrainerProfile,
} from './types';

const ARCHETYPE_PERSONA_WEIGHTS: Record<EnemyTrainerArchetype, Record<EnemyAiPersona, number>> = {
  虐待调教型: { 激进: 0.65, 均衡: 0.25, 保守: 0.1 },
  共享轮用型: { 激进: 0.55, 均衡: 0.3, 保守: 0.15 },
  展示炫耀型: { 激进: 0.52, 均衡: 0.33, 保守: 0.15 },
  工具使用型: { 激进: 0.36, 均衡: 0.44, 保守: 0.2 },
  宠爱独占型: { 激进: 0.24, 均衡: 0.46, 保守: 0.3 },
  洗脑奴化型: { 激进: 0.18, 均衡: 0.32, 保守: 0.5 },
  放置忽视型: { 激进: 0.12, 均衡: 0.28, 保守: 0.6 },
  骄傲型: { 激进: 0.58, 均衡: 0.3, 保守: 0.12 },
  复仇型: { 激进: 0.56, 均衡: 0.3, 保守: 0.14 },
  理智型: { 激进: 0.22, 均衡: 0.53, 保守: 0.25 },
  胆小型: { 激进: 0.1, 均衡: 0.28, 保守: 0.62 },
  未知: { 激进: 0.33, 均衡: 0.34, 保守: 0.33 },
};

function pickEnemyPersonaByArchetype(archetype: EnemyTrainerArchetype | undefined): EnemyAiPersona {
  const weights = ARCHETYPE_PERSONA_WEIGHTS[archetype ?? '未知'] ?? ARCHETYPE_PERSONA_WEIGHTS.未知;
  const roll = Math.random();
  const thresholdAggressive = weights.激进;
  const thresholdBalanced = weights.激进 + weights.均衡;
  if (roll < thresholdAggressive) return '激进';
  if (roll < thresholdBalanced) return '均衡';
  return '保守';
}

function buildEnemyTrainerProfile(input?: EnemyTrainerProfile): EnemyTrainerProfile {
  const base: EnemyTrainerProfile = {
    类型: '未知',
    意志状态: '未知',
    持有捕捉球: true,
    捕捉球类型: '普通球',
    ...input,
  };
  const persona = pickEnemyPersonaByArchetype(base.类型 ?? '未知');
  return {
    ...base,
    战斗人格: persona,
    人格来源: '映射随机',
  };
}

export const useBattleStore = defineStore('battle', () => {
  const engine = shallowRef<BattleEngine | null>(null);
  const phase = ref<BattlePhase>('idle');
  const battleType = ref<BattleConsole['战斗类型']>('普通');
  const location = ref<string>('');
  const hasTechAssist = ref(false);

  const ally = ref<BattleUnit | null>(null);
  const enemy = ref<BattleUnit | null>(null);
  const allyTeam = ref<BattleUnit[]>([]);
  const enemyTeam = ref<BattleUnit[]>([]);
  const allyActiveIndex = ref(0);
  const enemyActiveIndex = ref(0);

  const round = ref(0);
  const log = ref<BattleLogEntry[]>([]);
  const finalResult = ref<BattleResult | null>(null);
  const lastActions = ref<ActionResult[]>([]);
  const forcedSwitchSide = ref<'ally' | 'enemy' | null>(null);

  // 道具相关
  const availableItems = ref<BattleItem[]>([]);
  const itemUsed = ref(false);
  const usedItemName = ref<string | null>(null);

  const captureBalls = ref<CaptureBallItem[]>([]);
  const enemyEscapedDuringCapture = ref(false);

  const initAllyData = shallowRef<BattleUnit[] | null>(null);
  const initEnemyData = shallowRef<BattleUnit[] | null>(null);

  const isOver = computed(() => engine.value?.battleOver ?? false);

  /** 按有效速度排序的行动顺序（含全队，死亡单位排末尾） */
  const ctbOrder = computed(() => {
    function effectiveSpeed(u: BattleUnit): number {
      let spd = u.速度;
      for (const e of u.statusEffects) {
        if (e.type === 'speed_up') spd = Math.floor(spd * (1 + e.value));
        if (e.type === 'speed_down') spd = Math.floor(spd * (1 - e.value));
      }
      return Math.max(1, spd);
    }
    const units: Array<{ name: string; side: 'ally' | 'enemy'; hp: number; hpMax: number; level: number; speed: number }> = [
      ...allyTeam.value.map(u => ({ name: u.name, side: 'ally' as const, hp: u.HP, hpMax: u.HPMax, level: u.等级, speed: effectiveSpeed(u) })),
      ...enemyTeam.value.map(u => ({ name: u.name, side: 'enemy' as const, hp: u.HP, hpMax: u.HPMax, level: u.等级, speed: effectiveSpeed(u) })),
    ];
    return units.sort((a, b) => {
      if (a.hp <= 0 && b.hp > 0) return 1;
      if (a.hp > 0 && b.hp <= 0) return -1;
      return b.speed - a.speed;
    });
  });

  const capturePreview = ref<CaptureRollResult | null>(null);
  const captureBallsUsed = ref<string[]>([]);

  let _onBattleEnd: ((result: BattleResult) => void) | null = null;

  function registerOnBattleEnd(cb: (result: BattleResult) => void) {
    _onBattleEnd = cb;
  }

  function emitBattleEnd() {
    if (finalResult.value && _onBattleEnd) {
      _onBattleEnd(finalResult.value);
    }
  }

  function syncFromEngine() {
    if (!engine.value) return;

    allyTeam.value = engine.value.allyTeam.map(u => ({ ...u, statusEffects: [...u.statusEffects] }));
    enemyTeam.value = engine.value.enemyTeam.map(u => ({ ...u, statusEffects: [...u.statusEffects] }));
    allyActiveIndex.value = engine.value.allyActiveIndex;
    enemyActiveIndex.value = engine.value.enemyActiveIndex;

    const allyActive = allyTeam.value[allyActiveIndex.value] ?? null;
    const enemyActive = enemyTeam.value[enemyActiveIndex.value] ?? null;

    if (allyActive) {
      allyActive.statusEffects = engine.value.getStatusEffectsWithField('ally');
    }
    if (enemyActive) {
      enemyActive.statusEffects = engine.value.getStatusEffectsWithField('enemy');
    }

    ally.value = allyActive;
    enemy.value = enemyActive;

    round.value = engine.value.round;
    log.value = [...engine.value.log];
    forcedSwitchSide.value = engine.value.getPendingForcedSwitch()?.side ?? null;
  }

  /** 初始化战斗（3v3） */
  function initBattle(
    allyUnits: BattleUnit[],
    enemyUnits: BattleUnit[],
    type: BattleConsole['战斗类型'],
    items: BattleItem[],
    balls: CaptureBallItem[],
    enemyTrainerInfo?: BattleConsole['敌方训练家信息'],
  ) {
    const safeAlly = allyUnits.slice(0, 3).map(u => JSON.parse(JSON.stringify(u)) as BattleUnit);
    const safeEnemy = enemyUnits.slice(0, 3).map(u => JSON.parse(JSON.stringify(u)) as BattleUnit);

    if (safeAlly.length === 0 || safeEnemy.length === 0) {
      throw new Error('战斗队伍不能为空');
    }

    initAllyData.value = JSON.parse(JSON.stringify(safeAlly));
    initEnemyData.value = JSON.parse(JSON.stringify(safeEnemy));

    const enemyProfile = buildEnemyTrainerProfile(enemyTrainerInfo);
    const e = new BattleEngine(safeAlly, safeEnemy, enemyProfile);
    engine.value = e;
    battleType.value = type;

    lastActions.value = [];
    finalResult.value = null;
    availableItems.value = items;
    itemUsed.value = false;
    forcedSwitchSide.value = null;
    usedItemName.value = null;
    capturePreview.value = null;
    captureBallsUsed.value = [];
    captureBalls.value = [...balls];
    enemyEscapedDuringCapture.value = false;

    phase.value = items.length > 0 ? 'item_select' : 'selecting';
    e.planEnemyAction();
    syncFromEngine();
  }

  function restartBattle() {
    if (!initAllyData.value || !initEnemyData.value) return;
    const allyClone = JSON.parse(JSON.stringify(initAllyData.value)) as BattleUnit[];
    const enemyClone = JSON.parse(JSON.stringify(initEnemyData.value)) as BattleUnit[];
    const items = availableItems.value.map(i => ({ ...i }));
    const balls = captureBalls.value.map(b => ({ ...b }));
    initBattle(allyClone, enemyClone, battleType.value, items, balls, engine.value?.enemyTrainerProfile);
  }

  function useItem(item: BattleItem) {
    if (!engine.value) return;
    engine.value.useItem(item);
    itemUsed.value = true;
    usedItemName.value = item.name;
    phase.value = 'selecting';
    syncFromEngine();
  }

  function skipItem() {
    phase.value = 'selecting';
  }

  function executeRound(command: BattleCommand) {
    if (!engine.value) return;
    phase.value = 'animating';

    const actions = engine.value.executeRound(command);
    lastActions.value = actions;

    syncFromEngine();

    if (engine.value.battleOver) {
      finalResult.value = engine.value.getResult(battleType.value);
      if (finalResult.value!.winner === 'enemy') {
        tryEnemyAutoCapture();
      }
      if (finalResult.value!.winner === 'ally' && battleType.value !== 'BOSS') {
        phase.value = 'capture_prompt';
      } else {
        phase.value = 'result';
      }
    } else if (engine.value.getPendingForcedSwitch()?.side === 'ally') {
      phase.value = 'forced_switch';
    } else {
      engine.value.planEnemyAction();
      phase.value = 'selecting';
    }
  }

  function confirmForcedSwitch(toIndex: number) {
    if (!engine.value) return;
    const ok = engine.value.confirmForcedSwitch(toIndex);
    if (!ok) return;

    syncFromEngine();

    if (engine.value.battleOver) {
      finalResult.value = engine.value.getResult(battleType.value);
      if (finalResult.value!.winner === 'enemy') {
        tryEnemyAutoCapture();
      }
      if (finalResult.value!.winner === 'ally' && battleType.value !== 'BOSS') {
        phase.value = 'capture_prompt';
      } else {
        phase.value = 'result';
      }
      return;
    }

    engine.value.planEnemyAction();
    phase.value = 'selecting';
  }

  function tryEscape() {
    if (!engine.value) return;
    phase.value = 'animating';

    const escResult = engine.value.tryEscape(battleType.value);
    syncFromEngine();

    if (escResult.success || engine.value.battleOver) {
      finalResult.value = engine.value.getResult(battleType.value);
      phase.value = 'result';
    } else if (engine.value.getPendingForcedSwitch()?.side === 'ally') {
      phase.value = 'forced_switch';
    } else {
      engine.value.planEnemyAction();
      phase.value = 'selecting';
    }
  }

  /** 玩家选球后预览捕捉率 */
  function previewCapture(attempt: CaptureAttempt) {
    if (!engine.value) return;
    const enriched = enrichCaptureAttempt(attempt);
    capturePreview.value = engine.value.buildCapturePreview(enriched);
  }

  function rollCapture(attempt: CaptureAttempt) {
    if (!engine.value || !capturePreview.value) return;
    const enriched = enrichCaptureAttempt(attempt);
    const preview = engine.value.buildCapturePreview(enriched);
    const diceRoll = Math.floor(Math.random() * 100) + 1;
    const rolled = engine.value.rollCapture(preview, diceRoll);
    capturePreview.value = rolled;
    captureBallsUsed.value.push(attempt.ballType);

    const ballIndex = captureBalls.value.findIndex(b => b.type === attempt.ballType);
    if (ballIndex >= 0) {
      captureBalls.value[ballIndex] = {
        ...captureBalls.value[ballIndex],
        count: captureBalls.value[ballIndex].count - 1,
      };
      captureBalls.value = captureBalls.value.filter(b => b.count > 0);
    }

    syncFromEngine();

    if (rolled.success) {
      finalResult.value = { ...engine.value.getResult(battleType.value), capture: rolled };
      phase.value = 'result';
    } else {
      engine.value.applyCaptureFail();
      syncFromEngine();
      const escaped = engine.value.tryEnemyEscapeAfterFail();
      syncFromEngine();
      if (escaped) {
        enemyEscapedDuringCapture.value = true;
      }
    }
  }

  function skipCapture() {
    finalResult.value = {
      ...(engine.value?.getResult(battleType.value) ?? {}),
      ...(capturePreview.value?.attempted ? { capture: capturePreview.value } : {}),
      ...(enemyEscapedDuringCapture.value ? { enemyEscaped: true } : {}),
    } as BattleResult;
    phase.value = 'result';
  }

  function resetCapturePreview() {
    capturePreview.value = null;
    enemyEscapedDuringCapture.value = false;
  }

  function enrichCaptureAttempt(attempt: CaptureAttempt): CaptureAttempt {
    return {
      ...attempt,
      useTechAssist: hasTechAssist.value,
      enemyAffection: enemy.value?.好感度,
      enemyCorruption: enemy.value?.堕落值,
      enemyNature: enemy.value?.性格,
    };
  }

  /** 敌方自动捕捉检定（我方战败时触发）——仅训练家战有效 */
  function tryEnemyAutoCapture() {
    if (!engine.value) return;
    if (battleType.value === '捕获') return;
    const { preview, ballType } = engine.value.buildEnemyCaptureAlly();
    const diceRoll = Math.floor(Math.random() * 100) + 1;
    const rolled = { ...preview, attempted: true, diceRoll, success: diceRoll === 1 ? preview.sRankHardLock && diceRoll === 1 ? true : false : diceRoll / 100 <= preview.finalRate };
    const isSLock = preview.sRankHardLock === true;
    rolled.success = isSLock ? diceRoll === 1 : (diceRoll / 100) <= preview.finalRate;
    rolled.roll = diceRoll / 100;
    rolled.detailText = `${preview.detailText}；掷骰${diceRoll}/100 → ${rolled.success ? '✅敌方捕捉成功' : '❌敌方捕捉失败'}`;

    finalResult.value = {
      ...(finalResult.value ?? engine.value.getResult(battleType.value)),
      enemyCaptureAlly: rolled,
    };
  }

  return {
    engine,
    phase,
    battleType,
    location,
    hasTechAssist,
    ally,
    enemy,
    allyTeam,
    enemyTeam,
    allyActiveIndex,
    enemyActiveIndex,
    round,
    log,
    lastActions,
    finalResult,
    availableItems,
    itemUsed,
    forcedSwitchSide,
    usedItemName,
    isOver,
    ctbOrder,
    captureBalls,
    capturePreview,
    captureBallsUsed,
    initBattle,
    restartBattle,
    registerOnBattleEnd,
    emitBattleEnd,
    useItem,
    skipItem,
    executeRound,
    tryEscape,
    previewCapture,
    rollCapture,
    skipCapture,
    resetCapturePreview,
    tryEnemyAutoCapture,
    confirmForcedSwitch,
  };
});
