// ============================================================================
// dsh-biomemory · 存储层（store.mjs，v0.6 架构升级）
//
// 记忆条目的物理读写与状态操作：
//   - Markdown 条目解析/格式化（兼容新旧格式 ↔ SQLite 迁移）
//   - 写入（writeEntry：去重 + 审计 + preferences 同步 + 会话沉淀标记清除）
//   - 记忆钉 / 查找 / 备份 / 巩固 / 删除 / 回滚 / 条目状态 / 更新
//   - Markdown→SQLite 一次性迁移
//
// v0.9.0：向量索引（ensureVectors）已随语义检索一起移除。
//
// 从 index.mjs 拆出；只依赖 shared.mjs / session-state.mjs / db。
// ============================================================================

import fs from 'node:fs'
import path from 'node:path'
import * as db from './db.mjs'
import {
  MEMORY_ROOT, PATHS, readFile, writeFile, appendFile, nowStamp, isoNow, tsToIso, fingerprint,
  isImportant, bigramSimilarity, CFG, ensureDirs, dbgLog,
} from './shared.mjs'
import { clearSummaryPending } from './session-state.mjs'
import { inferType, makeKey, triggersFromText } from './trigger.mjs'

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
        // v0.8.0：跳过同步镜像与反思报告——它们由 bm-sync-mirror.cjs 按条目行格式生成，
        // 会被 parseEntryLine 当成真实条目误导入（历史遗留的重复来源）。
        if (f.isDirectory()) { if (f.name !== 'reflections' && f.name !== 'backups') walk(full, path.join(rel, f.name)) }
        else if (f.name.endsWith('.md') && f.name !== '条目镜像.md') {
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
  db.metaSet('migrated_at', db.isoNow())
  db.metaSet('schema_version', '1')
  return { migrated: true, imported }
}

// ---------- 写入记忆（带审计；approval 在调用方 gate） ----------

/** 记忆语义类别（memory_class）推断：
 *  user_decision（用户明确决定）/ user_preference（用户偏好）/ fact（普通事实）
 *  / model_suggestion（模型建议）/ model_inference（模型推测）。
 *  核心原则：assistant suggested X ≠ user decided X —— track 是第一依据，
 *  模型建议/推测只可能来自 agent 轨，绝不冒充用户决定。 */
export function inferMemoryClass({ track, text }) {
  const t = String(text || '')
  if (track === 'user') {
    if (/决定|拍板|选(?:用|定|型)|采用|定为|定为|就这么(?:定|办|用)|方案|弃用|定为|推(?:翻|用)|选择/.test(t)) return 'user_decision'
    if (/喜欢|偏好|希望|不要|禁止|必须|一贯|以后都|更(?:喜欢|习惯|倾向)/.test(t)) return 'user_preference'
    return 'fact'
  }
  if (/建议|可以试试|不妨|推荐|我建议|更好的做法|或许可以/.test(t)) return 'model_suggestion'
  return 'model_inference'
}

