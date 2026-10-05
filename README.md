# dsh-biomemory

> **给 DeepSeek Harness 的记忆层**：本地单文件、零服务、零 API，靠**触发信号**把该想起的记忆在该想起的时候拿出来。

**v0.10.0** · MIT License · DSH ≥ 0.1.1-rc.2（已在 0.2.0-rc.2 桌面版实测）· Node ≥ 22.19.0

---

## 它是什么

一句话：**只做记忆，不做记忆平台。**

- **不做**：外置服务、向量检索、嵌入模型、知识图谱、云端同步、Web UI。
- **做**：一个 SQLite 单文件 + 一个"什么时候该想起什么"的确定性规则集。

它和"记忆平台"（如外置记忆服务）的区别，不是功能多少，而是**没有额外要跑的东西**：装完就是一个插件，数据在你自己机器的 `.dsh/biomemory/biomemory.db` 里，拷走文件就是迁移。

## 四层结构

### 1. 存储层：单文件 SQLite

| 字段 | 含义 |
|---|---|
| `realm` | 隔离维度：`user` 或 `project:<工作目录>` |
| `mtype` | 记忆类型：`workflow` / `error` / `decision` / `fact` |
| `trigger` | 触发信号串（见下） |
| `mkey` | 同键覆盖用的主题键 |
| `text` | 正文 |
| `created_at` / `last_accessed` / `hits` | 生命周期：写入时间 / 最近使用 / 使用次数 |
| `status` | `active` / `archived` / `deleted`（删除是**墓碑**，不物理删） |

另有两张辅助表：`chains`（工作流链）、`trigger_counts`（触发次数，用于工作流升级）。

### 2. 召回层：触发信号驱动

不等模型"自己想起来"，而是**看当前会话发生了什么**：

- 信号来源：当前会话工作目录（`session.cwd`）+ 最近 12 次工具调用的名字与参数（文件路径、命令、错误代号都从这里来）。
- 触发串只有三种形态，可读可解释：
  - `file:<文件名>` —— 例如 `file:package.json`
  - `tool:<工具名>` —— 例如 `tool:pwsh`
  - `err:<错误代号>` —— 例如 `err:MODULE_NOT_FOUND`
- 命中即注入，排序 **workflow > error > decision > fact**，同类型按最近使用时间；命中工作流链则**整条链**一起注入。
- **注入预算**：每次最多 8 条、最多 1200 字符；没命中就一个字都不注入（不占 token）。

### 3. 清理层：五条可解释规则

`/memory compact` 执行，每次淘汰都写 `compact.log`：

1. 同 `realm + type + key` 的新记忆覆盖旧记忆（旧条目标墓碑）——写在写入路径上；
2. `fact`：超过 30 天没人用（使用次数 ≤1）→ 进墓碑；
3. `workflow` / `error` / `decision`：不设有效期；超过 90 天没人用 → 权重减半；
4. `error` 与 `decision` **永不自动删除**；
5. 每条淘汰/降权都记 `compact.log`（时间 · 指纹 · 命中规则 · 摘要）。

### 4. 适配层：工作流从重复里自己长出来

同一个触发串出现 **超过 3 次**，相关记忆自动升级为 `workflow`，并按时间顺序拼成一条链：

```
当 file:package.json 时：先看 package.json → 跑测试 → 再改代码
```

链是**顺序记录**，不是因果推断——不假装知道为什么，只如实记下"你上次是这么做的"。

## 安装

```bash
# 需要已安装 git；--profile 换成你的 profile 名
dsh plugin --profile web add github:KLRSL/dsh-biomemory

# 本地开发（link）
dsh plugin --profile web add link:./dsh-biomemory
```

装完重启 DSH（桌面版会热挂载）。

## 用法

### 工具 `memory`

| action | 说明 |
|---|---|
| `add` | 写入一条记忆（`text` 必填；`track=user|agent`；`source` 记来源） |
| `query` | 关键词查询（`text`/`topK`/`fragmentTypes`/`includeArchived`） |
| `list` / `update` / `remove` / `restore` / `pin` / `unpin` | 浏览 / 改 / 删（墓碑）/ 回滚 / 锁定 / 解锁 |
| `compact` | 按五条规则清理（`dryRun=true` 只预览） |
| `dump` | 导出人类可读 Markdown（含工作流链） |

