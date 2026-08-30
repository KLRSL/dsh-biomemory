// ============================================================================
// dsh-biomemory · 存储层（store.mjs，v0.6 架构升级）
//
// 记忆条目的物理读写与状态操作：
//   - Markdown 条目解析/格式化（兼容新旧格式 ↔ SQLite 迁移）
//   - 写入（writeEntry：去重 + 审计 + preferences 同步 + 会话沉淀标记清除）
//   - 记忆钉 / 查找 / 备份 / 巩固 / 删除 / 回滚 / 条目状态 / 更新
//   - Markdown→SQLite 一次性迁移 / 向量索引建立
//
// 从 index.mjs 拆出；只依赖 shared.mjs / session-state.mjs / db / embed。
// ============================================================================

import fs from 'node:fs'
import path from 'node:path'
import * as db from './db.mjs'
import * as embed from './embed.mjs'
import {
  MEMORY_ROOT, PATHS, readFile, writeFile, appendFile, nowStamp, isoNow, tsToIso, fingerprint,
  isImportant, detectConflict, CFG, ensureDirs, audit, dbgLog,
} from './shared.mjs'
import { clearSummaryPending } from './session-state.mjs'
import { petNotify } from './notify.mjs'

// ---------- 条目解析（兼容新旧格式） ----------

// 解析单条记忆行 → { raw, kind, mode, fp, weight, hits, ts, pinned, text }
export function parseEntryLine(line) {
  // 双字段格式：- [知识|自动] [fp:xxx] [w:10] [h:3] [t:...] [pin] 文本
  let m = line.match(/^-\s*\[([^|\]]+)\|([^\]]+)\]\s*(.*)$/)
  let kind, mode, rest
  if (m) {
    kind = m[1] // 知识/行为
    mode = m[2] // 自动/审批
    rest = m[3]
  } else {
    // 单字段格式（preferences.md 旧格式）：- [2026-08-15] 文本
    m = line.match(/^-\s*\[([^\]]+)\]\s*(.*)$/)
    if (!m) return null
    kind = m[1] // 偏好（或日期）
    mode = 'pref'
    rest = m[2]
  }
  const entry = { kind, mode, weight: 10, hits: 0, ts: null, pinned: false, text: '' }
  // 提取 [fp:xxx]（宽松匹配：允许任意非空指纹内容）
  let fpM = rest.match(/^\[fp:([^\]]+)\]\s*/)
  if (fpM) { entry.fp = fpM[1]; rest = rest.slice(fpM[0].length) }
  // 提取 [w:数字]
  let wM = rest.match(/^\[w:(\d+(?:\.\d+)?)\]\s*/)
  if (wM) { entry.weight = Number(wM[1]); rest = rest.slice(wM[0].length) }
  // 提取 [h:数字]
  let hM = rest.match(/^\[h:(\d+)\]\s*/)
  if (hM) { entry.hits = Number(hM[1]); rest = rest.slice(hM[0].length) }
  // 提取 [t:时间]
  let tM = rest.match(/^\[t:([^\]]+)\]\s*/)
  if (tM) { entry.ts = tM[1]; rest = rest.slice(tM[0].length) }
  // 提取 [pin]
  let pinM = rest.match(/^\[pin\]\s*/)
  if (pinM) { entry.pinned = true; rest = rest.slice(pinM[0].length) }
  entry.text = rest.trim()
  if (!entry.fp) entry.fp = fingerprint(entry.text)
  return entry
}

export function formatEntryLine(e) {
  const parts = [`- [${e.kind}|${e.mode}]`, `[fp:${e.fp}]`, `[w:${e.weight}]`, `[h:${e.hits}]`]
  if (e.ts) parts.push(`[t:${e.ts}]`)
  if (e.pinned) parts.push('[pin]')
  parts.push(e.text)
  return parts.join(' ')
}

// 读取文件中的条目行
export function readEntries(p) {
  const out = []
  for (const line of readFile(p).split('\n')) {
    const e = parseEntryLine(line.trim())
    if (e) out.push(e)
  }
  return out
}

// 扫描全部记忆文件（hot/projects/longterm/archive），返回 [{layer, file, entries}]
export function scanAllFiles() {
  const out = []
  for (const [label, p] of [
    ['hot/behavior', PATHS.hotBehavior],
    ['hot/knowledge', PATHS.hotKnowledge],
    ['preferences', PATHS.preferences],
  ]) {
    const es = readEntries(p)
    if (es.length) out.push({ layer: label, file: p, entries: es })
  }
  for (const dir of [path.join(MEMORY_ROOT, 'projects'), path.join(MEMORY_ROOT, 'longterm'), PATHS.archive]) {
    if (!fs.existsSync(dir)) continue
    const walk = (d, rel) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, f.name)
        if (f.isDirectory()) walk(full, path.join(rel, f.name))
        else if (f.name.endsWith('.md')) {
          const es = readEntries(full)
          if (es.length) out.push({ layer: path.relative(MEMORY_ROOT, full).replace(/\\/g, '/'), file: full, entries: es })
        }
      }
    }
    walk(dir, '')
  }
  return out
}

