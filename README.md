# dsh-biomemory

> **生物仿生记忆系统**：跨会话记忆插件，像人脑一样分层记、分级审、会代谢、透明可改。
>
> [简体中文](README.md) · [English](README.en.md)

> **v0.6.4** · MIT License · DSH ≥ 0.1.1-rc.2（0.1.2-rc.1 已实测）· Node ≥ 22.19.0

给 [DeepSeek Harness](https://github.com/deepseek-ai/dsh)（DSH）的跨会话记忆插件：像人脑一样**分层记、分级审、会代谢、透明可改**。数据层为 SQLite（`node:sqlite` 内置、WAL 模式、零外部依赖），旧 Markdown 记忆首次启动自动迁移并保留只读备份。

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 分层记忆 | Memory / Retrieved / Applied 三层分离——存储层、查询候选、已注入快照；检索到 ≠ 已采用，执行与否由 AI 结合上下文判断 |
| 分级审批 | 重要记忆（用户偏好/项目决策/踩坑教训）人工审批，普通事实自动写入；审批通道不可用时按 `approvalFallback` 降级（auto/deny） |
| 自动沉淀 | 会话结束自动注入「沉淀本轮」指令；启动自动注入**冻结记忆快照**（锁定与偏好最高优先级，冲突行为记忆置顶 `[冲突]` 标注） |
| 记忆代谢 | 半衰期衰减 + 引用巩固（用进废退）+ 冲突豁免 + 低权重归档；执行前自动备份、支持断点续跑与 dry-run 预览 |
| 深度反思 | 主题聚类 / 趋势统计 / 冲突提醒 / 遗忘建议，纯本地无 LLM，报告写入 `longterm/reflections/` |
| 记忆类别 | `memory_class` 自动推断：user_decision / user_preference / fact / model_suggestion / model_inference（建议 ≠ 决定） |
| 来源可溯 | `source_ref` 记录来源，`add` 缺省记 `session:<id>`；结构化审计五元组（时间/操作者/事件/条目/详情）全程可查 |
| 语义检索 | 本地嵌入模型 bge-small-zh-v1.5（512 维，离线）优先；TF-IDF + cosine 纯 JS 降级；exact / semantic / hybrid 三模式 |
| 透明可改 | 每条记忆可编辑/删除/回滚（删除前自动备份）；SQLite 单文件即所有数据，`.db` 直接用标准工具查看 |
| 零原生依赖 | `node:sqlite` 内置 + 纯 JS 实现，无原生模块冲突；管理 UI 五 tab「记忆工作台」，深色模式跟随 DSH 主题 |

## 安装

### 从 GitHub 安装（推荐）

```bash
# 需要已安装 git；--profile web 换成你的 profile 名
dsh plugin --profile web add github:KLRSL/dsh-biomemory
```

### 本地 bundle（开发 / link）

```bash
# 在项目目录下执行
dsh plugin --profile web add link:./dsh-biomemory
```

`dsh plugin` 会自动把安装的包登记到 profile 的 `dsh.profile.bundles` 并挂载补丁；安装完成后重启 DSH。

**安装后验证**：

```bash
# 1. 工具已注册 —— 在会话中直接调用（对话内模型可见）
memory action=query text="测试"

# 2. 数据层就绪 —— 首次启动后应出现
ls ~/.dsh/biomemory/
# biomemory.db  biomemory.db-wal  biomemory.db-shm

# 3. 旧 Markdown 记忆自动迁移（保留只读备份，不删除）
#    迁移状态可通过 Web API 查看：
#    GET /biomemory/api/status → migration 字段

# 4. 管理 UI —— DSH 设置页出现「记忆工作台」五个 tab：
#    概览 / 知识库 / 代谢 / 反思 / 设置
```

## 快速开始

```text
# ① 保存一条用户偏好（重要记忆 → 触发人工审批；审批通过后入库）
memory action=add track=user text="用户偏好：网络下载一律用国内镜像源" source="用户原话"

# ② 查询（hybrid = 精确 + 语义融合，默认）
memory action=query text="镜像源" mode=hybrid topK=5

# ③ 修复一条记忆（内容说错了，直接改文本，元数据不动）
memory action=update fp="a1b2c3" text="用户偏好：网络下载一律用国内镜像源（pip 清华 / npm npmmirror）"

# ④ 锁定重要条目（不参与衰减，永远进会话快照）
memory action=pin fp="a1b2c3"

# ⑤ 代谢 + 反思（建议跑一次看看效果；--dry-run 可以只预览）
memory action=dream dryRun=true
memory action=reflect dryRun=true

# ⑥ 审计（看看这段时间记忆系统发生了什么）
memory action=audit sinceDays=7
memory action=audit aggregate=true groupBy=action

# ⑦ 运行时也可以在对话里用 /memory 命令
/memory list
/memory query 偏好
```

## 使用指南

### memory 工具（action 清单）

| action | 参数 | 说明 |
| --- | --- | --- |
| `add` | `text`（必填）, `track`=user\|agent, `source` | 保存记忆；重要条目自动请求审批，审批不可用时按 `approvalFallback` 降级 |
| `query` | `text`, `mode`=hybrid\|exact\|semantic, `topK`, `minWeight`, `projectId`, `fragmentTypes`, `includeArchived` | 查询；命中自动巩固（用进废退） |
| `update` | `fp`, `text` | 编辑一条记忆（保留锁定/权重等元数据；文本变了向量置空重算；审计 UPDATE） |
| `remove` | `fp` | 删除一条（删除前自动备份数据库，可回滚） |
| `restore` | `fp` | 从最近备份回滚被删除的一条 |
| `list` | `topK` | 列出全部条目；与偏好冲突的行为记忆置顶并标注 |
| `pin` / `unpin` | `fp` | 锁定/解锁。锁定 = 不遗忘（防衰减/归档），不代表每轮必须执行 |
| `dream` | `dryRun`, `resume`（默认 true） | 记忆代谢：衰减/巩固/冲突/归档；支持断点续跑 |
| `reflect` | `dryRun` | 深度反思：主题聚类/趋势统计/冲突提醒/遗忘建议 |
| `audit` | `type`, `sinceDays`, `aggregate`, `groupBy`（action\|day\|entry） | 结构化审计查询/聚合统计 |

示例：

```text
memory action=add track=user text="正式名「大肥鱼」，不用旧名" source="用户原话"
memory action=query text="UI 渲染宽度规则" mode=hybrid topK=10 minWeight=0.1 fragmentTypes=decision,preference
memory action=audit type="DECAY" sinceDays=7
memory action=audit aggregate=true groupBy=day
```

**记忆类别（自动推断，写入时记录）**：`user_decision`（用户明确决定）· `user_preference`（用户偏好）· `fact`（普通事实）· `model_suggestion`（模型建议）· `model_inference`（模型推测）。建议 ≠ 决定，模型建议永不冒充用户拍板。

### memory_recall 工具

跨会话召回（「你还记得…吗」场景），与 `memory query` 同底，语义上专用于回忆：

```text
memory_recall text="去年定下的版本规则"
```

### /memory 命令族

| 命令 | 说明 |
| --- | --- |
| `/memory list` | 列出全部条目（冲突条目置顶） |
| `/memory query <词>` | 关键词 + 语义检索 |
| `/memory add <内容>` | 直接写入（人类发起，免审批） |
| `/memory edit <fp> <新内容>` | 编辑一条 |
| `/memory remove <fp>` | 删除一条（可回滚） |
| `/memory undo <fp>` | 回滚被删除的一条 |
| `/memory pin <fp>` / `unpin <fp>` | 锁定 / 解锁 |
| `/memory entries [词]` | 列出条目（可带过滤词） |
| `/memory dream [--dry-run]` | 记忆代谢 |
| `/memory reflect [--dry-run]` | 深度反思 |
| `/memory audit [--since 7d] [--type DECAY]` | 审计查询 |

### 冻结快照注入

会话启动时，插件自动把高价值记忆冻结注入 system prompt（注册即冻结，快照标记「会话冻结」）：

- 头部明确三层概念：**本快照 = Applied Context**（已注入 prompt）；Memory（存储层）与 Retrieved（查询候选）不在此列；**检索到 ≠ 已采用**。
- 注入顺序：**锁定记忆（最高优先级，不参与衰减）→ 用户偏好（最高优先级，写入须尊重）→ 近期知识 → 近期行为**。
- 与偏好冲突的行为记忆**置顶并标注 `[冲突]`**，由你裁决修改。
- 热区 token 预算 `hotTokenLimit`（默认 5000），超出时保留偏好与锁定段。

### 分级审批门

| 记忆类型 | 审批方式 |
| --- | --- |
| 用户偏好 / 项目决策 / 踩坑教训（`track=user` 或命中重要词） | **人工审批**（ask） |
| 普通事实 | 自动写入（auto） |
| 审批通道不可用（策略 never / 服务缺失） | 按 `approvalFallback`：`auto` = 自动保存并审计降级标记 · `deny` = 拒绝写入（fail-closed） |

### 记忆代谢（Dream）

相当于睡眠时大脑做的事——`/memory dream` 或 `memory action=dream`：

1. **半衰期衰减**（默认 7 天）：`w × 0.5^(年龄/半衰期)`，下限 1。
2. **引用巩固**：单条命中引用 ≥ `consolidateThreshold`（默认 3）次则 +1 权重，上限 `weightCap`（默认 20）。
3. **冲突豁免**：与偏好冲突的行为记忆不衰减不归档、保持活跃，在列表与快照中**置顶浮出**，由你人工裁决（编辑改掉冲突内容后恢复正常代谢），记 `CONFLICT` 事件。
4. **低权重归档**：权重低于 `decayThreshold`（默认 3）→ `status=archived`，**移动不删除**。

执行前自动备份数据库（保留最近 7 次，`ROLLBACK` 事件可溯）；每 100 条写检查点，中断后 `resume=true` 断点续跑；`--dry-run` 只预览不落盘。

### 深度反思（Reflect）

纯本地、无 LLM 的周期总结：**主题聚类**（TF 向量余弦相似度 ≥ 0.25）· **趋势统计**（近 7 天 vs 上一周写入量）· **冲突提醒**（行为与偏好潜在冲突清单）· **遗忘建议**（低权重候选）。报告写入 `longterm/reflections/<时间戳>.md`，支持 `--dry-run` 预览。

### 知识库（管理 UI）

DSH 设置页「记忆工作台」五个 tab：

| tab | 功能 |
| --- | --- |
| 概览 | 存储统计（条目/锁定/分层/向量数/审计近 7 天）、模型状态、迁移状态、冲突与低权重速览 |
| 知识库 | 全文/语义搜索（exact/semantic/hybrid）、按分层筛选、权重/引用/时间/锁定状态展示；一键锁定/解锁、**就地编辑**、**安全删除**（先备份可回滚）；冲突条目置顶 + 红色徽标 |
| 代谢 | 一键执行 / 预览记忆代谢，展示衰减/巩固/冲突/归档结果 |
| 反思 | 一键执行 / 预览深度反思，报告罗列与冲突就地裁决（编辑或删除） |
| 设置 | 全部配置项可视化编辑（含恢复默认） |

### 审计

双通道：**SQLite `audit_log` 表**（结构化，五元组 `t / actor / action / entry_id / detail`，主通道）+ **`audit.log`**（人类可读一行摘要，向后兼容）。

事件类型：`WRITE` / `DECAY` / `CONSOLIDATE` / `CONFLICT` / `ARCHIVE` / `RECALL` / `ROLLBACK` / `AUTO-DREAM` / `AUTO-REFLECT`（其余辅助事件：`PIN` / `UNPIN` / `UPDATE` / `REMOVE` / `RESTORE` / `MIGRATE` / `VECTORIZE` / `PREVIEW` / `REFLECT` / `CONFIG`）。

```text
/memory audit                      # 最近事件
/memory audit --since 7d           # 最近 7 天
/memory audit --type DECAY         # 只看 DECAY
memory action=audit type="DECAY" sinceDays=7
memory action=audit aggregate=true groupBy=action   # 聚合统计
```

### 语义检索

先关键词匹配；命中不足时用纯 JS 的 **TF-IDF + cosine** 补充召回（无原生模块、完全离线）。配置了本地嵌入模型（bge-small-zh-v1.5，512 维，存储于 `~/.dsh/models/`）且可用时，自动升级为 **hybrid** 融合检索（RRF 变体）；模型缺失/加载失败自动降级为关键词检索，记忆功能不受影响。语义命中在输出中标注「语义」。

## 配置

| key | 默认值 | 说明 |
| --- | --- | --- |
| `halfLifeDays` | `7` | 半衰期（天）：权重每过半衰期衰减一半 |
| `decayThreshold` | `3` | 权重低于此值 → 归档（移动，不删除） |
| `consolidateThreshold` | `3` | 引用 ≥ 此次数 → 巩固（+1 权重） |
| `weightCap` | `20` | 巩固权重上限（防膨胀） |
| `hotTokenLimit` | `5000` | 快照注入热区 token 上限 |
| `maxQueryResults` | `20` | 查询返回上限 |
| `approvalFallback` | `auto` | 审批不可用时：`auto`=自动保存并审计降级 / `deny`=拒绝写入 |
| `autoDreamDays` | `7` | 启动时距上次代谢 ≥ 此天数自动执行（`0`=关闭） |
| `autoReflectDays` | `3` | 启动时距上次反思 ≥ 此天数自动执行（`0`=关闭） |
| `conflictOverlap` | `3` | 冲突检测：行为与单条偏好的专有双字重叠阈值 |
| `petEndpoint` | `null` | 可选：本地桌宠通知服务 URL（默认关闭） |

可在设置页「设置」tab 可视化修改，或通过 `POST /biomemory/api/config` 调整；持久化为 `biomemory.config.json`（透明可改）。

## 集成

### Web API（DshWebServer 注册，prefix `/biomemory/api`）

| 方法 / 路径 | 说明 |
| --- | --- |
| `GET /status` | 存储统计 + 配置 + 模型/迁移状态 |
| `GET /config` · `POST /config` | 读取 / 更新配置（白名单字段，`reset:true` 恢复默认） |
| `POST /dream` | 记忆代谢（body `{ "dryRun": true }`） |
| `POST /reflect` | 深度反思（body `{ "dryRun": true }`） |
| `GET /entries` | 条目列表（`q` 搜索词 / `layer` 分层 / `mode` 检索模式 / `limit` 上限） |
| `POST /entries/pin` · `/unpin` · `/remove` · `/restore` · `/update` | 条目管理（body 含 `fp` 等） |
| `POST /vectors` · `GET /vectors` | 触发向量化 / 查询向量化状态 |
| `GET /audit` · `GET /audit/aggregate` | 审计查询（`sinceDays`/`type`）/ 聚合统计（`groupBy`） |

### 通知（可选）

配置 `petEndpoint` 后，记忆保存等事件通过 HTTP POST 通知本地桌宠气泡（离线静默失败，不影响记忆本体）。

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DSH_BIOMEMORY_DIR` | `~/.dsh/biomemory` | SQLite 数据目录 |
| `DSH_MEMORY_ROOT` | `~/.dsh/memory` | 旧 Markdown 根目录（迁移源与只读备份） |
| `DSH_MODELS_ROOT` | `~/.dsh/models` | 本地嵌入模型目录 |
| `DSH_MEMORY_DEBUG` | — | `1` 时输出调试日志 |

## 兼容性

- **Node ≥ 22.19.0**（`node:sqlite` 内置要求）。
- **运行时**：`@deepseek-ai/dsh-*` ≥ 0.1.1-rc.2（当前 latest 线；0.1.2-rc.1 已实测，按实际 lib 源码核对实现）。
- **peerDependencies**：`@deepseek-ai/cordis ^4.0.2`、`@deepseek-ai/dsh-session >= 0.1.1-rc.2`、`@deepseek-ai/dsh-tools >= 0.1.1-rc.2`。
- **零原生 npm 依赖**：数据层为 `node:sqlite` 内置 + 纯 JS，不会与其他插件的原生模块冲突；语义检索模型为可选离线组件，缺失自动降级。
- v0.6.3 起 memory 工具返回值兼容 dsh-tools 新版 lossless JSON 校验（undefined/NaN 字段统一置 null，避免工具校验报错）。

## 版本历史

| 版本 | 日期 | 要点 |
| --- | --- | --- |
| **v0.6.4** | 2026-09-06 | **数据层单轨制**：SQLite 为唯一运行时数据源——写入一律走 memory 工具（writeEntry 不再追加 preferences.md）；偏好文本/冲突检测改从 SQLite 读（prefsText()，替代读 Markdown）；Markdown（hot/projects/longterm/preferences）永久降级为只读备份+人工查看层，不再参与运行时读写（消除「双轨不同步」盲区）；60 测试全绿 |
| **v0.6.3** | 2026-09-05 | 适配 DSH 0.1.2-rc.1：memory 工具返回值兼容 dsh-tools 新版 lossless JSON 校验（undefined/NaN 字段置 null，修复工具报错）；插件 UI 深色适配（DSH 主题跟随，双通道探测 + MutationObserver） |
| **v0.6.2** | 2026-09-05 | 管理 UI 按「骨架/血肉/呼吸」设计语言重构：现代极简——neutralSurface 底 + 白色圆角卡片分层、主色下划线 tabs、4/8px 栅格、150ms 动效；配色全部取自 dsh-fuse design 令牌，零硬编码；确立紫粉品牌色（记忆神经） |
| **v0.6.1** | 2026-09-05 | Memory / Retrieved / Applied 三层分离（检索到 ≠ 已采用）；记忆钉语义修正（锁定 = 不遗忘 + relevance admission）；记忆类别 `memory_class` + 来源 `source_ref`；schema 演进（entries 表新增列，旧库启动自动 ALTER，幂等） |
| **v0.6.0** | 2026-08-31 | `index.mjs` 拆为 shared / store / retrieve / meta / snapshot / gate / notify / session-state 模块（行为不变，57 测试全绿）；会话结束自动沉淀（turn/end 后注入总结指令，写即清标记、5 分钟防呆、严格去重） |
| **v0.5.3** | 2026-08-31 | 设置页改用 dsh-fuse 设计令牌；peerDeps 升至 `>=0.1.1-rc.1` |
| **v0.5.2** | 2026-08-20 | 可编辑记忆（update 保留锁定/权重，审计 UPDATE，防重复）+ 冲突浮出置顶（行为与偏好冲突不再静默降权）+ 单条回滚（restore / `/memory undo`） |
| **v0.5.0** | 2026-08-20 | SQLite 数据层（`~/.dsh/biomemory/biomemory.db`，node:sqlite 内置、WAL、零外部依赖）+ 本地嵌入语义检索（bge-small-zh-v1.5，512 维，离线）；旧 Markdown 记忆自动迁移（保留只读备份）+ 审计聚合 + dream 断点续跑 |
| **v0.4.0** | — | 自动召回（命中巩固，用进废退）/ 自动保存（审批降级 + 自动代谢/反思周期）+ 深度反思 + 知识页（设置页 tab） |
| **v0.3.x** | — | 记忆代谢（dream）+ 记忆钉（pin）+ 结构化审计（audit.jsonl）+ 语义检索（TF-IDF）+ 设置面板 |

## 常见问题

- **Node 版本**：要求 Node ≥ 22.19.0（`node:sqlite` 内置）；旧版本可能无法加载插件。
- **DSH 运行时兼容性**：目标 `@deepseek-ai/dsh-*` ≥ 0.1.1-rc.2——请核对实际运行的运行时版本（0.1.2-rc.1 已实测）。
- **工具报错（Invalid object / lossless JSON）**：升级到 v0.6.3+，返回值已兼容 dsh-tools 新版严格校验。
- **语义检索不可用**：检查 `~/.dsh/models/bge-small-zh-v1.5` 模型是否存在；缺失时自动降级为关键词 + TF-IDF 检索，记忆功能不受影响。
- **记忆写入失败**：检查 `~/.dsh/biomemory/`（及 `DSH_BIOMEMORY_DIR`）读写权限；审批被拒时确认审批策略与 `approvalFallback` 设置。
- **旧 Markdown 记忆去哪了**：首次启动已自动迁移进 SQLite；`E:\DE\memory\` 保留为只读备份（**v0.6.4 起为纯只读层，不再写入/读取**，修改它不会影响运行时——写入一律走 memory 工具）。

## 数据层（单轨）

- **唯一数据源**：`~/.dsh/biomemory/biomemory.db`（SQLite，node:sqlite 内置、WAL）。
- **只读镜像**：`E:\DE\memory\`（hot/ projects/ longterm/ preferences.md）仅备份与人工查看，v0.6.4 起不参与运行时——手工编辑不会生效。
- **写入入口**：`memory` 工具（add/edit/remove/pin）与 `/memory` 命令，全部落 SQLite 并审计。
- **一次性迁移**：新环境首次启动仍会从 Markdown 导入历史（meta.migrated_at 幂等，仅一次）。
- **误删的条目还能找回吗**：删除前自动备份数据库（保留最近 7 次），`/memory undo <fp>` 或 `memory action=restore fp=...` 即可恢复。
- **原生模块冲突**：本插件无任何原生依赖——纯 JS 实现，不会与其他插件冲突。

## 开发

```bash
# 运行测试（node:test，60 个用例全绿）
npm test
```

模块结构：`index.mjs`（接线层）+ `shared`（配置/审计/冲突）· `store`（写入/钉/删/回滚/迁移）· `retrieve`（查询/语义）· `meta`（代谢/反思）· `snapshot`（快照/会话沉淀）· `gate`（审批/自检）· `notify`（桌宠通知）· `session-state` · `db`（SQLite 数据层）· `embed`（嵌入模型）。

**贡献**：fork → 修改 → 补充/更新测试 → 提交前运行 `npm test`；报 issue 请附 DSH 运行时版本、Node 版本与复现步骤。

## License

MIT — 完整文本见 [LICENSE](LICENSE)。
