// ====================================================================
// 战斗系统脚本入口 - 宝可梦风格3v3重构
// ====================================================================

import { createScriptIdDiv, createScriptIdIframe, teleportStyle } from '@util/script';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import './global.css';
import { useBattleStore } from './store';
import { resetPortraitPool } from './battle-assets';
import type {
  BattleConsole,
  BattleItem,
  BattleResult,
  BattleUnit,
  CaptureBallItem,
  Element,
  PassiveSkillData,
  SkillData,
  SkillTargetType,
} from './types';

function normalizeSkillTargetType(raw: unknown): SkillTargetType | undefined {
  if (typeof raw !== 'string') return undefined;
  const normalized = raw.trim().toLowerCase();

  const mapping: Record<string, SkillTargetType> = {
    single_enemy: 'single_enemy',
    enemy: 'single_enemy',
    敌方单体: 'single_enemy',
    单体敌方: 'single_enemy',
    self: 'self',
    自身: 'self',
    自己: 'self',
    ally: 'ally',
    友方单体: 'ally',
    单体友方: 'ally',
    all_enemies: 'all_enemies',
    敌方全体: 'all_enemies',
    all_allies: 'all_allies',
    友方全体: 'all_allies',
  };

  return mapping[normalized];
}

/** 从 MVU 角色数据提取 BattleUnit */
function extractBattleUnit(name: string, charData: Record<string, any>): BattleUnit {
  const skills: SkillData[] = [];
  const passives: PassiveSkillData[] = [];
  const rawSkills = charData.技能 ?? {};

  for (const [skillName, s] of Object.entries(rawSkills) as [string, any][]) {
    if (!s) continue;

    if (s.类型 === '被动' || s.类型 === '天赋' || s.类型 === '光环') {
      passives.push({
        name: s.name || skillName,
        类型: s.类型,
        描述: s.描述 ?? '',
        效果公式: s.效果公式 ?? '',
        数值参数: s.数值参数 ?? {},
      });
      continue;
    }

    skills.push({
      name: s.name || skillName,
      类型: s.类型 ?? '主动',
      稀有度: s.稀有度 ?? 'N',
      元素属性: (s.元素属性 ?? '无') as Element,
      消耗MP: Number(s.消耗MP) || 0,
      冷却回合: Number(s.冷却回合) || 0,
      基础威力: Number(s.基础威力) || 0,
      描述: s.描述 ?? '',
      效果公式: s.效果公式 ?? '',
      目标类型: normalizeSkillTargetType(s.目标类型),
      数值参数: s.数值参数 ?? {},
    });
  }

  return {
    name,
    性格: charData.性格,
     好感度: charData.好感度 != null ? Number(charData.好感度) : undefined,
    堕落值: Number(charData.堕落值) || 0,
    等级: Number(charData.等级) || 1,
    稀有度: charData.稀有度,
    品质: charData.品质,
    战斗类型: charData.战斗类型,
    元素属性: (charData.元素属性 ?? '无') as Element,
    攻击力: Number(charData.攻击力) || 10,
    防御力: Number(charData.防御力) || 10,
    特攻: Number(charData.特攻) || 10,
    特防: Number(charData.特防) || 10,
    速度: Number(charData.速度) || 10,
    HP: Number(charData.生命值?.最大值) || 100,
    HPMax: Number(charData.生命值?.最大值) || 100,
    MP: Number(charData.法力值?.最大值) || 50,
    MPMax: Number(charData.法力值?.最大值) || 50,
    shield: Number(charData.护盾?.当前值) || 0,
    shieldMax: Number(charData.护盾?.最大值) || 0,
    skills,
    passives,
    cooldowns: {},
    statusEffects: [],
  };
}

/** 从背包变量中提取可用战斗道具 */
function extractBattleItems(statData: Record<string, any>): BattleItem[] {
  const items: BattleItem[] = [];
  const backpack = _.get(statData, '背包', {}) as Record<string, any>;

  for (const [itemName, itemData] of Object.entries(backpack)) {
    if (!itemData || Number(itemData.数量 ?? itemData.count ?? 0) <= 0) continue;
    const count = Number(itemData.数量 ?? itemData.count ?? 0);

    if (itemName.includes('精华')) {
      const elementMap: Record<string, Element> = {
        风之精华: '风',
        水之精华: '水',
        火之精华: '火',
        地之精华: '地',
        光之精华: '光',
        暗之精华: '暗',
      };
      const element = elementMap[itemName];
      if (element) items.push({ name: itemName, category: '属性增强药', element, count });
      continue;
    }

    if (itemName.includes('技能增强')) {
      items.push({ name: itemName, category: '技能增强药', count });
      continue;
    }

    if (itemName.includes('伤药')) {
      let healLevel: '初级' | '中级' | '高级' = '初级';
      if (itemName.includes('中级')) healLevel = '中级';
      else if (itemName.includes('高级')) healLevel = '高级';
      items.push({ name: itemName, category: '伤药', healLevel, count });
      continue;
    }
  }

  return items;
}

function buildTeamNames(consoleData: BattleConsole, side: 'ally' | 'enemy'): string[] {
  const rawMain = side === 'ally' ? consoleData.己方出战 : consoleData.敌方出战;
  const parts = Array.isArray(rawMain) ? rawMain : (typeof rawMain === 'string' ? rawMain.split(/[,，、]/) : []);
  const list = (side === 'ally' ? consoleData.己方队伍 : consoleData.敌方队伍) ?? [];
  const merged = [...parts, ...list].filter(Boolean).map(s => s.trim());
  return [...new Set(merged)].slice(0, 3);
}

