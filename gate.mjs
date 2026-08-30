// ============================================================================
// dsh-biomemory · 审批门与自检（gate.mjs，v0.6 架构升级）
//
//   - gateWrite：分级审批门（重要 ask / 普通 auto；审批不可用按 approvalFallback 降级）
//   - selfHeal：SQLite 完整性自检，损坏时从最近备份恢复
// 从 index.mjs 拆出；依赖 shared / db / notify。
// ============================================================================

import * as db from './db.mjs'
import { CFG, isImportant, TOOL_NAME, REQUEST_MARKER, dbgLog } from './shared.mjs'

// ---------- 审批门（分级：重要 ask / 普通 auto；审批不可用按 approvalFallback 降级） ----------

export async function gateWrite(ctx, { track, text }) {
  const important = isImportant(text, track)
  if (!important) {
    return { approved: true, mode: 'auto' }
  }
  const fallback = () => CFG.approvalFallback === 'auto'
    ? { approved: true, mode: 'fallback' }
    : { approved: false, mode: 'ask', outcome: 'unavailable' }
  const approval = ctx.get('approval')
  if (!approval) {
    return fallback()
  }
  try {
    const outcome = await approval.request({
      toolName: TOOL_NAME,
      reason: `${REQUEST_MARKER} add ${track}\n${text}`,
    })
    if (outcome === 'allowed-once') return { approved: true, mode: 'ask' }
    // 策略 never / 被拒 / 取消：按 fallback 策略决定是否自动保存（审计会标记）
    return CFG.approvalFallback === 'auto'
      ? { approved: true, mode: 'fallback', outcome }
      : { approved: false, mode: 'ask', outcome }
  } catch {
    return fallback()
  }
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
