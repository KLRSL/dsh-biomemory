// ============================================================================
// dsh-biomemory · 清理层（compact.mjs，v2）
//
// 五条可解释规则，唯一执行入口是 compact()；每次淘汰都写 <MEMORY_ROOT>/compact.log。
//   1. 同 realm+type+key 覆盖 —— 写入时已把旧条目标墓碑（store.writeEntry），此处不重复
//   2. fact —— last_used 超过 30 天且 use_count ≤1 → 墓碑
//   3. workflow/error/decision —— 不设 TTL；last_used 超过 90 天且 use_count ≤1 → 权重减半
//   4. error/decision —— 默认永久保留（本实现不自动淘汰）
//   5. 每条淘汰/降权都写 compact.log（时间 / fp / 规则 / 摘要）
//
// 规则之外不再有别的清理逻辑——多加一条就回到"逻辑复杂、维护困难"的老路。
// ============================================================================

import fs from 'node:fs'
import path from 'node:path'
import * as db from './db.mjs'
import { MEMORY_ROOT } from './shared.mjs'

export const RULES = {
  factTtlDays: 30,
  staleDays: 90,
  minUseCount: 1,
}

function ageDays(ts, now) {
  if (!ts) return Infinity
  const t = Date.parse(ts)
  if (!Number.isFinite(t)) return Infinity
  return (now.getTime() - t) / 86400000
}

function logPath() { return path.join(MEMORY_ROOT, 'compact.log') }

function appendLog(lines) {
  if (!lines.length) return
  try {
    fs.mkdirSync(MEMORY_ROOT, { recursive: true })
    fs.appendFileSync(logPath(), lines.join('\n') + '\n', 'utf-8')
  } catch { /* 日志失败不影响清理结果 */ }
}

/** 执行五条规则。dryRun=true 只算不落库、不写日志 */
export function compact({ now = new Date(), dryRun = false, rules = RULES } = {}) {
  const all = db.allEntries()
  const log = []
  let tombstoned = 0
  let decayed = 0
  for (const e of all) {
    const used = e.last_accessed || e.created_at
    const age = ageDays(used, now)
    const hits = Number(e.hits || 0)
    const mtype = e.mtype || 'fact'
    // 规则 2：fact 过期且没人用
    if (mtype === 'fact' && age > rules.factTtlDays && hits <= rules.minUseCount) {
      if (!dryRun) db.setStatus(e.fp, 'deleted')
      tombstoned++
      log.push(`${db.isoNow()} TOMBSTONE rule=fact-ttl>${rules.factTtlDays}d fp=${e.fp} age=${age.toFixed(1)}d use=${hits} :: ${String(e.text).slice(0, 60)}`)
      continue
    }
    // 规则 3：workflow/error/decision 久未使用 → 降权（不删）
    if (mtype !== 'fact' && age > rules.staleDays && hits <= rules.minUseCount) {
      const from = Number(e.weight || 10)
      const to = Math.max(1, Math.round(from / 2))
      if (to < from) {
        if (!dryRun) db.upsertEntry({ fp: e.fp, weight: to })
        decayed++
        log.push(`${db.isoNow()} DECAY rule=stale>${rules.staleDays}d fp=${e.fp} ${from}->${to} age=${age.toFixed(1)}d use=${hits} :: ${String(e.text).slice(0, 60)}`)
      }
    }
    // 规则 4：error / decision 永不自动淘汰（显式标记已解决由使用者 update 处理）
  }
  if (!dryRun) appendLog(log)
  return { scanned: all.length, tombstoned, decayed, dryRun, log }
}

/** 可读导出（dump）：把活跃记忆按类型写一份 Markdown，返回文件路径与计数 */
export function dump({ dir = MEMORY_ROOT, now = new Date() } = {}) {
  const all = db.allEntries()
  const byType = { workflow: [], error: [], decision: [], fact: [], 其它: [] }
  for (const e of all) (byType[e.mtype] || byType['其它']).push(e)
  const lines = [`# 记忆导出（${db.isoNow()}）`, '', `共 ${all.length} 条活动记忆（墓碑不计）`, '']
  for (const [t, arr] of Object.entries(byType)) {
    if (!arr.length) continue
    lines.push(`## ${t}（${arr.length}）`, '')
    for (const e of arr.sort((a, b) => String(b.last_accessed || '').localeCompare(String(a.last_accessed || '')))) {
      const meta = [`fp:${e.fp}`, e.realm || 'user', e.trigger || '-', `use:${e.hits || 0}`].join(' ')
      lines.push(`- [${meta}] ${e.text}`)
    }
    lines.push('')
  }
  const chains = db.chainAll()
  if (chains.length) {
    lines.push(`## 工作流链（${chains.length}）`, '')
    for (const c of chains) lines.push(`- 当 ${c.trigger} 时：${(c.steps || []).join(' → ')}`)
    lines.push('')
  }
  const file = path.join(dir, `dump-${now.toISOString().slice(0, 19).replace(/[:T]/g, '')}.md`)
  if (dir === MEMORY_ROOT) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, lines.join('\n'), 'utf-8')
  return { ok: true, file, total: all.length, byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])), chains: chains.length }
}
