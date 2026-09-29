window.__ModuleLoader__.load({
	id: "dsh-biomemory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
/* ============================================================================
 * 本地化控件与图标（vendored）
 * 来源：@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2 的 lib/index.js 与 *.module.css
 * 原因：官方 references/practices.md §UI 第 1 条明确禁止插件 require 任何 Harness Client 包
 *      （该包随版本改名——0.2.0 起图标只导出 ...Regular/...Medium，裸名与 ...16 全部消失；
 *       载入时会得到 undefined 组件，渲染即崩）。故按官方建议把 markup/CSS/行为抄进本插件，
 *       类名统一 bm- 前缀，颜色只依赖 --dsw-alias-* 主题令牌。
 * ========================================================================== */
const bmCx = (...parts) => parts.filter((v) => typeof v === "string" && v).join(" ");
const bmJsx = (type, props) => react.createElement(type, props);
const bmJsxs = bmJsx;

/* ---- 图标（官方 SVG 路径原样抄录，默认 strokeWidth=1，等同官方 ...Regular 变体）---- */
const IconSearchOutlineArtwork = ({ size = 16, className, strokeWidth }) => bmJsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [bmJsx("path", {
		d: "M6.58727 11.8586C9.55061 11.8586 11.9529 9.45637 11.9529 6.49304C11.9529 3.5297 9.55061 1.12744 6.58727 1.12744C3.62394 1.12744 1.22168 3.5297 1.22168 6.49304C1.22168 9.45637 3.62394 11.8586 6.58727 11.8586Z",
		stroke: "currentColor"
	}), bmJsx("path", {
		d: "M10.2991 10.3933L14.7783 14.8725",
		stroke: "currentColor"
	})]
});
const IconSearchOutline16 = (props) => bmJsx(IconSearchOutlineArtwork, { size: 16, ...props, strokeWidth: 1 });

const IconTrashOutlineArtwork = ({ size = 16, className, strokeWidth }) => bmJsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		bmJsx("path", {
			d: "M1.28149 3.88831H14.7187",
			stroke: "currentColor"
		}),
		bmJsx("path", {
			d: "M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833",
			stroke: "currentColor"
		}),
		bmJsx("path", {
			d: "M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831",
			stroke: "currentColor"
		}),
		bmJsx("path", {
			d: "M6.44946 6.98926V11.1238",
			stroke: "currentColor"
		}),
		bmJsx("path", {
			d: "M9.55054 6.98926V11.1238",
			stroke: "currentColor"
		})
	]
});
const IconTrashOutline16 = (props) => bmJsx(IconTrashOutlineArtwork, { size: 16, ...props, strokeWidth: 1 });

const IconRefreshOutlineArtwork = ({ size = 16, className, strokeWidth }) => bmJsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [bmJsx("path", {
		d: "M14.5001 8C14.5 9.28552 14.1188 10.5422 13.4045 11.611C12.6903 12.6799 11.6752 13.5129 10.4875 14.0049C9.29982 14.4968 7.99295 14.6255 6.73212 14.3747C5.4713 14.124 4.31314 13.505 3.4041 12.596C2.49514 11.687 1.87614 10.5288 1.62537 9.26798C1.37459 8.00716 1.50331 6.70028 1.99525 5.51261C2.48719 4.32494 3.32025 3.30981 4.3891 2.59557C5.45795 1.88134 6.71458 1.50008 8.0001 1.5C9.9001 1.5 11.7001 2.3 13.0001 3.6L14.5001 5.1",
		stroke: "currentColor"
	}), bmJsx("path", {
		d: "M14.4999 1.5V5.1H10.8999",
		stroke: "currentColor"
	})]
});
const IconRefreshOutline14 = (props) => bmJsx(IconRefreshOutlineArtwork, { size: 14, ...props, strokeWidth: 1 });

const IconCheckOutlineArtwork = ({ size = 16, className, strokeWidth }) => bmJsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: bmJsx("path", {
		d: "M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4",
		stroke: "currentColor"
	})
});
const IconCheckOutline16 = (props) => bmJsx(IconCheckOutlineArtwork, { size: 16, ...props, strokeWidth: 1 });

const IconWarningOutlineArtwork = ({ size = 16, className, strokeWidth }) => bmJsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		bmJsx("path", {
			d: "M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z",
			stroke: "currentColor"
		}),
		bmJsx("path", {
			d: "M8 4.29199V9.79199",
			stroke: "currentColor"
		}),
		bmJsx("path", {
			d: "M8 10.708V11.708",
			stroke: "currentColor"
		})
	]
});
const IconWarningOutline16 = (props) => bmJsx(IconWarningOutlineArtwork, { size: 16, ...props, strokeWidth: 1 });

