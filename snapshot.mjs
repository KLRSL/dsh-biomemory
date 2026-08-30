// ============================================================================
// dsh-biomemory · 快照与会话沉淀层（snapshot.mjs，v0.6 架构升级）
//
//   - renderSnapshot：会话启动注入 system prompt 的冻结快照（偏好/锁定/知识/行为）
//   - 会话结束自动沉淀：turn/end(completed) 后注入"请沉淀"指令，模型据此 memory add
// 从 index.mjs 拆出；依赖 shared / db / session-state。
// ============================================================================

import * as db from './db.mjs'
import {
  PATHS, readFile, estimateTokens, detectConflict, CFG,
} from './shared.mjs'
import {
  isSummaryPending, getSummarySid, getLastTurnEnd, setLastTurnEnd, markSummaryPending, clearSummaryPending,
} from './session-state.mjs'

// ---------- 冻结快照（会话启动注入 system prompt；注册即冻结） ----------

export function renderSnapshot() {
  db.openDb()
  const prefs = db.listEntries({ fragmentType: 'preference', status: 'active', limit: 200 })
    .map((e) => `- [${e.created_at ? String(e.created_at).slice(0, 10) : ''}] ${e.text}`)
    .join('\n')
  const all = db.allEntries()
  const pinned = []
  const kb = []
  const bb = []
  for (const e of all) {
    if (e.pinned) pinned.push(`- [锁定|${e.layer}] ${e.text}`)
    else if (e.fragment_type === 'preference' || e.kind === '知识') kb.push(e)
    else bb.push(e)
  }
  // 自动召回排序：权重高、新近的优先（预算内只注入最有价值的）
  const rank = (a, b) => (b.weight - a.weight) || (String(b.created_at || '').localeCompare(String(a.created_at || '')))
  const fmt = (e) => `- [${e.layer}] ${e.text}`
  const prefsText = readFile(PATHS.preferences)
  const parts = []
  if (prefs) parts.push('## 用户偏好（最高优先级）\n' + prefs)
  if (pinned.length) parts.push('## 锁定记忆（最高优先级，不参与衰减）\n' + pinned.join('\n'))
  if (kb.length) parts.push('## 近期知识记忆\n' + kb.sort(rank).map(fmt).join('\n'))
  if (bb.length) {
    // 与偏好冲突的行为记忆置顶并标注（冲突浮出，会话内即可发现）
    const bbSorted = [...bb].sort((a, b) => {
      const ca = a.kind === '行为' && detectConflict(a, prefsText) ? 1 : 0
      const cb = b.kind === '行为' && detectConflict(b, prefsText) ? 1 : 0
      return (cb - ca) || rank(a, b)
    })
    parts.push('## 近期行为记忆\n' + bbSorted.map((e) => `- [${e.layer}]${e.kind === '行为' && detectConflict(e, prefsText) ? ' [冲突]' : ''} ${e.text}`).join('\n'))
  }
  if (!parts.length) return ''
  let text = `# 记忆快照（dsh-biomemory，会话冻结）\n\n${parts.join('\n\n')}`
  // 热区 token 硬限制：超出部分截断（保留偏好与锁定）
  if (estimateTokens(text) > CFG.hotTokenLimit) {
    let budget = CFG.hotTokenLimit - estimateTokens(`# 记忆快照（dsh-biomemory，会话冻结）\n\n${parts[0]}\n\n${parts[1] || ''}`)
    const keep = [parts[0]]
    if (parts[1]) keep.push(parts[1])
    for (const p of parts.slice(2)) {
      const t = estimateTokens(p)
      if (t <= budget) { keep.push(p); budget -= t }
    }
    text = `# 记忆快照（dsh-biomemory，会话冻结）\n\n${keep.join('\n\n')}`
  }
  return text
}

// ---------- 会话结束自动沉淀（v0.6） ----------

// 供 systemPrompt.section 调用的总结指令文本（无待沉淀标记时返回空串，不污染提示词）
export function sessionSummarySectionText() {
  // 无待沉淀标记 → 不注入
  if (!isSummaryPending()) return ''
  // 距上次 turn/end 超过 5 分钟（用户在另一处、或已沉淀）→ 不再催促
  const last = getLastTurnEnd()
  if (last > 0 && Date.now() - last > 5 * 60 * 1000) {
    clearSummaryPending()
    return ''
  }
  // 注入一次总结指令：引导模型判断本轮有无值得沉淀的偏好/决策/教训并写入
  return [
    '## 本轮对话已结束 · 请沉淀值得长期记住的内容',
    '请回顾刚刚结束的这轮对话，判断是否有值得写入长期记忆的：用户偏好/纠正/项目决策/踩坑教训。',
    '若有，请用 `memory` 工具写入（track=user 存偏好/知识，track=agent 存行为/教训），做到严格去重——',
    '与已有记忆重复或可用代码/文件重新推导的不要写。若本轮无可沉淀内容，忽略即可。',
  ].join('\n')
}

// 监听 DSH 会话事件：turn/end(completed/success) 时标记本会话"待沉淀"
export function handleSessionEvent(session, rawEvent) {
  try {
    const ev = rawEvent ?? {}
    const evType = typeof ev.type === 'string' ? ev.type : ''
    if (evType === 'turn/end') {
      const reason = ev.data?.reason?.kind ?? ev.data?.reason
      const done = typeof reason === 'string' && (reason === 'completed' || reason === 'success')
      if (done) {
        setLastTurnEnd(Date.now(), session?.id ?? '')
        markSummaryPending(session?.id ?? '')
      }
    }
  } catch { /* 静默，不影响会话 */ }
}
