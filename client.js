window.__ModuleLoader__.load({
	id: "dsh-biomemory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let prim = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/client/index.ts
		/**
		 * Biomemory settings page — 记忆工作台（设计稿 v3 · 现代极简）
		 *
		 * 用户定稿（2026-08-19）：五个入口 = 概览 / 知识库 / 代谢 / 反思 / 设置
		 * 设计语言（现代极简，dsh-fuse default 主题令牌）：
		 *   - 底色 neutralSurface #F5F6F8，白色卡片分层
		 *   - 主色 #7C3AED 紫 / 辅色 #C026D3 粉紫 / 强调 #0EA5E9 青，中性色系，低饱和状态色
		 *   - 圆角 8/12/16，4/8px 栅格，字号 12/14/16/20/28，行高正文 1.7 / 标题 1.25
		 */
		const copy = {
			"zh-CN": {
				tab: "记忆",
				title: "记忆工作台",
				subtitle: "数字海马体 · 151 条记忆 · 语义检索已就绪",
				tabOverview: "概览",
				tabKnowledge: "知识库",
				tabMetabolism: "代谢",
				tabReflect: "反思",
				tabSettings: "设置",
				loading: "正在读取状态…",
				unavailable: "暂时无法读取运行状态，但记忆系统不会影响现有工具或上下文。",
				total: "全部记忆",
				totalNote: "总条数",
				pinned: "锁定",
				pinnedNote: "记忆钉",
				model: "嵌入模型",
				modelNote: "bge-zh · 512维",
				modelTag: "本地离线",
				audit: "代谢健康",
				auditNote: "近7天事件",
				auditTag: "10+ 权重 135 条",
				vectorized: "已向量化",
				composition: "记忆构成",
				typeDist: "类型分布",
				weightDist: "权重分布",
				recentActivity: "近 7 天活动",
				flow: "记忆流",
				searchPlaceholder: "搜记忆：如「镜像下载」「桌宠规则」…",
				modeHybrid: "◉ 混合检索 hybrid",
				modeExact: "○ 关键词 exact",
				modeSemantic: "○ 语义 semantic",
				searchBtn: "搜索",
				noEntries: "（无匹配记忆）",
				entriesLoading: "读取知识库…",
				entriesFailed: "知识库读取失败",
				allLayers: "全部分层",
				pin: "锁定",
				unpin: "解锁",
				remove: "删除",
				removeConfirm: "确定删除这条记忆？会自动备份，可回滚。",
				removedNote: "已删除（自动备份，可回滚）",
				undo: "撤销",
				edit: "编辑",
				saveEdit: "保存",
				cancel: "取消",
				editPlaceholder: "修改记忆内容…",
				conflictBadge: "⚠ 与偏好冲突",
				resolveHint: "保存后该条从冲突列表移除；重新执行反思可刷新完整列表",
				weight: "权重",
				hits: "引用",
				config: "系统配置",
				halfLifeDays: "半衰期（天）",
				halfLifeDaysHelp: "记忆权重每经过这么多天衰减一半（默认 7）",
				decayThreshold: "归档阈值",
				decayThresholdHelp: "权重低于此值的记忆自动移入归档区（默认 3）",
				consolidateThreshold: "巩固阈值",
				consolidateThresholdHelp: "被引用达到此次数后权重 +1（默认 3）",
				weightCap: "权重上限",
				weightCapHelp: "巩固加权的最高权重，防止膨胀（默认 20）",
				hotTokenLimit: "热区 token 上限",
				hotTokenLimitHelp: "会话启动注入记忆快照的 token 预算（默认 5000）",
				maxQueryResults: "查询上限",
				maxQueryResultsHelp: "一次查询最多返回的条目数（默认 20）",
				fallback: "审批降级策略",
				fallbackHelp: "审批不可用（策略 never/服务缺失）时：自动保存并审计标记，或拒绝写入（默认自动）",
				fallbackAuto: "自动保存（推荐）",
				fallbackDeny: "拒绝写入",
				autoDreamDays: "自动代谢周期（天，0=关闭）",
				autoDreamDaysHelp: "启动时距上次代谢超过此天数自动执行 dream（默认 7）",
				autoReflectDays: "自动反思周期（天，0=关闭）",
				autoReflectDaysHelp: "启动时距上次反思超过此天数自动执行（默认 3）",
				reset: "恢复默认",
				resetConfirm: "确定恢复全部默认设置？",
				petEndpoint: "本地通知服务 URL（可选，可为空）",
				petEndpointHelp: "用于本地通知服务的可选 URL（可为空，默认关闭）",
				save: "保存配置",
				saving: "保存中…",
				saved: "已保存",
				saveFailed: "保存失败",
				dream: "记忆代谢",
				runDream: "执行整理 (dream)",
				previewDream: "预览 (dry-run)",
				dreamRunning: "整理中…",
				dreamFailed: "整理失败",
				scanned: "扫描",
				decayed: "衰减",
				consolidated: "巩固",
				conflicted: "冲突",
				archived: "归档",
				backup: "备份",
				noItems: "（无条目）",
				runAudit: "最近审计",
				auditTitle: "审计记录",
				auditLoading: "读取中…",
				auditFailed: "审计读取失败",
				noAudit: "（暂无审计记录）",
				reflectRun: "执行深度反思",
				reflectPreview: "预览 (dry-run)",
				reflectRunning: "反思中…",
				reflectFailed: "反思失败",
				clustersTitle: "主题聚类",
				conflictsTitle: "潜在冲突",
				forgetTitle: "遗忘候选",
				reportFile: "报告",
				previewOnly: "（预览不落盘）",
				noClusters: "（暂无相似记忆聚类）",
				none: "（无）",
				ops: {
					decay: "衰减",
					consolidate: "巩固",
					conflict: "冲突",
					archive: "归档"
				},
				layers: {
					"hot/behavior": "行为热区",
					"hot/knowledge": "知识热区",
					"preferences": "偏好",
					"archive": "归档"
				}
			},
			en: {
				tab: "Memory",
				title: "Memory Workbench",
				subtitle: "Digital Hippocampus · 151 memories · semantic search ready",
				tabOverview: "Overview",
				tabKnowledge: "Knowledge",
				tabMetabolism: "Metabolism",
				tabReflect: "Reflect",
				tabSettings: "Settings",
				loading: "Reading status…",
				unavailable: "Runtime status is temporarily unavailable.",
				total: "All memories",
				totalNote: "total",
				pinned: "Pinned",
				pinnedNote: "pins",
				model: "Embedding",
				modelNote: "bge-zh · 512d",
				modelTag: "local offline",
				audit: "Metabolism",
				auditNote: "7d events",
				auditTag: "135 entries w≥10",
				vectorized: "vectorized",
				composition: "Composition",
				typeDist: "By type",
				weightDist: "By weight",
				recentActivity: "Recent activity",
				flow: "Memory flow",
				searchPlaceholder: "Search: e.g. mirror download, pet rules…",
				modeHybrid: "◉ Hybrid",
				modeExact: "○ Exact",
				modeSemantic: "○ Semantic",
				searchBtn: "Search",
				noEntries: "(no matching entries)",
				entriesLoading: "Loading…",
				entriesFailed: "Failed to load",
				allLayers: "All layers",
				pin: "Pin",
				unpin: "Unpin",
				remove: "Remove",
				removeConfirm: "Remove this entry? A backup is made first.",
				removedNote: "Removed (backed up, restorable)",
				undo: "Undo",
				edit: "Edit",
				saveEdit: "Save",
				cancel: "Cancel",
				editPlaceholder: "Edit memory content…",
				conflictBadge: "⚠ conflicts with preference",
				resolveHint: "Saving removes it from the list; re-run reflect to refresh",
				weight: "weight",
				hits: "hits",
				config: "Configuration",
				halfLifeDays: "Half-life (days)",
				halfLifeDaysHelp: "Weight halves after this many days (default 7)",
				decayThreshold: "Decay threshold",
				decayThresholdHelp: "Entries below this weight are archived (default 3)",
				consolidateThreshold: "Consolidate threshold",
				consolidateThresholdHelp: "References reaching this count add +1 (default 3)",
				weightCap: "Weight cap",
				weightCapHelp: "Max weight (default 20)",
				hotTokenLimit: "Hot token limit",
				hotTokenLimitHelp: "Snapshot token budget (default 5000)",
				maxQueryResults: "Max results",
				maxQueryResultsHelp: "Max entries per query (default 20)",
				fallback: "Approval fallback",
				fallbackHelp: "When approval unavailable: auto-save or deny (default auto)",
				fallbackAuto: "Auto-save",
				fallbackDeny: "Deny",
				autoDreamDays: "Auto-dream (days, 0=off)",
				autoDreamDaysHelp: "Run dream if older (default 7)",
				autoReflectDays: "Auto-reflect (days, 0=off)",
				autoReflectDaysHelp: "Run reflect if older (default 3)",
				reset: "Reset",
				resetConfirm: "Reset all settings?",
				petEndpoint: "Notify service URL (optional)",
				petEndpointHelp: "Optional local notification URL",
				save: "Save",
				saving: "Saving…",
				saved: "Saved",
				saveFailed: "Save failed",
				dream: "Metabolism",
				runDream: "Run dream",
				previewDream: "Preview (dry-run)",
				dreamRunning: "Running…",
				dreamFailed: "Failed",
				scanned: "Scanned",
				decayed: "decayed",
				consolidated: "consolidated",
				conflicted: "conflicted",
				archived: "archived",
				backup: "Backup",
				noItems: "(no items)",
				runAudit: "Recent audit",
				auditTitle: "Audit log",
				auditLoading: "Loading…",
				auditFailed: "Failed",
				noAudit: "(no audit entries)",
				reflectRun: "Run reflection",
				reflectPreview: "Preview (dry-run)",
				reflectRunning: "Reflecting…",
				reflectFailed: "Failed",
				clustersTitle: "Clusters",
				conflictsTitle: "Conflicts",
				forgetTitle: "Forget candidates",
				reportFile: "Report",
				previewOnly: "(preview)",
				noClusters: "(none)",
				none: "(none)",
				ops: {
					decay: "decay",
					consolidate: "consolidate",
					conflict: "conflict",
					archive: "archive"
				},
				layers: {
					"hot/behavior": "hot/behavior",
					"hot/knowledge": "hot/knowledge",
					"preferences": "preferences",
					"archive": "archive"
				}
			}
		};
		function text() {
			const primary = (navigator.languages?.[0] || navigator.language || "en").toLowerCase();
			return primary === "zh-cn" || primary.startsWith("zh-hans") ? copy["zh-CN"] : copy.en;
		}
		// 主题探测（双通道）：优先 DSH 前端标记（documentElement/body 的 data-ds-dark-theme），其次系统主题
		function detectDshTheme() {
			try {
				const attr = (document.documentElement.getAttribute("data-ds-dark-theme")) || (document.body.getAttribute("data-ds-dark-theme"));
				if (attr !== null && attr !== undefined && attr !== "") return attr === "light" ? "light" : "dark";
			} catch (error) {
				/* 探测失败则回退系统主题 */
			}
			return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
		}
		function applyDshTheme() {
			const theme = detectDshTheme();
			const roots = document.querySelectorAll(".bm-page");
			for (const root of roots) root.setAttribute("data-dsh-theme", theme);
		}
		const inject = ["slots"];
		// 现代极简：dsh-fuse 设计令牌（配色/间距/圆角/阴影唯一来源，见 ../dsh-fuse/config/theme.json themes.default）
		const styles = `
/* 令牌（唯一色值来源，只允许引用变量） */
.bm-page{--bm-primary:#7C3AED;--bm-secondary:#C026D3;--bm-accent:#0EA5E9;--bm-primary-soft:color-mix(in srgb,var(--bm-primary) 10%,transparent);--bm-secondary-soft:color-mix(in srgb,var(--bm-secondary) 10%,transparent);--bm-accent-soft:color-mix(in srgb,var(--bm-accent) 10%,transparent);--bm-blend:color-mix(in srgb,var(--bm-primary) 3%,var(--bm-surface));--bm-chip-bg:color-mix(in srgb,var(--bm-border) 45%,transparent);--bm-bg:#FFFFFF;--bm-surface:#F5F6F8;--bm-text:#1A1A1A;--bm-muted:#6B7280;--bm-border:#E5E7EB;--bm-success:#2E7D32;--bm-warning:#ED6C02;--bm-error:#C62828;--bm-radius-sm:8px;--bm-radius-md:12px;--bm-radius-lg:16px;--bm-space-xs:4px;--bm-space-sm:8px;--bm-space-md:16px;--bm-space-lg:24px;--bm-space-xl:32px;--bm-shadow-card:0 1px 3px rgba(26,26,26,.08);--bm-shadow-float:0 10px 30px rgba(26,26,26,.14);display:flex;flex-direction:column;gap:24px;width:100%;max-width:880px;margin:0 auto;padding:24px;box-sizing:border-box;background:linear-gradient(180deg,var(--dsw-alias-bg-layer-2,var(--bm-surface)),var(--bm-blend));border-radius:var(--bm-radius-lg);color:var(--dsw-alias-label-primary,var(--bm-text));font-size:14px;line-height:1.7}
.bm-page h3{margin:0;font-size:20px;font-weight:700;letter-spacing:-.01em;line-height:1.25}
.bm-page h4{margin:0 0 12px;font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px}
.bm-page h4::before{content:"";width:3px;height:14px;border-radius:999px;background:var(--bm-primary);flex:none}
.bm-sub{color:var(--dsw-alias-label-secondary,var(--bm-muted));font-size:14px;margin-top:4px}
.bm-tabs{display:flex;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2,var(--bm-border));margin-bottom:16px}
.bm-tab{padding:8px 14px;border:1px solid transparent;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,var(--bm-muted));font-size:14px;font-weight:500;cursor:pointer;transition:color .15s ease,background-color .15s ease,border-color .15s ease}
.bm-tab:hover{color:var(--bm-text);background:color-mix(in srgb,var(--bm-primary) 6%,transparent)}
.bm-tab.active{color:var(--bm-primary);border-bottom-color:var(--bm-primary);font-weight:600}
.bm-block{padding:24px;border:1px solid var(--dsw-alias-border-l2,var(--bm-border));border-radius:var(--bm-radius-lg);background:var(--dsw-alias-bg-layer-1,var(--bm-bg));display:flex;flex-direction:column;gap:16px;box-shadow:var(--bm-shadow-card)}
.bm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(166px,1fr));gap:16px}
.bm-card{padding:16px;border:1px solid var(--dsw-alias-border-l2,var(--bm-border));border-radius:var(--bm-radius-md);background:var(--dsw-alias-bg-layer-1,var(--bm-bg));display:flex;flex-direction:column;gap:4px;box-shadow:var(--bm-shadow-card)}
.bm-block .bm-card{background:var(--dsw-alias-bg-layer-2,var(--bm-surface));box-shadow:none}
.bm-card .v{font-size:28px;font-weight:700;color:var(--bm-text);letter-spacing:-.01em;line-height:1.25}
@supports ((background-clip:text) or (-webkit-background-clip:text)){.bm-card .v{background:linear-gradient(90deg,var(--bm-primary),var(--bm-secondary) 55%,var(--bm-accent));-webkit-background-clip:text;background-clip:text;color:transparent}}
.bm-card .l{color:var(--dsw-alias-label-secondary,var(--bm-muted));font-size:14px;font-weight:500}
.bm-card .n{font-size:12px;color:var(--dsw-alias-label-secondary,var(--bm-muted))}
.bm-badge{display:inline-flex;align-items:center;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;background:var(--bm-primary-soft);color:var(--bm-primary)}
.bm-badge.accent{background:var(--bm-accent-soft);color:var(--bm-accent)}
.bm-badge.secondary{background:var(--bm-secondary-soft);color:var(--bm-secondary)}
.bm-root{display:inline-block;padding:2px 8px;background:var(--dsw-alias-bg-layer-2,var(--bm-surface));border-radius:var(--bm-radius-sm);color:var(--dsw-alias-label-secondary,var(--bm-muted));font-size:12px;word-break:break-all;font-family:ui-monospace,Consolas,monospace}
.bm-config{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}
.bm-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.bm-field label{color:var(--bm-text);font-size:14px;font-weight:600}
.bm-field input[type=number],.bm-field select{height:38px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2,var(--bm-border));border-radius:var(--bm-radius-sm);background:var(--bm-bg);color:var(--bm-text);font-size:14px;min-width:0;transition:border-color .15s ease,box-shadow .15s ease}
.bm-field input[type=number]:focus,.bm-field select:focus{outline:none;border-color:var(--bm-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--bm-primary) 15%,transparent)}
.bm-wide{grid-column:1/-1}
.bm-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.bm-note{color:var(--dsw-alias-label-secondary,var(--bm-muted));font-size:14px}
.bm-ok{color:var(--bm-success);font-weight:500}
.bm-err{color:var(--bm-error);font-weight:500}
.bm-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;max-height:300px;overflow:auto;counter-reset:bm-n}
.bm-list li{padding:8px 12px;border-radius:var(--bm-radius-sm);background:var(--dsw-alias-bg-layer-2,var(--bm-surface));color:var(--bm-text);font-size:12px;word-break:break-all;border:1px solid var(--dsw-alias-border-l2,var(--bm-border));font-family:ui-monospace,Consolas,monospace;counter-increment:bm-n}
.bm-list li::before{content:counter(bm-n) ".";margin-right:8px;color:var(--dsw-alias-label-secondary,var(--bm-muted));font-weight:600}
.bm-summary{font-weight:600;color:var(--bm-text)}
.bm-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.bm-toolbar select{height:38px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2,var(--bm-border));border-radius:var(--bm-radius-sm);background:var(--bm-bg);color:var(--bm-text);font-size:14px}
.bm-entries{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;max-height:560px;overflow:auto}
.bm-entry{padding:16px;border:1px solid var(--dsw-alias-border-l2,var(--bm-border));border-left:3px solid var(--bm-border);border-radius:var(--bm-radius-md);background:var(--dsw-alias-bg-layer-1,var(--bm-bg));transition:box-shadow .15s ease,border-color .15s ease,filter .15s ease}
.bm-entry.t-pref{border-left-color:var(--bm-primary)}
.bm-entry.t-fact{border-left-color:var(--bm-accent)}
.bm-entry.t-sec{border-left-color:var(--bm-secondary)}
.bm-entry:hover{box-shadow:var(--bm-shadow-card)}
.bm-entry.pinned{border-color:color-mix(in srgb,var(--bm-primary) 45%,var(--bm-border));background:color-mix(in srgb,var(--bm-primary) 5%,var(--bm-bg))}
.bm-entry.conflict{border-color:color-mix(in srgb,var(--bm-error) 55%,var(--bm-border));background:color-mix(in srgb,var(--bm-error) 4%,var(--bm-bg));box-shadow:inset 3px 0 0 var(--bm-error)}
.bm-entry-text{color:var(--bm-text);font-size:14px;word-break:break-all}
.bm-badge-conflict{display:inline-block;margin-right:6px;padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--bm-error) 10%,transparent);color:var(--bm-error);font-size:12px;font-weight:600;vertical-align:1px}
.bm-entry-edit{display:flex;flex-direction:column;gap:8px;flex:1;min-width:0;width:100%}
.bm-conflict-item .bm-entry-edit{flex:1 1 100%;min-width:0}
.bm-entry-textarea{width:100%;min-height:96px;padding:12px 16px;border:1px solid var(--bm-border);border-radius:var(--bm-radius-sm);background:var(--bm-bg);color:var(--bm-text);font-size:14px;line-height:1.7;font-family:inherit;resize:vertical;box-sizing:border-box;transition:border-color .15s ease,box-shadow .15s ease}
.bm-entry-textarea:focus{outline:none;border-color:var(--bm-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--bm-primary) 15%,transparent)}
.bm-entry-meta{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;color:var(--dsw-alias-label-secondary,var(--bm-muted));font-size:12px}
.bm-entry-meta .bm-chip{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;background:var(--bm-chip-bg);color:var(--dsw-alias-label-secondary,var(--bm-muted));font-size:12px;font-weight:500}
.bm-entry-meta .bm-chip.c-pref{background:var(--bm-primary-soft);color:var(--bm-primary)}
.bm-entry-meta .bm-chip.c-fact{background:var(--bm-accent-soft);color:var(--bm-accent)}
.bm-entry-meta .bm-chip.c-sec{background:var(--bm-secondary-soft);color:var(--bm-secondary)}
.bm-entry-ops{display:flex;gap:6px;margin-left:auto;align-items:center}
.bm-cluster{margin:0;padding:16px;border:1px solid var(--dsw-alias-border-l2,var(--bm-border));border-radius:var(--bm-radius-md);background:var(--dsw-alias-bg-layer-2,var(--bm-surface))}
.bm-conflict-item{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--bm-error) 35%,var(--bm-border));border-radius:var(--bm-radius-sm);background:color-mix(in srgb,var(--bm-error) 4%,var(--bm-bg));box-shadow:inset 3px 0 0 var(--bm-error)}
.bm-undo-bar{display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--dsw-alias-border-l2,var(--bm-border));border-radius:var(--bm-radius-md);background:var(--dsw-alias-bg-layer-2,var(--bm-surface));font-size:12px;color:var(--dsw-alias-label-secondary,var(--bm-muted))}
.bm-conflict-item + .bm-conflict-item{margin-top:8px}
.bm-conflict-text{flex:1;min-width:0;font-size:14px;color:var(--bm-error);word-break:break-all}
.bm-cluster-title{font-weight:600;color:var(--bm-text);font-size:14px;margin-bottom:4px}
.bm-cluster ul{margin:0;padding-left:18px;color:var(--dsw-alias-label-secondary,var(--bm-muted));font-size:14px}
/* 概览：构成三卡 + 记忆流 */
.bm-mode-row{display:flex;gap:8px;flex-wrap:wrap}
.bm-mode-btn{padding:6px 14px;border:1px solid var(--dsw-alias-border-l2,var(--bm-border));border-radius:var(--bm-radius-sm);background:var(--bm-bg);color:var(--dsw-alias-label-secondary,var(--bm-muted));font-size:12px;font-weight:500;cursor:pointer;transition:all .15s ease}
.bm-mode-btn:hover{border-color:var(--bm-primary);color:var(--bm-primary)}
.bm-mode-btn.active{border-color:var(--bm-primary);background:color-mix(in srgb,var(--bm-primary) 8%,var(--bm-bg));color:var(--bm-primary);font-weight:600;box-shadow:0 0 0 1px color-mix(in srgb,var(--bm-primary) 15%,transparent)}
.bm-search-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.bm-search-row input{flex:1;min-width:200px;height:40px;padding:0 14px;border:1px solid var(--dsw-alias-border-l2,var(--bm-border));border-radius:var(--bm-radius-sm);background:var(--bm-bg);color:var(--dsw-alias-label-primary,var(--bm-text));font-size:14px;transition:border-color .15s ease,box-shadow .15s ease}
.bm-search-row input::placeholder{color:var(--dsw-alias-label-secondary,var(--bm-muted))}
.bm-search-row input:focus{outline:none;border-color:var(--bm-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--bm-primary) 15%,transparent)}
.bm-flow-entry{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l2,var(--bm-border));position:relative;transition:filter .15s ease}
.bm-flow-entry:not(:last-child)::after{content:"";position:absolute;left:3px;top:12px;bottom:-8px;width:1.5px;background:var(--dsw-alias-border-l2,var(--bm-border));transition:background .15s ease}
.bm-flow-entry:hover::after{background:color-mix(in srgb,var(--bm-primary) 30%,var(--bm-border))}
.bm-flow-entry:last-child{border-bottom:0}
.bm-flow-mark{flex:none;width:8px;height:8px;border-radius:50%;margin-top:6px;background:color-mix(in srgb,var(--bm-muted) 45%,transparent)}
.bm-flow-mark.gold{background:var(--bm-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--bm-primary) 15%,transparent)}
.bm-flow-mark.red{background:var(--bm-error);box-shadow:0 0 0 3px color-mix(in srgb,var(--bm-error) 15%,transparent)}
.bm-flow-mark.c-pref{background:var(--bm-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--bm-primary) 15%,transparent)}
.bm-flow-mark.c-fact{background:var(--bm-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--bm-accent) 15%,transparent)}
.bm-flow-mark.c-sec{background:var(--bm-secondary);box-shadow:0 0 0 3px color-mix(in srgb,var(--bm-secondary) 15%,transparent)}
.bm-flow-text{flex:1;min-width:0}
.bm-flow-text .t{font-size:14px;color:var(--bm-text);word-break:break-all}
.bm-flow-text .d{font-size:12px;color:var(--dsw-alias-label-secondary,var(--bm-muted));margin-top:2px}
.bm-flow-op{margin-left:auto;flex:none}
/* 构成图表：行内紧凑条 */
.bm-chart{display:flex;flex-direction:column;gap:8px;padding:4px 0}
.bm-chart-row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary,var(--bm-muted))}
.bm-chart-row .lbl{width:56px;flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bm-chart-row .track{flex:1;max-width:170px;height:8px;border-radius:999px;background:color-mix(in srgb,var(--bm-muted) 12%,transparent);overflow:hidden}
.bm-chart-row .fill{height:100%;border-radius:999px;min-width:2px}
.bm-chart-row .val{width:32px;flex:none;text-align:right;font-family:ui-monospace,Consolas,monospace;color:var(--bm-text)}
.bm-chart-row .pct{width:36px;flex:none;text-align:right;color:var(--dsw-alias-label-secondary,var(--bm-muted))}
/* 深色令牌覆盖（dsh-fuse themes.dark + 记忆品牌扩展：紫/粉紫/青 三层） */
.bm-page[data-dsh-theme="dark"]{--bm-primary:#A78BFA;--bm-secondary:#F0ABFC;--bm-accent:#22D3EE;--bm-bg:#0F1115;--bm-surface:#1A1D23;--bm-text:#E8EAED;--bm-muted:#9AA0A6;--bm-border:#2A2E37;--bm-success:#34D399;--bm-warning:#FBBF24;--bm-error:#F87171;--bm-shadow-card:0 1px 3px rgba(0,0,0,.4);--bm-shadow-float:0 10px 30px rgba(0,0,0,.5)}
.bm-page[data-dsh-theme="dark"] .bm-tab:hover{background:color-mix(in srgb,var(--bm-primary) 12%,transparent)}
.bm-page[data-dsh-theme="dark"] .bm-entry:hover,.bm-page[data-dsh-theme="dark"] .bm-flow-entry:hover{filter:brightness(1.06)}
.bm-page[data-dsh-theme="dark"] .bm-field input[type=number]:focus,.bm-page[data-dsh-theme="dark"] .bm-field select:focus,.bm-page[data-dsh-theme="dark"] .bm-search-row input:focus,.bm-page[data-dsh-theme="dark"] .bm-entry-textarea:focus{box-shadow:0 0 0 3px color-mix(in srgb,var(--bm-primary) 25%,transparent)}
.bm-page[data-dsh-theme="dark"] .bm-entry.conflict{background:color-mix(in srgb,var(--bm-error) 8%,var(--bm-bg))}
.bm-page[data-dsh-theme="dark"] .bm-conflict-item{background:color-mix(in srgb,var(--bm-error) 8%,var(--bm-bg))}
.bm-page[data-dsh-theme="dark"] .bm-badge-conflict{background:color-mix(in srgb,var(--bm-error) 16%,transparent)}
`;
		const CONFIG_KEYS = ["halfLifeDays", "decayThreshold", "consolidateThreshold", "weightCap", "hotTokenLimit", "maxQueryResults", "autoDreamDays", "autoReflectDays"];
		const { Button, Input, StateDot, IconSearchOutline16, IconTrashOutline16, IconRefreshOutline14, IconCheckOutline16, IconWarningOutline16, IconThinkOutline14, IconSettingsOutline16, IconLinkOutline14, IconBrowseOutline16 } = prim;
		function BiomemorySettingsPage() {
			const t = text();
			const [status, setStatus] = react.useState({ kind: "loading" });
			const [configText, setConfigText] = react.useState({});
			const [petEndpoint, setPetEndpoint] = react.useState("");
			const [fallback, setFallback] = react.useState("auto");
			const [saveState, setSaveState] = react.useState(null);
			const [dream, setDream] = react.useState(null);
			const [audit, setAudit] = react.useState(null);
			const [tab, setTab] = react.useState("overview");
			const [searchText, setSearchText] = react.useState("");
			const [searchMode, setSearchMode] = react.useState("hybrid");
			const [layerSel, setLayerSel] = react.useState("");
			const [knowledge, setKnowledge] = react.useState({ kind: "idle", entries: [] });
			const [reflect, setReflect] = react.useState(null);
			const [editingFp, setEditingFp] = react.useState(null);
			const [editingText, setEditingText] = react.useState("");
			const [lastRemoved, setLastRemoved] = react.useState(null);
			const loadStatus = react.useCallback(() => {
				const controller = new AbortController();
				fetch("/biomemory/api/status", {
					credentials: "same-origin",
					signal: controller.signal
				}).then(async (response) => {
					if (!response.ok) throw new Error("status unavailable");
					const data = await response.json();
					if (!data?.ok) throw new Error("status unavailable");
					const cfg = data.config || {};
					const textForm = {};
					for (const key of CONFIG_KEYS) textForm[key] = cfg[key] !== void 0 ? String(cfg[key]) : "";
					setConfigText(textForm);
					setPetEndpoint(data.petEndpoint || "");
					setFallback(data.config?.approvalFallback || "auto");
					setStatus({ kind: "ready", value: data });
				}).catch(() => setStatus({ kind: "error" }));
				return () => controller.abort();
			}, []);
			react.useEffect(() => loadStatus(), [loadStatus]);
			// 挂载时给 .bm-page 打上 data-dsh-theme，并监听系统主题变化实时更新（纯 JS，不动 DOM 结构）
			react.useEffect(() => {
				applyDshTheme();
				if (typeof window.matchMedia !== "function") return void 0;
				const mq = window.matchMedia("(prefers-color-scheme: dark)");
				const onChange = () => applyDshTheme();
				if (typeof mq.addEventListener === "function") {
					mq.addEventListener("change", onChange);
					return () => mq.removeEventListener("change", onChange);
				}
				if (typeof mq.addListener === "function") {
					mq.addListener(onChange);
					return () => mq.removeListener(onChange);
				}
				return void 0;
			});
			const saveConfig = () => {
				setSaveState({ kind: "saving" });
				const body = {};
				for (const key of CONFIG_KEYS) { const value = configText[key]; if (value !== void 0 && value !== "") body[key] = Number(value); }
				body.petEndpoint = petEndpoint.trim() !== "" ? petEndpoint.trim() : null;
				body.approvalFallback = fallback === "deny" ? "deny" : "auto";
				fetch("/biomemory/api/config", {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body)
				}).then(async (response) => {
					if (!response.ok) throw new Error("save failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("save failed");
					if (data.petEndpoint !== void 0) setPetEndpoint(data.petEndpoint || "");
					setSaveState({ kind: "ok" });
					loadStatus();
				}).catch(() => setSaveState({ kind: "error" }));
			};
			const resetConfig = () => {
				if (!window.confirm(t.resetConfirm)) return;
				setSaveState({ kind: "saving" });
				fetch("/biomemory/api/config", {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ reset: true })
				}).then(async (response) => {
					if (!response.ok) throw new Error("reset failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("reset failed");
					setPetEndpoint(data.petEndpoint || "");
					setFallback(data.config?.approvalFallback || "auto");
					const textForm = {};
					for (const key of CONFIG_KEYS) textForm[key] = data.config[key] !== void 0 ? String(data.config[key]) : "";
					setConfigText(textForm);
					setSaveState({ kind: "ok" });
					loadStatus();
				}).catch(() => setSaveState({ kind: "error" }));
			};
			const runDream = (dryRun) => {
				setDream({ kind: "running", dryRun });
				fetch("/biomemory/api/dream", {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ dryRun })
				}).then(async (response) => {
					if (!response.ok) throw new Error("dream failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("dream failed");
					setDream({ kind: "done", dryRun, report: data.report || {} });
					if (!dryRun) loadStatus();
				}).catch(() => setDream({ kind: "error", dryRun }));
			};
			const runAudit = () => {
				setAudit({ kind: "loading" });
				fetch("/biomemory/api/audit?sinceDays=30", { credentials: "same-origin" })
					.then(async (response) => {
						if (!response.ok) throw new Error("audit failed");
						const data = await response.json();
						if (!data?.ok) throw new Error("audit failed");
						setAudit({ kind: "done", entries: data.entries || [] });
					}).catch(() => setAudit({ kind: "error" }));
			};
			const loadEntries = (q, layer) => {
				const query = q !== void 0 ? q : searchText;
				const lay = layer !== void 0 ? layer : layerSel;
				setKnowledge({ kind: "loading", entries: [] });
				const params = new URLSearchParams();
				if (query) params.set("q", query);
				if (lay) params.set("layer", lay);
				params.set("mode", searchMode);
				fetch(`/biomemory/api/entries?${params.toString()}`, { credentials: "same-origin" })
					.then(async (response) => {
						if (!response.ok) throw new Error("entries failed");
						const data = await response.json();
						if (!data?.ok) throw new Error("entries failed");
						setKnowledge({ kind: "ready", entries: data.entries || [] });
					}).catch(() => setKnowledge({ kind: "error", entries: [] }));
			};
			const entryOp = (fp, op, text) => {
				const body = { fp };
				if (text !== void 0) body.text = text;
				fetch(`/biomemory/api/entries/${op}`, {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body)
				}).then(async (response) => {
					if (!response.ok) throw new Error(`${op} failed`);
					const data = await response.json();
					if (!data?.ok) throw new Error(`${op} failed`);
					if (op === "update") { setEditingFp(null); setEditingText(""); }
					loadEntries();
				}).catch(() => {});
			};
			const startEdit = (entry) => { setEditingFp(entry.fp); setEditingText(entry.text); };
			const cancelEdit = () => { setEditingFp(null); setEditingText(""); };
			// 编辑框横向形态：宽度撑满整行（flex 收缩修复），高度适中，长文本按行数自适应
			const editBoxStyle = () => ({
				minHeight: 96,
				height: Math.max(96, Math.min(260, Math.ceil(editingText.length / 45) * 26 + 30)),
				fontSize: 14,
				lineHeight: 1.7
			});
			// 反思页裁决冲突：就地编辑保存 → 从冲突列表移除（改掉冲突内容后不再冲突）
			const resolveConflict = (fp, text) => {
				if (!String(text || "").trim()) return;
				fetch("/biomemory/api/entries/update", {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ fp, text: String(text).trim() })
				}).then(async (response) => {
					if (!response.ok) throw new Error("update failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("update failed");
					setReflect((prev) => {
						if (!prev || prev.kind !== "done") return prev;
						const report = { ...prev.report, conflicts: (prev.report.conflicts || []).filter((c) => c.fp !== fp) };
						return { ...prev, report };
					});
					setEditingFp(null); setEditingText("");
					loadEntries();
				}).catch(() => {});
			};
			// 反思页删除冲突条目（仅限潜在冲突列表）：先备份可回滚，删除后从列表移除
			const removeConflict = (fp, text) => {
				fetch("/biomemory/api/entries/remove", {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ fp })
				}).then(async (response) => {
					if (!response.ok) throw new Error("remove failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("remove failed");
					setReflect((prev) => {
						if (!prev || prev.kind !== "done") return prev;
						const report = { ...prev.report, conflicts: (prev.report.conflicts || []).filter((c) => c.fp !== fp) };
						return { ...prev, report };
					});
					setEditingFp(null); setEditingText("");
					setLastRemoved({ fp, text: String(text || "").slice(0, 60) });
					loadEntries();
				}).catch(() => {});
			};
			// 撤销删除：从备份回滚单条目，加回冲突列表
			const undoRemove = () => {
				if (!lastRemoved) return;
				const fp = lastRemoved.fp;
				fetch("/biomemory/api/entries/restore", {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ fp })
				}).then(async (response) => {
					if (!response.ok) throw new Error("restore failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("restore failed");
					setReflect((prev) => {
						if (!prev || prev.kind !== "done") return prev;
						const conflicts = prev.report.conflicts || [];
						if (conflicts.some((c) => c.fp === fp)) return prev;
						return { ...prev, report: { ...prev.report, conflicts: [...conflicts, { layer: data.layer || "hot/behavior", fp, text: data.text }] } };
					});
					setLastRemoved(null);
					loadEntries();
				}).catch(() => {});
			};
			const runReflect = (dryRun) => {
				setReflect({ kind: "running", dryRun });
				fetch("/biomemory/api/reflect", {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ dryRun })
				}).then(async (response) => {
					if (!response.ok) throw new Error("reflect failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("reflect failed");
					setReflect({ kind: "done", dryRun, report: data.report || {} });
				}).catch(() => setReflect({ kind: "error", dryRun }));
			};
			const opName = (op) => t.ops[op] || op;
			const layerName = (layer) => t.layers[layer] || layer;
			if (status.kind === "loading") {
				return (0, react.createElement)("div", { className: "bm-page" }, (0, react.createElement)("style", null, styles), (0, react.createElement)("h3", null, t.title), (0, react.createElement)("div", { className: "bm-note" }, t.loading));
			}
			if (status.kind === "error") {
				return (0, react.createElement)("div", { className: "bm-page" }, (0, react.createElement)("style", null, styles), (0, react.createElement)("h3", null, t.title), (0, react.createElement)("div", { className: "bm-note" }, t.unavailable));
			}
			const stats = status.value.stats || {};
			const layers = stats.layers || {};
			const modelReady = !!(stats.model && stats.model.ready);
			const byType = stats.byType || [];
			const byWeight = stats.byWeight || [];
			const audit7d = stats.audit7d || [];
			// ---------- 概览页 ----------
			const overviewCards = [
				[t.total, String(stats.total === void 0 ? "—" : stats.total), t.totalNote, stats.vectors !== void 0 ? `${t.vectorized} ${stats.vectors}/${stats.total}` : "", ""],
				[t.pinned, String(stats.pinned === void 0 ? "—" : stats.pinned), t.pinnedNote, "", ""],
				[t.model, modelReady ? "512维" : "降级", t.modelNote, modelReady ? t.modelTag : "keyword", "accent"],
				[t.audit, String(stats.auditCount === void 0 ? "—" : stats.auditCount), t.auditNote, byWeight.find((r) => r.key === "10+") ? `10+ 权重 ${byWeight.find((r) => r.key === "10+").count} 条` : "", "secondary"]
			].map(([title, value, note, tag, tone]) => (0, react.createElement)("div", {
				key: title,
				className: "bm-card"
			}, (0, react.createElement)("div", { className: "v" }, value), (0, react.createElement)("div", { className: "l" }, title), note ? (0, react.createElement)("div", { className: "n" }, note) : null, tag ? (0, react.createElement)("span", { className: "bm-badge" + (tone ? " " + tone : "") }, tag) : null));
			// 品牌三色分配（功能色映射：偏好=紫 / 事实知识=青 / 其余行为笔记=粉紫），语义状态色（红/黄/绿）保留
			const typeTone = (entry) => {
				const k = entry.fragment_type || entry.kind || "note";
				return k === "preference" ? "pref" : (k === "fact" || k === "knowledge") ? "fact" : "sec";
			};
			const typeColor = (k) => k === "preference" ? "var(--bm-primary)" : (k === "fact" || k === "knowledge") ? "var(--bm-accent)" : "var(--bm-secondary)";
			const typeRows = byType.map((r) => {
				const pct = stats.total ? Math.round(r.count / stats.total * 100) : 0;
				return (0, react.createElement)("div", { key: r.key, className: "bm-chart-row" }, (0, react.createElement)("span", { className: "lbl" }, r.key), (0, react.createElement)("div", { className: "track" }, (0, react.createElement)("div", { className: "fill", style: { width: pct + "%", background: typeColor(r.key) } })), (0, react.createElement)("span", { className: "val" }, String(r.count)), (0, react.createElement)("span", { className: "pct" }, pct + "%"));
			});
			const weightRows = byWeight.map((r) => {
				const max = Math.max(1, ...byWeight.map((x) => x.count));
				const pct = Math.round(r.count / max * 100);
				return (0, react.createElement)("div", { key: r.key, className: "bm-chart-row" }, (0, react.createElement)("span", { className: "lbl" }, r.key === "10+" ? "≥10" : r.key), (0, react.createElement)("div", { className: "track" }, (0, react.createElement)("div", { className: "fill", style: { width: pct + "%", background: r.key === "10+" ? "var(--bm-primary)" : r.key === "5-9" ? "var(--bm-accent)" : "var(--bm-secondary)" } })), (0, react.createElement)("span", { className: "val" }, String(r.count)), (0, react.createElement)("span", { className: "pct" }, pct + "%"));
			});
			const activityItems = audit7d.slice(0, 5).map((r) => {
				const labels = { RECOVER: "恢复", MIGRATE: "迁移", RECALL: "召回", WRITE: "写入", DECAY: "衰减", ARCHIVE: "归档", CONSOLIDATE: "巩固", CONFLICT: "冲突", PIN: "锁定", UNPIN: "解锁" };
				return (0, react.createElement)("li", { key: r.key }, `${r.key} ${labels[r.key] || ""} ×${r.count}`);
			});
			const compositionSection = (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.composition), (0, react.createElement)("div", { className: "bm-grid" }, (0, react.createElement)("div", { className: "bm-card" }, (0, react.createElement)("div", { className: "l" }, t.typeDist), (0, react.createElement)("div", { className: "bm-chart" }, typeRows)), (0, react.createElement)("div", { className: "bm-card" }, (0, react.createElement)("div", { className: "l" }, t.weightDist), (0, react.createElement)("div", { className: "bm-chart" }, weightRows)), (0, react.createElement)("div", { className: "bm-card" }, (0, react.createElement)("div", { className: "l" }, t.recentActivity), activityItems.length ? (0, react.createElement)("ul", { className: "bm-list" }, activityItems) : (0, react.createElement)("div", { className: "bm-note" }, t.noAudit))));
			const modeBtn = (id, label) => (0, react.createElement)("button", {
				key: id,
				className: searchMode === id ? "bm-mode-btn active" : "bm-mode-btn",
				onClick: () => {
					setSearchMode(id);
					if (searchText) loadEntries(searchText, void 0);
				}
			}, label);
			const flowSection = (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.flow), (0, react.createElement)("div", { className: "bm-mode-row" }, modeBtn("hybrid", t.modeHybrid), modeBtn("exact", t.modeExact), modeBtn("semantic", t.modeSemantic)), (0, react.createElement)("div", { className: "bm-search-row" }, (0, react.createElement)("input", {
				type: "text",
				placeholder: t.searchPlaceholder,
				value: searchText,
				onChange: (event) => setSearchText(event.target.value),
				onKeyDown: (event) => { if (event.key === "Enter") loadEntries(); }
			}), (0, react.createElement)(Button, { variant: "primary", onClick: () => loadEntries() }, t.searchBtn)), (() => {
				if (knowledge.kind === "loading") return (0, react.createElement)("div", { className: "bm-note" }, t.entriesLoading);
				if (knowledge.kind === "error") return (0, react.createElement)("div", { className: "bm-err" }, t.entriesFailed);
				const entries = knowledge.entries || [];
				if (entries.length === 0) return (0, react.createElement)("div", { className: "bm-note" }, t.noEntries);
				return (0, react.createElement)("div", null, entries.slice(0, 8).map((entry) => {
					const isPinned = !!entry.pinned;
					const isConflict = entry.status === "conflict";
					return (0, react.createElement)("div", {
						key: entry.fp,
						className: "bm-flow-entry"
					}, (0, react.createElement)("span", { className: "bm-flow-mark" + (isPinned ? " gold" : "") + (isConflict ? " red" : "") + (!isPinned && !isConflict ? " c-" + typeTone(entry) : "") }), (0, react.createElement)("div", { className: "bm-flow-text" }, (0, react.createElement)("div", { className: "t" }, isConflict ? (0, react.createElement)("span", { className: "bm-badge-conflict" }, t.conflictBadge) : null, entry.text), (0, react.createElement)("div", { className: "d" }, `${entry.fragment_type || entry.kind || "note"} · 权重 ${entry.weight}${isPinned ? " · 锁定" : ""}`)), (0, react.createElement)("div", { className: "bm-flow-op" }, (0, react.createElement)(Button, {
						variant: "ghost",
						size: "sm",
						onClick: () => entryOp(entry.fp, isPinned ? "unpin" : "pin")
					}, isPinned ? t.unpin : t.pin)));
				}));
			})());
			const overviewSection = (0, react.createElement)(react.Fragment, null, (0, react.createElement)("div", { className: "bm-grid" }, ...overviewCards), compositionSection, flowSection);
			// ---------- 设置 ----------
			const configFields = CONFIG_KEYS.map((key) => {
				const labels = {
					halfLifeDays: t.halfLifeDays,
					decayThreshold: t.decayThreshold,
					consolidateThreshold: t.consolidateThreshold,
					weightCap: t.weightCap,
					hotTokenLimit: t.hotTokenLimit,
					maxQueryResults: t.maxQueryResults,
					autoDreamDays: t.autoDreamDays,
					autoReflectDays: t.autoReflectDays
				};
				const helps = {
					halfLifeDays: t.halfLifeDaysHelp,
					decayThreshold: t.decayThresholdHelp,
					consolidateThreshold: t.consolidateThresholdHelp,
					weightCap: t.weightCapHelp,
					hotTokenLimit: t.hotTokenLimitHelp,
					maxQueryResults: t.maxQueryResultsHelp,
					autoDreamDays: t.autoDreamDaysHelp,
					autoReflectDays: t.autoReflectDaysHelp
				};
				return (0, react.createElement)("div", {
					key,
					className: "bm-field"
				}, (0, react.createElement)("label", null, labels[key]), (0, react.createElement)("input", {
					type: "number",
					value: configText[key] !== void 0 ? configText[key] : "",
					onChange: (event) => setConfigText({ ...configText, [key]: event.target.value })
				}), (0, react.createElement)("span", { className: "bm-note" }, helps[key]));
			});
			const dreamSection = (() => {
				if (dream === null) return null;
				if (dream.kind === "running") return (0, react.createElement)("div", { className: "bm-note" }, t.dreamRunning);
				if (dream.kind === "error") return (0, react.createElement)("div", { className: "bm-err" }, `${t.dreamFailed}${dream.dryRun ? " (dry-run)" : ""}`);
				const r = dream.report || {};
				const items = (r.items || []).slice(0, 20);
				return (0, react.createElement)("div", { className: "bm-actions", style: { flexDirection: "column", alignItems: "stretch", gap: 8 } }, (0, react.createElement)("div", { className: "bm-summary" }, `${t.scanned} ${r.scanned}：${t.decayed} ${r.decayed} · ${t.consolidated} ${r.consolidated} · ${t.conflicted} ${r.conflicted} · ${t.archived} ${r.archived}`), r.backup ? (0, react.createElement)("div", { className: "bm-root" }, `${t.backup}：${r.backup}`) : null, items.length === 0 ? (0, react.createElement)("div", { className: "bm-note" }, t.noItems) : (0, react.createElement)("ul", { className: "bm-list" }, items.map((item, index) => {
					const to = item.to ? ` → ${item.to}` : "";
					return (0, react.createElement)("li", { key: index }, `${opName(item.op)} [${item.layer}] ${item.fp}${to}`);
				})));
			})();
			const auditSection = (() => {
				if (audit === null) return null;
				if (audit.kind === "loading") return (0, react.createElement)("div", { className: "bm-note" }, t.auditLoading);
				if (audit.kind === "error") return (0, react.createElement)("div", { className: "bm-err" }, t.auditFailed);
				const entries = (audit.entries || []).slice(0, 20);
				if (entries.length === 0) return (0, react.createElement)("div", { className: "bm-note" }, t.noAudit);
				return (0, react.createElement)("ul", { className: "bm-list" }, entries.map((entry, index) => (0, react.createElement)("li", { key: index }, `${(entry.t || "").slice(0, 16)} ${entry.action || entry.event || ""} ${entry.entry_id || entry.fp || ""} ${entry.detail || entry.text || ""}`)));
			})();
			const saveNote = saveState === null ? null : saveState.kind === "saving" ? (0, react.createElement)("span", { className: "bm-note" }, t.saving) : saveState.kind === "ok" ? (0, react.createElement)("span", { className: "bm-ok" }, t.saved) : (0, react.createElement)("span", { className: "bm-err" }, t.saveFailed);
			const settingsSection = (0, react.createElement)(react.Fragment, null, (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.config), (0, react.createElement)("div", { className: "bm-config" }, ...configFields, (0, react.createElement)("div", { className: "bm-field bm-wide" }, (0, react.createElement)("label", null, t.fallback), (0, react.createElement)("select", { value: fallback, onChange: (event) => setFallback(event.target.value) }, (0, react.createElement)("option", { value: "auto" }, t.fallbackAuto), (0, react.createElement)("option", { value: "deny" }, t.fallbackDeny)), (0, react.createElement)("span", { className: "bm-note" }, t.fallbackHelp)), (0, react.createElement)("div", { className: "bm-field bm-wide" }, (0, react.createElement)("label", null, t.petEndpoint), (0, react.createElement)(Input, {
				icon: (0, react.createElement)(IconLinkOutline14, { size: 14 }),
				type: "text",
				value: petEndpoint,
				placeholder: "https://example.com/notify",
				onChange: (event) => setPetEndpoint(event.target.value),
				style: { width: "100%" }
			}), (0, react.createElement)("span", { className: "bm-note" }, t.petEndpointHelp))), (0, react.createElement)("div", { className: "bm-actions" }, (0, react.createElement)(Button, {
				variant: "primary",
				disabled: saveState !== null && saveState.kind === "saving",
				onClick: saveConfig
			}, t.save), (0, react.createElement)(Button, {
				variant: "outline",
				disabled: saveState !== null && saveState.kind === "saving",
				onClick: resetConfig
			}, t.reset), saveNote)), stats.dbPath ? (0, react.createElement)("div", { className: "bm-root" }, `SQLite：${stats.dbPath}`) : null, stats.migration && stats.migration.migrated ? (0, react.createElement)("div", { className: "bm-note" }, `Markdown 已迁移至 SQLite（${(stats.migration.migratedAt || "").slice(0, 16)}）`) : null);
			// ---------- 代谢 ----------
			const metabolismSection = (0, react.createElement)(react.Fragment, null, (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.dream), (0, react.createElement)("div", { className: "bm-actions" }, (0, react.createElement)(Button, {
				variant: "primary",
				disabled: dream !== null && dream.kind === "running",
				onClick: () => runDream(false)
			}, t.runDream), (0, react.createElement)(Button, {
				variant: "outline",
				disabled: dream !== null && dream.kind === "running",
				onClick: () => runDream(true)
			}, t.previewDream)), dreamSection), (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.auditTitle), (0, react.createElement)("div", { className: "bm-actions" }, (0, react.createElement)(Button, {
				variant: "outline",
				disabled: audit !== null && audit.kind === "loading",
				onClick: runAudit
			}, (0, react.createElement)(IconRefreshOutline14, { size: 14 }), " ", t.runAudit)), auditSection));
			// ---------- 知识库 ----------
			const layerOptions = Object.keys(layers).sort().map((layer) => (0, react.createElement)("option", { key: layer, value: layer }, layerName(layer)));
			const knowledgeBody = (() => {
				if (knowledge.kind === "loading") return (0, react.createElement)("div", { className: "bm-note" }, t.entriesLoading);
				if (knowledge.kind === "error") return (0, react.createElement)("div", { className: "bm-err" }, t.entriesFailed);
				if (knowledge.kind === "idle" || knowledge.entries.length === 0) return (0, react.createElement)("div", { className: "bm-note" }, t.noEntries);
				return (0, react.createElement)("ul", { className: "bm-entries" }, knowledge.entries.map((entry) => {
					const isConflict = entry.status === "conflict";
					const isEditing = editingFp === entry.fp;
					return (0, react.createElement)("li", {
						key: entry.fp,
						className: "bm-entry" + (entry.pinned ? " pinned" : "") + (isConflict ? " conflict" : "") + " t-" + typeTone(entry)
					}, isEditing ? (0, react.createElement)("div", { className: "bm-entry-edit" }, (0, react.createElement)("textarea", {
						className: "bm-entry-textarea",
						style: editBoxStyle(),
						value: editingText,
						onChange: (event) => setEditingText(event.target.value)
					}), (0, react.createElement)("div", { className: "bm-entry-ops" }, (0, react.createElement)(Button, {
						variant: "primary",
						size: "sm",
						onClick: () => { if (editingText.trim()) entryOp(entry.fp, "update", editingText.trim()); }
					}, t.saveEdit), (0, react.createElement)(Button, {
						variant: "ghost",
						size: "sm",
						onClick: cancelEdit
					}, t.cancel))) : (0, react.createElement)("div", { className: "bm-entry-text" }, entry.text), (0, react.createElement)("div", { className: "bm-entry-meta" }, (0, react.createElement)("span", { className: "bm-chip c-" + typeTone(entry) }, `[${layerName(entry.layer)}]`), entry.pinned ? (0, react.createElement)("span", { className: "bm-ok" }, "PIN") : null, isConflict ? (0, react.createElement)("span", { className: "bm-badge-conflict" }, t.conflictBadge) : null, entry.mode ? (0, react.createElement)("span", { className: "bm-chip" }, entry.mode) : null, (0, react.createElement)("span", { className: "bm-chip" }, `${t.weight} ${entry.weight}`), (0, react.createElement)("span", { className: "bm-chip" }, `${t.hits} ${entry.hits}`), (0, react.createElement)("span", { className: "bm-entry-ops" }, (0, react.createElement)(Button, {
						variant: "ghost",
						size: "sm",
						onClick: () => entryOp(entry.fp, entry.pinned ? "unpin" : "pin")
					}, entry.pinned ? t.unpin : t.pin), (0, react.createElement)(Button, {
						variant: "ghost",
						size: "sm",
						onClick: () => startEdit(entry)
					}, t.edit), (0, react.createElement)(Button, {
						variant: "ghost",
						size: "sm",
						onClick: () => {
							if (window.confirm(`${t.removeConfirm}\n\n${entry.text.slice(0, 80)}`)) entryOp(entry.fp, "remove");
						}
					}, (0, react.createElement)(IconTrashOutline16, { size: 14 }), " ", t.remove))));
				}));
			})();
			const knowledgeSection = (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, (0, react.createElement)(IconBrowseOutline16, { size: 14 }), " ", t.tabKnowledge), (0, react.createElement)("div", { className: "bm-mode-row" }, modeBtn("hybrid", t.modeHybrid), modeBtn("exact", t.modeExact), modeBtn("semantic", t.modeSemantic)), (0, react.createElement)("div", { className: "bm-toolbar" }, (0, react.createElement)(Input, {
				icon: (0, react.createElement)(IconSearchOutline16, { size: 14 }),
				type: "text",
				placeholder: t.searchPlaceholder,
				value: searchText,
				onChange: (event) => setSearchText(event.target.value),
				onKeyDown: (event) => { if (event.key === "Enter") loadEntries(); },
				style: { flex: 1, minWidth: 180 }
			}), (0, react.createElement)("select", {
				value: layerSel,
				onChange: (event) => setLayerSel(event.target.value)
			}, (0, react.createElement)("option", { value: "" }, t.allLayers), ...layerOptions), (0, react.createElement)(Button, {
				variant: "primary",
				onClick: () => loadEntries()
			}, t.searchBtn)), knowledgeBody);
			// ---------- 反思 ----------
			const reflectBody = (() => {
				if (reflect === null) return (0, react.createElement)("div", { className: "bm-note" }, t.reflectRun);
				if (reflect.kind === "running") return (0, react.createElement)("div", { className: "bm-note" }, t.reflectRunning);
				if (reflect.kind === "error") return (0, react.createElement)("div", { className: "bm-err" }, t.reflectFailed);
				const r = reflect.report || {};
				const clusters = r.clusters || [];
				const conflicts = r.conflicts || [];
				const forget = r.forget || [];
				const summary = `${t.scanned} ${r.scanned}：${t.clustersTitle} ${clusters.length} · ${t.conflictsTitle} ${conflicts.length} · ${t.forgetTitle} ${forget.length}`;
				const clusterNodes = clusters.map((c, index) => (0, react.createElement)("div", {
					key: index,
					className: "bm-cluster"
				}, (0, react.createElement)("div", { className: "bm-cluster-title" }, `${t.clustersTitle} ${index + 1}（${c.size} 条）`), (0, react.createElement)("ul", null, c.members.map((m, mi) => (0, react.createElement)("li", { key: mi }, `[${layerName(m.layer)}] ${m.text}`)))));
				const conflictNodes = conflicts.length ? (0, react.createElement)("ul", { className: "bm-list" }, conflicts.map((c, index) => {
					const isEditing = editingFp === c.fp;
					return (0, react.createElement)("li", { key: index, className: "bm-conflict-item" }, isEditing ? (0, react.createElement)("div", { className: "bm-entry-edit" }, (0, react.createElement)("textarea", {
						className: "bm-entry-textarea",
						style: editBoxStyle(),
						value: editingText,
						onChange: (event) => setEditingText(event.target.value)
					}), (0, react.createElement)("div", { className: "bm-entry-ops" }, (0, react.createElement)(Button, {
						variant: "primary",
						size: "sm",
						onClick: () => resolveConflict(c.fp, editingText)
					}, t.saveEdit), (0, react.createElement)(Button, {
						variant: "ghost",
						size: "sm",
						onClick: cancelEdit
					}, t.cancel))) : (0, react.createElement)(react.Fragment, null, (0, react.createElement)("span", { className: "bm-conflict-text" }, `[${layerName(c.layer)}] ${c.text}`), (0, react.createElement)("span", { className: "bm-entry-ops" }, (0, react.createElement)(Button, {
						variant: "ghost",
						size: "sm",
						onClick: () => startEdit(c)
					}, t.edit), (0, react.createElement)(Button, {
						variant: "ghost",
						size: "sm",
						onClick: () => {
							if (window.confirm(`${t.removeConfirm}\n\n${c.text.slice(0, 80)}`)) removeConflict(c.fp, c.text);
						}
					}, (0, react.createElement)(IconTrashOutline16, { size: 14 }), " ", t.remove))));
				})) : (0, react.createElement)("div", { className: "bm-note" }, t.none);
				const forgetNodes = forget.length ? (0, react.createElement)("ul", { className: "bm-list" }, forget.map((f, index) => (0, react.createElement)("li", { key: index }, `[${layerName(f.layer)}] [w:${f.weight}] ${f.text}`))) : (0, react.createElement)("div", { className: "bm-note" }, t.none);
				return (0, react.createElement)("div", { className: "bm-actions", style: { flexDirection: "column", alignItems: "stretch", gap: 8 } }, (0, react.createElement)("div", { className: "bm-summary" }, summary), (0, react.createElement)("div", { className: "bm-root" }, r.reportFile ? `${t.reportFile}：${r.reportFile}` : t.previewOnly), lastRemoved ? (0, react.createElement)("div", { className: "bm-undo-bar" }, (0, react.createElement)("span", null, `${t.removedNote}：${lastRemoved.text}…`), (0, react.createElement)(Button, {
					variant: "primary",
					size: "sm",
					onClick: undoRemove
				}, t.undo)) : null, (0, react.createElement)("h4", null, t.conflictsTitle), conflictNodes, conflicts.length ? (0, react.createElement)("div", { className: "bm-note" }, t.resolveHint) : null, (0, react.createElement)("h4", null, t.clustersTitle), clusters.length ? clusterNodes : (0, react.createElement)("div", { className: "bm-note" }, t.noClusters), (0, react.createElement)("h4", null, t.forgetTitle), forgetNodes);
			})();
			const reflectSection = (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, (0, react.createElement)(IconThinkOutline14, { size: 14 }), " ", t.tabReflect), (0, react.createElement)("div", { className: "bm-actions" }, (0, react.createElement)(Button, {
				variant: "primary",
				disabled: reflect !== null && reflect.kind === "running",
				onClick: () => runReflect(false)
			}, t.reflectRun), (0, react.createElement)(Button, {
				variant: "outline",
				disabled: reflect !== null && reflect.kind === "running",
				onClick: () => runReflect(true)
			}, t.reflectPreview)), reflectBody);
			const tabBtn = (id, label, icon) => (0, react.createElement)("button", {
				className: tab === id ? "bm-tab active" : "bm-tab",
				onClick: () => setTab(id)
			}, icon ? (0, react.createElement)(react.Fragment, null, icon, " ") : null, label);
			const iconMap = {
				overview: (0, react.createElement)(IconBrowseOutline16, { size: 14 }),
				knowledge: (0, react.createElement)(IconSearchOutline16, { size: 14 }),
				metabolism: (0, react.createElement)(IconRefreshOutline14, { size: 14 }),
				reflect: (0, react.createElement)(IconThinkOutline14, { size: 14 }),
				settings: (0, react.createElement)(IconSettingsOutline16, { size: 14 })
			};
			return (0, react.createElement)("div", { className: "bm-page" }, (0, react.createElement)("style", null, styles), (0, react.createElement)("div", null, (0, react.createElement)("h3", null, t.title), (0, react.createElement)("div", { className: "bm-sub" }, t.subtitle)), (0, react.createElement)("div", { className: "bm-tabs" }, tabBtn("overview", t.tabOverview, iconMap.overview), tabBtn("knowledge", t.tabKnowledge, iconMap.knowledge), tabBtn("metabolism", t.tabMetabolism, iconMap.metabolism), tabBtn("reflect", t.tabReflect, iconMap.reflect), tabBtn("settings", t.tabSettings, iconMap.settings)), tab === "overview" ? overviewSection : tab === "knowledge" ? knowledgeSection : tab === "metabolism" ? metabolismSection : tab === "reflect" ? reflectSection : settingsSection);
		}
		function apply(ctx) {
			ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "biomemory-settings",
				order: 60,
				label: () => text().tab
			}, BiomemorySettingsPage)), "biomemory: memory settings");
		}
		//#endregion
		exports.BiomemorySettingsPage = BiomemorySettingsPage;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
