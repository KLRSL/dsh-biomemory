// ============================================================================
// dsh-memory-layer · 触发信号（trigger.mjs，v2）
//
// 「触发式召回」的最小实现：把一段记忆挂到一个**确定性**的触发串上，
// 召回时用当前会话的信号去命中它——不靠模型判断、不靠向量。
//
// trigger 形态（只有三种，保持可解释）：
//   file:<文件名>   来自文本/工具参数里的路径（如 file:package.json）
//   tool:<工具名>   来自 tool/call 的工具名（如 tool:pwsh）
//   err:<错误代号>  来自错误输出里的大写代号（如 err:MODULE_NOT_FOUND）
//
// 记忆类型（type）与优先级：workflow(0) > error(1) > decision(2) > fact(3)。
// 类型从文本特征推断，规则固定、可测；判不出来就是 fact。
// ============================================================================

export const TYPE_PRIORITY = { workflow: 0, error: 1, decision: 2, fact: 3 }

const RE_PATH = /[A-Za-z0-9_.\/\\-]*[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,6}\b/g
const RE_ERRCODE = /\b([A-Z][A-Z0-9_]{3,})\b/g

/** 归一化 trigger：小写、去空白；非字符串返回 null */
export function normalizeTrigger(s) {
  const v = String(s ?? '').trim().toLowerCase().replace(/\s+/g, '')
  if (!v) return null
  return v.length > 96 ? v.slice(0, 96) : v
}

/** 从一段文本里抽 trigger（文件 + 错误代号） */
export function triggersFromText(text) {
  const out = new Set()
  const s = String(text || '')
  for (const m of s.matchAll(RE_PATH)) {
    const base = m[0].split(/[\/\\]/).pop()
    if (base && /\.[A-Za-z0-9]{1,6}$/.test(base)) out.add(normalizeTrigger('file:' + base))
  }
  for (const m of s.matchAll(RE_ERRCODE)) {
    const code = m[1]
    if (code.length >= 5 && !['HTTPS', 'HTTP', 'JSON', 'README'].includes(code)) out.add(normalizeTrigger('err:' + code))
  }
  return [...out]
}

/** 从宿主事件（tool/call 的 name + arguments 原始 JSON 串）抽 trigger */
export function triggersFromToolCalls(calls = []) {
  const out = new Set()
  for (const c of calls) {
    if (!c) continue
    if (c.name) out.add(normalizeTrigger('tool:' + c.name))
    const args = typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments ?? '')
    for (const t of triggersFromText(args)) out.add(t)
  }
  return [...out]
}

/** 记忆类型推断：workflow / error / decision / fact（规则固定，判不出即 fact） */
export function inferType({ text, track } = {}) {
  const t = String(text || '')
  if (/教训|踩坑|踩过的坑|报错|错误|失败|异常|崩|事故|严禁再|别再犯|bug/i.test(t)) return 'error'
  if (/流程|步骤|顺序|先.{1,12}(再|然后)|每次都要|按这个来|工作流|固定做法|操作顺序/.test(t)) return 'workflow'
  if (/决定|拍板|定为|定为|采用|弃用|以后都|约定|规矩|必须|不许|禁止|统一/.test(t)) return 'decision'
  if (track === 'user' && /偏好|喜欢|希望|更倾向/.test(t)) return 'decision'
  return 'fact'
}

/** 同键覆盖用的 key：取首句前 24 字（去标点空白、小写）；不足 6 字返回 null（不参与覆盖） */
export function makeKey(text) {
  const first = String(text || '').split(/[。！？\n]/)[0] || ''
  const v = first.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase().slice(0, 24)
  return v.length >= 6 ? v : null
}

/** 类型优先级（未知类型排在 fact 之后） */
export function priorityOf(mtype) {
  const p = TYPE_PRIORITY[mtype]
  return p === undefined ? 9 : p
}
