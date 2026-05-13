// ====================================================================
// 战姬任务系统 - 自动发放日常/周常任务 + 奖励结算
// 目标：减少AI token消耗，任务不由AI生成，而由脚本管理
// ====================================================================

// 日常任务模板池 (~20个)
const DAILY_QUEST_POOL = [
  { name:'实战训练', req:'在虚拟训练平台进行1次战斗', 金币:[80,150], 道具:[{n:'小型经验糖果',q:1}], 标签:['战斗'], icon:'⚔️', filter:(d:any) => hasBattleChar(d) },
  { name:'基础训练', req:'与任意战姬投影体进行1场战斗', 金币:[80,120], 道具:[{n:'初级伤药',q:1}], 标签:['战斗'], icon:'⚔️', filter:(d:any) => hasBattleChar(d) },
  { name:'连胜挑战', req:'在战斗中取得1次胜利', 金币:[100,150], 道具:[{n:'小型经验糖果',q:1}], 标签:['战斗'], icon:'🏆', filter:(d:any) => hasBattleChar(d) },
  { name:'城市巡游', req:'前往2个不同地点', 金币:[50,100], 道具:[{n:'初级伤药',q:1}], 标签:['探索'], icon:'🗺️', filter:() => true },
  { name:'信息收集', req:'前往人员密集场所探查情报', 金币:[50,100], 道具:[{n:'小型经验糖果',q:1}], 标签:['探索'], icon:'🔍', filter:() => true },
  { name:'社交拜访', req:'与1位NPC进行对话互动', 金币:[30,80], 道具:[{n:'迷魂香',q:1}], 标签:['探索'], icon:'💬', filter:() => true },
  { name:'战姬互动', req:'与任意出战战姬进行1次H互动', 金币:[100,200], 道具:[{n:'甜蜜糖果',q:1}], 标签:['养成'], icon:'💕', filter:(d:any) => hasBattleChar(d) },
  { name:'好感培养', req:'通过互动提升任意战姬好感度至少3点', 金币:[80,120], 道具:[{n:'甜蜜糖果',q:1}], 标签:['养成'], icon:'💝', filter:(d:any) => hasBattleChar(d) },
  { name:'亲密接触', req:'与任意战姬进行亲密身体接触', 金币:[50,100], 道具:[{n:'小型经验糖果',q:1}], 标签:['养成'], icon:'🤝', filter:(d:any) => hasBattleChar(d) },
  { name:'经验积累', req:'使用经验糖果提升任意战姬经验', 金币:[50,80], 道具:[{n:'中型经验糖果',q:1}], 标签:['养成'], icon:'⭐', filter:(d:any) => hasBattleChar(d) },
  { name:'技能试炼', req:'在战斗中使用1次战姬技能', 金币:[80,120], 道具:[{n:'技能强化剂',q:1}], 标签:['战斗'], icon:'⚡', filter:(d:any) => hasBattleChar(d) },
  { name:'道具使用', req:'使用1个任意道具', 金币:[30,60], 道具:[{n:'初级伤药',q:1}], 标签:['探索'], icon:'🧪', filter:() => true },
  { name:'装备整理', req:'检查并调整1位战姬的着装', 金币:[30,60], 道具:[{n:'迷魂香',q:1}], 标签:['养成'], icon:'👗', filter:(d:any) => hasBattleChar(d) },
  { name:'切磋交流', req:'与1位其他训练家进行战斗', 金币:[100,150], 道具:[{n:'普通捕捉球',q:1}], 标签:['战斗'], icon:'🤺', filter:(d:any) => hasBattleChar(d) },
  { name:'野外探索', req:'前往野外区域进行探索', 金币:[50,100], 道具:[{n:'小型经验糖果',q:1}], 标签:['探索'], icon:'🌲', filter:() => true },
  { name:'据点打理', req:'维护据点设施（检查收藏室或工作区）', 金币:[50,100], 道具:[{n:'小型经验糖果',q:1}], 标签:['探索'], icon:'🏰', filter:(d:any) => isBaseUnlocked(d) },
  { name:'情报收集', req:'打探当地奇怪事情的情报', 金币:[30,60], 道具:[{n:'初级伤药',q:1}], 标签:['探索'], icon:'📋', filter:() => true },
  { name:'日常巡逻', req:'在当前区域巡逻一次', 金币:[50,80], 道具:[{n:'初级伤药',q:1}], 标签:['探索'], icon:'🚶', filter:() => true },
];