const IconThinkOutlineArtwork = ({ size = 16, className, strokeWidth }) => bmJsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		bmJsx("path", {
			d: "M10.2854 5.71481C12.9673 8.39663 14.1182 11.5938 12.8562 12.8559C11.5942 14.1179 8.39706 12.9669 5.71518 10.2851C3.03333 7.60323 1.88236 4.40608 3.14441 3.14403C4.40644 1.882 7.6036 3.03297 10.2854 5.71481Z",
			stroke: "currentColor"
		}),
		bmJsx("path", {
			d: "M10.2854 10.2851C7.6036 12.9669 4.40644 14.1179 3.14441 12.8559C1.88236 11.5938 3.03333 8.39663 5.71518 5.71481C8.39706 3.03297 11.5942 1.882 12.8562 3.14403C14.1182 4.40608 12.9673 7.60323 10.2854 10.2851Z",
			stroke: "currentColor"
		}),
		bmJsx("path", {
			d: "M8.86291 8.0002C8.86291 8.47549 8.47762 8.86087 8.00224 8.86087C7.52694 8.86087 7.1416 8.47549 7.1416 8.0002C7.1416 7.52485 7.52694 7.13953 8.00224 7.13953C8.47762 7.13953 8.86291 7.52485 8.86291 8.0002Z",
			fill: "currentColor"
		})
	]
});
const IconThinkOutline14 = (props) => bmJsx(IconThinkOutlineArtwork, { size: 14, ...props, strokeWidth: 1 });

const IconSettingsOutlineArtwork = ({ size = 16, className, strokeWidth }) => bmJsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [bmJsx("path", {
		d: "M8 9.75012C8.9665 9.75012 9.75 8.96662 9.75 8.00012C9.75 7.03362 8.9665 6.25012 8 6.25012C7.0335 6.25012 6.25 7.03362 6.25 8.00012C6.25 8.96662 7.0335 9.75012 8 9.75012Z",
		stroke: "currentColor"
	}), bmJsx("path", {
		d: "M13.0107 7.79377C12.9505 7.89401 12.9205 7.94413 12.9205 7.99951C12.9205 8.0549 12.9505 8.10502 13.0106 8.20528L13.9849 9.83006C14.045 9.93029 14.0751 9.9804 14.0751 10.0358C14.0751 10.0911 14.045 10.1413 13.9849 10.2415L13.0037 11.8777C12.9468 11.9726 12.9184 12.0201 12.8725 12.0461C12.8267 12.072 12.7713 12.072 12.6607 12.072H10.6704C10.5598 12.072 10.5045 12.072 10.4586 12.098C10.4128 12.1239 10.3843 12.1714 10.3274 12.2662L9.33825 13.9142C9.28133 14.009 9.25287 14.0564 9.20703 14.0823C9.16118 14.1083 9.10588 14.1083 8.99529 14.1083H7.00486C6.89426 14.1083 6.83896 14.1083 6.79312 14.0823C6.74727 14.0564 6.71881 14.009 6.6619 13.9142L5.67273 12.2662C5.61581 12.1714 5.58735 12.1239 5.54151 12.098C5.49566 12.072 5.44036 12.072 5.32977 12.072H3.33945C3.2288 12.072 3.17347 12.072 3.12761 12.0461C3.08176 12.0201 3.0533 11.9726 2.9964 11.8777L2.0152 10.2415C1.9551 10.1413 1.92505 10.0911 1.92505 10.0358C1.92505 9.9804 1.9551 9.93029 2.0152 9.83006L2.98951 8.20528C3.04963 8.10502 3.07969 8.0549 3.07969 7.99951C3.07968 7.94413 3.04961 7.89401 2.98946 7.79377L2.01529 6.17011C1.95514 6.06987 1.92507 6.01975 1.92507 5.96437C1.92506 5.90899 1.95512 5.85886 2.01524 5.7586L2.9964 4.1224C3.0533 4.0275 3.08176 3.98005 3.12761 3.95408C3.17347 3.92811 3.2288 3.92811 3.33945 3.92811H5.32977C5.44036 3.92811 5.49566 3.92811 5.54151 3.90216C5.58735 3.87621 5.61581 3.82879 5.67273 3.73397L6.6619 2.08599C6.71881 1.99116 6.74727 1.94375 6.79312 1.9178C6.83896 1.89185 6.89426 1.89185 7.00486 1.89185H8.99529C9.10588 1.89185 9.16118 1.89185 9.20703 1.9178C9.25287 1.94375 9.28133 1.99116 9.33825 2.08599L10.3274 3.73397C10.3843 3.82879 10.4128 3.87621 10.4586 3.90216C10.5045 3.92811 10.5598 3.92811 10.6704 3.92811H12.6607C12.7713 3.92811 12.8267 3.92811 12.8725 3.95408C12.9184 3.98005 12.9468 4.0275 13.0037 4.1224L13.9849 5.7586C14.045 5.85886 14.0751 5.90899 14.0751 5.96437C14.0751 6.01975 14.045 6.06987 13.9849 6.17011L13.0107 7.79377Z",
		stroke: "currentColor",
		strokeMiterlimit: "10"
	})]
});
const IconSettingsOutline16 = (props) => bmJsx(IconSettingsOutlineArtwork, { size: 16, ...props, strokeWidth: 1 });

