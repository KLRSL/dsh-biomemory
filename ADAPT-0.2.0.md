# dsh-biomemory 适配 DSH 0.2.0-rc.2 记录

> 建立日期：2026-09-29 · 依据：桌面版运行时内自带的官方规范（`@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/`）
> 运行时基线：`<app>`（Electron 桌面版），组件包 518 个，版本 `0.2.0-rc.2`

## 一、结论先行

**dsh-biomemory 0.8.2 在 0.2.0-rc.2 下可以正常挂载**：探针 profile（desktop 副本 + 本插件）实测
`dsh --profile desktop-probe --dump-config` 退出码 0、1344 行、零 `skipping profile bundle`、零报错，
`dsh-biomemory` 以 loader 条目出现。所以本次不是"移植"，是"按新规范打磨"。

## 二、已修

| # | 问题 | 证据 | 处置 |
|---|---|---|---|
| 1 | `dsh.client.inject` 声明了 `@deepseek-ai/dsh-client-runtime`，该包在 0.2.0-rc.2 中**不存在** | asar 包清单 518 个包中无此包；官方客户端插件（ui-goal / ui-schedule / ui-skill / ui-theme / settings-plugins）均不引用它 | 已从 inject 移除，保留实际存在的 `dsh-client-ui-settings`（settings.section 槽）与 `dsh-client-ui-slots`（`ctx.slots`） |
| 2 | **`lib/client.js` require 了 `@deepseek-ai/dsh-client-ui-primitives`，且解构出的 9 个图标在 0.2.0 里全是 `undefined`** | 官方包 0.2.0-rc.2 导出表（282 个成员）实测：`Button`/`Input`/`StateDot` 仍在，但图标**只导出 `...Regular`/`...Medium`/`...Artwork`**——`IconSearchOutline16`、`IconSearchOutline` 均已不存在。渲染 `createElement(undefined)` 会整块清空槽位（`slot entry crashed`） | 已按官方 `references/practices.md` §UI 第 1 条**本地化**：把 9 个图标的官方 SVG 路径 + Button/Input 的结构与 CSS 抄进插件（`lib/client.js` 顶部 vendored 块），类名统一 `bm-` 前缀，颜色只依赖 `--dsw-alias-*` 令牌。`lib/client.js` 现已**零** Harness Client 包依赖（`require` 只剩基线的 `react`）。备份 `lib/client.js.bak-vendored-20260929` |
| 3 | 缺少回归防护 | — | 新增 `tests/no-harness-client-imports.test.mjs`（5 条守卫）：不得 require 任何 `@deepseek-ai/*`、不得出现未声明外部模块、本地化成员齐备、样式走 `bm-` 前缀与主题令牌、`dsh.client.inject` 不得声明不存在的包 |

## 三、v0.9.0：移除嵌入模型与语义检索（2026-09-29 用户决策）

**背景**：`embed.mjs` 依赖 `@huggingface/transformers` + onnxruntime，且需额外下载约 90MB 的
`bge-small-zh-v1.5` ONNX 权重到 `~/.dsh/models/`。官方 `BAAI/bge-small-zh-v1.5` 仓库**不含 ONNX**，
必须用 transformers.js 转换版（`Xenova/bge-small-zh-v1.5`）。用户决定不做这套依赖。

**移除**：

| 项 | 处置 |
|---|---|
| `embed.mjs` | 删除（备份 `<local>\_backup\dsh-biomemory-embed-removed-20260929\embed.mjs`） |
| `@huggingface/transformers` 依赖 | 从 `package.json` 移除；`node_modules` 由 410.5 MB 降到 **20.1 MB**（去掉 onnxruntime-node 210MB / onnxruntime-web 128MB / @huggingface 9.7MB） |
| `pnpm.onlyBuiltDependencies` | 移除（onnxruntime-node / sharp 不再需要） |
| query 三模式（exact/semantic/hybrid） | 收敛为**单一确定性检索**：`score = relevance · (1 + 0.5·min(weight,weightCap)/weightCap)`，`relevance = Σ命中字段权重 + 0.1·min(命中次数,5)`。`exactSearch`/`exactRelevance` 从 `embed.mjs` 迁入 `retrieve.mjs` |
| 向量 API | `db.setVector` / `setVectorsBatch` / `entriesWithVectors` / `vectorCount` 删除；`store.ensureVectors` 删除；`/vectors` HTTP 端点删除；`preloadEmbeddings` 配置项删除。`entries.vector` **列保留**在 schema 中（避免破坏性重建既有数据库），运行期不再读写 |
| RRF 融合 | `hybridFuse` / `semanticTopK` / `embed()` / `cosine`(embed 版) 随模块删除 |
| 设置页 UI | 去掉"混合/精确/语义"分段按钮（两处）、"嵌入模型"状态卡、"启动时预加载嵌入模型"开关；文案同步 |
| 保留 | `tokenize` / `cosine`(词频版) 保留——`meta.mjs` 的主题聚类（词频余弦 ≥0.25 归簇）仍在使用，且它们是纯 JS、零依赖 |

