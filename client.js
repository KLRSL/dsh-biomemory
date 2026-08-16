window.__ModuleLoader__.load({
	id: "dsh-biomemory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/index.ts
		/** Biomemory settings page: memory stats, config, dream, audit. */
		const copy = {
			"zh-CN": {
				tab: "记忆",
				title: "记忆系统",
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
				decayThreshold: "归档阈值",
				consolidateThreshold: "巩固阈值",
				weightCap: "权重上限",
				hotTokenLimit: "热区 token 上限",
				maxQueryResults: "查询上限",
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
				decayThreshold: "Decay threshold",
				consolidateThreshold: "Consolidate threshold",
				weightCap: "Weight cap",
				hotTokenLimit: "Hot token limit",
				maxQueryResults: "Max query results",
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
		const styles = `
.bm-page{display:flex;flex-direction:column;gap:12px;max-width:720px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55}
.bm-page h3{margin:0;font-size:18px;font-weight:600}
.bm-page h4{margin:0 0 10px;font-size:14px;font-weight:600}
.bm-status{padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-3)}
.bm-status.error{color:var(--dsw-alias-label-tertiary)}
.bm-block{padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3)}
.bm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.bm-card{padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.bm-card strong{display:block;margin-bottom:2px;font-weight:600;font-size:15px}
.bm-card span{color:var(--dsw-alias-label-tertiary);font-size:12px}
.bm-root{margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:12px;word-break:break-all}
.bm-config{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}
.bm-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.bm-field label{color:var(--dsw-alias-label-tertiary);font-size:12px}
.bm-field input[type=number],.bm-field input[type=text]{height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;min-width:0}
.bm-field input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.bm-wide{grid-column:1/-1}
.bm-actions{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}
.bm-btn{padding:6px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer}
.bm-btn:hover{border-color:var(--dsw-alias-brand-primary)}
.bm-btn.primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}
.bm-btn:disabled{opacity:.5;cursor:default}
.bm-note{color:var(--dsw-alias-label-tertiary);font-size:12px}
.bm-ok{color:#34c759}
.bm-err{color:#e5484d}
.bm-list{margin:10px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;max-height:280px;overflow:auto}
.bm-list li{padding:4px 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,Consolas,monospace;font-size:12px;word-break:break-all}
.bm-summary{margin-top:10px;font-weight:600}
`;
		const CONFIG_KEYS = ["halfLifeDays", "decayThreshold", "consolidateThreshold", "weightCap", "hotTokenLimit", "maxQueryResults"];
		function BiomemorySettingsPage() {
			const t = text();
			const [status, setStatus] = react.useState({ kind: "loading" });
			const [configText, setConfigText] = react.useState({});
			const [petEndpoint, setPetEndpoint] = react.useState("");
			const [saveState, setSaveState] = react.useState(null);
			const [dream, setDream] = react.useState(null);
			const [audit, setAudit] = react.useState(null);
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
				fetch("/biomemory/api/audit?sinceDays=7&type=DECAY", {
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
			const opName = (op) => t.ops[op] || op;
			const layerName = (layer) => t.layers[layer] || layer;
			if (status.kind === "loading") {
				return (0, react.createElement)("div", { className: "bm-page" }, (0, react.createElement)("style", null, styles), (0, react.createElement)("h3", null, t.title), (0, react.createElement)("div", { className: "bm-status" }, t.loading));
			}
			if (status.kind === "error") {
				return (0, react.createElement)("div", { className: "bm-page" }, (0, react.createElement)("style", null, styles), (0, react.createElement)("h3", null, t.title), (0, react.createElement)("div", { className: "bm-status error" }, t.unavailable));
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
					maxQueryResults: t.maxQueryResults
				};
				return (0, react.createElement)("div", {
					key,
					className: "bm-field"
				}, (0, react.createElement)("label", null, labels[key]), (0, react.createElement)("input", {
					type: "number",
					value: configText[key] !== void 0 ? configText[key] : "",
					onChange: (event) => setConfigText({ ...configText, [key]: event.target.value })
				}));
			});
			const dreamSection = (() => {
				if (dream === null) return null;
				if (dream.kind === "running") {
					return (0, react.createElement)("div", { className: "bm-status" }, t.dreamRunning);
				}
				if (dream.kind === "error") {
					return (0, react.createElement)("div", { className: "bm-status error" }, `${t.dreamFailed}${dream.dryRun ? " (dry-run)" : ""}`);
				}
				const r = dream.report || {};
				const items = (r.items || []).slice(0, 20);
				return (0, react.createElement)("div", null, (0, react.createElement)("div", { className: "bm-summary" }, `${t.scanned} ${r.scanned}：${t.decayed} ${r.decayed} · ${t.consolidated} ${r.consolidated} · ${t.conflicted} ${r.conflicted} · ${t.archived} ${r.archived}`), r.backup ? (0, react.createElement)("div", { className: "bm-root" }, `${t.backup}：${r.backup}`) : null, items.length === 0 ? (0, react.createElement)("div", { className: "bm-note" }, t.noItems) : (0, react.createElement)("ul", { className: "bm-list" }, items.map((item, index) => {
					const to = item.to ? ` → ${item.to}` : "";
					return (0, react.createElement)("li", { key: index }, `${opName(item.op)} [${item.layer}] ${item.fp}${to}`);
				})));
			})();
			const auditSection = (() => {
				if (audit === null) return null;
				if (audit.kind === "loading") {
					return (0, react.createElement)("div", { className: "bm-status" }, t.auditLoading);
				}
				if (audit.kind === "error") {
					return (0, react.createElement)("div", { className: "bm-status error" }, t.auditFailed);
				}
				const entries = (audit.entries || []).slice(0, 20);
				if (entries.length === 0) {
					return (0, react.createElement)("div", { className: "bm-note" }, t.noAudit);
				}
				return (0, react.createElement)("ul", { className: "bm-list" }, entries.map((entry, index) => (0, react.createElement)("li", { key: index }, `${(entry.t || "").slice(0, 16)} ${entry.event || ""} ${entry.fp || ""} ${entry.text || ""}`)));
			})();
			const saveNote = saveState === null ? null : saveState.kind === "saving" ? (0, react.createElement)("span", { className: "bm-note" }, t.saving) : saveState.kind === "ok" ? (0, react.createElement)("span", { className: "bm-ok" }, t.saved) : (0, react.createElement)("span", { className: "bm-err" }, t.saveFailed);
			return (0, react.createElement)("div", { className: "bm-page" }, (0, react.createElement)("style", null, styles), (0, react.createElement)("h3", null, t.title), (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.stats), (0, react.createElement)("div", { className: "bm-grid" }, ...summaryCards, ...layerCards), (0, react.createElement)("div", { className: "bm-root" }, `${t.memoryRoot}：${stats.memoryRoot || ""}`)), (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.config), (0, react.createElement)("div", { className: "bm-config" }, ...configFields, (0, react.createElement)("div", { className: "bm-field bm-wide" }, (0, react.createElement)("label", null, t.petEndpoint), (0, react.createElement)("input", {
				type: "text",
				value: petEndpoint,
				placeholder: "https://example.com/notify",
				onChange: (event) => setPetEndpoint(event.target.value)
			}), (0, react.createElement)("span", { className: "bm-note" }, t.petEndpointHelp))), (0, react.createElement)("div", { className: "bm-actions" }, (0, react.createElement)("button", {
				className: "bm-btn primary",
				disabled: saveState !== null && saveState.kind === "saving",
				onClick: saveConfig
			}, t.save), saveNote)), (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.dream), (0, react.createElement)("div", { className: "bm-actions" }, (0, react.createElement)("button", {
				className: "bm-btn primary",
				disabled: dream !== null && dream.kind === "running",
				onClick: () => runDream(false)
			}, t.runDream), (0, react.createElement)("button", {
				className: "bm-btn",
				disabled: dream !== null && dream.kind === "running",
				onClick: () => runDream(true)
			}, t.previewDream)), dreamSection), (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.audit), (0, react.createElement)("div", { className: "bm-actions" }, (0, react.createElement)("button", {
				className: "bm-btn",
				disabled: audit !== null && audit.kind === "loading",
				onClick: runAudit
			}, t.runAudit)), auditSection));
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
		exports.default = BiomemorySettingsPage;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
