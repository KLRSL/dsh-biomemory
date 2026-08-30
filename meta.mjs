// ============================================================================
// dsh-biomemory · 代谢与反思层（meta.mjs，v0.6 架构升级）
//
//   - runDream：记忆代谢（半衰期衰减 + 引用巩固 + 冲突豁免 + 低权重归档 + 断点续跑）
//   - clusterEntries / latestReflection / runReflect：深度反思（主题聚类/趋势/冲突/遗忘）
// 从 index.mjs 拆出；依赖 shared / retrieve / db。
// ============================================================================

import fs from 'node:fs'
import path from 'node:path'
import * as db from './db.mjs'
import {
  MEMORY_ROOT, PATHS, readFile, writeFile, nowStamp, CFG, detectConflict, audit,
} from './shared.mjs'
import { tokenize, cosine } from './retrieve.mjs'

// ---------- 记忆代谢（dream：衰减 + 巩固 + 冲突仲裁 + 归档） ----------

export function runDream(opts = {}) {
  const dryRun = opts.dryRun === true
  const report = { scanned: 0, decayed: 0, consolidated: 0, conflicted: 0, archived: 0, backup: null, items: [] }
  db.openDb()
  if (dryRun) {
    report.backup = '（dry-run 不执行备份）'
  } else {
    report.backup = db.backupDb()
  }
  // 断点续跑（文档 P0-002）：上次中断位置恢复；每 100 条写一次检查点
  const checkpointKey = 'dream_checkpoint'
  const resumeFp = !dryRun && opts.resume !== false ? db.metaGet(checkpointKey) : null
  const prefsText = readFile(PATHS.preferences)
  const now = Date.now()
  const entries = db.allEntries()
  let started = false
  let batchCount = 0
  for (const e of entries) {
    if (e.pinned || e.fragment_type === 'preference' || e.status === 'archived') continue
    if (resumeFp && !started) {
      if (e.fp === resumeFp) started = true
      else continue
    } else {
      started = true
    }
    report.scanned++
    let changed = false
    // 1. 衰减：w * 0.5^(age/halfLife)
    let ageDays = 0
    if (e.created_at) {
      const t = new Date(e.created_at)
      if (!Number.isNaN(t.getTime())) ageDays = Math.max(0, (now - t.getTime()) / 86400000)
    }
    const decayed = e.weight * Math.pow(0.5, ageDays / CFG.halfLifeDays)
    if (decayed < e.weight) {
      report.decayed++
      report.items.push({ op: 'DECAY', layer: e.layer, fp: e.fp, entry_id: e.entry_id, from: e.weight, to: Math.max(1, Math.round(decayed * 10) / 10) })
      e.weight = Math.max(1, Math.round(decayed * 10) / 10)
      changed = true
    }
    // 2. 巩固：引用 ≥ 阈值 → 加权（设上限）
    if (e.hits >= CFG.consolidateThreshold && e.weight < CFG.weightCap) {
      report.consolidated++
      report.items.push({ op: 'CONSOLIDATE', layer: e.layer, fp: e.fp, entry_id: e.entry_id, to: Math.min(CFG.weightCap, e.weight + 1) })
      e.weight = Math.min(CFG.weightCap, e.weight + 1)
      changed = true
    }
    // 3. 冲突仲裁（v0.5.2 改为「浮出待裁决」）：与偏好冲突的行为记忆不再自动降权
    if (e.kind === '行为' && detectConflict(e, prefsText)) {
      report.conflicted++
      report.items.push({ op: 'CONFLICT', layer: e.layer, fp: e.fp, entry_id: e.entry_id, note: '浮出待用户裁决（不降权不归档）' })
      continue
    }
    // 4. 归档：权重低于阈值 → status=archived（保留记录，文档 §2.4.3 冷归档）
    let archivedNow = false
    if (e.weight < CFG.decayThreshold) {
      report.archived++
      report.items.push({ op: 'ARCHIVE', layer: e.layer, fp: e.fp, entry_id: e.entry_id, text: e.text })
      archivedNow = true
      changed = true
    }
    if (changed && !dryRun) {
      db.upsertEntry({
        ...e,
        status: archivedNow ? 'archived' : 'active',
        weight: e.weight,
      })
    }
    // 检查点：每 100 条记录进度（断点续跑）
    if (!dryRun && ++batchCount % 100 === 0) {
      db.metaSet(checkpointKey, e.fp)
    }
  }
  if (!dryRun) db.metaSet(checkpointKey, '') // 完成清空检查点
  // 审计记录（dry-run 也记录 PREVIEW）
  for (const it of report.items) {
    if (dryRun) audit('PREVIEW', { op: it.op, fp: it.fp })
    else audit(it.op, { fp: it.fp, text: it.text || '', entry_id: it.entry_id })
  }
  return report
}

// ---------- 深度反思（reflect：主题聚类 + 趋势 + 冲突 + 遗忘建议） ----------