// 周常任务模板池 (~15个)
const WEEKLY_QUEST_POOL = [
  { name:'连战连胜', req:'本周内取得3场战斗胜利', 金币:[300,500], 道具:[{n:'高级伤药',q:1},{n:'中型经验糖果',q:2}], 标签:['战斗'], icon:'⚔️', filter:(d:any) => hasBattleChar(d) },
  { name:'精英讨伐', req:'击败1名拥有C级以上战姬的训练家', 金币:[400,600], 道具:[{n:'大型经验糖果',q:1}], 标签:['战斗'], icon:'💀', filter:(d:any) => hasBattleChar(d) && getMaxLevel(d) >= 8 },
  { name:'战姬捕获', req:'使用捕捉球成功捕获1只野生战姬', 金币:[300,500], 道具:[{n:'高级捕捉球',q:2}], 标签:['捕获'], icon:'🎯', filter:(d:any) => hasAnyBall(d) },
  { name:'稀有猎手', req:'捕获1只C级或以上品质的战姬', 金币:[500,800], 道具:[{n:'超级捕捉球',q:1}], 标签:['捕获'], icon:'💎', filter:(d:any) => hasAnyBall(d) && getMaxLevel(d) >= 10 },
  { name:'战姬培养', req:'让任意战姬升3级', 金币:[300,500], 道具:[{n:'大型经验糖果',q:2}], 标签:['养成'], icon:'📈', filter:(d:any) => hasBattleChar(d) },
  { name:'好感突破', req:'将任意战姬好感度提升至80以上', 金币:[400,600], 道具:[{n:'挚爱糖果',q:1}], 标签:['养成'], icon:'💕', filter:(d:any) => hasBattleChar(d) },
  { name:'技能掌握', req:'让任意战姬学会1个新技能', 金币:[500,700], 道具:[{n:'稀有技能学习机',q:1}], 标签:['养成'], icon:'📚', filter:(d:any) => hasBattleChar(d) },
  { name:'据点建设', req:'升级1次据点设施（收藏室或工作区）', 金币:[400,600], 道具:[{n:'高级融合催化剂',q:1}], 标签:['养成'], icon:'🏗️', filter:(d:any) => isBaseUnlocked(d) },
  { name:'融合实验', req:'尝试进行1次战姬融合', 金币:[500,700], 道具:[{n:'高级融合保护剂',q:1}], 标签:['融合'], icon:'🔮', filter:(d:any) => hasMultipleChars(d) },
  { name:'秘境探索', req:'探索1处秘境', 金币:[500,800], 道具:[{n:'高级相性提升剂',q:1}], 标签:['秘境'], icon:'🌌', filter:(d:any) => getMaxLevel(d) >= 8 },
  { name:'打工赚钱', req:'让战姬在工作区服役', 金币:[200,400], 道具:[{n:'中级经验糖果',q:3}], 标签:['养成'], icon:'💰', filter:(d:any) => isWorkAreaUnlocked(d) },
  { name:'社交达人', req:'与3位不同NPC建立良好关系', 金币:[300,500], 道具:[{n:'甜蜜糖果',q:3}], 标签:['探索'], icon:'🤝', filter:() => true },
  { name:'收藏扩充', req:'增加收藏室中的战姬', 金币:[300,500], 道具:[{n:'大型经验糖果',q:1}], 标签:['养成'], icon:'📦', filter:(d:any) => isBaseUnlocked(d) && hasBattleChar(d) },
  { name:'竞技挑战', req:'参加1场正式的训练家对战', 金币:[400,600], 道具:[{n:'技能强化剂',q:2}], 标签:['战斗'], icon:'🏟️', filter:(d:any) => hasBattleChar(d) && getMaxLevel(d) >= 5 },
  { name:'探险远征', req:'前往1个新的城镇或特殊地点', 金币:[300,500], 道具:[{n:'高级捕捉球',q:1}], 标签:['探索'], icon:'🧭', filter:() => true },
];

// ====================================================================
// 辅助函数
// ====================================================================

function hasBattleChar(data: any): boolean {
  const chars = data.角色数据 || {};
  return Object.values(chars).some((c:any) => c.归属状态 === '出战');
}

