// ============================================================================
// dsh-biomemory · v0.5 SQLite 数据层（db.mjs）
//
// 对应 v0.5 技术文档 §2.3/§2.4/§3.3/§4：
//   - L2/L3 结构化存储：entries 表（entry_id/project/fragment_type/summary/
//     weight/pinned/status…），文档 §2.3.1 字段对齐
//   - 审计日志：audit_log 表（五元组 actor/t/action/entry_id/detail），文档 §3.3
//   - 向量：vector BLOB（Float32Array 序列化）随行存储 + JS 侧暴力 cosine
//     （个人规模 ≤10 万条下与 HNSW 等效，零原生依赖——文档 §4.4 延迟目标内）
//   - 断点续跑：compact 检查点存 meta 表（文档 P0-002）
//   - 数据安全：compact 前自动备份 .db 副本，保留最近 7 次（文档 §4.5）
//
// 迁移：首次启动自动把现有 Markdown（hot/projects/longterm/preferences）
// 导入 SQLite（文档 §4.5 export/导入精神）；Markdown 原文件保留为只读备份。
//
// 技术：node:sqlite（Node 24 内置，零外部依赖），WAL 模式（文档 §4.3）。
// ============================================================================

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

// 路径惰性求值：每次 openDb 时读环境变量，避免模块加载时机（ESM 静态
// import 提升）早于 env 设置导致测试/运行绑定错误路径——2026-08-19 教训：
// 测试静态 import db.mjs 抢在 env 设置前加载，真实库被 DELETE 清空。
function biomemoryDir() {
  return process.env.DSH_BIOMEMORY_DIR || path.join(os.homedir(), '.dsh', 'biomemory')
}
export function dbPath() { return path.join(biomemoryDir(), 'biomemory.db') }
export function backupDir() { return path.join(biomemoryDir(), 'backup') }
export const MAX_BACKUPS = 7

let _db = null

/** 打开（或创建）数据库；返回 DatabaseSync 实例 */
export function openDb() {
  if (_db) return _db
  fs.mkdirSync(biomemoryDir(), { recursive: true })
  const db = new DatabaseSync(dbPath())
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  migrateSchema(db)
  _db = db
  return db
}

function migrateSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      entry_id      TEXT PRIMARY KEY,
      fp            TEXT UNIQUE,
      layer         TEXT NOT NULL DEFAULT 'longterm',
      project_id    TEXT,
      project_name  TEXT,
      fragment_type TEXT NOT NULL DEFAULT 'note',
      kind          TEXT DEFAULT '知识',
      mode          TEXT DEFAULT '自动',
      summary       TEXT,
      text          TEXT NOT NULL,
      entities      TEXT,
      weight        REAL NOT NULL DEFAULT 10,
      hits          INTEGER NOT NULL DEFAULT 0,
      pinned        INTEGER NOT NULL DEFAULT 0,
      pin_reason    TEXT,
      created_at    TEXT,
      last_accessed TEXT,
      status        TEXT NOT NULL DEFAULT 'active',
      vector        BLOB
    );
    CREATE INDEX IF NOT EXISTS idx_entries_fp ON entries(fp);
    CREATE INDEX IF NOT EXISTS idx_entries_layer ON entries(layer);
    CREATE INDEX IF NOT EXISTS idx_entries_project ON entries(project_id);
    CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
    CREATE INDEX IF NOT EXISTS idx_entries_weight ON entries(weight);

    CREATE TABLE IF NOT EXISTS audit_log (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      t        TEXT NOT NULL,
      actor    TEXT NOT NULL DEFAULT 'agent',
      action   TEXT NOT NULL,
      entry_id TEXT,
      detail   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_t ON audit_log(t);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_entry ON audit_log(entry_id);

    CREATE TABLE IF NOT EXISTS meta (
      k TEXT PRIMARY KEY,
      v TEXT
    );
  `)
}

// ---------- 条目 CRUD ----------

/** 行对象 → entries 表字段 */
function toRow(e) {
  return {
    entry_id: e.entry_id || crypto.randomUUID(),
    fp: e.fp ?? '',
    layer: e.layer || 'longterm',
    project_id: e.project_id ?? null,
    project_name: e.project_name ?? null,
    fragment_type: e.fragment_type || 'note',
    kind: e.kind || '知识',
    mode: e.mode || '自动',
    summary: e.summary ?? null,
    text: e.text ?? '',
    entities: e.entities ? JSON.stringify(e.entities) : null,
    weight: Number(e.weight ?? 10),
    hits: Number(e.hits ?? 0),
    pinned: e.pinned ? 1 : 0,
    pin_reason: e.pin_reason ?? null,
    created_at: e.created_at ?? null,
    last_accessed: e.last_accessed ?? null,
    status: e.status || 'active',
    vector: e.vector ?? null,
  }
}

/** entries 行 → 记忆对象 */
function fromRow(r) {
  return {
    entry_id: r.entry_id,
    fp: r.fp,
    layer: r.layer,
    project_id: r.project_id ?? undefined,
    project_name: r.project_name ?? undefined,
    fragment_type: r.fragment_type,
    kind: r.kind,
    mode: r.mode,
    summary: r.summary ?? undefined,
    text: r.text,
    entities: r.entities ? safeJson(r.entities, []) : undefined,
    weight: r.weight,
    hits: r.hits,
    pinned: !!r.pinned,
    pin_reason: r.pin_reason ?? undefined,
    created_at: r.created_at ?? undefined,
    last_accessed: r.last_accessed ?? undefined,
    status: r.status,
  }
}

function safeJson(s, fallback) {
  try { return JSON.parse(s) } catch { return fallback }
}

/** 写入/更新一条记忆（upsert by fp）；返回 entry_id */
export function upsertEntry(e) {
  const db = openDb()
  const r = toRow(e)
  const existing = r.fp ? db.prepare('SELECT * FROM entries WHERE fp = ?').get(r.fp) : undefined
  if (existing) {
    // 未显式提供的字段保留旧值（避免缺省字段覆盖已有数据）
    const keep = (given, old) => (given !== undefined && given !== null ? given : old)
    const m = {
      layer: keep(e.layer, existing.layer),
      project_id: keep(e.project_id, existing.project_id),
      project_name: keep(e.project_name, existing.project_name),
      fragment_type: keep(e.fragment_type, existing.fragment_type),
      kind: keep(e.kind, existing.kind),
      mode: keep(e.mode, existing.mode),
      summary: keep(e.summary, existing.summary),
      text: keep(e.text, existing.text),
      entities: e.entities !== undefined ? (Array.isArray(e.entities) ? JSON.stringify(e.entities) : e.entities) : existing.entities,
      weight: keep(e.weight, existing.weight),
      hits: keep(e.hits, existing.hits),
      pinned: e.pinned !== undefined ? (e.pinned ? 1 : 0) : existing.pinned,
      pin_reason: e.pin_reason !== undefined ? e.pin_reason : existing.pin_reason,
      last_accessed: e.last_accessed !== undefined ? e.last_accessed : existing.last_accessed,
      status: keep(e.status, existing.status),
      vector: e.vector !== undefined ? e.vector : existing.vector,
    }
    db.prepare(`UPDATE entries SET
      layer=?, project_id=?, project_name=?, fragment_type=?, kind=?, mode=?,
      summary=?, text=?, entities=?, weight=?, hits=?, pinned=?, pin_reason=?,
      last_accessed=?, status=?, vector=?
      WHERE fp = ?`).run(
      m.layer, m.project_id, m.project_name, m.fragment_type, m.kind, m.mode,
      m.summary, m.text, m.entities, m.weight, m.hits, m.pinned, m.pin_reason,
      m.last_accessed, m.status, m.vector, r.fp,
    )
    return existing.entry_id
  }
  db.prepare(`INSERT INTO entries
    (entry_id, fp, layer, project_id, project_name, fragment_type, kind, mode,
     summary, text, entities, weight, hits, pinned, pin_reason, created_at,
     last_accessed, status, vector)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    r.entry_id, r.fp, r.layer, r.project_id, r.project_name, r.fragment_type, r.kind, r.mode,
    r.summary, r.text, r.entities, r.weight, r.hits, r.pinned, r.pin_reason,
    r.created_at ?? isoNow(), r.last_accessed, r.status, r.vector,
  )
  return r.entry_id
}

/** 按指纹读取 */
export function getByFp(fp) {
  const db = openDb()
  const r = db.prepare('SELECT * FROM entries WHERE fp = ?').get(fp)
  return r ? fromRow(r) : undefined
}

/** 按 entry_id 读取 */
export function getById(id) {
  const db = openDb()
  const r = db.prepare('SELECT * FROM entries WHERE entry_id = ?').get(id)
  return r ? fromRow(r) : undefined
}