const IconLinkOutlineArtwork = ({ size = 16, className, strokeWidth }) => bmJsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [bmJsx("path", {
		d: "M6.59961 9.40051C6.82779 9.6334 7.10015 9.81842 7.40074 9.94472C7.70132 10.071 8.02409 10.1361 8.35013 10.1361C8.67618 10.1361 8.99894 10.071 9.29953 9.94472C9.60011 9.81842 9.87247 9.6334 10.1007 9.40051L12.9015 6.59967C13.3658 6.13541 13.6266 5.50572 13.6266 4.84915C13.6266 4.19258 13.3658 3.56289 12.9015 3.09863C12.4372 2.63436 11.8075 2.37354 11.151 2.37354C10.4944 2.37354 9.86472 2.63436 9.40045 3.09863L9.05034 3.44873",
		stroke: "currentColor"
	}), bmJsx("path", {
		d: "M9.40051 6.59959C9.17233 6.3667 8.89997 6.18169 8.59939 6.05538C8.2988 5.92907 7.97603 5.86401 7.64999 5.86401C7.32395 5.86401 7.00118 5.92907 6.70059 6.05538C6.40001 6.18169 6.12765 6.3667 5.89946 6.59959L3.09863 9.40043C2.63436 9.8647 2.37354 10.4944 2.37354 11.151C2.37354 11.8075 2.63436 12.4372 3.09863 12.9015C3.56289 13.3657 4.19258 13.6266 4.84915 13.6266C5.50572 13.6266 6.13541 13.3657 6.59967 12.9015L6.94978 12.5514",
		stroke: "currentColor"
	})]
});
const IconLinkOutline14 = (props) => bmJsx(IconLinkOutlineArtwork, { size: 14, ...props, strokeWidth: 1 });

const BrowseOutlineArtwork = ({ size = 16, className, strokeWidth }) => bmJsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		bmJsx("path", {
			d: "M4.9375 5.90295H11.0625",
			stroke: "currentColor"
		}),
		bmJsx("path", {
			d: "M4.9375 9.02991H8.27841",
			stroke: "currentColor"
		}),
		bmJsx("path", {
			d: "M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V13.2246C13.9996 14.0489 13.3036 14.6738 12.5 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5ZM3.5 2.32617C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H12.5C12.8004 13.6738 12.9996 13.4489 13 13.2246V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5Z",
			fill: "currentColor"
		})
	]
});
const IconBrowseOutline16 = (props) => bmJsx(BrowseOutlineArtwork, { size: 16, ...props, strokeWidth: 1 });

/* ---- Button（照抄官方结构与类名语义，类名换 bm- 前缀）---- */
function Button({ variant = "ghost", size = "md", icon, className, children, ...rest }) {
	return bmJsxs("button", {
		type: "button",
		className: bmCx("bm-btn", "bm-btn-" + variant, "bm-btn-" + size, className),
		...rest,
		children: [icon != null && bmJsx("span", { className: "bm-btn-icon", children: icon }), children]
	});
}

