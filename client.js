window.__ModuleLoader__.load({
	id: "dsh-biomemory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let prim = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/client/index.ts
		/** Biomemory settings page: memory stats, config, knowledge base, reflection. */
		const copy = {
			"zh-CN": {
				tab: "记忆",
				title: "记忆系统",
				tabSettings: "设置",
				tabKnowledge: "知识库",
				tabReflect: "深度反思",
				loading: "正在读取状态…",
				unavailable: "暂时无法读取运行状态，但记忆系统不会影响现有工具或上下文。",
				stats: "运行统计",
				total: "总条数",
				pinned: "锁定数",
				auditCount: "审计事件",
				layersTitle: "分层分布",
				memoryRoot: "记忆根目录",
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
				audit: "审计记录",
				runAudit: "最近审计",
				auditLoading: "读取中…",
				auditFailed: "审计读取失败",
				noAudit: "（暂无审计记录）",
				search: "搜索记忆（语义召回）…",
				searchBtn: "搜索",
				allLayers: "全部分层",
				noEntries: "（无匹配记忆）",
				entriesLoading: "读取知识库…",
				entriesFailed: "知识库读取失败",
				pin: "锁定",
				unpin: "解锁",
				remove: "删除",
				removeConfirm: "确定删除这条记忆？会自动备份，可回滚。",
				weight: "权重",
				hits: "引用",
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
				title: "Memory system",
				tabSettings: "Settings",
				tabKnowledge: "Knowledge",
				tabReflect: "Reflect",
				loading: "Reading status…",
				unavailable: "Runtime status is temporarily unavailable. Memory never removes existing tools or context.",
				stats: "Statistics",
				total: "Total entries",
				pinned: "Pinned",
				auditCount: "Audit events",
				layersTitle: "By layer",
				memoryRoot: "Memory root",
				config: "Configuration",
				halfLifeDays: "Half-life (days)",
				halfLifeDaysHelp: "Memory weight halves after this many days (default 7)",
				decayThreshold: "Decay threshold",
				decayThresholdHelp: "Entries below this weight are archived (default 3)",
				consolidateThreshold: "Consolidate threshold",
				consolidateThresholdHelp: "References reaching this count add +1 weight (default 3)",
				weightCap: "Weight cap",
				weightCapHelp: "Max weight after consolidation, prevents runaway growth (default 20)",
				hotTokenLimit: "Hot token limit",
				hotTokenLimitHelp: "Token budget for the session snapshot injection (default 5000)",
				maxQueryResults: "Max query results",
				maxQueryResultsHelp: "Max entries returned per query (default 20)",
				fallback: "Approval fallback",
				fallbackHelp: "When approval is unavailable (policy never / missing service): auto-save with audit marker, or deny writes (default auto)",
				fallbackAuto: "Auto-save (recommended)",
				fallbackDeny: "Deny writes",
				autoDreamDays: "Auto-dream interval (days, 0=off)",
				autoDreamDaysHelp: "Run dream at startup if older than this (default 7)",
				autoReflectDays: "Auto-reflect interval (days, 0=off)",
				autoReflectDaysHelp: "Run reflection at startup if older than this (default 3)",
				reset: "Reset to defaults",
				resetConfirm: "Reset all settings to defaults?",
				petEndpoint: "Local notify service URL (optional, may be empty)",
				petEndpointHelp: "Optional URL for a local notification service (may be empty, off by default)",
				save: "Save config",
				saving: "Saving…",
				saved: "Saved",
				saveFailed: "Save failed",
				dream: "Memory metabolism",
				runDream: "Run dream",
				previewDream: "Preview (dry-run)",
				dreamRunning: "Running…",
				dreamFailed: "Dream failed",
				scanned: "Scanned",
				decayed: "decayed",
				consolidated: "consolidated",
				conflicted: "conflicted",
				archived: "archived",
				backup: "Backup",
				noItems: "(no items)",
				audit: "Audit log",
				runAudit: "Recent audit",
				auditLoading: "Loading…",
				auditFailed: "Audit failed",
				noAudit: "(no audit entries)",
				search: "Search memory (semantic recall)…",
				searchBtn: "Search",
				allLayers: "All layers",
				noEntries: "(no matching entries)",
				entriesLoading: "Loading knowledge base…",
				entriesFailed: "Failed to load knowledge base",
				pin: "Pin",
				unpin: "Unpin",
				remove: "Remove",
				removeConfirm: "Remove this entry? A backup is made first and it can be restored.",
				weight: "weight",
				hits: "hits",
				reflectRun: "Run deep reflection",
				reflectPreview: "Preview (dry-run)",
				reflectRunning: "Reflecting…",
				reflectFailed: "Reflection failed",
				clustersTitle: "Topic clusters",
				conflictsTitle: "Potential conflicts",
				forgetTitle: "Forget candidates",
				reportFile: "Report",
				previewOnly: "(preview, not written)",
				noClusters: "(no similar-entry clusters)",
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
		const inject = ["slots"];
		// 布局样式：颜色一律走 --dsw-alias-* 令牌（带 fallback），组件本体交给 primitives
		const styles = `
.bm-page{display:flex;flex-direction:column;gap:14px;max-width:760px;color:var(--dsw-alias-label-primary,#1f2328);font-size:14px;line-height:1.6}
.bm-page h3{margin:0;font-size:18px;font-weight:600}
.bm-page h4{margin:0;font-size:14px;font-weight:600}
.bm-tabs{display:flex;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l2,#d0d7de);padding-bottom:8px}
.bm-tab{padding:6px 14px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#57606a);font-size:13px;cursor:pointer}
.bm-tab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(65,118,230,.08))}
.bm-tab.active{background:var(--dsw-alias-bg-layer-3,#f6f8fa);border-color:var(--dsw-alias-border-l2,#d0d7de);color:var(--dsw-alias-label-primary,#1f2328);font-weight:600}
.bm-block{padding:14px;border:1px solid var(--dsw-alias-border-l2,#d0d7de);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#fff);display:flex;flex-direction:column;gap:12px}
.bm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.bm-card{padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#d0d7de);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#f6f8fa)}
.bm-card strong{display:block;margin-bottom:2px;font-weight:600;font-size:16px;color:var(--dsw-alias-label-primary,#1f2328)}
.bm-card span{color:var(--dsw-alias-label-secondary,#57606a);font-size:13px}
.bm-root{color:var(--dsw-alias-label-tertiary,#6e7781);font-size:13px;word-break:break-all}
.bm-config{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.bm-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.bm-field label{color:var(--dsw-alias-label-primary,#1f2328);font-size:13px;font-weight:500}
.bm-field input[type=number],.bm-field select{height:32px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,#d0d7de);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);font-size:13px;min-width:0}
.bm-field input:focus,.bm-field select:focus{outline:none;border-color:#4176e6}
.bm-wide{grid-column:1/-1}
.bm-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.bm-note{color:var(--dsw-alias-label-secondary,#57606a);font-size:13px}
.bm-ok{color:#1a7f37}
.bm-err{color:#cf222e}
.bm-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;max-height:280px;overflow:auto}
.bm-list li{padding:5px 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-2,#f6f8fa);color:var(--dsw-alias-label-primary,#1f2328);font-family:ui-monospace,Consolas,monospace;font-size:12.5px;word-break:break-all}
.bm-summary{font-weight:600;color:var(--dsw-alias-label-primary,#1f2328)}
.bm-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.bm-toolbar select{height:32px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,#d0d7de);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);font-size:13px}
.bm-entries{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;max-height:520px;overflow:auto}
.bm-entry{padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#d0d7de);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#f6f8fa)}
.bm-entry.pinned{border-color:#c5a468}
.bm-entry-text{color:var(--dsw-alias-label-primary,#1f2328);font-size:13px;word-break:break-all}
.bm-entry-meta{display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary,#6e7781);font-size:12px;font-family:ui-monospace,Consolas,monospace}
.bm-entry-ops{display:flex;gap:6px;margin-left:auto;align-items:center}
.bm-cluster{margin:0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#d0d7de);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#f6f8fa)}
.bm-cluster-title{font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);font-size:13px;margin-bottom:4px}
.bm-cluster ul{margin:0;padding-left:18px;color:var(--dsw-alias-label-secondary,#57606a);font-size:13px}
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
			const [tab, setTab] = react.useState("settings");
			const [searchText, setSearchText] = react.useState("");
			const [layerSel, setLayerSel] = react.useState("");
			const [knowledge, setKnowledge] = react.useState({ kind: "idle", entries: [] });
			const [reflect, setReflect] = react.useState(null);
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
					for (const key of CONFIG_KEYS) {
						textForm[key] = cfg[key] !== void 0 ? String(cfg[key]) : "";
					}
					setConfigText(textForm);
					setPetEndpoint(data.petEndpoint || "");
					setFallback(data.config?.approvalFallback || "auto");
					setStatus({ kind: "ready", value: data });
				}).catch((error) => {
					if (!(error instanceof DOMException && error.name === "AbortError")) setStatus({ kind: "error" });
				});
				return () => {
					controller.abort();
				};
			}, []);
			react.useEffect(() => loadStatus(), [loadStatus]);
			const saveConfig = () => {
				setSaveState({ kind: "saving" });
				const body = {};
				for (const key of CONFIG_KEYS) {
					const value = configText[key];
					if (value !== void 0 && value !== "") body[key] = Number(value);
				}
				body.petEndpoint = petEndpoint.trim() !== "" ? petEndpoint.trim() : null;
				body.approvalFallback = fallback === "deny" ? "deny" : "auto";
				fetch("/biomemory/api/config", {
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body)
				}).then(async (response) => {
					if (!response.ok) throw new Error("save failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("save failed");
					if (data.petEndpoint !== void 0) setPetEndpoint(data.petEndpoint || "");
					setSaveState({ kind: "ok" });
					loadStatus();
				}).catch(() => {
					setSaveState({ kind: "error" });
				});
			};
			const resetConfig = () => {
				if (!window.confirm(t.resetConfirm)) return;
				setSaveState({ kind: "saving" });
				fetch("/biomemory/api/config", {
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" },
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
				}).catch(() => {
					setSaveState({ kind: "error" });
				});
			};
			const runDream = (dryRun) => {
				setDream({ kind: "running", dryRun });
				fetch("/biomemory/api/dream", {
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ dryRun })
				}).then(async (response) => {
					if (!response.ok) throw new Error("dream failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("dream failed");
					setDream({ kind: "done", dryRun, report: data.report || {} });
					if (!dryRun) loadStatus();
				}).catch(() => {
					setDream({ kind: "error", dryRun });
				});
			};
			const runAudit = () => {
				setAudit({ kind: "loading" });
				fetch("/biomemory/api/audit?sinceDays=30", {
					credentials: "same-origin"
				}).then(async (response) => {
					if (!response.ok) throw new Error("audit failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("audit failed");
					setAudit({ kind: "done", entries: data.entries || [] });
				}).catch(() => {
					setAudit({ kind: "error" });
				});
			};
			const loadEntries = (q, layer) => {
				const query = q !== void 0 ? q : searchText;
				const lay = layer !== void 0 ? layer : layerSel;
				setKnowledge({ kind: "loading", entries: [] });
				const params = new URLSearchParams();
				if (query) params.set("q", query);
				if (lay) params.set("layer", lay);
				fetch(`/biomemory/api/entries?${params.toString()}`, {
					credentials: "same-origin"
				}).then(async (response) => {
					if (!response.ok) throw new Error("entries failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("entries failed");
					setKnowledge({ kind: "ready", entries: data.entries || [] });
				}).catch(() => {
					setKnowledge({ kind: "error", entries: [] });
				});
			};
			const entryOp = (fp, op) => {
				fetch(`/biomemory/api/entries/${op}`, {
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ fp })
				}).then(async (response) => {
					if (!response.ok) throw new Error(`${op} failed`);
					const data = await response.json();
					if (!data?.ok) throw new Error(`${op} failed`);
					loadEntries();
				}).catch(() => { /* 保持现状 */ });
			};
			const runReflect = (dryRun) => {
				setReflect({ kind: "running", dryRun });
				fetch("/biomemory/api/reflect", {
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ dryRun })
				}).then(async (response) => {
					if (!response.ok) throw new Error("reflect failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("reflect failed");
					setReflect({ kind: "done", dryRun, report: data.report || {} });
				}).catch(() => {
					setReflect({ kind: "error", dryRun });
				});
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
			const layerCards = Object.keys(layers).map((layer) => (0, react.createElement)("div", {
				key: layer,
				className: "bm-card"
			}, (0, react.createElement)("strong", null, String(layers[layer])), (0, react.createElement)("span", null, layerName(layer))));
			const summaryCards = [
				["total", stats.total, t.total],
				["pinned", stats.pinned, t.pinned],
				["audit", stats.auditCount, t.auditCount]
			].map(([id, value, label]) => (0, react.createElement)("div", {
				key: id,
				className: "bm-card"
			}, (0, react.createElement)("strong", null, String(value === void 0 ? "—" : value)), (0, react.createElement)("span", null, label)));
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
				if (dream.kind === "running") {
					return (0, react.createElement)("div", { className: "bm-note" }, t.dreamRunning);
				}
				if (dream.kind === "error") {
					return (0, react.createElement)("div", { className: "bm-err" }, `${t.dreamFailed}${dream.dryRun ? " (dry-run)" : ""}`);
				}
				const r = dream.report || {};
				const items = (r.items || []).slice(0, 20);
				return (0, react.createElement)("div", { className: "bm-actions", style: { flexDirection: "column", alignItems: "stretch", gap: 8 } }, (0, react.createElement)("div", { className: "bm-summary" }, `${t.scanned} ${r.scanned}：${t.decayed} ${r.decayed} · ${t.consolidated} ${r.consolidated} · ${t.conflicted} ${r.conflicted} · ${t.archived} ${r.archived}`), r.backup ? (0, react.createElement)("div", { className: "bm-root" }, `${t.backup}：${r.backup}`) : null, items.length === 0 ? (0, react.createElement)("div", { className: "bm-note" }, t.noItems) : (0, react.createElement)("ul", { className: "bm-list" }, items.map((item, index) => {
					const to = item.to ? ` → ${item.to}` : "";
					return (0, react.createElement)("li", { key: index }, `${opName(item.op)} [${item.layer}] ${item.fp}${to}`);
				})));
			})();
			const auditSection = (() => {
				if (audit === null) return null;
				if (audit.kind === "loading") {
					return (0, react.createElement)("div", { className: "bm-note" }, t.auditLoading);
				}
				if (audit.kind === "error") {
					return (0, react.createElement)("div", { className: "bm-err" }, t.auditFailed);
				}
				const entries = (audit.entries || []).slice(0, 20);
				if (entries.length === 0) {
					return (0, react.createElement)("div", { className: "bm-note" }, t.noAudit);
				}
				return (0, react.createElement)("ul", { className: "bm-list" }, entries.map((entry, index) => (0, react.createElement)("li", { key: index }, `${(entry.t || "").slice(0, 16)} ${entry.event || ""} ${entry.fp || ""} ${entry.text || ""}`)));
			})();
			const saveNote = saveState === null ? null : saveState.kind === "saving" ? (0, react.createElement)("span", { className: "bm-note" }, t.saving) : saveState.kind === "ok" ? (0, react.createElement)("span", { className: "bm-ok" }, t.saved) : (0, react.createElement)("span", { className: "bm-err" }, t.saveFailed);
			const settingsSection = (0, react.createElement)(react.Fragment, null, (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.stats), (0, react.createElement)("div", { className: "bm-grid" }, ...summaryCards, ...layerCards), (0, react.createElement)("div", { className: "bm-root" }, `${t.memoryRoot}：${stats.memoryRoot || ""}`)), (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.config), (0, react.createElement)("div", { className: "bm-config" }, ...configFields, (0, react.createElement)("div", { className: "bm-field bm-wide" }, (0, react.createElement)("label", null, t.fallback), (0, react.createElement)("select", { value: fallback, onChange: (event) => setFallback(event.target.value) }, (0, react.createElement)("option", { value: "auto" }, t.fallbackAuto), (0, react.createElement)("option", { value: "deny" }, t.fallbackDeny)), (0, react.createElement)("span", { className: "bm-note" }, t.fallbackHelp)), (0, react.createElement)("div", { className: "bm-field bm-wide" }, (0, react.createElement)("label", null, t.petEndpoint), (0, react.createElement)(Input, {
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
			}, t.reset), saveNote)), (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.dream), (0, react.createElement)("div", { className: "bm-actions" }, (0, react.createElement)(Button, {
				variant: "primary",
				disabled: dream !== null && dream.kind === "running",
				onClick: () => runDream(false)
			}, t.runDream), (0, react.createElement)(Button, {
				variant: "outline",
				disabled: dream !== null && dream.kind === "running",
				onClick: () => runDream(true)
			}, t.previewDream)), dreamSection), (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.audit), (0, react.createElement)("div", { className: "bm-actions" }, (0, react.createElement)(Button, {
				variant: "outline",
				disabled: audit !== null && audit.kind === "loading",
				onClick: runAudit
			}, (0, react.createElement)(IconRefreshOutline14, { size: 14 }), " ", t.runAudit)), auditSection));
			const layerOptions = Object.keys(layers).sort().map((layer) => (0, react.createElement)("option", { key: layer, value: layer }, layerName(layer)));
			const knowledgeBody = (() => {
				if (knowledge.kind === "loading") {
					return (0, react.createElement)("div", { className: "bm-note" }, t.entriesLoading);
				}
				if (knowledge.kind === "error") {
					return (0, react.createElement)("div", { className: "bm-err" }, t.entriesFailed);
				}
				if (knowledge.kind === "idle" || knowledge.entries.length === 0) {
					return (0, react.createElement)("div", { className: "bm-note" }, t.noEntries);
				}
				return (0, react.createElement)("ul", { className: "bm-entries" }, knowledge.entries.map((entry) => (0, react.createElement)("li", {
					key: entry.fp,
					className: entry.pinned ? "bm-entry pinned" : "bm-entry"
				}, (0, react.createElement)("div", { className: "bm-entry-text" }, entry.text), (0, react.createElement)("div", { className: "bm-entry-meta" }, (0, react.createElement)("span", null, `[${layerName(entry.layer)}]`), entry.pinned ? (0, react.createElement)("span", { className: "bm-ok" }, "PIN") : null, entry.mode ? (0, react.createElement)("span", null, entry.mode) : null, (0, react.createElement)("span", null, `${t.weight} ${entry.weight}`), (0, react.createElement)("span", null, `${t.hits} ${entry.hits}`), entry.ts ? (0, react.createElement)("span", null, entry.ts) : null, (0, react.createElement)("span", { className: "bm-entry-ops" }, (0, react.createElement)(Button, {
					variant: "ghost",
					size: "sm",
					onClick: () => entryOp(entry.fp, entry.pinned ? "unpin" : "pin")
				}, entry.pinned ? t.unpin : t.pin), (0, react.createElement)(Button, {
					variant: "ghost",
					size: "sm",
					onClick: () => {
						if (window.confirm(`${t.removeConfirm}\n\n${entry.text.slice(0, 80)}`)) entryOp(entry.fp, "remove");
					}
				}, (0, react.createElement)(IconTrashOutline16, { size: 14 }), " ", t.remove))))));
			})();
			const knowledgeSection = (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, (0, react.createElement)(IconBrowseOutline16, { size: 14 }), " ", t.tabKnowledge), (0, react.createElement)("div", { className: "bm-toolbar" }, (0, react.createElement)(Input, {
				icon: (0, react.createElement)(IconSearchOutline16, { size: 14 }),
				type: "text",
				placeholder: t.search,
				value: searchText,
				onChange: (event) => setSearchText(event.target.value),
				onKeyDown: (event) => {
					if (event.key === "Enter") loadEntries();
				},
				style: { flex: 1, minWidth: 180 }
			}), (0, react.createElement)("select", {
				value: layerSel,
				onChange: (event) => setLayerSel(event.target.value)
			}, (0, react.createElement)("option", { value: "" }, t.allLayers), ...layerOptions), (0, react.createElement)(Button, {
				variant: "primary",
				onClick: () => loadEntries()
			}, t.searchBtn)), knowledgeBody);
			const reflectBody = (() => {
				if (reflect === null) {
					return (0, react.createElement)("div", { className: "bm-note" }, t.reflectRun);
				}
				if (reflect.kind === "running") {
					return (0, react.createElement)("div", { className: "bm-note" }, t.reflectRunning);
				}
				if (reflect.kind === "error") {
					return (0, react.createElement)("div", { className: "bm-err" }, t.reflectFailed);
				}
				const r = reflect.report || {};
				const clusters = r.clusters || [];
				const conflicts = r.conflicts || [];
				const forget = r.forget || [];
				const summary = `${t.scanned} ${r.scanned}：${t.clustersTitle} ${clusters.length} · ${t.conflictsTitle} ${conflicts.length} · ${t.forgetTitle} ${forget.length} · 近 7 天写入 ${r.recent7}（上周 ${r.prev7}）`;
				const clusterNodes = clusters.map((c, index) => (0, react.createElement)("div", {
					key: index,
					className: "bm-cluster"
				}, (0, react.createElement)("div", { className: "bm-cluster-title" }, `${t.clustersTitle} ${index + 1}（${c.size} 条）`), (0, react.createElement)("ul", null, c.members.map((m, mi) => (0, react.createElement)("li", { key: mi }, `[${layerName(m.layer)}] ${m.text}`)))));
				const conflictNodes = conflicts.length ? (0, react.createElement)("ul", { className: "bm-list" }, conflicts.map((c, index) => (0, react.createElement)("li", { key: index }, `[${layerName(c.layer)}] ${c.text}`))) : (0, react.createElement)("div", { className: "bm-note" }, t.none);
				const forgetNodes = forget.length ? (0, react.createElement)("ul", { className: "bm-list" }, forget.map((f, index) => (0, react.createElement)("li", { key: index }, `[${layerName(f.layer)}] [w:${f.weight}] ${f.text}`))) : (0, react.createElement)("div", { className: "bm-note" }, t.none);
				return (0, react.createElement)("div", { className: "bm-actions", style: { flexDirection: "column", alignItems: "stretch", gap: 8 } }, (0, react.createElement)("div", { className: "bm-summary" }, summary), (0, react.createElement)("div", { className: "bm-root" }, r.reportFile ? `${t.reportFile}：${r.reportFile}` : t.previewOnly), (0, react.createElement)("h4", null, t.clustersTitle), clusters.length ? clusterNodes : (0, react.createElement)("div", { className: "bm-note" }, t.noClusters), (0, react.createElement)("h4", null, t.conflictsTitle), conflictNodes, (0, react.createElement)("h4", null, t.forgetTitle), forgetNodes);
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
			return (0, react.createElement)("div", { className: "bm-page" }, (0, react.createElement)("style", null, styles), (0, react.createElement)("h3", null, t.title), (0, react.createElement)("div", { className: "bm-tabs" }, tabBtn("settings", t.tabSettings, (0, react.createElement)(IconSettingsOutline16, { size: 14 })), tabBtn("knowledge", t.tabKnowledge, (0, react.createElement)(IconBrowseOutline16, { size: 14 })), tabBtn("reflect", t.tabReflect, (0, react.createElement)(IconThinkOutline14, { size: 14 }))), tab === "settings" ? settingsSection : tab === "knowledge" ? knowledgeSection : reflectSection);
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
