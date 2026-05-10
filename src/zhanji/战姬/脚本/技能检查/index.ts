// ====================================================================
// 战姬技能兼容性检查器 - 检查MVU角色数据中技能是否能在战斗引擎中使用
// ====================================================================

const VALID_FORMULAS = [
  'physical_damage', 'magic_damage', 'heal', 'buff', 'debuff',
  'drain_physical', 'drain_magic',
];
const VALID_ELEMENTS = ['地', '火', '水', '风', '光', '暗', '无'];
const VALID_TARGET_TYPES = ['single_enemy', 'self', 'ally', 'all_enemies', 'all_allies'];
const VALID_SKILL_TYPES = ['主动', '被动', '光环', '天赋'];
const TARGET_TYPE_CN_MAP: Record<string, string> = {
  敌方单体: 'single_enemy', 单体敌方: 'single_enemy', enemy: 'single_enemy',
  自身: 'self', 自己: 'self',
  友方单体: 'ally', 单体友方: 'ally',
  敌方全体: 'all_enemies',
  友方全体: 'all_allies',
};

const RARITY_MP_COST: Record<string, number> = {
  普通: 5, 稀有: 12, 史诗: 20, 传说: 32, 神话: 45,
};

interface SkillIssue {
  charName: string;
  skillName: string;
  field: string;
  value: string;
  severity: 'error' | 'warning';
  suggestion: string;
}

/** 推断效果公式 */
function inferFormula(skill: Record<string, any>): string | null {
  const f = (skill.效果公式 ?? '').toString().toLowerCase();
  if (VALID_FORMULAS.includes(f)) return f;
  const p = skill.数值参数 ?? {};
  if (p.治疗量 || p.治疗比例) return 'heal';
  const buffKeys = ['攻击加成', '防御加成', '特攻加成', '特防加成', '速度加成', '命中加成', '闪避加成'];
  if (buffKeys.some(k => (p[k] ?? 0) > 0)) return 'buff';
  if (buffKeys.some(k => (p[k] ?? 0) < 0)) return 'debuff';
  if (p.吸血比例) return (p.伤害类型 === 1) ? 'drain_magic' : 'drain_physical';
  if (skill.基础威力 > 0) return (p.伤害类型 === 1) ? 'magic_damage' : 'physical_damage';
  return null;
}

function normalizeTargetType(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (VALID_TARGET_TYPES.includes(normalized)) return normalized;
  if (TARGET_TYPE_CN_MAP[raw]) return TARGET_TYPE_CN_MAP[raw];
  if (TARGET_TYPE_CN_MAP[normalized]) return TARGET_TYPE_CN_MAP[normalized];
  return null;
}

function inferTargetType(formula: string | null): string {
  if (formula === 'heal' || formula === 'buff') return 'self';
  return 'single_enemy';
}

