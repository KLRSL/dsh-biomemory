# dsh-biomemory · 生物仿生记忆系统

> [中文文档](README.zh-CN.md) · [English](README.md)

给 DeepSeek Harness (DSH) 的跨会话记忆插件：像人脑一样分层记、分级审、会代谢、透明可改。

- 纯文件 Markdown 数据层（默认 `~/.dsh/memory`，`DSH_MEMORY_ROOT` 环境变量可覆盖）——肉眼可读、手改即生效
- `memory` 工具：add / query / remove / list / pin / unpin / dream / audit
- 会话启动自动注入**冻结记忆快照**（锁定记忆与用户偏好最高优先级，其次近期知识/行为）
- **分级审批门**：重要记忆（偏好/决策/教训）走人工审批，普通事实自动写入；无审批通道时 fail closed
- 审计：人类可读 `audit.log`（旧版，兼容保留）+ 结构化 `audit.jsonl`（JSON Lines）——每次事件可追溯
- `/memory` 命令：list / query / add / remove / pin / unpin / dream / audit
- `memory_recall` 工具：跨会话召回（"你还记得…吗"场景）
- 去重：内容指纹跳过重复记忆
- **记忆代谢**（`/memory dream`）：半衰期衰减 + 引用巩固 + 冲突仲裁 + 低权重归档——执行前自动备份、损坏自动回滚
- **记忆钉**：锁定记忆不参与衰减、无条件注入快照
- **语义检索**：纯 JS TF-IDF + cosine——无原生模块、无外部依赖

## 安装

```bash
# 在 DSH profile 中作为本地 bundle 使用
dsh plugin add dsh-biomemory
# 或 pnpm 本地 link
pnpm add link:./dsh-biomemory
```

在 profile 的 `dsh.profile.bundles` 中加入 `dsh-biomemory`。

## 记忆结构

```
~/.dsh/memory/
├── preferences.md      # 用户/项目偏好（最高优先级，冻结注入）
├── hot/
│   ├── knowledge.md    # L1 近期知识（事实/决策）
│   └── behavior.md     # L1 近期行为（教训/习惯/工作流）
├── projects/<项目>/    # L2 项目档案
├── longterm/           # L3 长期记忆体
├── archive/            # 代谢归档的记忆（权重衰减至阈值以下，不删除）
├── backups/            # dream 执行前自动备份（回滚来源）
├── audit.log           # 人类可读审计（旧版，兼容保留）
└── audit.jsonl         # 结构化审计（JSON Lines，v0.3）
```

每条记忆一行：`- [知识|自动] [fp:xxx] [w:10] [h:3] [t:2026-08-16 13:00] [pin] 文本`

- `w` = 权重（默认 10）——衰减/巩固的基础
- `h` = 引用计数——巩固的输入
- `t` = 写入时间——衰减年龄来源
- `pin` = 锁定（不参与衰减、无条件注入）

## 记忆代谢（Dream）

`/memory dream`（或 `memory action=dream`）手动触发记忆代谢——相当于睡眠时大脑做的事：

1. **半衰期衰减**（默认 7 天）：权重每过半衰期衰减一半（`w × 0.5^(年龄/半衰期)`），下限 1。
2. **引用巩固**：单条引用 ≥ `consolidateThreshold`（默认 3）次则 +1 权重，上限 `weightCap`（默认 20）。
3. **冲突仲裁**：行为记忆与 preferences 冲突时偏好优先——该行为记忆权重减半，并记录 `CONFLICT` 审计事件。
4. **归档**：权重低于 `decayThreshold`（默认 3）的记忆移入 `archive/`——移动，不删除。

用法：

```
/memory dream            # 执行代谢
/memory dream --dry-run  # 只预览，不落盘
memory action=dream dryRun=true   # memory 工具等价写法
```

dry-run 示例输出：

```
【预览】扫描 120 条：衰减 12 · 巩固 3 · 冲突 0 · 归档 4
备份：（dry-run 不执行备份）
```

**备份与回滚**：正式执行前，整个记忆库自动复制到 `backups/<时间戳>/`（含 `audit.jsonl`）。启动自检发现主文件损坏时，自动回滚到最近一次备份。回滚会记录 `ROLLBACK` 审计事件。

## 自动召回 / 自动保存（v0.4.0）

记忆系统不再只靠显式调用，多了三层「自动」：

1. **自动保存降级**：重要记忆默认走审批；当审批不可用（审批策略为 never、服务缺失）时，按 `approvalFallback` 配置自动保存（默认 `auto`），审计标记 `[降级]`，不丢记忆。可在设置页改为 `deny` 恢复 fail-closed。
2. **自动巩固（用进废退）**：每次带关键词的查询/召回命中，该条 `hits+1` 并写回——越常被想起的记忆越不易被遗忘（审计 `RECALL`）。
3. **自动代谢/反思**：`autoDreamDays`（默认 7）与 `autoReflectDays`（默认 3）——启动时距上次执行超过周期则自动 `dream` / `reflect`，审计 `AUTO-DREAM` / `AUTO-REFLECT`，设 0 关闭。