/** 查询条目：支持 project/layer/fragment_type/status/关键词/排序/分页 */
export function listEntries({ projectId, layer, fragmentType, status = 'active', q, limit = 100, offset = 0 } = {}) {
  const db = openDb()
  const where = []
  const args = []
  if (projectId) { where.push('project_id = ?'); args.push(projectId) }
  if (layer) { where.push('layer = ?'); args.push(layer) }
  if (fragmentType) { where.push('fragment_type = ?'); args.push(fragmentType) }
  if (status) { where.push('status = ?'); args.push(status) }
  if (q) { where.push('(text LIKE ? OR summary LIKE ? OR entities LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`) }
  const sql = `SELECT * FROM entries ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY pinned DESC, weight DESC, created_at DESC LIMIT ? OFFSET ?`
  args.push(limit, offset)
  return db.prepare(sql).all(...args).map(fromRow)
}

/** 统计：总量/锁定/分层/状态分布 */
export function stats() {
  const db = openDb()
  const total = db.prepare('SELECT COUNT(*) c FROM entries').get().c
  const pinned = db.prepare('SELECT COUNT(*) c FROM entries WHERE pinned = 1').get().c
  const byLayer = Object.fromEntries(db.prepare('SELECT layer, COUNT(*) c FROM entries GROUP BY layer').all().map((r) => [r.layer, r.c]))
  const byStatus = Object.fromEntries(db.prepare('SELECT status, COUNT(*) c FROM entries GROUP BY status').all().map((r) => [r.status, r.c]))
  const auditCount = db.prepare('SELECT COUNT(*) c FROM audit_log').get().c
  return { total, pinned, layers: byLayer, status: byStatus, auditCount, dbPath: dbPath() }
}

/** 按指纹删除（物理） */
export function removeByFp(fp) {
  const db = openDb()
  const e = getByFp(fp)
  if (!e) return false
  db.prepare('DELETE FROM entries WHERE fp = ?').run(fp)
  db.prepare('DELETE FROM audit_log WHERE entry_id = ?').run(e.entry_id)
  return true
}

/** 更新权重/命中/访问时间（回忆强化） */
export function touchEntry(fp, { weightDelta = 0, hitsDelta = 0, accessed = false } = {}) {
  const db = openDb()
  const e = getByFp(fp)
  if (!e) return
  const w = Math.min(20, Math.max(0.1, e.weight + weightDelta))
  const h = e.hits + hitsDelta
  db.prepare('UPDATE entries SET weight = ?, hits = ?, last_accessed = ? WHERE fp = ?')
    .run(w, h, accessed ? isoNow() : (e.last_accessed ?? null), fp)
}

/** 设置/解除记忆钉 */
export function setPinFp(fp, pinned, reason) {
  const db = openDb()
  const e = getByFp(fp)
  if (!e) return false
  db.prepare('UPDATE entries SET pinned = ?, pin_reason = ?, weight = ? WHERE fp = ?')
    .run(pinned ? 1 : 0, pinned ? reason ?? null : null, pinned ? 1 : e.weight, fp)
  return true
}

/** 列出钉住记忆 */
export function listPinned(projectId) {
  const db = openDb()
  if (projectId) {
    return db.prepare('SELECT * FROM entries WHERE pinned = 1 AND project_id = ? ORDER BY created_at DESC').all(projectId).map(fromRow)
  }
  return db.prepare('SELECT * FROM entries WHERE pinned = 1 ORDER BY created_at DESC').all().map(fromRow)
}

/** 全部活跃条目（供代谢/反思/迁移用） */
export function allEntries({ includeArchived = false } = {}) {
  const db = openDb()
  const sql = includeArchived
    ? 'SELECT * FROM entries ORDER BY created_at'
    : "SELECT * FROM entries WHERE status = 'active' OR status = 'superseded' ORDER BY created_at"
  return db.prepare(sql).all().map(fromRow)
}

// ---------- 向量 ----------

/** 写向量（Float32Array → BLOB）；id 可为 entry_id 或 fp */
export function setVector(id, vec) {
  const db = openDb()
  const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength)
  const byId = db.prepare('UPDATE entries SET vector = ? WHERE entry_id = ?').run(buf, id)
  if (byId.changes === 0) {
    db.prepare('UPDATE entries SET vector = ? WHERE fp = ?').run(buf, id)
  }
}

/** 批量写向量（迁移/重建用）；id 可为 entry_id 或 fp */
export function setVectorsBatch(pairs) {
  const db = openDb()
  const stmtId = db.prepare('UPDATE entries SET vector = ? WHERE entry_id = ?')
  const stmtFp = db.prepare('UPDATE entries SET vector = ? WHERE fp = ?')
  let ok = 0
  for (const [id, vec] of pairs) {
    const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength)
    const r = stmtId.run(buf, id)
    if (r.changes === 0) {
      const r2 = stmtFp.run(buf, id)
      if (r2.changes > 0) ok++
    } else {
      ok++
    }
  }
  return ok
}

