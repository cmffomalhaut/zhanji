# 战姬系统 — 项目概览

> 给后续 AI 的快速上手文档。简单问题看这里，复杂问题再去读源码。

---

## 项目定位

宝可梦风格的 **3v3 战斗系统**，运行在 SillyTavern 酒馆助手前端脚本环境中。  
玩家扮演训练家，捕捉/培养"战姬"（女性角色），进行战斗、任务、日常管理。

---

## 目录结构

```
zhanji/
├── 战姬/
│   ├── index.yaml                  # 角色卡配置（酒馆助手入口）
│   ├── schema.json / schema.ts     # MVU变量Schema
│   ├── 核心设定.yml                # 系统规则（给AI看的）
│   ├── 第一条消息/0.txt            # 初始消息
│   ├── 世界书/                     # 世界书条目（触发关键词注入）
│   │   ├── 变量/                   # 变量定义、更新规则、输出格式
│   │   └── *.json / *.txt          # 捕捉系统、道具、任务等条目
│   ├── 界面/状态栏/                # 状态栏UI（zhanji.yaml）
│   └── 脚本/
│       ├── MVU/index.ts            # MVU助手脚本（变量读写桥接）
│       ├── 任务系统/index.ts       # 日常/周常任务结算
│       ├── 变量结构/变量结构.yaml  # 完整数据Schema
│       └── 战斗系统/               # ← 核心战斗前端
└── 酒馆助手脚本-*.json             # 打包好的助手脚本（多版本）
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | Vue 3 + TypeScript |
| 状态管理 | Pinia |
| 样式 | CSS（global.css） |
| 数据定义 | YAML / JSON Schema |
| 运行环境 | 酒馆助手脚本系统（MVU框架） |

---

## 核心模块速查

### 战斗系统 `脚本/战斗系统/`

| 文件 | 行数 | 职责 |
|------|------|------|
| `types.ts` | ~380 | 所有 TypeScript 类型定义 |
| `engine.ts` | ~1730 | 战斗逻辑核心（伤害/状态/AI） |
| `store.ts` | ~315 | Pinia 状态 + UI 阶段管理 |
| `App.vue` | — | 主容器，协调所有子组件 |
| `anim.ts` | — | 动画系统 |
| `useBattleCommand.ts` | — | 玩家指令构建 |
| `components/` | ~500 | BattleArena / SkillPanel / TurnOrderBar / BattleResultModal / ItemSelect |

### 数据系统 `战姬/世界书/变量/`

| 文件 | 职责 |
|------|------|
| `变量结构.yaml` | 完整数据Schema（角色/训练家/任务/性器状态） |
| `变量更新规则.yaml` | AI更新变量的规则 |
| `变量输出格式.yaml` | 变量如何输出给AI |
| `战后裁决.yml` | 战斗结束后的变量结算规则 |
| `角色更新规则.yml` | 角色属性更新规则 |

---

## 战斗流程

```
item_select（选道具）
    ↓
selecting（玩家选技能/换人/逃跑）
    ↓
animating（引擎结算回合）
    ├─ 速度排序 → 依次执行
    ├─ executeSkill() → 命中 → 伤害 → 状态效果 → 被动触发
    ├─ processStatusEndTurn() → 状态效果结算
    ├─ planEnemyAction() → 敌方AI决策
    └─ 检查胜负/捕捉条件
    ↓
forced_switch（当前战姬倒下，强制换人）或 result（战斗结束）
```

---

## 伤害计算（简版）

```
基础伤害 = (ATK × 系数 + 威力) × 防御减免 × 全局缩放
最终伤害 = 基础伤害 × 克制倍率 × STAB × 暴击 × 随机 × 伤害加成
单次伤害上限 = 敌方HP × 12~38%（防秒杀硬封顶）
```

**元素克制链**：火→风→地→水→火，光↔暗互克，无属性无克制  
**克制倍率**：超克制 1.5x，同属性 0.5x，不克制 0.67x

---

## 关键函数（engine.ts）

| 函数 | 作用 |
|------|------|
| `executeRound(command)` | 执行一个完整回合 |
| `executeSkill(attacker, defender, skill)` | 执行单次技能 |
| `calcDamage()` | 伤害计算 |
| `tryApplyStatus()` | 应用状态效果 |
| `checkPassives()` | 被动技能触发检查 |
| `planEnemyAction()` | 敌方AI决策 |
| `rollCapture()` | 捕捉骰点 |
| `tryEscape()` | 逃跑判定 |

---

## 关键状态（store.ts）

| 变量 | 类型 | 说明 |
|------|------|------|
| `phase` | BattlePhase | 当前战斗阶段 |
| `ally / enemy` | BattleUnit | 当前出战单位 |
| `allyTeam / enemyTeam` | BattleUnit[] | 完整队伍 |
| `round` | number | 当前回合数 |
| `log` | string[] | 战斗日志 |
| `finalResult` | BattleResult | 战斗最终结果 |
| `canCapture` | boolean | 是否可投捕捉球 |

---

## 角色数据结构（变量结构.yaml）

每个战姬包含：
- 基础属性：等级、品质（C/B/A/S）、资质、性格、战斗类型、元素属性
- 战斗属性：HP/MP/ATK/DEF/SPD/MATK/MDEF（由 `calculateStats()` 计算）
- 社交属性：好感度、堕落值
- 技能列表：主动技能 + 被动技能
- 性器状态：各部位开发度/敏感度（详见 `变量结构.yaml`）

**属性计算**：品质 × 资质 × 性格 × 战斗类型 × 变化形态 → 最终属性

---

## 敌方AI系统

训练家类型 → 映射 AI 人格（激进/均衡/保守）  
人格决定：技能权重、换人阈值、逃跑倾向

---

## 捕捉系统

- 触发条件：敌方 HP ≤ 20%
- 捕捉率 = 基础率 × 球类倍率 × 技能加成 × 状态加成 × 抗性减免
- S 级品质硬锁：仅骰出 1 才成功

---

## 修改难度参考

| 任务 | 难度 | 主要涉及文件 |
|------|------|-------------|
| 调整数值（伤害系数、命中率） | 低 | `engine.ts` 顶部常量 |
| 新增技能/状态效果 | 中 | `types.ts` + `engine.ts` |
| 新增UI组件 | 中 | `components/` + `App.vue` |
| 修改战斗流程逻辑 | 高 | `engine.ts`（耦合度高） |
| 新增系统（天气/双打等） | 很高 | 全栈改动 |

> `engine.ts` 1730 行，逻辑高度耦合，改动前务必确认影响范围。

---

## 多版本说明

根目录有多个 `酒馆助手脚本-*.json`，是不同时期打包的版本。  
当前开发版本在 `战姬/脚本/` 目录下的源码。