export function writeEntry({ track, text, sessionId, approved, mode, source, realm, triggers }) {
  db.openDb()
  const fp = fingerprint(text)
  const dup = db.getByFp(fp)
  if (dup) {
    return { ok: true, skipped: true, reason: 'duplicate' }
  }
  const modeLabel = mode === 'fallback' ? '降级' : (mode === 'ask' ? '审批' : (mode === 'auto' ? '自动' : (approved ? '审批' : '自动')))
  const layer = track === 'user' ? 'longterm' : 'longterm'
  const fragmentType = track === 'user' ? (isImportant(text, track) ? 'preference' : 'fact') : 'lesson'
  // ---- v2：realm / type / trigger / key（触发式召回的最小三元组） ----
  const realmKey = realm || 'user'
  const mtype = inferType({ text, track })
  const trgList = (Array.isArray(triggers) && triggers.length ? triggers : triggersFromText(text)).filter(Boolean)
  const trigger = trgList[0] || null
  const mkey = makeKey(text)
  // 同键覆盖：同 realm+type+key 的旧条目标墓碑（不物理删）——「同一件事只留最新一条」
  let sameKey = false
  if (mkey) {
    for (const e of db.allEntries()) {
      const keyHit = e.mkey && (e.mkey === mkey || e.mkey.startsWith(mkey) || mkey.startsWith(e.mkey))
      if (e.fp !== fp && keyHit && (e.realm || 'user') === realmKey && (e.mtype || 'fact') === mtype) {
        db.setStatus(e.fp, 'deleted')
        sameKey = true
      }
    }
  }
  // v0.8.0 写入去重升级（记忆原子化）：与已有**同类**条目高度相似时不再新增，改为提示合并。
  // 碎片化的根因就是「同一件事被反复写成新条目」（8/20~9/5 那批只能靠人工合并，且漏合并的会被
  // 正常代谢归档）。用纯 bigram Jaccard，不触发嵌入模型；阈值可由 nearDuplicateThreshold 调整（0=关闭）。
  const nearThr = Number(CFG.nearDuplicateThreshold)
  // 带 trigger 的写入不合并（每次出现都是该 trigger 的上一步，供链使用）；同键已覆盖时也不再合并
  if (!sameKey && !trigger && Number.isFinite(nearThr) && nearThr > 0) {
    let best = null
    for (const e of db.allEntries()) {
      if (e.fragment_type !== fragmentType || (e.realm || 'user') !== realmKey) continue
      const score = bigramSimilarity(text, e.text)
      if (!best || score > best.score) best = { fp: e.fp, score, text: String(e.text || ''), weight: e.weight, entry_id: e.entry_id }
    }
    if (best && best.score >= nearThr) {
      const score = Math.round(best.score * 1000) / 1000
      // v0.8.0：可选「自动合并」——借鉴 @zheexinn/dsh-memory 的 merge-on-write（同一件事合并进已有条目
      // 而不是新增，顺带提权）。默认 merge；置 nearDuplicateAction='skip' 则只提示、不写。
      if (String(CFG.nearDuplicateAction) === 'merge') {
        const merged = `${best.text} ｜ 【补充·${new Date().toISOString().slice(0, 10)}】${text.trim()}`
        if (merged.length <= 4000) { // 合并后过长的（>4000 字）退回 skip，避免单条无限膨胀
          const weight = Math.min(Number(CFG.weightCap) || 20, Number(best.weight || 0) + 1)
          db.upsertEntry({ fp: best.fp, text: merged, weight })
          return { ok: true, merged: true, reason: 'near-duplicate-merged', fp: best.fp, similar: { fp: best.fp, score, text: best.text.slice(0, 200) } }
        }
      }
      return { ok: true, skipped: true, reason: 'near-duplicate', similar: { fp: best.fp, score, text: best.text.slice(0, 200) } }
    }
  }
  const memoryClass = inferMemoryClass({ track, text })
  const sourceRef = source || (sessionId ? `session:${sessionId}` : null)
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
    source_ref: sourceRef,
    memory_class: memoryClass,
    realm: realmKey,
    mtype,
    trigger,
    mkey,
  })
  // v2 适配层：同一 trigger 出现 >3 次（按 trigger_counts 计）→ 升级 workflow + 生成链
  let chain = null
  if (trigger) {
    const n = db.bumpTrigger(trigger, realmKey)
    if (n > 3) chain = promoteIfRepeated(trigger, realmKey)
  }
  // v0.6.1 单轨制：不再 append 到 preferences.md——SQLite 是唯一运行时数据源，
  // Markdown 仅保留为只读备份（曾因双轨导致 Markdown 新条目永不注入，见 2026-09-06 整理）
  // v0.6 会话沉淀：模型调 memory add 写入成功 → 视为"已沉淀"，清除待沉淀标记
  clearSummaryPending()
  return { ok: true, fp, mtype, trigger, chain } 
}

/** v2 适配层：同 trigger 的活跃条目 >3 条时，升级为 workflow 并生成「当 X 时：先 A，再 B」的链 */
export function promoteIfRepeated(trigger, realmKey) {
  if (!trigger) return null
  if (db.countByTrigger(trigger) <= 3) return null
  const rows = db.byTrigger([trigger], { realm: realmKey })
  for (const e of rows) if (e.mtype !== 'workflow') db.upsertEntry({ fp: e.fp, mtype: 'workflow' })
  const steps = rows
    .slice()
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    .map((e) => e.text)
  return db.chainUpsert({ trigger, realm: realmKey, steps })
}

// ---------- 记忆钉（锁定不参与衰减） ----------

export function setPin(fp, pinned) {
  db.openDb()
  const e = db.getByFp(fp)
  if (!e) return { ok: false, error: `未找到 [fp:${fp}]` }
  const ok = db.setPinFp(fp, pinned, pinned ? 'memory pin' : undefined)
  if (!ok) return { ok: false, error: `未找到 [fp:${fp}]` }
  return { ok: true, fp, pinned, text: e.text }
}