// 重写文件（仅写回条目行，保留格式；逐行保留原始文件其余内容）
export function rewriteFile(p, entries) {
  const lines = readFile(p).split('\n')
  const header = []
  for (const line of lines) {
    if (!parseEntryLine(line.trim()) && !line.trim().startsWith('- [')) header.push(line)
  }
  const body = entries.map((e) => formatEntryLine(e))
  const text = header.join('\n').replace(/\n{3,}/g, '\n\n').trim() + (body.length ? '\n' + body.join('\n') : '') + '\n'
  writeFile(p, text)
}

// ---------- v0.5：SQLite 初始化 + Markdown 迁移 ----------

// 首次启动：把现有 Markdown（hot/projects/longterm/preferences）导入 SQLite。
// 迁移后 Markdown 保留为只读备份（不删除）；meta 表记录 migrated_at。
export function migrateMarkdownToDb() {
  db.openDb()
  if (db.metaGet('migrated_at') !== null) return { migrated: false, reason: 'already' }
  const all = scanAllFiles()
  let imported = 0
  const prefsText = readFile(PATHS.preferences)
  for (const f of all) {
    const layer = f.layer === 'preferences' ? 'longterm' : f.layer
    const fragmentType = f.layer === 'preferences' ? 'preference' : (f.layer.startsWith('projects') ? 'note' : 'fact')
    for (const e of f.entries) {
      try {
        db.upsertEntry({
          fp: e.fp, layer, fragment_type: fragmentType, kind: e.kind, mode: e.mode,
          text: e.text, weight: e.weight, hits: e.hits, pinned: e.pinned,
          created_at: e.ts ? tsToIso(e.ts) : null,
        })
        imported++
      } catch { /* 单条失败不阻断迁移 */ }
    }
  }
  // 偏好作为 preference 条目
  for (const line of prefsText.split('\n')) {
    const e = parseEntryLine(line.trim())
    if (e) {
      try {
        db.upsertEntry({ fp: e.fp, layer: 'longterm', fragment_type: 'preference', kind: '偏好', mode: 'pref', text: e.text, weight: Math.max(e.weight, 12), pinned: true })
        imported++
      } catch { /* ignore */ }
    }
  }
  db.audit('MIGRATE', { detail: { imported, from: 'markdown', to: 'sqlite' } })
  db.metaSet('migrated_at', db.isoNow())
  db.metaSet('schema_version', '1')
  return { migrated: true, imported }
}

// v0.5 向量索引：给无向量的活跃条目补算嵌入（模型可用时）
export async function ensureVectors() {
  try {
    const extractor = await embed.getExtractor()
    if (!extractor) return { ok: false, reason: 'model-unavailable' }
    const db2 = db.openDb()
    const missing = db2.prepare("SELECT entry_id, text, summary FROM entries WHERE vector IS NULL AND status = 'active'").all()
    if (missing.length === 0) return { ok: true, embedded: 0 }
    const pairs = []
    for (const row of missing) {
      const vec = await embed.embed(row.summary || row.text)
      if (vec) pairs.push([row.entry_id, vec])
    }
    if (pairs.length) db.setVectorsBatch(pairs)
    db.audit('VECTORIZE', { detail: { count: pairs.length, total: missing.length } })
    return { ok: true, embedded: pairs.length, pending: missing.length - pairs.length }
  } catch (err) {
    dbgLog(`ensureVectors failed: ${String(err && err.message || err)}`)
    return { ok: false, reason: String(err && err.message || err) }
  }
}

// ---------- 写入记忆（带审计；approval 在调用方 gate） ----------

export function writeEntry({ track, text, sessionId, approved, mode }) {
  db.openDb()
  const fp = fingerprint(text)
  const dup = db.getByFp(fp)
  if (dup) {
    return { ok: true, skipped: true, reason: 'duplicate' }
  }
  const modeLabel = mode === 'fallback' ? '降级' : (mode === 'ask' ? '审批' : (mode === 'auto' ? '自动' : (approved ? '审批' : '自动')))
  const layer = track === 'user' ? 'longterm' : 'longterm'
  const fragmentType = track === 'user' ? (isImportant(text, track) ? 'preference' : 'fact') : 'lesson'
  const entryId = db.upsertEntry({
    fp, layer,
    fragment_type: fragmentType,
    kind: track === 'user' ? '知识' : '行为',
    mode: modeLabel,
    text: text.trim(),
    weight: 10,
    hits: 0,
    created_at: db.isoNow(),
    pinned: false,
  })
  db.audit('WRITE', { entry_id: entryId, detail: { fp, track, approved: modeLabel, fallback: mode === 'fallback' ? true : undefined } })
  if (track === 'user') {
    appendFile(PATHS.preferences, `- [${nowStamp()}] ${text.trim()}\n`)
  }
  // v0.6 会话沉淀：模型调 memory add 写入成功 → 视为"已沉淀"，清除待沉淀标记
  clearSummaryPending()
  petNotify('记忆已保存', `${track === 'user' ? '偏好' : '经验'}：${text}`)
  return { ok: true, fp }
}