## 深度反思（Reflect，v0.4.0）

`/memory reflect`（或 `memory action=reflect`、设置页「深度反思」tab）——纯本地、无 LLM 的周期总结：

1. **主题聚类**：全部记忆按 TF 向量余弦相似度聚类（≥0.25），找出反复出现的主题；
2. **趋势统计**：近 7 天 vs 上一周写入量对比（活跃上升 / 趋于平稳）；
3. **冲突提醒**：行为记忆与偏好的潜在冲突清单；
4. **遗忘建议**：低权重记忆候选（可人工删除或归档）。

报告写入 `longterm/reflections/<时间戳>.md`，支持 `--dry-run` 预览。

## 知识页（v0.4.0）

设置页新增「知识库」tab：全文/语义搜索、按分层筛选，展示每条记忆的权重/引用/时间/锁定状态，支持一键锁定/解锁与**安全删除**（删除前自动备份，可回滚）。配套 Web API：`GET /biomemory/api/entries`、`POST /biomemory/api/entries/pin|unpin|remove`、`POST /biomemory/api/reflect`。

## 记忆钉

锁定一条记忆：不参与衰减，无条件进入快照：

```
/memory pin <fp>      # 锁定
/memory unpin <fp>    # 解锁
memory action=pin fp="xxx"
memory action=unpin fp="xxx"
```

快照注入优先级：**锁定 > preferences > knowledge > behavior**。

## 审计

双通道：

- `audit.log`——人类可读的一行摘要，向后兼容
- `audit.jsonl`——结构化，每行一个 JSON 对象

事件：`WRITE` / `DECAY` / `CONSOLIDATE` / `CONFLICT` / `ARCHIVE` / `PIN` / `UNPIN` / `PREVIEW`（dry-run）/ `ROLLBACK`。

示例行：

```json
{"t":"2026-08-16T05:00:00.000Z","event":"DECAY","fp":"abc123","text":"..."}
```

查询：

```
/memory audit                    # 最近事件
/memory audit --since 7d         # 最近 7 天
/memory audit --type DECAY       # 只看 DECAY 事件
memory action=audit type="DECAY" sinceDays=7
```

## 语义检索

先做关键词匹配；命中不足时用纯 JS 的 TF-IDF + cosine 补充召回——**无原生模块、无外部依赖**，完全离线。语义命中的结果会在输出中标注"语义"。

## 配置

```js
// 插件配置（bundle 或 profile 层）
{
  halfLifeDays: 7,          // 半衰期（天）：衰减速度
  decayThreshold: 3,        // 权重低于此值 → 归档
  consolidateThreshold: 3,  // 引用 ≥ 此次数 → 巩固（+1 权重）
  weightCap: 20,            // 巩固权重上限（防膨胀）
  hotTokenLimit: 5000,      // 快照注入热区 token 上限
  maxQueryResults: 20,      // 查询返回上限
  petEndpoint: null         // 可选：本地通知服务 URL（默认关闭）
}
```

## 兼容性

- Node >= 22.19.0
- `@deepseek-ai/dsh-*` 0.1.0-rc.5 运行时（按实际 lib 源码核对实现）

## 常见故障排查（FAQ）

- **Node 版本**：要求 Node >= 22.19.0；旧版本可能无法加载插件。
- **DSH 运行时兼容性**：目标 `@deepseek-ai/dsh-*` 0.1.0-rc.5——请核对实际运行的运行时版本。
- **记忆目录问题**：写入失败时检查记忆根目录读写权限；若设置了 `DSH_MEMORY_ROOT`，须指向存在且可写的目录。
- **原生模块冲突**：本插件**无任何原生依赖**——纯 JS 实现，不会与其他插件的原生模块冲突。

## 使用场景演示

- **个人知识库长期维护**：长期积累事实与决策，日后像第二大脑一样检索；衰减与归档自动维持整洁，无需手动清理。
- **项目经验沉淀**：教训、习惯、决策按项目存于 `projects/<项目>/`，主题被反复引用时权重自动巩固。
- **跨会话偏好记忆**：偏好每次会话启动都注入，重要条目用记忆钉锁定保持稳定，冲突仲裁确保偏好对行为始终具有权威性。

## 贡献指南

- **报告 issue**：附上 DSH 运行时版本、Node 版本与复现步骤。
- **提交 PR**：fork 仓库 → 修改 → 补充/更新测试 → 提交前运行 `npm test`。
- **运行测试**：`npm test`（node:test）；新行为应附带测试覆盖。

## License

MIT
