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
  CaptureOutcome,
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
  const hasMihunxiang = ref(false);

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
  const usedItemNames = ref<string[]>([]);
  const usedItemName = computed(() => usedItemNames.value[usedItemNames.value.length - 1] ?? null);

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
  const captureLastBallUsed = computed(() => captureBallsUsed.value[captureBallsUsed.value.length - 1] ?? null);
  const captureTargetQueue = ref<number[]>([]);
  const completedCaptures = ref<CaptureOutcome[]>([]);
  const currentCaptureTargetIndex = ref<number | null>(null);

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
    usedItemNames.value = [];
    capturePreview.value = null;
    captureBallsUsed.value = [];
    captureTargetQueue.value = [];
    completedCaptures.value = [];
    currentCaptureTargetIndex.value = null;
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
    phase.value = 'animating';

    const actions = engine.value.executeRound({ action: 'item', item });
    lastActions.value = actions;
    const itemResult = engine.value.lastItemUseResult;
    if (itemResult?.ok && itemResult.itemName) {
      itemUsed.value = true;
      usedItemNames.value = [...usedItemNames.value, itemResult.itemName];
      availableItems.value = availableItems.value
        .map(i => (i.name === itemResult.itemName ? { ...i, count: Math.max(0, i.count - 1) } : i))
        .filter(i => i.count > 0);
    }
    syncFromEngine();

    if (engine.value.battleOver) {
      handleBattleOver();
    } else if (engine.value.getPendingForcedSwitch()?.side === 'ally') {
      phase.value = 'forced_switch';
    } else {
      engine.value.planEnemyAction();
      phase.value = 'selecting';
    }
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
      handleBattleOver();
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
      handleBattleOver();
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

    if (!rolled.success) {
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
    recordCurrentCaptureIfAttempted();
    startNextCaptureOrResult();
  }

  function confirmCaptureStep() {
    recordCurrentCaptureIfAttempted();
    startNextCaptureOrResult();
  }

  function resetCapturePreview() {
    capturePreview.value = null;
    enemyEscapedDuringCapture.value = false;
  }

  function enrichCaptureAttempt(attempt: CaptureAttempt): CaptureAttempt {
    return {
      ...attempt,
      useTechAssist: hasTechAssist.value,
      useMihunxiang: hasMihunxiang.value,
      enemyAffection: enemy.value?.好感度,
      enemyCorruption: enemy.value?.堕落值,
      enemyNature: enemy.value?.性格,
    };
  }

  function shuffleIndices(indices: number[]): number[] {
    const result = [...indices];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function buildFinalResult(): BattleResult {
    const base = engine.value?.getResult(battleType.value) ?? finalResult.value;
    if (!base) {
      throw new Error('战斗结果不存在');
    }
    const captures = completedCaptures.value;
    const lastCapture = captures[captures.length - 1];
    return {
      ...base,
      ...(lastCapture ? { capture: lastCapture.result } : {}),
      ...(captures.length > 0 ? { captures: [...captures] } : {}),
      ...(captures.some(c => c.enemyEscaped) ? { enemyEscaped: true } : {}),
    };
  }

  function prepareVictoryCaptureQueue() {
    if (!engine.value) return;
    captureTargetQueue.value = shuffleIndices(engine.value.getDefeatedEnemyIndices()).slice(0, 2);
  }

  function startNextCaptureOrResult() {
    if (!engine.value) return;
    capturePreview.value = null;
    enemyEscapedDuringCapture.value = false;

    const nextIndex = captureTargetQueue.value.shift();
    if (nextIndex === undefined) {
      currentCaptureTargetIndex.value = null;
      finalResult.value = buildFinalResult();
      phase.value = 'result';
      return;
    }

    currentCaptureTargetIndex.value = nextIndex;
    engine.value.setCaptureTarget(nextIndex);
    syncFromEngine();
    phase.value = 'capture_prompt';
  }

  function recordCurrentCaptureIfAttempted() {
    if (!engine.value || !capturePreview.value?.attempted || currentCaptureTargetIndex.value === null) return;
    const target = engine.value.enemyTeam[currentCaptureTargetIndex.value];
    if (!target) return;
    completedCaptures.value = [
      ...completedCaptures.value,
      {
        targetName: target.name,
        result: capturePreview.value,
        ...(enemyEscapedDuringCapture.value ? { enemyEscaped: true } : {}),
      },
    ];
  }

  function handleBattleOver() {
    if (!engine.value) return;
    finalResult.value = engine.value.getResult(battleType.value);
    if (finalResult.value.winner === 'enemy') {
      tryEnemyAutoCapture();
      phase.value = 'result';
      return;
    }
    if (finalResult.value.winner === 'ally') {
      prepareVictoryCaptureQueue();
      startNextCaptureOrResult();
      return;
    }
    phase.value = 'result';
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
    hasMihunxiang,
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
    usedItemNames,
    forcedSwitchSide,
    usedItemName,
    isOver,
    ctbOrder,
    captureBalls,
    capturePreview,
    captureBallsUsed,
    captureLastBallUsed,
    enemyEscapedDuringCapture,
    captureTargetQueue,
    completedCaptures,
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
    confirmCaptureStep,
    resetCapturePreview,
    tryEnemyAutoCapture,
    confirmForcedSwitch,
  };
});