/** 读取全部带向量的条目：返回 [{ entry, vec: Float32Array }] */
export function entriesWithVectors({ includeArchived = false } = {}) {
  const db = openDb()
  const sql = includeArchived
    ? 'SELECT * FROM entries WHERE vector IS NOT NULL'
    : "SELECT * FROM entries WHERE vector IS NOT NULL AND status IN ('active','superseded')"
  return db.prepare(sql).all().map((r) => ({ entry: fromRow(r), vec: new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4) }))
}

/** 向量数（索引规模统计） */
export function vectorCount() {
  const db = openDb()
  return db.prepare('SELECT COUNT(*) c FROM entries WHERE vector IS NOT NULL').get().c
}

// ---------- 审计 ----------

/** 记录审计事件（五元组：actor/t/action/entry_id/detail） */
export function audit(event, data = {}) {
  const db = openDb()
  db.prepare('INSERT INTO audit_log (t, actor, action, entry_id, detail) VALUES (?,?,?,?,?)').run(
    data.t ?? isoNow(),
    data.actor ?? 'agent',
    event,
    data.entry_id ?? null,
    typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail ?? {}),
  )
}

/** 审计查询：时间/类型/条目/操作者过滤 + 分页 */
export function queryAudit({ sinceDays, type, entryId, actor, limit = 50 } = {}) {
  const db = openDb()
  const where = []
  const args = []
  if (sinceDays) {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString()
    where.push('t >= ?'); args.push(since)
  }
  if (type) { where.push('action = ?'); args.push(type) }
  if (entryId) { where.push('entry_id = ?'); args.push(entryId) }
  if (actor) { where.push('actor = ?'); args.push(actor) }
  const sql = `SELECT * FROM audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`
  args.push(limit)
  return db.prepare(sql).all(...args).map((r) => ({ t: r.t, actor: r.actor, action: r.action, entry_id: r.entry_id, detail: r.detail }))
}

/** 审计聚合统计（文档 P1-003：按时间/事件类型/项目维度分组） */
export function auditAggregate({ sinceDays, groupBy = 'action' } = {}) {
  const db = openDb()
  const where = []
  const args = []
  if (sinceDays) {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString()
    where.push('t >= ?'); args.push(since)
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const col = groupBy === 'day' ? "substr(t,1,10)" : groupBy === 'entry' ? 'entry_id' : 'action'
  const rows = db.prepare(`SELECT ${col} k, COUNT(*) c FROM audit_log ${whereSql} GROUP BY ${col} ORDER BY c DESC`).all(...args)
  return rows.map((r) => ({ key: r.k, count: r.c }))
}

// ---------- meta（配置/检查点） ----------

export function metaGet(k) {
  const db = openDb()
  const v = db.prepare('SELECT v FROM meta WHERE k = ?').get(k)?.v ?? null
  return v === 'null' ? null : v
}

export function metaSet(k, v) {
  const db = openDb()
  if (v === null || v === undefined) {
    db.prepare('DELETE FROM meta WHERE k = ?').run(k)
    return
  }
  db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, String(v))
}

// ---------- 备份 / 恢复 ----------

/** compact 前自动备份 .db（保留最近 MAX_BACKUPS 次） */
export function backupDb() {
  const db = openDb()
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const dir = backupDir()
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '-' + String(Date.now() % 1000).padStart(3, '0')
  const target = path.join(dir, `biomemory-${stamp}.db`)
  fs.copyFileSync(dbPath(), target)
  // 清理旧备份
  const backups = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort()
  while (backups.length > MAX_BACKUPS) {
    fs.unlinkSync(path.join(dir, backups.shift()))
  }
  return target
}

/** 最近备份列表 */
export function listBackups() {
  const dir = backupDir()
  fs.mkdirSync(dir, { recursive: true })
  return fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort().reverse()
}

/** 从备份恢复（返回恢复到的路径） */
export function restoreLatestBackup() {
  const backups = listBackups()
  if (backups.length === 0) return null
  const src = path.join(backupDir(), backups[0])
  // 关闭当前连接再覆盖
  if (_db) { try { _db.close() } catch { /* ignore */ } _db = null }
  fs.copyFileSync(src, dbPath())
  openDb()
  return src
}

// ---------- 工具 ----------

export function isoNow() { return new Date().toISOString() }

/** 迁移状态查询：migrated=true 表示 Markdown 已导入 */
export function migrationStatus() {
  return { migrated: metaGet('migrated_at') !== null, migratedAt: metaGet('migrated_at'), version: metaGet('schema_version') ?? '1' }
}

/** 关闭数据库（测试用） */
export function closeDb() {
  if (_db) { try { _db.close() } catch { /* ignore */ } _db = null }
}