还有一个 `memory_recall` 工具，用于"你还记得…吗"式的显式召回。

### 命令 `/memory`

```
/memory list | query <词> | add <内容> | edit <fp> <新内容> | remove <fp> | undo <fp>
/memory pin <fp> | unpin <fp> | entries [词]
/memory compact [--dry-run] | dump
```

### 写入审批

重要记忆（用户偏好/决定/纠正类）走 DSH 官方审批：批准才落库，审批服务不可用时**默认拒绝**（fail-closed，可用配置 `approvalFallback=auto` 放宽）。

## 数据与隐私

- 全部本地：零网络请求、零外部 API、零遥测。
- 数据库：`<DSH_BIOMEMORY_DIR || ~/.dsh/biomemory>/biomemory.db`（SQLite，WAL）。
- 删除是墓碑（可恢复），`compact` 也只在库内改状态；需要真备份时 `dump` 出 Markdown。
- 环境变量：`DSH_BIOMEMORY_DIR`（数据目录）、`DSH_MEMORY_ROOT`（Markdown 备份/日志目录）。

## 配置

`~/.dsh/biomemory/biomemory.config.json`（或 bundle config）可覆盖：

| 键 | 默认 | 说明 |
|---|---|---|
| `nearDuplicateThreshold` | 0.7 | 写入去重的相似度阈值（0=关闭） |
| `nearDuplicateAction` | merge | 命中近重复时合并 / `skip` 只提示 |
| `approvalFallback` | deny | 审批不可用时拒绝 / `auto` 自动保存 |
| `decayThreshold` | 3 | 状态页"低权重待处理"的阈值 |
| `hotTokenLimit` | 5000 | 冻结快照注入的 token 上限 |
| `maxQueryResults` | 20 | 查询返回上限 |

## 设计上刻意不做的事

- **不做向量/嵌入检索**：相同输入必须给相同结果，检索要可解释。
- **不做自动"反思"**：没有模型就不假装会归纳；工作流只从重复里浮出来。
- **不做删除即销毁**：一切删除留墓碑，误删可回滚。
- **不做跨机同步**：那是另一类产品；这里只保证文件可以整体搬走。

## 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| **v0.10.0** | 2026-10-05 | **重构为「记忆层」**：新增触发式召回（`trigger` + `realm` + `mtype` + `mkey` 四列）、类型优先级排序、五条清理规则 + 墓碑 + `compact.log`、工作流从重复中升级并成链、注入预算（≤8 条 / ≤1200 字符）、`compact`/`dump`；**移除**记忆代谢（dream）、深度反思（reflect）、冲突裁决、结构化审计与自动 Markdown 镜像 |
| v0.9.2 | 2026-09-29 | 删死模块与死配置键；文档与实现对齐（配置表/API 表/测试数） |
| v0.9.1 | 2026-09-29 | 移除管理 UI，插件退化为纯宿主能力 |
| v0.9.0 | 2026-09-29 | 移除嵌入模型与 semantic/hybrid 检索，改单一确定性检索路径 |
| v0.8.2 | 2026-09-20 | 合规化批次：审计双写修复、配置按类型落库、近重复写入去重 |
| v0.8.0 | 2026-09-16 | 写入去重（bigram 相似度）+ 合并/跳过两种策略 |
| v0.7.0 | 2026-09-17 | 镜像同步钩子（v0.10.0 已移除） |
| v0.6.4 | 2026-09-06 | 单轨制：SQLite 为唯一事实来源，Markdown 降级只读备份 |
| v0.6.0 | 2026-08-19 | 架构拆分（shared/store/retrieve/snapshot/gate）+ 会话沉淀 |
| v0.5.0 | 2026-08-15 | 数据层迁移到 SQLite（`node:sqlite`） |

## License

MIT — 详见 [LICENSE](LICENSE)。