// ---------- 记忆钉（锁定不参与衰减） ----------

export function setPin(fp, pinned) {
  db.openDb()
  const e = db.getByFp(fp)
  if (!e) return { ok: false, error: `未找到 [fp:${fp}]` }
  const ok = db.setPinFp(fp, pinned, pinned ? 'memory pin' : undefined)
  if (!ok) return { ok: false, error: `未找到 [fp:${fp}]` }
  db.audit(pinned ? 'PIN' : 'UNPIN', { entry_id: e.entry_id, detail: { fp, text: e.text } })
  return { ok: true, fp, pinned, text: e.text }
}

export function findByText(q) {
  db.openDb()
  const ql = q.toLowerCase()
  for (const e of db.allEntries()) {
    if ((e.text || '').toLowerCase().includes(ql)) return e
  }
  return null
}

// ---------- 备份 ----------

export function backupNow() {
  const stamp = nowStamp().replace(/[^\d]/g, '').slice(0, 12)
  const dir = path.join(PATHS.backups, stamp)
  ensureDirs()
  fs.mkdirSync(dir, { recursive: true }) // 备份子目录必须存在，copyFileSync 不会自动创建
  for (const p of [PATHS.hotBehavior, PATHS.hotKnowledge, PATHS.preferences]) {
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dir, path.basename(p)))
  }
  if (fs.existsSync(PATHS.auditJson)) fs.copyFileSync(PATHS.auditJson, path.join(dir, 'audit.jsonl'))
  return dir
}

// 最近一次备份目录
export function latestBackup() {
  if (!fs.existsSync(PATHS.backups)) return null
  const dirs = fs.readdirSync(PATHS.backups).filter((d) => /^\d{12}$/.test(d)).sort().reverse()
  return dirs.length ? path.join(PATHS.backups, dirs[0]) : null
}

// ---------- 自动巩固（用进废退）+ 安全删除 ----------

export function consolidateHits(fpSet) {
  if (!fpSet || !fpSet.size) return 0
  db.openDb()
  for (const fp of fpSet) {
    db.touchEntry(fp, { hitsDelta: 1 })
  }
  return fpSet.size
}

// 安全删除：先备份数据库再删条目（可回滚）
export function removeEntry(fp) {
  db.openDb()
  const e = db.getByFp(fp)
  if (!e) return { ok: false, error: `未找到 [fp:${fp}]` }
  const bk = db.backupDb()
  db.removeByFp(fp)
  db.audit('REMOVE', { entry_id: e.entry_id, detail: { fp, text: e.text, backup: bk } })
  return { ok: true, fp, layer: e.layer, text: e.text, backup: bk }
}

// 单条目回滚：从最近备份库读回被删除的条目（保留元数据，向量置空重算），审计 RESTORE
export function restoreEntry(fp) {
  db.openDb()
  const existing = db.getByFp(fp)
  if (existing) return { ok: false, error: `[fp:${fp}] 仍存在，无需恢复` }
  const backups = db.listBackups() // 最新在前
  for (const name of backups) {
    const e = db.readEntryFromBackup(fp, name)
    if (!e) continue
    const { entry_id, vector, ...rest } = e
    db.upsertEntry({ ...rest, status: e.status || 'active', vector: null })
    db.audit('RESTORE', { entry_id, detail: { fp, text: e.text, from: name } })
    return { ok: true, fp, layer: e.layer, text: e.text, backup: name }
  }
  return { ok: false, error: `备份库中未找到 [fp:${fp}]（备份保留最近 ${db.MAX_BACKUPS || 7} 次）` }
}

// 条目状态（知识页状态色）：conflict=与偏好冲突（红）/ warning=低权重待处理（黄）/ ok=正常（绿）
export function entryStatus(e, prefsText) {
  if (e.kind === '行为' && detectConflict(e, prefsText)) return 'conflict'
  if (e.status !== 'archived' && Number(e.weight) < CFG.decayThreshold) return 'warning'
  return 'ok'
}

// 编辑条目文本：保留 fp/锁定/权重等元数据，清空旧向量（文本变了向量失效），审计可追溯
export function updateEntryText(fp, text) {
  db.openDb()
  const e = db.getByFp(fp)
  if (!e) return { ok: false, error: `未找到 [fp:${fp}]` }
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return { ok: false, error: 'text 必填' }
  if (trimmed === e.text) return { ok: true, note: '文本未变化', fp }
  const dupFp = fingerprint(trimmed)
  if (dupFp !== fp) {
    const dup = db.getByFp(dupFp)
    if (dup) return { ok: false, error: '与已有记忆重复（文本指纹已存在）' }
  }
  const from = e.text
  db.upsertEntry({ fp, text: trimmed })
  try { db.openDb().prepare('UPDATE entries SET vector = NULL WHERE fp = ?').run(fp) } catch { /* 向量清理失败不影响编辑 */ }
  db.audit('UPDATE', { entry_id: e.entry_id, detail: { fp, from: from.slice(0, 80), to: trimmed.slice(0, 80) } })
  return { ok: true, fp, text: trimmed }
}
