// ============================================================================
// dsh-biomemory · 审批门与自检（gate.mjs，v0.6 架构升级）
//
//   - gateWrite：分级审批门（重要 ask / 普通 auto；审批不可用按 approvalFallback 降级）
//   - selfHeal：SQLite 完整性自检，损坏时从最近备份恢复
// 从 index.mjs 拆出；依赖 shared / db / notify。
// ============================================================================

import * as db from './db.mjs'
import { CFG, isImportant, TOOL_NAME, REQUEST_MARKER, dbgLog, audit } from './shared.mjs'

// ---------- 审批门（分级：重要 ask / 普通 auto；审批不可用按 approvalFallback 降级） ----------

/** DSH 运行时实际返回值（0.1.5-rc.1：dsh-user-approval ApprovalOutcome =
 *  'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'；仅 'allowed-once' 是授予）。
 *  宽松匹配：大小写/下划线/连字符差异均归一，但不放宽授予语义——未知词一律拒绝。 */
export function isApprovalGranted(outcome) {
  const v = String(outcome ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-')
  if (v === 'allowed-once' || v === 'allowed' || v === 'allow' || v === 'granted' || v === 'approved' || v === 'allow-once') return true
  if (v === 'rejected' || v === 'cancelled' || v === 'canceled' || v === 'unavailable' || v === 'deny' || v === 'denied') return false
  // 不认识的词：不是本运行时契约的授予值 → fail-closed（记审计便于排查版本差异）
  if (v) {
    try { audit('APPROVAL-UNKNOWN', { detail: { outcome: String(outcome), tool: TOOL_NAME } }) } catch { /* 审计失败不影响拒绝 */ }
  }
  return false
}

export async function gateWrite(ctx, { track, text }) {
  const important = isImportant(text, track)
  if (!important) {
    return { approved: true, mode: 'auto' }
  }
  const failClosed = CFG.approvalFallback !== 'auto' // 默认 'deny'：审批缺失/异常 → 拒绝（fail-closed）
  const fallback = (why, outcome) => {
    try { audit('APPROVAL-UNAVAILABLE', { detail: { why, outcome: outcome ?? null, fallback: failClosed ? 'deny' : 'auto', track } }) } catch { /* 审计失败不改变策略 */ }
    return failClosed
      ? { approved: false, mode: 'ask', outcome: outcome ?? 'unavailable' }
      : { approved: true, mode: 'fallback', outcome: outcome ?? 'unavailable' }
  }
  const approval = ctx.get('approval')
  if (!approval) return fallback('service-missing')
  let outcome
  try {
    outcome = await approval.request({
      toolName: TOOL_NAME,
      reason: `${REQUEST_MARKER} add ${track}\n${text}`,
    })
  } catch (err) {
    // v0.6.5：异常不再静默吞掉——记审计后再按 fallback 策略处理
    return fallback('request-threw', err instanceof Error ? err.message : String(err))
  }
  if (isApprovalGranted(outcome)) return { approved: true, mode: 'ask' }
  // 策略 never / 被拒 / 取消 / unavailable：按 fallback 策略决定（审计会标记）
  return failClosed
    ? { approved: false, mode: 'ask', outcome }
    : { approved: true, mode: 'fallback', outcome }
}

// ---------- 启动自检：主文件解析失败 → 回滚最近备份 ----------

export function selfHeal() {
  // v0.5：SQLite 完整性自检——数据库损坏（如 SQLITE_CORRUPT）时从最近备份恢复
  try {
    db.openDb()
    db.stats() // 触发一次全表读，损坏会抛
  } catch {
    const bk = db.listBackups()
    if (bk.length) {
      const restored = db.restoreLatestBackup()
      db.audit('ROLLBACK', { detail: { from: restored } })
      dbgLog(`self-heal: restored from ${restored}`)
    }
  }
}