/** 检查单个技能 */
function checkSkill(charName: string, skillName: string, skill: any): SkillIssue[] {
  const issues: SkillIssue[] = [];
  const addIssue = (field: string, value: string, severity: 'error' | 'warning', suggestion: string) => {
    issues.push({ charName, skillName, field, value, severity, suggestion });
  };

  if (!skill || typeof skill !== 'object') {
    addIssue('整体', '非对象', 'error', '技能数据格式错误，需要是对象');
    return issues;
  }

  const type = skill.类型;
  if (!type || !VALID_SKILL_TYPES.includes(type)) {
    addIssue('类型', String(type || '(空)'), 'error', `必须为: ${VALID_SKILL_TYPES.join('/')}`);
  }

  if (!skill.稀有度) {
    addIssue('稀有度', '(空)', 'warning', '建议填写: 普通/稀有/史诗/传说/神话');
  } else if (type === '主动' && !RARITY_MP_COST[skill.稀有度]) {
    addIssue('稀有度', skill.稀有度, 'warning', '非标准稀有度，MP消耗将默认为0');
  }

  if (!skill.元素属性 || !VALID_ELEMENTS.includes(skill.元素属性)) {
    addIssue('元素属性', String(skill.元素属性 || '(空)'), 'warning', `建议为: ${VALID_ELEMENTS.join('/')}`);
  }

  // 被动/天赋/光环只做基本检查
  if (type === '被动' || type === '天赋' || type === '光环') {
    if (!skill.描述 || String(skill.描述).trim() === '') {
      addIssue('描述', '(空)', 'warning', '建议填写技能描述');
    }
    if (skill.数值参数 && typeof skill.数值参数 !== 'object') {
      addIssue('数值参数', typeof skill.数值参数, 'error', '数值参数必须是对象格式');
    }
    return issues;
  }

  // ========= 主动技能检查 =========

  // 效果公式
  const formula = inferFormula(skill);
  if (!formula) {
    addIssue('效果公式', String(skill.效果公式 || '(空)'), 'error',
      `引擎无法识别。可用: ${VALID_FORMULAS.join('/')}，或确保数值参数中有治疗量/治疗比例/吸血比例/攻击加成等`);
  }

  // 目标类型
  const rawTarget = skill.目标类型;
  const resolvedTarget = rawTarget ? normalizeTargetType(rawTarget) : null;
  if (rawTarget && !resolvedTarget) {
    addIssue('目标类型', String(rawTarget), 'error',
      `引擎无法识别。可用: ${VALID_TARGET_TYPES.join('/')} 或中文: ${Object.keys(TARGET_TYPE_CN_MAP).join('/')}`);
  }
  if (!rawTarget && formula) {
    const inferred = inferTargetType(formula);
    addIssue('目标类型', '(空→自动推断)', 'warning', `将自动推断为: ${inferred}，建议显式填写`);
  }

  // 数值参数
  if (skill.数值参数) {
    if (typeof skill.数值参数 !== 'object' || Array.isArray(skill.数值参数)) {
      addIssue('数值参数', typeof skill.数值参数, 'error', '数值参数必须是一个键值对对象');
    } else {
      for (const [key, val] of Object.entries(skill.数值参数 as Record<string, unknown>)) {
        if (typeof val !== 'number') {
          addIssue(`数值参数.${key}`, String(val), 'warning', '建议为数字类型');
        }
      }
    }
  }

  // MP消耗
  if (typeof skill.消耗MP !== 'number' || isNaN(skill.消耗MP)) {
    addIssue('消耗MP', String(skill.消耗MP ?? '(空)'), 'warning', '将固定按稀有度消耗MP（普通5/稀有12/史诗20/传说32/神话45）');
  }

  // 冷却
  if (!skill.冷却回合 && skill.冷却回合 !== 0) {
    addIssue('冷却回合', '(空)', 'warning', '将默认为0（无冷却）');
  }

  // 基础威力
  if (!skill.基础威力 && skill.基础威力 !== 0 && formula && formula !== 'heal' && formula !== 'buff' && formula !== 'debuff') {
    addIssue('基础威力', '(空)', 'warning', '伤害技能建议填写基础威力');
  }

  // MP是否够用
  if (type === '主动' && skill.稀有度 && RARITY_MP_COST[skill.稀有度]) {
    const mpCost = RARITY_MP_COST[skill.稀有度];
    addIssue('MP消耗', `${mpCost} (按${skill.稀有度}稀有度)`, 'warning', '');
  }

  return issues;
}

/** 主检查函数 */
function checkAllSkills() {
  const variables = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
  const statData = _.get(variables, 'stat_data', {});
  const chars = _.get(statData, '角色数据', {}) as Record<string, any>;

  if (!chars || Object.keys(chars).length === 0) {
    toastr.warning('没有找到任何战姬数据');
    return;
  }

  const allIssues: SkillIssue[] = [];
  let totalSkillsChecked = 0;

  for (const [charName, charData] of Object.entries(chars)) {
    if (!charData || typeof charData !== 'object') continue;
    const skills = charData.技能 ?? {};
    if (typeof skills !== 'object') continue;

    for (const [skillName, skillData] of Object.entries(skills as Record<string, any>)) {
      if (!skillData) continue;
      totalSkillsChecked++;
      const issues = checkSkill(charName, skillName, skillData);
      allIssues.push(...issues);
    }
  }

  const errors = allIssues.filter(i => i.severity === 'error');
  const warnings = allIssues.filter(i => i.severity === 'warning');

  // 控制台详细报告
  console.group('🔍 战姬技能兼容性检查');
  console.info(`检查了 ${totalSkillsChecked} 个技能`);
  console.info(`❌ 错误: ${errors.length} 个`);
  console.info(`⚠️  警告: ${warnings.length} 个`);

  if (allIssues.length > 0) {
    console.group('问题详情');
    allIssues.forEach(i => {
      const icon = i.severity === 'error' ? '❌' : '⚠️';
      console.log(`${icon} [${i.charName}] ${i.skillName} — ${i.field}: ${i.value} → ${i.suggestion}`);
    });
    console.groupEnd();
  } else {
    console.info('✅ 所有技能格式正常');
  }
  console.groupEnd();

  // toastr 总结
  if (errors.length > 0) {
    toastr.error(`技能检查: ${errors.length} 个错误, ${warnings.length} 个警告。详情见控制台`);
  } else if (warnings.length > 0) {
    toastr.warning(`技能检查: ${warnings.length} 个警告。详情见控制台`);
  } else {
    toastr.success(`技能检查: ${totalSkillsChecked} 个技能，全部通过 ✅`);
  }
}

$(() => {
  errorCatched(async () => {
    await waitGlobalInitialized('Mvu');
    console.info('[技能检查] 脚本已加载');

    appendInexistentScriptButtons([{ name: '检查战姬技能', visible: true }]);
    eventOn(getButtonEvent('检查战姬技能'), () => {
      checkAllSkills();
    });
  })();
});