/* ---- Input ---- */
function Input({ icon, className, ...rest }) {
	return bmJsxs("span", {
		className: bmCx("bm-input-wrap", className),
		children: [icon != null && bmJsx("span", { className: "bm-input-icon", children: icon }), bmJsx("input", { className: "bm-input", ...rest })]
	});
}
/* ===== vendored 结束 ===== */
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
				subtitle: "数字海马体 · {total} 条记忆 · 关键词检索",
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
				model: "检索方式",
				modelNote: "关键词相关度排序",
				modelTag: "离线 · 零依赖",
				audit: "代谢健康",
				auditNote: "近7天事件",
				auditTag: "10+ 权重 135 条",
				composition: "记忆构成",
				typeDist: "类型分布",
				weightDist: "权重分布",
				recentActivity: "近 7 天活动",
				flow: "记忆流",
				searchPlaceholder: "搜记忆：如「镜像下载」「桌宠规则」…",
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
				fallbackHelp: "审批不可用（服务缺失/请求异常/策略 never）时：拒绝写入并记审计（fail-closed，默认），或自动保存并审计标记（旧行为）",
				fallbackAuto: "自动保存",
				fallbackDeny: "拒绝写入（推荐）",
				autoDreamDays: "自动代谢周期（天，0=关闭）",
				autoDreamDaysHelp: "启动时距上次代谢超过此天数自动执行 dream（默认 7）",
				autoReflectDays: "自动反思周期（天，0=关闭）",
				autoReflectDaysHelp: "启动时距上次反思超过此天数自动执行（默认 3）",
				nearDuplicateThreshold: "写入去重阈值（0~1，0=关闭）",
				nearDuplicateThresholdHelp: "与已有同类条目相似度 ≥ 此值时按右侧策略处理（默认 0.7）",
				nearDuplicateAction: "近重复处理",
				nearDuplicateActionHelp: "merge=自动合并进已有条目（追加「补充·日期」并提权）／skip=只提示不写入",
				nearDuplicateActionMerge: "自动合并（推荐）",
				nearDuplicateActionSkip: "只提示",
				sinkWindowMinutes: "沉淀提醒窗口（分钟）",
				sinkWindowMinutesHelp: "每轮结束后「请沉淀」提醒的有效时长（默认 5 分钟；超时丢弃，等下一轮重新判断）",
				modelPending: "—",
				modelFailed: "—",
				last7d: "近 7 天",
				archiveTitle: "已归档记忆",
				archiveHelp: "归档条目不再注入模型、也不再出现在检索里；这里可以看到它们并恢复（恢复后重新参与检索与快照）。",
				archiveShow: "查看已归档",
				archiveEmpty: "（暂无归档条目）",
				archiveLoading: "载入中…",
				unarchive: "取消归档",
				supersede: "作废",
				supersededTitle: "已作废记忆（冲突裁决）",
				supersededHint: "作废 = 人工裁决认定「这条被更新的结论取代」：退出快照注入与检索，但记录保留、可随时恢复。与「归档」的区别只在原因（归档因权重自然衰减，作废因人工作废）。",
				showSuperseded: "查看已作废",
				supersededEmpty: "（暂无作废条目）",
				reactivate: "恢复",
				extractTitle: "从当前对话抽取记忆",
				extractHelp: "点按钮才抽取（后台自动抽取已按你的要求取消，避免烧 token）：取当前会话最新对话 → 交给模型抽成候选 → 经指纹去重与近重复合并后入库。建议先「预览」看将要发送的内容；抽取用的模型在设置页配置（extractProvider / extractModel）。",
				extractPreview: "预览（不花 token）",
				extractRun: "开始抽取",
				extractRunning: "抽取中…",
				extractFailed: "抽取失败",
				extractChars: "对话字符",
				extractCandidates: "候选",
				extractKept: "采用",
				extractWritten: "新增",
				extractMerged: "合并",
				extractSkipped: "跳过",
				reset: "恢复默认",
				resetConfirm: "确定恢复全部默认设置？",
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
				opsFailed: "操作未生效，请重试（详情见日志）",
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
				subtitle: "Digital Hippocampus · {total} memories · keyword retrieval",
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
				model: "Retrieval",
				modelNote: "keyword relevance",
				modelTag: "offline · zero-dep",
				audit: "Metabolism",
				auditNote: "7d events",
				auditTag: "135 entries w≥10",
				composition: "Composition",
				typeDist: "By type",
				weightDist: "By weight",
				recentActivity: "Recent activity",
				flow: "Memory flow",
				searchPlaceholder: "Search: e.g. mirror download, pet rules…",
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
				fallbackHelp: "When approval is unavailable (no service / request error / policy never): deny and audit (fail-closed, default) or auto-save and audit",
				fallbackAuto: "Auto-save",
				fallbackDeny: "Deny (recommended)",
				autoDreamDays: "Auto-dream (days, 0=off)",
				autoDreamDaysHelp: "Run dream if older (default 7)",
				autoReflectDays: "Auto-reflect (days, 0=off)",
				autoReflectDaysHelp: "Run reflect if older (default 3)",
				nearDuplicateThreshold: "Write dedup threshold (0-1, 0=off)",
				nearDuplicateThresholdHelp: "Similarity to an existing entry of the same type at or above this triggers the policy on the right (default 0.7)",
				nearDuplicateAction: "Near-duplicate policy",
				nearDuplicateActionHelp: "merge = fold into the existing entry (appends a dated supplement and raises weight) / skip = only report it",
				nearDuplicateActionMerge: "Merge automatically (recommended)",
				nearDuplicateActionSkip: "Report only",
				sinkWindowMinutes: "Sink reminder window (minutes)",
				sinkWindowMinutesHelp: "How long the post-turn sink reminder stays valid (default 5; older ones are dropped and re-judged next turn)",
				modelPending: "—",
				modelFailed: "—",
				last7d: "last 7d",
				archiveTitle: "Archived memories",
				archiveHelp: "Archived entries are no longer injected and no longer appear in retrieval; here you can see them and restore them (restored entries rejoin retrieval and the snapshot).",
				archiveShow: "Show archived",
				archiveEmpty: "(no archived entries)",
				archiveLoading: "Loading…",
				unarchive: "Unarchive",
				supersede: "Supersede",
				supersededTitle: "Superseded memories (conflict ruling)",
				supersededHint: "Superseding marks a memory as replaced by a newer conclusion: it leaves snapshot injection and retrieval while the record stays and can be restored. The only difference from archiving is the reason (archived = natural decay, superseded = human ruling).",
				showSuperseded: "Show superseded",
				supersededEmpty: "(no superseded entries)",
				reactivate: "Restore",
				extractTitle: "Extract memories from this conversation",
				extractHelp: "Runs only when you click it (the automatic per-N-turns extraction was dropped to save tokens): it reads the latest conversation of the current session, asks the model for candidate memories, then stores them through the same fingerprint dedup and near-duplicate merge. Preview first to see exactly what would be sent; set extractProvider / extractModel on the settings tab.",
				extractPreview: "Preview (no tokens)",
				extractRun: "Extract now",
				extractRunning: "Extracting…",
				extractFailed: "Extraction failed",
				extractChars: "Transcript chars",
				extractCandidates: "Candidates",
				extractKept: "Kept",
				extractWritten: "New",
				extractMerged: "Merged",
				extractSkipped: "Skipped",
				reset: "Reset",
				resetConfirm: "Reset all settings?",
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
				opsFailed: "Operation did not take effect — please retry",
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

		/* ---- 本地化控件样式（官方 Button/Input module.css 移植，类名 bm- 前缀，仅用主题令牌）---- */
		.bm-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;border:none;border-radius:var(--dsw-radius-md,8px);cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary,var(--bm-text));background:transparent;padding:0 14px}
		.bm-btn:disabled{cursor:not-allowed;opacity:.4}
		.bm-btn-md{height:36px}
		.bm-btn-sm{height:28px;font-size:12px;line-height:18px;padding:0 10px;border-radius:var(--dsw-radius-sm,6px)}
		.bm-btn-primary{background:var(--dsw-alias-button-primary-fill,#7C3AED);color:var(--dsw-alias-label-primary-foreground,#fff)}
		.bm-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#6D28D9)}
		.bm-btn-ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
		.bm-btn-ghost:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.18))}
		.bm-btn-outline{border:.5px solid var(--dsw-alias-border-l3,var(--bm-border));background:transparent}
		.bm-btn-outline:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
		.bm-btn-toolbar{background:var(--dsw-alias-button-tool-bar-fill,transparent)}
		.bm-btn-toolbar:hover:not(:disabled){background:var(--dsw-alias-button-tool-bar-hover,rgba(127,127,127,.12))}
		.bm-btn-icon{display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center}
		.bm-input-wrap{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4,var(--bm-border));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,var(--bm-surface))}
		.bm-input-wrap:focus-within{border-color:var(--dsw-alias-state-business-primary,#7C3AED)}
		.bm-input-icon{display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary,var(--bm-muted))}
		.bm-input{flex:1;min-width:0;border:none;outline:none;background:transparent;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary,var(--bm-text))}
		.bm-input::placeholder{color:var(--dsw-alias-label-dimmed,var(--bm-muted))}