function extractCaptureBalls(statData: Record<string, any>): CaptureBallItem[] {
  const backpack = _.get(statData, '背包', {}) as Record<string, any>;
  const ballTypes: CaptureBallItem[] = [];

  const ballMatcher: Array<{ patterns: string[]; type: CaptureBallItem['type'] }> = [
    { patterns: ['普通捕捉球', '普通球', '低级捕捉球', '低级球', '基础捕捉球', '基础球'], type: '普通球' },
    { patterns: ['高级捕捉球', '高级球'], type: '高级球' },
    { patterns: ['超级捕捉球', '超级球', '大师捕捉球', '大师球', '究极捕捉球', '究极球'], type: '超级球' },
    { patterns: ['魅惑捕捉球', '魅惑之球', '魅惑球', '魅魔捕捉球', '魅魔之球'], type: '魅惑之球' },
  ];

  const counted: Record<string, number> = {};

  for (const [itemName, itemData] of Object.entries(backpack)) {
    if (!itemData) continue;
    const count = Number((itemData as any).数量 ?? (itemData as any).count ?? 0);
    if (count <= 0) continue;

    for (const matcher of ballMatcher) {
      if (matcher.patterns.some(p => itemName.includes(p))) {
        counted[matcher.type] = (counted[matcher.type] || 0) + count;
        break;
      }
    }
  }

  for (const [type, count] of Object.entries(counted)) {
    if (count > 0) ballTypes.push({ type: type as CaptureBallItem['type'], count });
  }

  console.info('[战斗系统] 检测到捕捉球:', ballTypes);
  return ballTypes;
}