// ---------- 备份 ----------

// ---------- 备份（v0.8.0 已移除 backupNow/latestBackup：单轨制后 Markdown 备份不再产生，
// 它们读的 MEMORY_ROOT/backups 恒为空目录；DB 备份走 db.mjs::backupDb/listBackups） ----------

// ---------- 自动巩固（用进废退）+ 安全删除 ----------

export function consolidateHits(fpSet) {
  if (!fpSet || !fpSet.size) return 0
  db.openDb()
  for (const fp of fpSet) {
    // 顺带记录召回时间（last_accessed）：清理规则里的「久未使用」判据就靠这一列，
    // 旧实现从不更新该列，导致久不使用的条目也一直涨权。
    db.touchEntry(fp, { hitsDelta: 1, accessed: true })
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
  return { ok: true, fp, layer: e.layer, text: e.text, backup: bk }
}

// 取消归档（v0.8.0）：status 由 archived 改回 active，可顺带校准权重。
// 与 restoreEntry 的分工：restoreEntry 用于「已被删除」的条目（要求主库查无此 fp，从数据库备份读回）；
// 取消归档用于「行还在、只是 status=archived」的条目；由工作区维护脚本 bm-restore-archived.cjs 调用。
export function unarchiveEntry(fp, opts = {}) {
  db.openDb()
  const e = db.getByFp(fp)
  if (!e) return { ok: false, error: `未找到 [fp:${fp}]` }
  if (e.status !== 'archived') return { ok: false, error: `[fp:${fp}] 不是归档状态（当前 ${e.status}）` }
  const want = Number(opts.weight)
  const weight = Number.isFinite(want) && want > 0 ? want : e.weight
  db.upsertEntry({ fp, status: 'active', weight })
  return { ok: true, fp, layer: e.layer, kind: e.kind, from: e.weight, to: weight, text: e.text }
}

// 状态切换（v0.8.1）：归档 / 恢复收敛到一条路径；archived = 因权重衰减被动下架（冷归档），
// 不再进入快照注入与检索（db.allEntries 只取 active）。
export function setEntryStatus(fp, status, opts = {}) {
  if (!['active', 'archived'].includes(status)) return { ok: false, error: `非法状态 ${status}` }
  db.openDb()
  const e = db.getByFp(fp)
  if (!e) return { ok: false, error: `未找到 [fp:${fp}]` }
  if (e.status === status) return { ok: false, error: `[fp:${fp}] 已经是 ${status}` }
  const w = Number(opts.weight)
  const weight = Number.isFinite(w) && w > 0 ? w : e.weight
  db.upsertEntry({ fp, status, weight })
  return { ok: true, fp, from: e.status, to: status, layer: e.layer, kind: e.kind, text: e.text }
}

// 单条目回滚：从最近备份库读回被删除的条目（保留元数据），审计 RESTORE
export function restoreEntry(fp) {
  db.openDb()
  const existing = db.getByFp(fp)
  if (existing) return { ok: false, error: `[fp:${fp}] 仍存在，无需恢复` }
  const backups = db.listBackups() // 最新在前
  for (const name of backups) {
    const e = db.readEntryFromBackup(fp, name)
    if (!e) continue
    // v0.8.0：保留原 entry_id——旧实现丢弃它，upsertEntry 会重新生成 UUID，
    // 于是历史审计行（按 entry_id 关联）全部指向不存在的条目（实测 6893/10006 行悬空）。
    db.upsertEntry({ ...e, entry_id: e.entry_id, status: e.status || 'active', vector: null })
    return { ok: true, fp, layer: e.layer, text: e.text, backup: name }
  }
  return { ok: false, error: `备份库中未找到 [fp:${fp}]（备份保留最近 ${db.MAX_BACKUPS || 7} 次）` }
}

// 条目状态（知识页状态色）：warning=低权重待处理（黄）/ ok=正常（绿）
export function entryStatus(e) {
  if (e.status !== 'archived' && Number(e.weight) < CFG.decayThreshold) return 'warning'
  return 'ok'
}

// 编辑条目文本：保留 fp/锁定/权重等元数据，审计可追溯
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
  db.upsertEntry({ fp, text: trimmed, vector: null })
  return { ok: true, fp, text: trimmed }
}