`;
		const CONFIG_KEYS = ["halfLifeDays", "decayThreshold", "consolidateThreshold", "weightCap", "hotTokenLimit", "maxQueryResults", "autoDreamDays", "autoReflectDays", "nearDuplicateThreshold", "sinkWindowMinutes"];
		/* Button / Input / 图标 现由本文件顶部的 vendored 块提供（不再 require Harness Client 包） */
		function BiomemorySettingsPage() {
			const t = text();
			const [status, setStatus] = react.useState({ kind: "loading" });
			const [configText, setConfigText] = react.useState({});
			const [fallback, setFallback] = react.useState("auto");
			// v0.8.0 新增配置：近重复处理策略（merge/skip）与启动预加载嵌入模型（布尔，不能走数值字段）
			const [dupAction, setDupAction] = react.useState("merge");
			const [extractProvider, setExtractProvider] = react.useState("");
			const [extractModel, setExtractModel] = react.useState("");
			const [saveState, setSaveState] = react.useState(null);
			const [dream, setDream] = react.useState(null);
			const [audit, setAudit] = react.useState(null);
			const [tab, setTab] = react.useState("overview");
			const [searchText, setSearchText] = react.useState("");
			const [layerSel, setLayerSel] = react.useState("");
			const [knowledge, setKnowledge] = react.useState({ kind: "idle", entries: [] });
			const [reflect, setReflect] = react.useState(null);
			const [editingFp, setEditingFp] = react.useState(null);
			const [editingText, setEditingText] = react.useState("");
			const [lastRemoved, setLastRemoved] = react.useState(null);
			// v0.8.0：统一请求生命周期——所有面板请求都登记在册，组件卸载时统一 abort。
			// 旧实现只有 loadStatus 自带 AbortController，其余在途请求在面板关闭后仍会 setState（React 警告 + 空转）。
			const inflightRef = react.useRef(new Set());
			const apiFetch = react.useCallback((url, init = {}) => {
				const controller = new AbortController();
				inflightRef.current.add(controller);
				return window.fetch(url, { credentials: "same-origin", ...init, signal: controller.signal })
					.finally(() => { inflightRef.current.delete(controller); });
			}, []);
			react.useEffect(() => () => {
				for (const c of inflightRef.current) {
					try { c.abort(); } catch (error) { /* 已结束的请求忽略 */ }
				}
			}, []);
			// v0.8.0：切换 tab 时清掉编辑态——旧实现 editingFp/editingText 被知识库与反思页共用，
			// 在一个页签点了「编辑」再切到另一个页签，会看到另一条记忆的编辑框（跨 tab 串扰）。
			react.useEffect(() => {
				setEditingFp(null);
				setEditingText("");
			}, [tab]);
			const loadStatus = react.useCallback(() => {
				return apiFetch("/biomemory/api/status", {}).then(async (response) => {
					if (!response.ok) throw new Error("status unavailable");
					const data = await response.json();
					if (!data?.ok) throw new Error("status unavailable");
					const cfg = data.config || {};
					const textForm = {};
					for (const key of CONFIG_KEYS) textForm[key] = cfg[key] !== void 0 ? String(cfg[key]) : "";
					setConfigText(textForm);
					setFallback(data.config?.approvalFallback || "auto");
					setDupAction(data.config?.nearDuplicateAction === "skip" ? "skip" : "merge");
					setExtractProvider(data.config?.extractProvider || "");
					setExtractModel(data.config?.extractModel || "");
					setStatus({ kind: "ready", value: data });
				}).catch(() => setStatus({ kind: "error" }));
			}, []);
			// v0.8.0：effect 里不能再直接把 loadStatus() 的返回值（Promise）当作 cleanup 返回
			react.useEffect(() => { loadStatus(); }, [loadStatus]);
			// 挂载时给 .bm-page 打上 data-dsh-theme，并实时跟随主题变化：
			// ① 系统主题（matchMedia）② DSH 运行中切换主题（data-ds-dark-theme 属性变化，MutationObserver）
			react.useEffect(() => {
				applyDshTheme();
				const cleanups = [];
				if (typeof window.matchMedia === "function") {
					const mq = window.matchMedia("(prefers-color-scheme: dark)");
					const onChange = () => applyDshTheme();
					if (typeof mq.addEventListener === "function") {
						mq.addEventListener("change", onChange);
						cleanups.push(() => mq.removeEventListener("change", onChange));
					} else if (typeof mq.addListener === "function") {
						mq.addListener(onChange);
						cleanups.push(() => mq.removeListener(onChange));
					}
				}
				if (typeof MutationObserver === "function") {
					const obs = new MutationObserver(() => applyDshTheme());
					try {
						obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
						if (document.body) obs.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
						cleanups.push(() => obs.disconnect());
					} catch (error) {
						/* 观察失败：保留 matchMedia 通道 */
					}
				}
				return () => {
					for (const fn of cleanups) fn();
				};
				// v0.8.0：补依赖数组——旧实现每次渲染都重建 matchMedia 监听与 MutationObserver
			}, []);
			// 操作失败提示（删除/编辑/锁定等）：不再静默 —— 失败时给出可见反馈
			const [opError, setOpError] = react.useState(null);
			const failOp = (op) => setOpError([op]);
			const saveConfig = () => {
				setSaveState({ kind: "saving" });
				const body = {};
				for (const key of CONFIG_KEYS) { const value = configText[key]; if (value !== void 0 && value !== "") body[key] = Number(value); }
				body.approvalFallback = fallback === "deny" ? "deny" : "auto";
				body.nearDuplicateAction = dupAction === "skip" ? "skip" : "merge"; // v0.8.0：字符串配置，不能走数值字段
				body.extractProvider = extractProvider.trim();
				body.extractModel = extractModel.trim();
				apiFetch("/biomemory/api/config", {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body)
				}).then(async (response) => {
					if (!response.ok) throw new Error("save failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("save failed");
					setSaveState({ kind: "ok" });
					loadStatus();
				}).catch(() => setSaveState({ kind: "error" }));
			};
			const resetConfig = () => {
				if (!window.confirm(t.resetConfirm)) return;
				setSaveState({ kind: "saving" });
				apiFetch("/biomemory/api/config", {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ reset: true })
				}).then(async (response) => {
					if (!response.ok) throw new Error("reset failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("reset failed");
					setFallback(data.config?.approvalFallback || "auto");
					setDupAction(data.config?.nearDuplicateAction === "skip" ? "skip" : "merge");
					setExtractProvider(data.config?.extractProvider || "");
					setExtractModel(data.config?.extractModel || "");
					const textForm = {};
					for (const key of CONFIG_KEYS) textForm[key] = data.config[key] !== void 0 ? String(data.config[key]) : "";
					setConfigText(textForm);
					setSaveState({ kind: "ok" });
					loadStatus();
				}).catch(() => setSaveState({ kind: "error" }));
			};
			const runDream = (dryRun) => {
				setDream({ kind: "running", dryRun });
				apiFetch("/biomemory/api/dream", {
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
				apiFetch("/biomemory/api/audit?sinceDays=30", { credentials: "same-origin" })
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
				apiFetch(`/biomemory/api/entries?${params.toString()}`, { credentials: "same-origin" })
					.then(async (response) => {
						if (!response.ok) throw new Error("entries failed");
						const data = await response.json();
						if (!data?.ok) throw new Error("entries failed");
						setKnowledge({ kind: "ready", entries: data.entries || [] });
					}).catch(() => setKnowledge({ kind: "error", entries: [] }));
			};
			// v0.8.1：归档条目的查看与恢复（归档 = 不再注入/不再被检索，但用户必须能看到并恢复）
			const [archived, setArchived] = react.useState({ kind: "idle", entries: [] });
			const loadArchived = () => {
				setArchived({ kind: "loading", entries: [] });
				apiFetch("/biomemory/api/archived", { credentials: "same-origin" })
					.then(async (response) => {
						if (!response.ok) throw new Error("archived failed");
						const data = await response.json();
						if (!data?.ok) throw new Error("archived failed");
						setArchived({ kind: "ready", entries: data.entries || [] });
					}).catch(() => setArchived({ kind: "error", entries: [] }));
			};
			const unarchiveOp = (fp) => {
				apiFetch("/biomemory/api/entries/unarchive", {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ fp })
				}).then(async (response) => {
					if (!response.ok) throw new Error("unarchive failed");
					const data = await response.json();
					if (!data?.ok) throw new Error("unarchive failed");
					loadArchived();
					loadStatus();
				}).catch(() => failOp("unarchive"));
			};
			// v0.8.1：按需抽取（按钮触发）——预览走 transcriptOnly（零 token），抽取才调用模型
			const [extract, setExtract] = react.useState(null);
			const [superseded, setSuperseded] = react.useState({ kind: "idle", entries: [] });
			const runExtractNow = (mode) => {
				setExtract({ kind: "running", mode });
				apiFetch("/biomemory/api/extract", {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify(mode === "preview" ? { transcriptOnly: true } : { dryRun: mode === "dry" })
				}).then(async (response) => {
					const data = await response.json().catch(() => null);
					if (!response.ok || !data || !data.ok) throw new Error((data && data.error) || "extract failed");
					setExtract({ kind: "ready", mode, report: data.report || {} });
					loadStatus();
				}).catch((err) => setExtract({ kind: "error", mode, error: err instanceof Error ? err.message : String(err) }));
			};
			const entryOp = (fp, op, text) => {
				const body = { fp };
				if (text !== void 0) body.text = text;
				apiFetch(`/biomemory/api/entries/${op}`, {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body)
				}).then(async (response) => {
					if (!response.ok) throw new Error(`${op} failed`);
					const data = await response.json();
					if (!data?.ok) throw new Error(`${op} failed`);
					if (op === "update") { setEditingFp(null); setEditingText(""); }
					loadEntries();
				}).catch(() => failOp(op));
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
				apiFetch("/biomemory/api/entries/update", {
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
				}).catch(() => failOp("update"));
			};
			// 反思页删除冲突条目（仅限潜在冲突列表）：先备份可回滚，删除后从列表移除
			const removeConflict = (fp, text) => {
				apiFetch("/biomemory/api/entries/remove", {
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
				}).catch(() => failOp("remove"));
			};
			// 撤销删除：从备份回滚单条目，加回冲突列表
			const undoRemove = () => {
				if (!lastRemoved) return;
				const fp = lastRemoved.fp;
				apiFetch("/biomemory/api/entries/restore", {
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
				}).catch(() => failOp("restore"));
			};
			const runReflect = (dryRun) => {
				setReflect({ kind: "running", dryRun });
				apiFetch("/biomemory/api/reflect", {
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
			const byType = stats.byType || [];
			const byWeight = stats.byWeight || [];
			const audit7d = stats.audit7d || [];
			// ---------- 概览页 ----------
			const overviewCards = [
				[t.total, String(stats.total === void 0 ? "—" : stats.total), t.totalNote, "", ""],
				[t.pinned, String(stats.pinned === void 0 ? "—" : stats.pinned), t.pinnedNote, "", ""],
				[t.audit, String(stats.auditCount === void 0 ? "—" : stats.auditCount), t.auditNote, `${t.last7d} ${audit7d.reduce((sum, r) => sum + (Number(r.count) || 0), 0)}`, "secondary"]
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
			const flowSection = (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.flow), (0, react.createElement)("div", { className: "bm-search-row" }, (0, react.createElement)("input", {
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
			// v0.8.1：归档出口——「归档 = 静默下架」是自审里最硬的一条不对劲，补上查看与恢复
			const archiveSection = (0, react.createElement)("section", { className: "bm-block" },
				(0, react.createElement)("h4", null, t.archiveTitle),
				(0, react.createElement)("div", { className: "bm-note" }, t.archiveHelp),
				(0, react.createElement)("div", { className: "bm-actions" }, (0, react.createElement)(Button, { onClick: () => loadArchived() }, t.archiveShow)),
				archived.kind === "loading" ? (0, react.createElement)("div", { className: "bm-note" }, t.archiveLoading) : null,
				archived.kind === "error" ? (0, react.createElement)("div", { className: "bm-err" }, t.opsFailed) : null,
				archived.kind === "ready" && (archived.entries || []).length === 0 ? (0, react.createElement)("div", { className: "bm-note" }, t.archiveEmpty) : null,
				archived.kind === "ready" && (archived.entries || []).length
					? (0, react.createElement)("ul", { className: "bm-list" },
						archived.entries.slice(0, 50).map((e) => (0, react.createElement)("li", { key: e.fp },
							`${e.fp} · w=${e.weight} · ${e.fragment_type} · ${String(e.text || "").replace(/\s+/g, " ").slice(0, 100)}`,
							" ",
							(0, react.createElement)(Button, { onClick: () => unarchiveOp(e.fp) }, t.unarchive))))
					: null);
			// v0.8.1：冲突裁决闭环——把「作废」做成有出口的动作（此前只有红徽章，没有解决手段）
			const loadSuperseded = () => {
				setSuperseded({ kind: "loading", entries: [] });
				apiFetch("/biomemory/api/superseded", { credentials: "same-origin" })
					.then(async (response) => {
						if (!response.ok) throw new Error("superseded failed");
						const data = await response.json();
						if (!data?.ok) throw new Error("superseded failed");
						setSuperseded({ kind: "ready", entries: data.entries || [] });
					}).catch(() => setSuperseded({ kind: "error", entries: [] }));
			};
			const neutralize = (fp, status) => {
				apiFetch(status === "superseded" ? "/biomemory/api/entries/supersede" : "/biomemory/api/entries/reactivate", {
					method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ fp, reason: status === "superseded" ? "UI 冲突裁决" : void 0 })
				}).then(async (response) => {
					const data = await response.json().catch(() => null);
					if (!response.ok || !data || !data.ok) throw new Error((data && data.error) || "op failed");
					loadEntries(); loadSuperseded(); loadStatus();
				}).catch(() => failOp(status));
			};
			const supersedeOp = (fp) => neutralize(fp, "superseded");
			const supersededSection = (0, react.createElement)("section", { className: "bm-block" },
				(0, react.createElement)("h4", null, t.supersededTitle),
				(0, react.createElement)("div", { className: "bm-note" }, t.supersededHint),
				(0, react.createElement)("div", { className: "bm-actions" }, (0, react.createElement)(Button, { onClick: () => loadSuperseded() }, t.showSuperseded)),
				superseded.kind === "ready" && (superseded.entries || []).length === 0 ? (0, react.createElement)("div", { className: "bm-note" }, t.supersededEmpty) : null,
				superseded.kind === "ready" && (superseded.entries || []).length
					? (0, react.createElement)("ul", { className: "bm-list" },
						superseded.entries.slice(0, 50).map((e) => (0, react.createElement)("li", { key: e.fp },
							`${e.fp} · w=${e.weight} · ${e.fragment_type} · ${String(e.text || "").replace(/\s+/g, " ").slice(0, 100)}`, " ",
							(0, react.createElement)(Button, { onClick: () => neutralize(e.fp, "active") }, t.reactivate))))
					: null);
			const extractSection = (0, react.createElement)("section", { className: "bm-block" },
				(0, react.createElement)("h4", null, t.extractTitle),
				(0, react.createElement)("div", { className: "bm-note" }, t.extractHelp),
				(0, react.createElement)("div", { className: "bm-actions" },
					(0, react.createElement)(Button, { onClick: () => runExtractNow("preview") }, t.extractPreview),
					(0, react.createElement)(Button, { variant: "primary", onClick: () => runExtractNow("run") }, t.extractRun)),
				extract && extract.kind === "running" ? (0, react.createElement)("div", { className: "bm-note" }, t.extractRunning) : null,
				extract && extract.kind === "error" ? (0, react.createElement)("div", { className: "bm-err" }, `${t.extractFailed}：${extract.error}`) : null,
				extract && extract.kind === "ready" ? (0, react.createElement)("div", null,
					(0, react.createElement)("div", { className: "bm-summary" }, `${t.extractChars} ${extract.report.transcriptChars || 0} · ${t.extractCandidates} ${extract.report.candidates || 0} · ${t.extractKept} ${extract.report.kept || 0} · ${t.extractWritten} ${extract.report.written || 0} · ${t.extractMerged} ${extract.report.merged || 0} · ${t.extractSkipped} ${extract.report.skipped || 0}`),
					extract.report.previewOnly ? (0, react.createElement)("pre", { className: "bm-note", style: { whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto" } }, extract.report.transcript || "") : null,
					(extract.report.items || []).length ? (0, react.createElement)("ul", { className: "bm-list" }, extract.report.items.slice(0, 20).map((it, i) => (0, react.createElement)("li", { key: i }, `[${it.type} ${it.confidence}] ${it.text}`))) : null) : null);
			const overviewSection = (0, react.createElement)(react.Fragment, null, (0, react.createElement)("div", { className: "bm-grid" }, ...overviewCards), compositionSection, flowSection, extractSection, archiveSection, supersededSection);
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
					autoReflectDays: t.autoReflectDays,
					nearDuplicateThreshold: t.nearDuplicateThreshold,
					sinkWindowMinutes: t.sinkWindowMinutes
				};
				const helps = {
					halfLifeDays: t.halfLifeDaysHelp,
					decayThreshold: t.decayThresholdHelp,
					consolidateThreshold: t.consolidateThresholdHelp,
					weightCap: t.weightCapHelp,
					hotTokenLimit: t.hotTokenLimitHelp,
					maxQueryResults: t.maxQueryResultsHelp,
					autoDreamDays: t.autoDreamDaysHelp,
					autoReflectDays: t.autoReflectDaysHelp,
					nearDuplicateThreshold: t.nearDuplicateThresholdHelp,
					sinkWindowMinutes: t.sinkWindowMinutesHelp
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
			const settingsSection = (0, react.createElement)(react.Fragment, null, (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, t.config), (0, react.createElement)("div", { className: "bm-config" }, ...configFields), (0, react.createElement)("div", { className: "bm-actions" }, (0, react.createElement)(Button, {
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
						onClick: () => supersedeOp(entry.fp)
					}, t.supersede), (0, react.createElement)(Button, {
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
			const knowledgeSection = (0, react.createElement)("section", { className: "bm-block" }, (0, react.createElement)("h4", null, (0, react.createElement)(IconBrowseOutline16, { size: 14 }), " ", t.tabKnowledge), (0, react.createElement)("div", { className: "bm-toolbar" }, (0, react.createElement)(Input, {
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
				onClick: () => { setTab(id); setOpError(null); }
			}, icon ? (0, react.createElement)(react.Fragment, null, icon, " ") : null, label);
			const iconMap = {
				overview: (0, react.createElement)(IconBrowseOutline16, { size: 14 }),
				knowledge: (0, react.createElement)(IconSearchOutline16, { size: 14 }),
				metabolism: (0, react.createElement)(IconRefreshOutline14, { size: 14 }),
				reflect: (0, react.createElement)(IconThinkOutline14, { size: 14 }),
				settings: (0, react.createElement)(IconSettingsOutline16, { size: 14 })
			};
			// 副标题取真实条数（v0.6.5：不再硬编码「151 条记忆」）
			const subtitle = String(t.subtitle).replace("{total}", stats.total === void 0 ? "—" : String(stats.total));
			return (0, react.createElement)("div", { className: "bm-page" }, (0, react.createElement)("style", null, styles), (0, react.createElement)("div", null, (0, react.createElement)("h3", null, t.title), (0, react.createElement)("div", { className: "bm-sub" }, subtitle)), opError ? (0, react.createElement)("div", { className: "bm-err" }, `${t.opsFailed}（${opError[0] || ""}）`) : null, (0, react.createElement)("div", { className: "bm-tabs" }, tabBtn("overview", t.tabOverview, iconMap.overview), tabBtn("knowledge", t.tabKnowledge, iconMap.knowledge), tabBtn("metabolism", t.tabMetabolism, iconMap.metabolism), tabBtn("reflect", t.tabReflect, iconMap.reflect), tabBtn("settings", t.tabSettings, iconMap.settings)), tab === "overview" ? overviewSection : tab === "knowledge" ? knowledgeSection : tab === "metabolism" ? metabolismSection : tab === "reflect" ? reflectSection : settingsSection);
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