/** 生成简短战斗摘要并发送到聊天 */
async function sendBattleLog(
  allyNames: string[],
  enemyNames: string[],
  result: BattleResult,
) {
  const resultText = result.winner === 'ally' ? '胜利' : result.winner === 'escape' ? '逃跑' : '战败';
  const lines: string[] = [
    `━━━ 战斗结算 ━━━`,
    `${allyNames.join(' / ')}  vs  ${enemyNames.join(' / ')}`,
    `结果：${resultText}  |  回合数：${result.rounds}`,
  ];
  if (result.goldGained > 0) lines.push(`金币 +${result.goldGained}`);
  if (result.expGained > 0) lines.push(`经验 +${result.expGained}`);

  // ===== 技能使用统计 =====
  const allySkillCount: Record<string, Record<string, number>> = {};
  const enemySkillCount: Record<string, Record<string, number>> = {};
  let allyTotalDmg = 0;
  let enemyTotalDmg = 0;
  let allyTotalHeal = 0;
  let enemyTotalHeal = 0;

  for (const entry of result.log) {
    if (entry.type === 'damage' || entry.type === 'crit' || entry.type === 'heal') {
      const msg = entry.message;
      // 提取技能名：在"使用了 XXX"之后
      const usedMatch = msg.match(/使用了\s+(.+?)(?:，|$|造成)/);
      // 提取施法者：在"使用了"之前
      const actorMatch = msg.match(/^(.+?)\s+使用了/);

      if (actorMatch && usedMatch) {
        const actor = actorMatch[1];
        const skillName = usedMatch[1];
        const isAlly = allyNames.includes(actor);
        const pool = isAlly ? allySkillCount : enemySkillCount;
        if (!pool[actor]) pool[actor] = {};
        pool[actor][skillName] = (pool[actor][skillName] || 0) + 1;
      }

      // 累计伤害/治疗
      const dmgMatch = msg.match(/造成\s+(\d+)\s+点伤害/);
      const healMatch = msg.match(/恢复\s+(\d+)\s+HP/) ?? msg.match(/吸取\s+(\d+)\s+HP/);
      if (dmgMatch) {
        const actor = msg.match(/^(.+?)\s+使用了/)?.[1];
        if (actor && allyNames.includes(actor)) allyTotalDmg += Number(dmgMatch[1]);
        else if (actor) enemyTotalDmg += Number(dmgMatch[1]);
      }
      if (healMatch) {
        const actor = msg.match(/^(.+?)\s+使用了/)?.[1];
        if (actor && allyNames.includes(actor)) allyTotalHeal += Number(healMatch[1]);
        else if (actor) enemyTotalHeal += Number(healMatch[1]);
      }
    }
  }

  const formatSkillList = (pool: Record<string, Record<string, number>>): string[] => {
    const result: string[] = [];
    for (const [name, skills] of Object.entries(pool)) {
      const skillEntries = Object.entries(skills)
        .sort((a, b) => b[1] - a[1])
        .map(([sn, count]) => `${sn}×${count}`);
      if (skillEntries.length) result.push(`  ${name}: ${skillEntries.join('、')}`);
    }
    return result;
  };

  const allySkillLines = formatSkillList(allySkillCount);
  const enemySkillLines = formatSkillList(enemySkillCount);

  if (allySkillLines.length > 0) {
    lines.push('');
    lines.push('── 我方行动 ──');
    lines.push(`总伤害: ${allyTotalDmg}  |  总治疗: ${allyTotalHeal}`);
    lines.push(...allySkillLines);
  }
  if (enemySkillLines.length > 0) {
    lines.push('');
    lines.push('── 敌方行动 ──');
    lines.push(`总伤害: ${enemyTotalDmg}  |  总治疗: ${enemyTotalHeal}`);
    lines.push(...enemySkillLines);
  }

  // ===== 捕捉结果 =====
  if (result.captures && result.captures.length > 0) {
    for (const capture of result.captures) {
      if (capture.result.success) {
        lines.push('');
        lines.push(`🎯 捕捉成功！${capture.targetName} 被收入囊中`);
        if (capture.result.sRankHardLock) lines.push(`   (S级硬锁，骰出1点，奇迹！)`);
      } else {
        lines.push('');
        lines.push(`🎯 捕捉失败（${capture.targetName}）— ${capture.result.detailText.replace(/；掷骰\d+\/\d+.*/, '')}`);
      }
    }
  } else if (result.capture) {
    if (result.capture.success) {
      lines.push('');
      lines.push(`🎯 捕捉成功！${enemyNames[0]} 被收入囊中`);
      if (result.capture.sRankHardLock) lines.push(`   (S级硬锁，骰出1点，奇迹！)`);
    } else {
      lines.push('');
      lines.push(`🎯 捕捉失败 — ${result.capture.detailText.replace(/；掷骰\d+\/\d+.*/, '')}`);
    }
  }

  if (result.enemyEscaped) {
    lines.push(`💨 ${enemyNames[0]} 挣脱束缚逃跑了！`);
  }

  if (result.enemyCaptureAlly) {
    if (result.enemyCaptureAlly.success) {
      lines.push('');
      lines.push(`⚠ 敌方训练家趁乱投球，${allyNames[0]} 被捉走了！`);
    } else {
      lines.push('');
      lines.push(`敌方训练家尝试捕捉${allyNames[0]}，但失败了`);
    }
  }

  // ===== 关键事件 =====
  const keyLogs = result.log
    .filter(e => e.type === 'defeat' || e.type === 'victory' || e.type === 'switch')
    .slice(-6)
    .map(e => e.message);
  if (keyLogs.length) {
    lines.push('');
    lines.push('── 关键节点 ──');
    lines.push(...keyLogs.map(l => `  · ${l}`));
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━');

  await createChatMessages([{ role: 'user', message: lines.join('\n') }]);
}

/** 将战斗结果写回 MVU 变量（3v3） */
async function writeBattleResult(
  allyTeamNames: string[],
  enemyTeamNames: string[],
  result: BattleResult,
  messageId: number,
  usedItemNames: string[],
  captureBallsUsed: string[],
) {
  await waitGlobalInitialized('Mvu');
  const variables = Mvu.getMvuData({ type: 'message', message_id: messageId });
  const statData = _.get(variables, 'stat_data', {});
  const backpack = _.get(statData, '背包', {}) as Record<string, any>;

  allyTeamNames.forEach((name, idx) => {
    const allyData = _.get(statData, `角色数据.${name}`);
    if (!allyData) return;
    const state = result.allyTeamState[idx];
    if (!state) return;
    if (!allyData.生命值) allyData.生命值 = {};
    allyData.生命值.当前值 = state.HP;
    if (!allyData.法力值) allyData.法力值 = {};
    allyData.法力值.当前值 = state.MP;
    if (result.expGained > 0 && idx === 0) {
      if (!allyData.经验值) allyData.经验值 = {};
      allyData.经验值.当前值 = (Number(allyData.经验值.当前值) || 0) + result.expGained;
    }
  });

  enemyTeamNames.forEach((name, idx) => {
    const enemyData = _.get(statData, `角色数据.${name}`);
    if (!enemyData) return;
    const state = result.enemyTeamState[idx];
    if (!state) return;
    if (!enemyData.生命值) enemyData.生命值 = {};
    enemyData.生命值.当前值 = state.HP;
    if (!enemyData.法力值) enemyData.法力值 = {};
    enemyData.法力值.当前值 = state.MP;
    if (state.HP <= 0) enemyData.状态 = '濒死';
  });

  if (result.goldGained > 0) {
    const curGold = Number(_.get(statData, '金币', 0));
    _.set(statData, '金币', curGold + result.goldGained);
  }

  if (usedItemNames.length > 0) {
    for (const usedItemName of usedItemNames) {
      const itemPath = `背包.${usedItemName}.数量`;
      const currentCount = Number(_.get(statData, itemPath, 0));
      if (currentCount > 0) {
        _.set(statData, itemPath, Math.max(0, currentCount - 1));
        if (Number(_.get(statData, itemPath, 0)) <= 0) {
          _.unset(statData, `背包.${usedItemName}`);
        }
      }
    }
  }

  if (captureBallsUsed.length > 0) {
    for (const ballType of captureBallsUsed) {
      let ballKey: string | null = null;
      const candidates = [
        ballType,
        ballType.replace('球', '捕捉球'),
        ballType + '捕捉球',
      ];
      for (const candidate of candidates) {
        if (_.has(backpack, candidate)) { ballKey = candidate; break; }
      }
      if (!ballKey) {
        for (const key of Object.keys(backpack)) {
          if (key.includes(ballType.replace('球', '')) && key.includes('球')) {
            ballKey = key;
            break;
          }
        }
      }
      if (!ballKey) continue;

      const ballPath = `背包.${ballKey}.数量`;
      const currentCount = Number(_.get(statData, ballPath, 0));
      if (currentCount > 0) {
        _.set(statData, ballPath, Math.max(0, currentCount - 1));
        if (Number(_.get(statData, ballPath, 0)) <= 0) {
          _.unset(statData, `背包.${ballKey}`);
        }
      }
    }
  }

  const capturedNames = result.captures
    ?.filter(c => c.result.success)
    .map(c => c.targetName) ?? (result.capture?.success ? [enemyTeamNames[0]] : []);

  for (const capturedName of capturedNames) {
      const capturedData = _.get(statData, `角色数据.${capturedName}`);
      if (capturedData) {
        capturedData.从属训练家 = _.get(statData, '玩家名', '');
        capturedData.归属状态 = '出战';
        capturedData.状态 = '正常';
        if (!capturedData.生命值) capturedData.生命值 = {};
        capturedData.生命值.当前值 = 1;
        if (!capturedData.法力值) capturedData.法力值 = {};
        capturedData.法力值.当前值 = 1;
      }
  }

  if (result.enemyCaptureAlly?.success) {
    const capturedName = result.allyTeamState.find(u => u.name)?.name;
    if (capturedName) {
      const capturedData = _.get(statData, `角色数据.${capturedName}`);
      if (capturedData) {
        capturedData.归属状态 = '离场';
        capturedData.状态 = '异常';
        if (!capturedData.生命值) capturedData.生命值 = {};
        capturedData.生命值.当前值 = 1;
      }
    }
  }

  _.set(statData, '战斗控制台.进行中', false);
  await Mvu.replaceMvuData(variables, { type: 'message', message_id: messageId });
  console.info('[战斗系统] 战斗结果已写回 MVU 变量');
}

// ====================================================================
// 主入口: 战斗 UI 管理
// ====================================================================

let vueApp: ReturnType<typeof createApp> | null = null;
let $iframe: JQuery<HTMLIFrameElement> | null = null;
let destroyTeleportedStyle: (() => void) | null = null;
let battleMessageId = -1;
let battleAllyTeamNames: string[] = [];
let battleEnemyTeamNames: string[] = [];

function startBattle(messageId: number) {
  const variables = Mvu.getMvuData({ type: 'message', message_id: messageId });
  const statData = _.get(variables, 'stat_data', {});
  const globalStatData = _.get(Mvu.getMvuData({ type: 'global' }), 'stat_data', {}) ?? {};
  const consoleData: BattleConsole = _.get(statData, '战斗控制台', {}) as BattleConsole;

  if (!consoleData.进行中) return;

  const allyNames = buildTeamNames(consoleData, 'ally');
  const enemyNames = buildTeamNames(consoleData, 'enemy');

  function resolveCharData(name: string): Record<string, any> | undefined {
    return _.get(statData, `角色数据.${name}`) ?? _.get(globalStatData, `角色数据.${name}`);
  }

  const allyUnits = allyNames
    .map(name => ({ name, data: resolveCharData(name) }))
    .filter(x => !!x.data)
    .map(x => extractBattleUnit(x.name, x.data));

  const enemyUnits = enemyNames
    .map(name => ({ name, data: resolveCharData(name) }))
    .filter(x => !!x.data)
    .map(x => extractBattleUnit(x.name, x.data));

  if (allyUnits.length === 0 || enemyUnits.length === 0) {
    console.error('[战斗系统] 找不到有效队伍数据:', allyNames, enemyNames);
    return;
  }

  battleMessageId = messageId;
  battleAllyTeamNames = allyUnits.map(x => x.name);
  battleEnemyTeamNames = enemyUnits.map(x => x.name);

  const mergedStat = { ...globalStatData, ...statData };
  const items = extractBattleItems(mergedStat);
  const balls = extractCaptureBalls(mergedStat);
  const location = _.get(mergedStat, '世界.地点', '') as string;
  const trainerEquip = _.get(mergedStat, '训练家.特殊装备', []) as Array<{ 名称?: string }>;
  const hasTechAssist = trainerEquip.some(e => e.名称?.includes('捕捉辅助器'));
  const hasMihunxiang = Number(_.get(mergedStat, '背包.迷魂香.数量', 0)) > 0
    || trainerEquip.some(e => e.名称?.includes('迷魂香'));
  console.info(`[战斗系统] 开始战斗: [${battleAllyTeamNames.join(', ')}] vs [${battleEnemyTeamNames.join(', ')}]`);

  createBattleIframe(allyUnits, enemyUnits, consoleData.战斗类型, items, balls, consoleData.敌方训练家信息, location, hasTechAssist, hasMihunxiang);
}

function createBattleIframe(
  allyUnits: BattleUnit[],
  enemyUnits: BattleUnit[],
  type: BattleConsole['战斗类型'],
  items: BattleItem[],
  balls: CaptureBallItem[],
  enemyTrainerInfo?: BattleConsole['敌方训练家信息'],
  location?: string,
  hasTechAssist?: boolean,
  hasMihunxiang?: boolean,
) {
  resetPortraitPool();
  if ($iframe) destroyBattle();

  $iframe = createScriptIdIframe()
    .attr('scrolling', 'yes')
    .css({
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      border: 'none',
      borderRadius: '0',
      zIndex: '99999',
      background: 'transparent',
      overflow: 'auto',
    })
    .appendTo('body')
    .on('load', () => {
      const iframeDoc = $iframe![0].contentDocument!;
      const { destroy } = teleportStyle(iframeDoc.head);
      destroyTeleportedStyle = destroy;

      iframeDoc.documentElement.style.setProperty('overflow-x', 'hidden', 'important');
      iframeDoc.documentElement.style.setProperty('overflow-y', 'auto', 'important');
      iframeDoc.body.style.setProperty('overflow-x', 'hidden', 'important');
      iframeDoc.body.style.setProperty('overflow-y', 'auto', 'important');
      iframeDoc.body.style.setProperty('min-height', '100vh');

      const pinia = createPinia();
      vueApp = createApp(App).use(pinia);

      const store = useBattleStore(pinia);
      store.initBattle(allyUnits, enemyUnits, type, items, balls, enemyTrainerInfo);
      store.location = location ?? '';
      if (hasTechAssist) store.hasTechAssist = true;
      if (hasMihunxiang) store.hasMihunxiang = true;

      store.registerOnBattleEnd(async (result: BattleResult) => {
        const consumedItems = [...store.usedItemNames];
        if (hasMihunxiang) consumedItems.push('迷魂香');
        await writeBattleResult(battleAllyTeamNames, battleEnemyTeamNames, result, battleMessageId, consumedItems, store.captureBallsUsed);
        await sendBattleLog(battleAllyTeamNames, battleEnemyTeamNames, result);
        destroyBattle();
      });

      vueApp.mount(iframeDoc.body);
    });
}

function destroyBattle() {
  if (vueApp) {
    vueApp.unmount();
    vueApp = null;
  }
  if (destroyTeleportedStyle) {
    destroyTeleportedStyle();
    destroyTeleportedStyle = null;
  }
  if ($iframe) {
    $iframe.remove();
    $iframe = null;
  }
}

function closeBattleUI() {
  if ($iframe) $iframe.css('display', 'none');
}

function showBattleUI() {
  if ($iframe) {
    $iframe.css('display', '');
    const body = $iframe[0]?.contentDocument?.body;
    if (body) body.style.display = '';
  }
}

function findLatestBattleMessageId(scanDepth = 12): number {
  const latest = getLastMessageId();
  if (latest < 0) return -1;

  const minId = Math.max(0, latest - scanDepth + 1);
  for (let id = latest; id >= minId; id--) {
    const vars = Mvu.getMvuData({ type: 'message', message_id: id });
    const bc = _.get(vars, 'stat_data.战斗控制台');
    if (bc?.进行中) return id;
  }
  return -1;
}

function debugStartBattle() {
  if ($iframe) {
    showBattleUI();
    return;
  }

  const mockAlly: BattleUnit[] = [
    // === 我方强攻（力量型）: 覆盖 physical_damage / AOE / drain_physical / buff / debuff / 暴击 ===
    {
      name: '赵羽', 等级: 14, 稀有度: 'A', 战斗类型: '强攻型', 元素属性: '火',
      攻击力: 124, 防御力: 79, 特攻: 41, 特防: 44, 速度: 114,
      HP: 476, HPMax: 476, MP: 236, MPMax: 236, shield: 0, shieldMax: 200,
      cooldowns: {}, statusEffects: [],
      skills: [
        { name: '破军斩', 类型: '主动', 稀有度: '普通', 元素属性: '火', 消耗MP: 10, 冷却回合: 0, 基础威力: 60, 描述: '烈焰附着的斩击', 效果公式: 'physical_damage', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.95 } },
        { name: '横扫八方', 类型: '主动', 稀有度: '稀有', 元素属性: '火', 消耗MP: 25, 冷却回合: 3, 基础威力: 45, 描述: '横扫全体敌人', 效果公式: 'physical_damage', 目标类型: 'all_enemies', 数值参数: { 命中率: 0.9 } },
        { name: '嗜血刃', 类型: '主动', 稀有度: '稀有', 元素属性: '暗', 消耗MP: 20, 冷却回合: 3, 基础威力: 50, 描述: '吸取敌方生命', 效果公式: 'drain_physical', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.95 } },
        { name: '战吼', 类型: '主动', 稀有度: '稀有', 元素属性: '无', 消耗MP: 15, 冷却回合: 4, 基础威力: 0, 描述: '提升自身攻击', 效果公式: 'buff', 目标类型: 'self', 数值参数: { 攻击加成: 2, 持续回合: 3 } },
        { name: '碎甲击', 类型: '主动', 稀有度: '稀有', 元素属性: '地', 消耗MP: 15, 冷却回合: 3, 基础威力: 30, 描述: '降低敌方防御并可能造成流血', 效果公式: 'debuff', 目标类型: 'single_enemy', 数值参数: { 防御加成: 2, 持续回合: 3, 命中率: 0.9, 流血概率: 0.45, 流血回合: 3, 流血伤害: 0.05 } },
        { name: '绝杀突刺', 类型: '主动', 稀有度: '史诗', 元素属性: '火', 消耗MP: 35, 冷却回合: 5, 基础威力: 110, 描述: '高暴击的致命一击', 效果公式: 'physical_damage', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.85, 暴击率加成: 0.2 } },
        { name: '壁垒冲击', 类型: '主动', 稀有度: '史诗', 元素属性: '地', 消耗MP: 28, 冷却回合: 3, 基础威力: 50, 描述: '用防御和护盾发动强力反击', 效果公式: 'shield_damage', 目标类型: 'single_enemy', 数值参数: { 护盾倍率: 0.5, 系数: 0.6, 命中率: 0.9 } },
      ],
      passives: [
        { name: '战意护体', 类型: '被动', 描述: '受到攻击时有30%概率获得护盾', 效果公式: '', 数值参数: { 护盾触发概率: 0.3, 护盾比例: 0.15, 持续回合: 3 } },
      ],
    },
    // === 我方速度: 覆盖 physical / magic / heal / buff-speed / debuff-speed / buff-all_allies ===
    {
      name: '凌风', 等级: 13, 稀有度: 'A', 战斗类型: '敏捷型', 元素属性: '风',
      攻击力: 65, 防御力: 40, 特攻: 71, 特防: 40, 速度: 145,
      HP: 304, HPMax: 304, MP: 316, MPMax: 316, shield: 0, shieldMax: 0,
      cooldowns: {}, statusEffects: [],
      skills: [
        { name: '疾风刺', 类型: '主动', 稀有度: '普通', 元素属性: '风', 消耗MP: 8, 冷却回合: 0, 基础威力: 50, 描述: '迅捷的刺击', 效果公式: 'physical_damage', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.95 } },
        { name: '风刃术', 类型: '主动', 稀有度: '普通', 元素属性: '风', 消耗MP: 12, 冷却回合: 0, 基础威力: 55, 描述: '风之刃攻击', 效果公式: 'magic_damage', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.9 } },
        { name: '清风愈', 类型: '主动', 稀有度: '稀有', 元素属性: '风', 消耗MP: 22, 冷却回合: 3, 基础威力: 0, 描述: '恢复友方生命', 效果公式: 'heal', 目标类型: 'ally', 数值参数: { 治疗比例: 0.35 } },
        { name: '风之加护', 类型: '主动', 稀有度: '稀有', 元素属性: '风', 消耗MP: 18, 冷却回合: 4, 基础威力: 0, 描述: '提升友方速度', 效果公式: 'buff', 目标类型: 'ally', 数值参数: { 速度加成: 2, 持续回合: 3 } },
        { name: '风缚术', 类型: '主动', 稀有度: '稀有', 元素属性: '风', 消耗MP: 18, 冷却回合: 3, 基础威力: 0, 描述: '降低敌方速度', 效果公式: 'debuff', 目标类型: 'single_enemy', 数值参数: { 速度加成: 2, 持续回合: 3 } },
        { name: '全队鼓舞', 类型: '主动', 稀有度: '史诗', 元素属性: '无', 消耗MP: 30, 冷却回合: 5, 基础威力: 0, 描述: '提升全体友方属性', 效果公式: 'buff', 目标类型: 'all_allies', 数值参数: { 全属性加成: 1, 持续回合: 2 } },
      ],
      passives: [],
    },
    // === 我方魔导（魔法型）: 覆盖 magic / magic-AOE / drain_magic / heal / shield-buff / 全属性debuff ===
    {
      name: '雪姬', 等级: 14, 稀有度: 'A', 战斗类型: '魔导型', 元素属性: '水',
      攻击力: 41, 防御力: 44, 特攻: 162, 特防: 114, 速度: 44,
      HP: 616, HPMax: 616, MP: 811, MPMax: 811, shield: 0, shieldMax: 0,
      cooldowns: {}, statusEffects: [],
      skills: [
        { name: '冰晶术', 类型: '主动', 稀有度: '普通', 元素属性: '水', 消耗MP: 12, 冷却回合: 0, 基础威力: 60, 描述: '发射冰晶', 效果公式: 'magic_damage', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.95 } },
        { name: '暴风雪', 类型: '主动', 稀有度: '稀有', 元素属性: '水', 消耗MP: 32, 冷却回合: 4, 基础威力: 50, 描述: '全体冰系魔法', 效果公式: 'magic_damage', 目标类型: 'all_enemies', 数值参数: { 命中率: 0.85 } },
        { name: '生命汲取', 类型: '主动', 稀有度: '稀有', 元素属性: '暗', 消耗MP: 25, 冷却回合: 3, 基础威力: 55, 描述: '吸取敌方魔力与生命', 效果公式: 'drain_magic', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.9 } },
        { name: '治愈术', 类型: '主动', 稀有度: '稀有', 元素属性: '光', 消耗MP: 25, 冷却回合: 3, 基础威力: 0, 描述: '恢复友方生命', 效果公式: 'heal', 目标类型: 'ally', 数值参数: { 治疗量: 65 } },
        { name: '冰晶护盾', 类型: '主动', 稀有度: '史诗', 元素属性: '水', 消耗MP: 28, 冷却回合: 4, 基础威力: 0, 描述: '给友方施加护盾', 效果公式: 'buff', 目标类型: 'ally', 数值参数: { 护盾值: 55 } },
        { name: '虚弱诅咒', 类型: '主动', 稀有度: '稀有', 元素属性: '暗', 消耗MP: 22, 冷却回合: 3, 基础威力: 0, 描述: '降低敌方全属性并概率中毒', 效果公式: 'debuff', 目标类型: 'single_enemy', 数值参数: { 全属性加成: 1, 持续回合: 2, 中毒概率: 0.4, 中毒回合: 3, 中毒伤害: 0.05 } },
      ],
      passives: [],
    },
  ];

  const mockEnemy: BattleUnit[] = [
    // === 敌方强攻（力量型）===
    {
      name: '铁心', 等级: 12, 稀有度: 'B', 战斗类型: '强攻型', 元素属性: '地',
      攻击力: 96, 防御力: 62, 特攻: 36, 特防: 36, 速度: 80,
      HP: 374, HPMax: 374, MP: 196, MPMax: 196, shield: 0, shieldMax: 0,
      cooldowns: {}, statusEffects: [],
      skills: [
        { name: '重斩', 类型: '主动', 稀有度: '普通', 元素属性: '地', 消耗MP: 8, 冷却回合: 0, 基础威力: 55, 描述: '沉重的斩击', 效果公式: 'physical_damage', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.95 } },
        { name: '地裂波', 类型: '主动', 稀有度: '稀有', 元素属性: '地', 消耗MP: 24, 冷却回合: 3, 基础威力: 40, 描述: '全体地面攻击', 效果公式: 'physical_damage', 目标类型: 'all_enemies', 数值参数: { 命中率: 0.9 } },
        { name: '铁壁', 类型: '主动', 稀有度: '稀有', 元素属性: '地', 消耗MP: 15, 冷却回合: 4, 基础威力: 0, 描述: '大幅提升防御', 效果公式: 'buff', 目标类型: 'self', 数值参数: { 防御加成: 2, 持续回合: 3 } },
        { name: '痛击', 类型: '主动', 稀有度: '稀有', 元素属性: '地', 消耗MP: 18, 冷却回合: 2, 基础威力: 75, 描述: '猛力一击', 效果公式: 'physical_damage', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.9 } },
        { name: '威压', 类型: '主动', 稀有度: '稀有', 元素属性: '暗', 消耗MP: 15, 冷却回合: 3, 基础威力: 0, 描述: '降低敌方攻击', 效果公式: 'debuff', 目标类型: 'single_enemy', 数值参数: { 攻击加成: 2, 持续回合: 2 } },
        { name: '狂战士之怒', 类型: '主动', 稀有度: '史诗', 元素属性: '火', 消耗MP: 32, 冷却回合: 5, 基础威力: 100, 描述: '高暴击强攻', 效果公式: 'physical_damage', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.85, 暴击率加成: 0.15 } },
      ],
      passives: [],
    },
    // === 敌方速度 ===
    {
      name: '影刃', 等级: 11, 稀有度: 'B', 战斗类型: '敏捷型', 元素属性: '暗',
      攻击力: 61, 防御力: 32, 特攻: 61, 特防: 35, 速度: 122,
      HP: 252, HPMax: 252, MP: 269, MPMax: 269, shield: 0, shieldMax: 0,
      cooldowns: {}, statusEffects: [],
      skills: [
        { name: '影袭', 类型: '主动', 稀有度: '普通', 元素属性: '暗', 消耗MP: 8, 冷却回合: 0, 基础威力: 48, 描述: '暗影突袭', 效果公式: 'physical_damage', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.95 } },
        { name: '暗影弹', 类型: '主动', 稀有度: '普通', 元素属性: '暗', 消耗MP: 10, 冷却回合: 0, 基础威力: 52, 描述: '暗系法术攻击', 效果公式: 'magic_damage', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.9 } },
        { name: '暗步', 类型: '主动', 稀有度: '稀有', 元素属性: '暗', 消耗MP: 15, 冷却回合: 4, 基础威力: 0, 描述: '提升自身速度', 效果公式: 'buff', 目标类型: 'self', 数值参数: { 速度加成: 2, 持续回合: 3 } },
        { name: '烟雾弹', 类型: '主动', 稀有度: '稀有', 元素属性: '暗', 消耗MP: 16, 冷却回合: 3, 基础威力: 0, 描述: '降低敌方速度', 效果公式: 'debuff', 目标类型: 'single_enemy', 数值参数: { 速度加成: 2, 持续回合: 2 } },
        { name: '连环击', 类型: '主动', 稀有度: '稀有', 元素属性: '暗', 消耗MP: 20, 冷却回合: 2, 基础威力: 35, 描述: '二连击', 效果公式: 'physical_damage', 目标类型: 'single_enemy', 数值参数: { 伤害次数: 2, 命中率: 0.9 } },
        { name: '暗杀术', 类型: '主动', 稀有度: '史诗', 元素属性: '暗', 消耗MP: 30, 冷却回合: 4, 基础威力: 90, 描述: '高暴击暗杀', 效果公式: 'physical_damage', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.85, 暴击率加成: 0.2 } },
      ],
      passives: [],
    },
    // === 敌方魔导（魔法型）===
    {
      name: '红莲', 等级: 12, 稀有度: 'B', 战斗类型: '魔导型', 元素属性: '火',
      攻击力: 36, 防御力: 36, 特攻: 125, 特防: 80, 速度: 36,
      HP: 446, HPMax: 446, MP: 598, MPMax: 598, shield: 0, shieldMax: 0,
      cooldowns: {}, statusEffects: [],
      skills: [
        { name: '火球术', 类型: '主动', 稀有度: '普通', 元素属性: '火', 消耗MP: 10, 冷却回合: 0, 基础威力: 58, 描述: '火球攻击', 效果公式: 'magic_damage', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.95 } },
        { name: '烈焰风暴', 类型: '主动', 稀有度: '稀有', 元素属性: '火', 消耗MP: 30, 冷却回合: 4, 基础威力: 48, 描述: '全体火焰魔法', 效果公式: 'magic_damage', 目标类型: 'all_enemies', 数值参数: { 命中率: 0.85 } },
        { name: '魔力吸取', 类型: '主动', 稀有度: '稀有', 元素属性: '暗', 消耗MP: 22, 冷却回合: 3, 基础威力: 52, 描述: '吸取魔力', 效果公式: 'drain_magic', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.9 } },
        { name: '灼热光环', 类型: '主动', 稀有度: '稀有', 元素属性: '火', 消耗MP: 20, 冷却回合: 4, 基础威力: 0, 描述: '降低敌方特防并造成灼烧', 效果公式: 'debuff', 目标类型: 'single_enemy', 数值参数: { 特防加成: 2, 持续回合: 3, 灼烧概率: 0.55, 灼烧回合: 3, 灼烧伤害: 0.06 } },
        { name: '火焰护盾', 类型: '主动', 稀有度: '稀有', 元素属性: '火', 消耗MP: 24, 冷却回合: 4, 基础威力: 0, 描述: '给敌方强攻手加护盾', 效果公式: 'buff', 目标类型: 'ally', 数值参数: { 护盾值: 45 } },
        { name: '业火', 类型: '主动', 稀有度: '史诗', 元素属性: '火', 消耗MP: 40, 冷却回合: 5, 基础威力: 115, 描述: '超高威力火系魔法', 效果公式: 'magic_damage', 目标类型: 'single_enemy', 数值参数: { 命中率: 0.8, 暴击率加成: 0.1 } },
      ],
      passives: [],
    },
  ];

  const mockItems: BattleItem[] = [
    { name: '火之精华', category: '属性增强药', element: '火', count: 2 },
    { name: '技能增强药水', category: '技能增强药', count: 1 },
    { name: '初级伤药', category: '伤药', healLevel: '初级', count: 3 },
    { name: '中级伤药', category: '伤药', healLevel: '中级', count: 1 },
  ];

  const mockBalls: CaptureBallItem[] = [
    { type: '普通球', count: 5 },
    { type: '高级球', count: 2 },
    { type: '超级球', count: 1 },
  ];

  console.info('[战斗系统] 调试模式：启动模拟战斗');
  createBattleIframe(mockAlly, mockEnemy, '普通', mockItems, mockBalls, { 类型: '理智型' });
}