function hasMultipleChars(data: any): boolean {
  const chars = data.角色数据 || {};
  const battleChars = Object.values(chars).filter((c:any) => c.归属状态 === '出战');
  return battleChars.length >= 2;
}

function hasAnyBall(data: any): boolean {
  const bp = data.背包 || {};
  const balls = ['普通捕捉球','高级捕捉球','超级捕捉球','魅惑之球'];
  return balls.some(b => _.get(bp, `${b}.数量`, 0) > 0);
}

function getMaxLevel(data: any): number {
  const chars = data.角色数据 || {};
  let maxLv = 0;
  Object.values(chars).forEach((c:any) => {
    if (c.归属状态 === '出战' && c.等级 > maxLv) maxLv = c.等级;
  });
  return maxLv;
}

function isBaseUnlocked(data: any): boolean {
  return _.get(data, '训练家.据点.已解锁', false);
}

function isWorkAreaUnlocked(data: any): boolean {
  return _.get(data, '训练家.据点.工作区.已解锁', false);
}

function randomPick<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

// ====================================================================
// 任务生成
// ====================================================================

function generateQuests(pool: any[], count: number, data: any, existingIds: string[]): any[] {
  const applicable = pool.filter(q => {
    if (q.filter && !q.filter(data)) return false;
    // 避免与已有任务重名
    return !existingIds.includes(q.name);
  });
  // 如果符合条件的不足，放宽限制
  const candidates = applicable.length >= count ? applicable : pool.filter(q => !existingIds.includes(q.name));
  if (candidates.length === 0) return [];
  if (candidates.length < count) {
    // 允许重复选
    const result: any[] = [];
    for (let i = 0; i < count; i++) {
      result.push(candidates[Math.floor(Math.random() * candidates.length)]);
    }
    return result;
  }
  return randomPick(candidates, count);
}

function buildTaskObject(template: any, id: string, type: string, dateStr: string): any {
  const goldReward = randomInRange(template.金币[0], template.金币[1]);
  const itemStrs = template.道具.map((item:any) => `${item.n}×${item.q}`);
  const rewardStr = `🪙金币×${goldReward}` + (itemStrs.length > 0 ? `, ${itemStrs.join(', ')}` : '');
  const deadline = type === '日常任务' ? `当天` : '本周日';

  return {
    名称: template.name,
    要求: template.req,
    奖励: rewardStr,
    类型: type,
    期限: deadline,
    已完成: false,
    已过期: false,
    进度: '0/1',
    标签: template.标签 || [],
    图标: template.icon || '📋',
    发布者: '任务公会',
    背景色: '',
  };
}

// ====================================================================
// 主逻辑
// ====================================================================

