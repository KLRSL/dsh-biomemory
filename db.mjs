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
  db.exec('PRAGMA busy_timeout = 5000') // v0.8.0：多实例（web + CLI/维护脚本）同库时避免 SQLITE_BUSY 直接抛错
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
      vector        BLOB,
      realm         TEXT,
      mtype         TEXT,
      trigger       TEXT,
      mkey          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_entries_fp ON entries(fp);
    CREATE INDEX IF NOT EXISTS idx_entries_layer ON entries(layer);
    CREATE INDEX IF NOT EXISTS idx_entries_project ON entries(project_id);
    CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
    CREATE INDEX IF NOT EXISTS idx_entries_weight ON entries(weight);


    CREATE TABLE IF NOT EXISTS meta (
      k TEXT PRIMARY KEY,
      v TEXT
    );
    CREATE TABLE IF NOT EXISTS trigger_counts (
      trigger    TEXT NOT NULL,
      realm      TEXT NOT NULL,
      count      INTEGER NOT NULL DEFAULT 0,
      last_at    TEXT,
      PRIMARY KEY (trigger, realm)
    );
    CREATE TABLE IF NOT EXISTS chains (
      trigger    TEXT PRIMARY KEY,
      realm      TEXT,
      steps      TEXT NOT NULL DEFAULT '[]',
      use_count  INTEGER NOT NULL DEFAULT 0,
      last_used  TEXT,
      created_at TEXT
    );
  `)
  // v0.6.1：记忆来源与语义类别（评审建议 source_ref + memory_class）——
  // 旧库用 ALTER TABLE 补列（列已存在时 ADD COLUMN 抛错，静默忽略）
  for (const ddl of ['source_ref TEXT', 'memory_class TEXT', 'realm TEXT', 'mtype TEXT', 'trigger TEXT', 'mkey TEXT']) {
    try { db.exec(`ALTER TABLE entries ADD COLUMN ${ddl}`) } catch { /* 列已存在 */ }
  }
  // v0.10.0：新列索引必须在 ALTER 之后建（旧库先加列，否则 CREATE INDEX 找不到列）
  for (const idx of ['trigger', 'mtype', 'realm']) {
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_${idx} ON entries(${idx})`) } catch { /* 索引已存在 */ }
  }
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
    source_ref: e.source_ref ?? null,
    memory_class: e.memory_class ?? null,
    realm: e.realm ?? null,
    mtype: e.mtype ?? null,
    trigger: e.trigger ?? null,
    mkey: e.mkey ?? null,
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
    source_ref: r.source_ref ?? undefined,
    memory_class: r.memory_class ?? undefined,
    realm: r.realm ?? undefined,
    mtype: r.mtype ?? undefined,
    trigger: r.trigger ?? undefined,
    mkey: r.mkey ?? undefined,
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
      source_ref: e.source_ref !== undefined ? e.source_ref : existing.source_ref,
      memory_class: e.memory_class !== undefined ? e.memory_class : existing.memory_class,
      realm: keep(e.realm, existing.realm),
      mtype: keep(e.mtype, existing.mtype),
      trigger: keep(e.trigger, existing.trigger),
      mkey: keep(e.mkey, existing.mkey),
    }
    db.prepare(`UPDATE entries SET
      layer=?, project_id=?, project_name=?, fragment_type=?, kind=?, mode=?,
      summary=?, text=?, entities=?, weight=?, hits=?, pinned=?, pin_reason=?,
      last_accessed=?, status=?, vector=?, source_ref=?, memory_class=?,
      realm=?, mtype=?, trigger=?, mkey=?
      WHERE fp = ?`).run(
      m.layer, m.project_id, m.project_name, m.fragment_type, m.kind, m.mode,
      m.summary, m.text, m.entities, m.weight, m.hits, m.pinned, m.pin_reason,
      m.last_accessed, m.status, m.vector, m.source_ref, m.memory_class,
      m.realm, m.mtype, m.trigger, m.mkey, r.fp,
    )
    return existing.entry_id
  }
  db.prepare(`INSERT INTO entries
    (entry_id, fp, layer, project_id, project_name, fragment_type, kind, mode,
     summary, text, entities, weight, hits, pinned, pin_reason, created_at,
     last_accessed, status, vector, source_ref, memory_class, realm, mtype, trigger, mkey)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    r.entry_id, r.fp, r.layer, r.project_id, r.project_name, r.fragment_type, r.kind, r.mode,
    r.summary, r.text, r.entities, r.weight, r.hits, r.pinned, r.pin_reason,
    r.created_at ?? isoNow(), r.last_accessed, r.status, r.vector, r.source_ref, r.memory_class,
    r.realm, r.mtype, r.trigger, r.mkey,
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
  return { total, pinned, layers: byLayer, status: byStatus, dbPath: dbPath() }
}

/** 按指纹删除（物理）。v0.8.0：不再连带删除审计行——删条目不等于抹掉历史（审计是追溯链） */
export function removeByFp(fp) {
  const db = openDb()
  const e = getByFp(fp)
  if (!e) return false
  db.prepare('DELETE FROM entries WHERE fp = ?').run(fp)
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

/** 设置/解除记忆钉。v0.8.0：不再把 weight 清零（旧实现 pinned 时写 weight=1 →
 *  一解锁就低于 decayThreshold 被标为「待处理」；钉住本身不参与自动清理）。 */
export function setPinFp(fp, pinned, reason) {
  const db = openDb()
  const e = getByFp(fp)
  if (!e) return false
  db.prepare('UPDATE entries SET pinned = ?, pin_reason = ? WHERE fp = ?')
    .run(pinned ? 1 : 0, pinned ? reason ?? null : null, fp)
  return true
}

/** 全部活跃条目（供代谢/反思/迁移用） */
export function allEntries({ includeArchived = false } = {}) {
  const db = openDb()
  const sql = includeArchived
    ? 'SELECT * FROM entries ORDER BY created_at'
    : "SELECT * FROM entries WHERE status = 'active' ORDER BY created_at" // 只有 active 参与注入/检索（archived / deleted 都不参与）
  return db.prepare(sql).all().map(fromRow)
}

// ---------- 向量：已于 v0.9.0 随语义检索一起移除 ----------
// `entries.vector` 列保留在 schema 中仅为兼容既有数据库（避免破坏性重建），
// 运行期不再读写；相关 API（setVector/setVectorsBatch/entriesWithVectors/vectorCount）已删除。

// ---------- 审计 ----------

/** 记录审计事件（五元组：actor/t/action/entry_id/detail） */
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
  // v0.8.0：checkpoint 结果要检查——busy≠0 说明还有读者/写者，TRUNCATE 没能把 WAL 全部并回主库，
  // 此时直接 copyFile 会得到「不含最新写入」的备份（旧实现静默接受）。
  let ck = null
  try {
    const row = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()
    ck = row ? { busy: Number(row.busy ?? 0), log: Number(row.log ?? 0), checkpointed: Number(row.checkpointed ?? 0) } : null
    if (ck && ck.busy !== 0) console.warn(`[dsh-biomemory] wal_checkpoint busy=${ck.busy}：备份可能不含最新 WAL 内容`)
  } catch (err) {
    console.warn('[dsh-biomemory] wal_checkpoint 失败：', err instanceof Error ? err.message : String(err))
  }
  const dir = backupDir()
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '-' + String(Date.now() % 1000).padStart(3, '0')
  // 同一毫秒内连续备份会撞名（时间戳只有毫秒精度），直接 copyFile 会**静默覆盖**
  // 上一份备份——「每次备份独立文件」是备份语义的底线，这里补序号后缀兜底。
  const base = path.join(dir, `biomemory-${stamp}`)
  let target = `${base}.db`
  for (let n = 2; fs.existsSync(target); n += 1) target = `${base}-${n}.db`
  fs.copyFileSync(dbPath(), target)
  // v0.8.0：备份可用性自检——能打开且条目数对得上才算合格备份（不合格就删掉并报错，
  // 避免留下一个「看起来有备份、实际不能用」的文件）。
  try {
    const src = db.prepare('SELECT COUNT(*) n FROM entries').get().n
    const c = new DatabaseSync(target, { readOnly: true })
    const dst = c.prepare('SELECT COUNT(*) n FROM entries').get().n
    c.close()
    if (Number(src) !== Number(dst)) throw new Error(`条目数不一致（主库 ${src} / 备份 ${dst}）`)
  } catch (err) {
    try { fs.unlinkSync(target) } catch { /* ignore */ }
    throw new Error(`备份自检失败（已删除该文件）：${err instanceof Error ? err.message : String(err)}`)
  }
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

/** 从备份恢复（返回恢复到的路径）。
 *  v0.8.0 加固：①覆盖前先给当前库留一份 pre-restore 快照；②用「临时文件 + rename」原子替换，
 *  不再原地 copyFile（他进程持连接时原地覆盖可能留下半截文件）；③清掉旧的 -wal/-shm，
 *  否则残留 WAL 会被当成新库的前滚日志导致读到脏数据。 */
export function restoreLatestBackup() {
  const backups = listBackups()
  if (backups.length === 0) return null
  const src = path.join(backupDir(), backups[0])
  // 关闭当前连接再替换
  if (_db) { try { _db.close() } catch { /* ignore */ } _db = null }
  const target = dbPath()
  const safety = `${target}.pre-restore-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
  if (fs.existsSync(target)) fs.copyFileSync(target, safety)
  const tmp = `${target}.restore-tmp-${process.pid}`
  fs.copyFileSync(src, tmp)
  fs.renameSync(tmp, target)
  for (const sidecar of [`${target}-wal`, `${target}-shm`]) {
    if (fs.existsSync(sidecar)) { try { fs.unlinkSync(sidecar) } catch { /* ignore */ } }
  }
  openDb()
  return src
}