$(() => {
  errorCatched(async () => {
    await waitGlobalInitialized('Mvu');
    console.info('[战斗系统] 脚本已加载');

    const $floatBtn = createScriptIdDiv()
      .css({ position: 'fixed', bottom: '20px', right: '20px', zIndex: '9999' })
      .html(`
        <div style="display:flex;gap:6px;align-items:center;position:relative;">
          <button style="padding:8px 16px;background:linear-gradient(135deg,#8b1a1a,#c0392b);color:#f5e6c8;border:1px solid #d4a44c;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.5);transition:all 0.15s ease;" id="zj-start">⚔ 战斗</button>
          <button style="padding:8px 10px;background:rgba(40,50,70,0.9);color:#94a8b8;border:1px solid rgba(200,180,140,0.2);border-radius:6px;cursor:pointer;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.5);transition:all 0.15s ease;" id="zj-debug">🔧</button>
        </div>
      `)
      .appendTo('body');

    function showPrepPanel() {
      if ($floatBtn.find('.zj-prep-panel').length) {
        $floatBtn.find('.zj-prep-panel').remove();
        return;
      }
      const messageId = findLatestBattleMessageId();
      let allyNames: string[] = [];
      let enemyNames: string[] = [];
      let battleType = '普通';
      if (messageId >= 0) {
        const vars = Mvu.getMvuData({ type: 'message', message_id: messageId });
        const bc = _.get(vars, 'stat_data.战斗控制台');
        if (bc) {
          allyNames = buildTeamNames(bc, 'ally');
          enemyNames = buildTeamNames(bc, 'enemy');
          battleType = bc.战斗类型 ?? '普通';
        }
      }
      const allyText = allyNames.length ? allyNames.join(' / ') : '（未检测到）';
      const enemyText = enemyNames.length ? enemyNames.join(' / ') : '（未检测到）';
      const $panel = $(`
        <div style="position:absolute;bottom:calc(100% + 8px);right:0;min-width:220px;padding:12px;background:rgba(10,20,40,0.97);border:1px solid rgba(212,164,76,0.4);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.6);display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;gap:8px;font-size:12px;color:#c8d8e8;"><span style="color:#d4a44c;font-weight:600;min-width:32px;flex-shrink:0;">类型</span><span>${battleType}</span></div>
          <div style="display:flex;gap:8px;font-size:12px;color:#c8d8e8;"><span style="color:#d4a44c;font-weight:600;min-width:32px;flex-shrink:0;">己方</span><span>${allyText}</span></div>
          <div style="display:flex;gap:8px;font-size:12px;color:#c8d8e8;"><span style="color:#d4a44c;font-weight:600;min-width:32px;flex-shrink:0;">敌方</span><span>${enemyText}</span></div>
          <button style="margin-top:4px;padding:7px 0;background:linear-gradient(135deg,#8b1a1a,#c0392b);color:#f5e6c8;border:1px solid #d4a44c;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.15s ease;" id="zj-prep-go">开始战斗</button>
        </div>
      `).appendTo($floatBtn);
      $panel.find('#zj-prep-go').on('click', () => {
        $panel.remove();
        if (messageId >= 0) startBattle(messageId);
      });
    }

    $floatBtn.find('#zj-start').on('click', () => {
      if ($iframe) { showBattleUI(); return; }
      showPrepPanel();
    });

    $floatBtn.find('#zj-debug').on('click', () => debugStartBattle());

    eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (variables: any) => {
      const bc = _.get(variables, 'stat_data.战斗控制台');
      if (!bc) return;
      if (bc.进行中 && !$iframe) {
        const messageId = findLatestBattleMessageId();
        if (messageId >= 0 && !$iframe) startBattle(messageId);
      }
    });

    const latestBattleMessageId = findLatestBattleMessageId();
    if (latestBattleMessageId >= 0 && !$iframe) {
      console.info('[战斗系统] 检测到战斗进行中，主动启动');
      startBattle(latestBattleMessageId);
    }

    const onBattleCloseMessage = (e: MessageEvent) => {
      if (e.data?.type === 'battle-close' && e.data?.source === 'th-battle-ui') {
        destroyBattle();
      }
    };

    window.parent.addEventListener('message', onBattleCloseMessage);

    $(window).on('pagehide', () => {
      window.parent.removeEventListener('message', onBattleCloseMessage);
      $floatBtn.remove();
      destroyBattle();
    });
  })();
});