**验证**：`node --test tests/*.test.mjs` → **95 tests / 95 pass / 0 fail**；
`dsh --profile desktop-probe --dump-config` → EXIT=0、1344 行、零跳过。

## 四、待修（按官方规范，均已有明文依据）

| # | 问题 | 官方依据 | 影响 |
|---|---|---|---|
| 5 | 界面文案走插件自带 `copy` 字典，未走 Client locale 服务 | `references/ui-plugin.md`：Route visible UI text through the Client locale service；`practices.md` §UI | 多语言与宿主语言设置不同步 |
| 6 | 容器/控件颜色使用自有品牌色（紫/粉）而非 `--dsw-alias-*` 令牌 | `practices.md` §UI：样式只能用主题令牌，字面色仅限 artwork | 宿主主题改版时观感漂移（不会崩） |

### 图标名对照（0.2.0-rc.2 实测）

| 插件原用名（0.2.0 中为 undefined） | 官方现名 | 本地化后的组件 |
|---|---|---|
| `IconSearchOutline16` | `IconSearchOutlineRegular`（默认 16px） | `IconSearchOutline16` |
| `IconTrashOutline16` | `IconTrashOutlineRegular` | `IconTrashOutline16` |
| `IconRefreshOutline14` | `IconRefreshOutlineRegular` | `IconRefreshOutline14`（size 14） |
| `IconCheckOutline16` | `IconCheckOutlineRegular` | `IconCheckOutline16` |
| `IconWarningOutline16` | `IconWarningOutlineRegular` | `IconWarningOutline16` |
| `IconThinkOutline14` | `IconThinkOutlineRegular` | `IconThinkOutline14`（size 14） |
| `IconSettingsOutline16` | `IconSettingsOutlineRegular` | `IconSettingsOutline16` |
| `IconLinkOutline14` | `IconLinkOutlineRegular` | `IconLinkOutline14`（size 14） |
| `IconBrowseOutline16` | `IconBrowseOutlineRegular`（artwork 名无 Icon 前缀） | `IconBrowseOutline16` |

`StateDot` 在官方仍在，但本插件的解构里**从未使用**，故未本地化。

## 四、安装口径（重要，此前做法需修正）

官方 `SKILL.md` 明确：

> Do not write the profile's `package.json` or `cordis.patch.yml`, create packages under `$DSH_HOME`,
> or run pnpm in the profile directory: `install_bundle` performs those steps.

`@deepseek-ai/dsh-plugin-manager` 文档补充：
- 管理入口 = Web 侧边栏 **Plugins** 页 / `plugin_manager` 工具；
- `plugin_manager` 工具**仅在 Creator 模式**默认启用，其它预设默认关闭；每次调用需 `danger-full-access` 或审批；
- 安装走 `install_bundle`（registry 名 / 绝对路径 / git / tarball 都支持，绝对路径会读其 `package.json`）；
- 安装前会做 DSH peer 兼容校验（本插件为开放式 `>=0.1.1-rc.2`，可通过）；
- 不兼容插件走 `compatibility.json` 的**逐版本豁免**：`dsh plugin --profile <p> allow-version <pkg@ver> --dsh-version <runtime> --accept-risk`；
- `desktop` profile 由 Electron 独占管理，命令行只能装、不能 `--dump-config`。

→ 后续向 desktop profile 安装插件应走插件管理器（GUI 或 Creator 模式下的工具），不要再手写 profile 的 package.json。

## 五、验证方法

```powershell
# 服务端半边（不触碰真实 desktop profile）
<app>\resources\runtime\cli\bin\dsh.cmd --profile desktop-probe --dump-config   # 期望 EXIT=0 且无 skipping
# 语法
<tmp>\Node.js\node.exe --check <local>\projects\dsh-biomemory\lib\client.js
# 单元测试
<tmp>\Node.js\node.exe --test "<local>\projects\dsh-biomemory\tests\*.test.mjs"
```

客户端半边的可用性需要浏览器控制（槽位注册、主题、控制台无 `slot entry crashed`）；
无浏览器时按 `references/verification.md` 声明验证边界。
