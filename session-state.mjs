// ============================================================================
// dsh-biomemory · 会话沉淀状态（session-state.mjs，v0.6）
//
// 会话结束自动沉淀的轻量状态：由 snapshot 模块写入（turn/end 时标记），
// store 模块在 writeEntry 成功后清除（模型完成沉淀）。独立成最小模块，
// 避免 store ↔ snapshot 循环依赖。
// ============================================================================

let _lastTurnEnd = 0
let _lastTurnEndSession = ''
let _summaryPending = false
let _summarySid = ''

export function markSummaryPending(sid) {
  _summaryPending = true
  _summarySid = sid || ''
}

export function clearSummaryPending() {
  _summaryPending = false
  _summarySid = ''
}

export function isSummaryPending() {
  return _summaryPending
}

export function getSummarySid() {
  return _summarySid
}

export function setLastTurnEnd(ts, sid) {
  _lastTurnEnd = ts
  _lastTurnEndSession = sid || ''
}

export function getLastTurnEnd() {
  return _lastTurnEnd
}
