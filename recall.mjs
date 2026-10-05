// ============================================================================
// dsh-memory-layer · 触发式召回（recall.mjs，v2）
//
// 输入当前会话的"信号"（项目路径 + 最近工具调用），输出该注入的内容：
//   - 命中 trigger 的记忆：按类型优先级 workflow > error > decision > fact，同类型按 last_used
//   - 命中 trigger 的工作流链：优先注入（整条链）
//   - 注入预算：最多 maxItems 条 / maxChars 字符（超了按优先级截断）
//
// 不靠模型判断、不靠向量：命中就注入，没命中就什么都不注入（宁缺毋滥，预算优先）。
// ============================================================================

import * as db from './db.mjs'
import { triggersFromText, triggersFromToolCalls, priorityOf } from './trigger.mjs'

export const BUDGET = { maxItems: 8, maxChars: 1200 }

/** 组装本次注入内容。返回 { text, items, triggers, chars } */
export function recallBySignals({ cwd, toolCalls = [] } = {}, budget = BUDGET) {
  const triggers = [...new Set([...triggersFromToolCalls(toolCalls), ...triggersFromText(cwd || '')])].filter(Boolean)
  if (!triggers.length) return { text: '', items: [], triggers: [], chars: 0 }
  const realm = cwd ? 'project:' + String(cwd).toLowerCase().replace(/\\/g, '/') : 'user'
  const hits = db.byTrigger(triggers, { realm })
  hits.sort((a, b) => priorityOf(a.mtype) - priorityOf(b.mtype) || String(b.last_accessed || b.created_at || '').localeCompare(String(a.last_accessed || a.created_at || '')))
  const chains = triggers.map((t) => db.chainGet(t)).filter(Boolean)
  const lines = []
  let chars = 0
  const items = []
  const push = (line, item) => {
    if (items.length >= budget.maxItems) return false
    if (chars + line.length > budget.maxChars) return false
    lines.push(line)
    chars += line.length
    items.push(item)
    return true
  }
  for (const c of chains) {
    if (!push(`- [链] 当 ${c.trigger} 时：${(c.steps || []).join(' → ')}`, { kind: 'chain', trigger: c.trigger })) break
  }
  for (const e of hits) {
    if (!push(`- [${e.mtype || 'fact'}] ${e.text}`, { kind: 'memory', fp: e.fp })) break
  }
  if (!lines.length) return { text: '', items: [], triggers, chars: 0 }
  // 用进废退：只有真正被注入的条目才记一次使用
  const fps = new Set(items.filter((i) => i.fp).map((i) => i.fp))
  for (const fp of fps) db.touchEntry(fp, { hitsDelta: 1, accessed: true })
  for (const i of items) if (i.kind === 'chain') db.chainTouched(i.trigger)
  return { text: lines.join('\n'), items, triggers, chars }
}