$(() => {
  errorCatched(async () => {
    await waitGlobalInitialized('Mvu');
    console.info('[任务系统] 脚本已加载');

    let lastProcessedDate = '';
    let lastProcessedWeek = '';

    eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (newVars: any, oldVars: any) => {
      const newData = _.get(newVars, 'stat_data', {});
      const rewardMap = newData._任务奖励映射 || {};

      // ====== 检测日期变化 → 刷新任务 ======
      const currentDate = _.get(newData, '世界.日期', '');
      const currentWeek = _.get(newData, '世界.星期', '');

      if (currentDate && currentDate !== lastProcessedDate) {
        lastProcessedDate = currentDate;
        console.info(`[任务系统] 📅 日期变更: ${currentDate}，刷新日常任务`);

        // 移除旧日常任务
        const existingTaskIds = Object.keys(newData.任务列表 || {});
        for (const taskId of existingTaskIds) {
          const task = newData.任务列表[taskId];
          if (task && task.类型 === '日常任务' && !task.已完成) {
            delete newData.任务列表[taskId];
          }
        }
        // 清理相关奖励映射
        for (const taskId of Object.keys(rewardMap)) {
          if (rewardMap[taskId]?._type === '日常任务') delete rewardMap[taskId];
        }

        // 生成新日常任务
        const currentQuests = Object.values(newData.任务列表 || {}).map((t:any) => t.名称);
        const selected = generateQuests(DAILY_QUEST_POOL, 3, newData, currentQuests);
        selected.forEach((tmpl, i) => {
          const taskId = `日常_${currentDate}_${i+1}`;
          const task = buildTaskObject(tmpl, taskId, '日常任务', currentDate);
          _.set(newData, `任务列表.${taskId}`, task);
          // 记录奖励映射
          rewardMap[taskId] = {
            _type: '日常任务',
            金币: randomInRange(tmpl.金币[0], tmpl.金币[1]),
            道具: tmpl.道具.map((item:any) => ({ 名称: item.n, 数量: item.q })),
            经验值: randomInRange(200, 600),
          };
        });
        console.info(`[任务系统] 已刷新 ${selected.length} 个日常任务`);
      }

      // ====== 补缺：当天无日常任务时自动生成 ======
      if (currentDate && currentDate === lastProcessedDate) {
        const hasDailyToday = Object.keys(newData.任务列表 || {}).some(id => id.startsWith(`日常_${currentDate}_`));
        if (!hasDailyToday) {
          const currentQuests = Object.values(newData.任务列表 || {}).map((t:any) => t.名称);
          const selected = generateQuests(DAILY_QUEST_POOL, 3, newData, currentQuests);
          selected.forEach((tmpl, i) => {
            const taskId = `日常_${currentDate}_${i+1}`;
            const task = buildTaskObject(tmpl, taskId, '日常任务', currentDate);
            _.set(newData, `任务列表.${taskId}`, task);
            rewardMap[taskId] = {
              _type: '日常任务',
              金币: randomInRange(tmpl.金币[0], tmpl.金币[1]),
              道具: tmpl.道具.map((item:any) => ({ 名称: item.n, 数量: item.q })),
              经验值: randomInRange(200, 600),
            };
          });
          console.info(`[任务系统] 补充生成 ${selected.length} 个日常任务`);
        }
      }

      // ====== 周一刷新周常 ======
      if (currentWeek === '周一' && currentWeek !== lastProcessedWeek) {
        lastProcessedWeek = currentWeek;
        console.info(`[任务系统] 📆 周一检测，刷新周常任务`);

        // 移除旧周常任务
        const existingTaskIds = Object.keys(newData.任务列表 || {});
        for (const taskId of existingTaskIds) {
          const task = newData.任务列表[taskId];
          if (task && task.类型 === '周常任务' && !task.已完成) {
            delete newData.任务列表[taskId];
          }
        }
        // 清理相关奖励映射
        for (const taskId of Object.keys(rewardMap)) {
          if (rewardMap[taskId]?._type === '周常任务') delete rewardMap[taskId];
        }

        // 生成新周常任务
        const currentQuests = Object.values(newData.任务列表 || {}).map((t:any) => t.名称);
        const selected = generateQuests(WEEKLY_QUEST_POOL, 3, newData, currentQuests);
        selected.forEach((tmpl, i) => {
          const taskId = `周常_${currentDate}_${i+1}`;
          const task = buildTaskObject(tmpl, taskId, '周常任务', currentDate);
          _.set(newData, `任务列表.${taskId}`, task);
          rewardMap[taskId] = {
            _type: '周常任务',
            金币: randomInRange(tmpl.金币[0], tmpl.金币[1]),
            道具: tmpl.道具.map((item:any) => ({ 名称: item.n, 数量: item.q })),
            经验值: randomInRange(200, 600),
          };
        });
        console.info(`[任务系统] 已刷新 ${selected.length} 个周常任务`);
      }

      // 回写奖励映射
      _.set(newVars, 'stat_data._任务奖励映射', rewardMap);
      _.set(newData, '世界._任务上次刷新日期', currentDate);
    });

    // 记录初始状态
    const initVars = Mvu.getMvuData({ type: 'message', message_id: -1 });
    const initData = _.get(initVars, 'stat_data', {});
    const existingTasks = _.get(initData, '任务列表', {});
    const hasActiveTasks = Object.values(existingTasks).some((t:any) => !t.已完成 && !t.已过期);

    if (hasActiveTasks) {
      // 已有任务，从变量中读取上次刷新日期避免重复刷新
      lastProcessedDate = _.get(initData, '世界._任务上次刷新日期', '') || _.get(initData, '世界.日期', '');
    }
    // 如果无任务，lastProcessedDate 保持空字符串，下次VARIABLE_UPDATE_ENDED会自动触发刷新
    lastProcessedWeek = _.get(initData, '世界.星期', '') || '';
    console.info(`[任务系统] 初始化完成，日期: ${lastProcessedDate || '(待刷新)'} ${lastProcessedWeek}, 活跃任务: ${hasActiveTasks}`);
  });
});