/** 从指定备份库读取单条条目（按 fp；不碰主库连接） */
export function readEntryFromBackup(fp, backupPath) {
  const src = path.isAbsolute(backupPath) ? backupPath : path.join(backupDir(), backupPath)
  if (!fs.existsSync(src)) return undefined
  let conn
  try {
    conn = new DatabaseSync(src)
    const r = conn.prepare('SELECT * FROM entries WHERE fp = ?').get(fp)
    return r ? fromRow(r) : undefined
  } catch { return undefined } finally {
    if (conn) { try { conn.close() } catch { /* ignore */ } }
  }
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


// ---------- v2：墓碑 / 触发式召回 / 工作流链（trigger + chain） ----------

/** 墓碑：状态切换而不物理删除（active / archived / deleted） */
export function setStatus(fp, status) {
  openDb().prepare('UPDATE entries SET status = ? WHERE fp = ?').run(status, fp)
  return true
}

/** 按 trigger 命中的活跃条目（同 realm 优先，其次全局） */
export function byTrigger(triggers, { realm } = {}) {
  const list = (triggers || []).filter(Boolean)
  if (!list.length) return []
  const db = openDb()
  const ph = list.map(() => '?').join(',')
  const rows = db.prepare(`SELECT * FROM entries WHERE status='active' AND trigger IN (${ph})`).all(...list)
  return rows.map(fromRow).sort((a, b) => (b.realm === realm) - (a.realm === realm))
}

/** 同 trigger 的活跃条目数（>3 触发 workflow 升级） */
export function countByTrigger(trigger) {
  const r = openDb().prepare("SELECT COUNT(*) c FROM entries WHERE trigger = ? AND status = 'active'").get(trigger)
  return r ? r.c : 0
}

/** 工作流链：读一条 */
export function chainGet(trigger) {
  const r = openDb().prepare('SELECT * FROM chains WHERE trigger = ?').get(trigger)
  return r ? { trigger: r.trigger, realm: r.realm, steps: safeJson(r.steps, []), use_count: r.use_count, last_used: r.last_used, created_at: r.created_at } : undefined
}

/** 工作流链：写入（存在则更新步骤） */
export function chainUpsert({ trigger, realm, steps }) {
  const db = openDb()
  const ex = chainGet(trigger)
  if (ex) db.prepare('UPDATE chains SET steps=?, realm=?, last_used=? WHERE trigger=?').run(JSON.stringify(steps ?? ex.steps), realm ?? ex.realm, isoNow(), trigger)
  else db.prepare('INSERT INTO chains (trigger, realm, steps, use_count, last_used, created_at) VALUES (?,?,?,?,?,?)').run(trigger, realm ?? null, JSON.stringify(steps || []), 0, isoNow(), isoNow())
  return chainGet(trigger)
}

/** 工作流链：全部（最近使用在前） */
export function chainAll() {
  return openDb().prepare('SELECT * FROM chains ORDER BY last_used DESC').all()
    .map((r) => ({ trigger: r.trigger, realm: r.realm, steps: safeJson(r.steps, []), use_count: r.use_count, last_used: r.last_used, created_at: r.created_at }))
}

/** 链被召回时记一次使用 */
export function chainTouched(trigger) {
  openDb().prepare('UPDATE chains SET use_count = use_count + 1, last_used = ? WHERE trigger = ?').run(isoNow(), trigger)
}


/** trigger 出现次数（写入路径调用；>3 触发 workflow 升级） */
export function bumpTrigger(trigger, realm) {
  const d = openDb()
  d.prepare('INSERT INTO trigger_counts (trigger, realm, count, last_at) VALUES (?,?,1,?) ON CONFLICT(trigger, realm) DO UPDATE SET count = count + 1, last_at = excluded.last_at').run(trigger, realm || 'user', isoNow())
  return triggerCount(trigger, realm)
}

export function triggerCount(trigger, realm) {
  const r = openDb().prepare('SELECT count FROM trigger_counts WHERE trigger = ? AND realm = ?').get(trigger, realm || 'user')
  return r ? r.count : 0
}