// 贪心主题聚类：TF 向量余弦相似度 ≥ 0.25 的条目归为一簇
export function clusterEntries(entries) {
  const vecOf = (e) => {
    const tf = new Map()
    for (const t of tokenize(e.text)) tf.set(t, (tf.get(t) || 0) + 1)
    return tf
  }
  const items = entries.map((e) => ({ ...e, vec: vecOf(e) }))
  const clusters = []
  const used = new Set()
  for (const it of items) {
    if (used.has(it.fp)) continue
    const cluster = { members: [it], vecs: [it.vec] }
    used.add(it.fp)
    for (;;) {
      let best = null, bestScore = 0
      for (const cand of items) {
        if (used.has(cand.fp)) continue
        let maxScore = 0
        for (const v of cluster.vecs) maxScore = Math.max(maxScore, cosine(v, cand.vec))
        if (maxScore > bestScore) { bestScore = maxScore; best = cand }
      }
      if (!best || bestScore < 0.25) break
      cluster.members.push(best)
      cluster.vecs.push(best.vec)
      used.add(best.fp)
    }
    if (cluster.members.length >= 2) {
      cluster.members.sort((a, b) => b.weight - a.weight)
      clusters.push(cluster)
    }
  }
  clusters.sort((a, b) => b.members.length - a.members.length)
  return clusters
}

// 最近一次反思报告
export function latestReflection() {
  const dir = path.join(MEMORY_ROOT, 'longterm', 'reflections')
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().reverse()
  return files.length ? path.join(dir, files[0]) : null
}

// 执行深度反思。opts: { dryRun }
export function runReflect(opts = {}) {
  const dryRun = opts.dryRun === true
  // v0.5.2：统一数据源为 SQLite 主库（旧实现扫 Markdown 备份文件，导致已删除
  // 条目在反思中复活——删除/编辑以 SQLite 为准，Markdown 仅为只读备份）
  db.openDb()
  const entries = db.allEntries({ includeArchived: true }).map((e) => ({ layer: e.layer, ...e }))
  const DAY = 86400000
  const now = Date.now()
  const ageOf = (e) => {
    const ts = e.ts || e.created_at
    if (!ts) return null
    let t = new Date(ts)
    if (Number.isNaN(t.getTime()) && String(ts).includes(' ')) t = new Date(String(ts).replace(' ', 'T'))
    return Number.isNaN(t.getTime()) ? null : t.getTime()
  }
  const recent7 = entries.filter((e) => { const a = ageOf(e); return a !== null && now - a < 7 * DAY })
  const prev7 = entries.filter((e) => { const a = ageOf(e); return a !== null && now - a >= 7 * DAY && now - a < 14 * DAY })
  const live = entries.filter((e) => e.layer !== 'preferences' && !e.layer.startsWith('archive'))
  const clusters = clusterEntries(live)
  const prefsText = readFile(PATHS.preferences)
  const conflicts = entries.filter((e) => e.layer.startsWith('hot/behavior') && detectConflict(e, prefsText))
  const forget = live
    .filter((e) => !e.pinned && e.weight < CFG.decayThreshold * 1.5)
    .sort((a, b) => a.weight - b.weight)
    .slice(0, 10)
  const byLayer = {}
  for (const e of entries) byLayer[e.layer] = (byLayer[e.layer] || 0) + 1
  const trend = prev7.length === 0 ? '（上周无数据）' : recent7.length > prev7.length ? '活跃上升' : recent7.length < prev7.length ? '趋于平稳' : '持平'
  const stamp = nowStamp()
  const lines = [
    `# 深度反思 ${stamp}`,
    '',
    `- 条目总数：${entries.length}（${Object.entries(byLayer).map(([l, n]) => `${l} ${n}`).join(' · ')}）`,
    `- 近 7 天写入：${recent7.length} 条（上一周 ${prev7.length} 条，${trend}）`,
    `- 主题聚类：${clusters.length} 个（≥2 条相似记忆）`,
    `- 潜在冲突：${conflicts.length} 条行为记忆与偏好冲突`,
    `- 遗忘候选：${forget.length} 条低权重记忆（< ${CFG.decayThreshold * 1.5}）`,
    '',
    '## 主题聚类',
    ...(clusters.length
      ? clusters.map((c, i) => `### 主题 ${i + 1}（${c.members.length} 条）\n${c.members.slice(0, 6).map((m) => `- [${m.layer}] [w:${m.weight}] ${m.text}`).join('\n')}`)
      : ['（暂无相似记忆聚类）']),
    '## 潜在冲突（浮出待用户裁决，不自动降权；改掉冲突内容后恢复正常代谢）',
    ...(conflicts.length ? conflicts.map((c) => `- [${c.layer}] [fp:${c.fp}] ${c.text}`).concat(['', '裁决：memory action=update fp="<指纹>" text="新内容"，或 /memory edit <fp> <新内容>']) : ['（无）']),
    '## 遗忘候选（可人工删除或归档）',
    ...(forget.length ? forget.map((f) => `- [${f.layer}] [w:${f.weight}] ${f.text}`) : ['（无）']),
  ]
  const text = lines.join('\n') + '\n'
  let reportFile = null
  if (!dryRun) {
    const dir = path.join(MEMORY_ROOT, 'longterm', 'reflections')
    fs.mkdirSync(dir, { recursive: true })
    reportFile = path.join(dir, stamp.replace(/[^\d]/g, '').slice(0, 12) + '.md')
    writeFile(reportFile, text)
    audit('REFLECT', { scanned: entries.length, clusters: clusters.length, conflicts: conflicts.length, reportFile })
  }
  return {
    dryRun,
    scanned: entries.length,
    recent7: recent7.length,
    prev7: prev7.length,
    trend,
    byLayer,
    clusters: clusters.map((c) => ({ size: c.members.length, members: c.members.slice(0, 6).map((m) => ({ layer: m.layer, fp: m.fp, text: m.text, weight: m.weight })) })),
    conflicts: conflicts.map((c) => ({ layer: c.layer, fp: c.fp, text: c.text })),
    forget: forget.map((f) => ({ layer: f.layer, fp: f.fp, weight: f.weight, text: f.text })),
    reportFile,
    text,
  }
}
