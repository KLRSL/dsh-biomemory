// ============================================================================
// dsh-biomemory — 生物仿生记忆系统（DSH 插件化 · 按官方插件文档重构）
//
// 目标运行时：@deepseek-ai/dsh-* 0.1.0-rc.5（host runtime 实测契约）
//
// 数据层：纯文件 Markdown（默认 ~/.dsh/memory，DSH_MEMORY_ROOT 可覆盖，透明可读改），三层双通道：
//   hot\behavior.md / hot\knowledge.md     L1 运行时热记忆
//   projects\<项目>\...                     L2 项目档案
//   longterm\...                            L3 长期记忆体
//   preferences.md                          用户/项目偏好（最高优先级）
//   archive\...                             代谢归档（衰减降权的记忆，不删除）
//   backups\...                             整理前自动备份（可回滚）
//   audit.jsonl                             结构化审计（JSON Lines）
//
// 条目行格式（元数据可扩展，旧格式自动兼容）：
//   - [知识|自动] [fp:xxx] [w:12] [h:3] [t:2026-08-16 13:00] [pin] 文本
//     w=权重（默认10） h=引用计数（巩固用） t=写入时间 pin=锁定（不参与衰减）
//
// 能力（v0.4.0）：
//   1. memory 工具：add / query / remove / list / pin / unpin / dream / audit
//   2. 冻结快照注入：systemPrompt.section({ name, order, text })，会话启动冻结，
//      注入优先级：锁定 > preferences > 权重/时间排序的热区，token 预算内取最有价值
//   3. 分级审批门 + 自动保存降级：重要记忆走 approval.request（ask）；审批不可用
//      （如审批策略 never）时按 approvalFallback 自动保存（默认 auto，审计标记
//      AUTO-FALLBACK；可配 deny 保持 fail closed）
//   4. 自动巩固（用进废退）：查询/召回命中即 hits+1 写回，权重随引用增长
//   5. 记忆代谢（dream）：半衰期衰减 + 引用巩固 + 冲突仲裁 + 低权重归档；
//      支持 --dry-run 预览；执行前自动备份到 backups/；可配置启动时自动执行
//   6. 记忆钉：pin/unpin，锁定记忆不参与衰减，无条件注入热区
//   7. 结构化审计：audit.jsonl 记录 WRITE/DECAY/CONSOLIDATE/CONFLICT/ARCHIVE/PIN/UNPIN/REFLECT
//   8. 语义检索：纯 JS TF-IDF + cosine（无原生模块、无外部依赖），关键词匹配降级
//   9. 配置化：半衰期/衰减阈值/巩固阈值/权重上限/热区 token 上限/自动周期均可配置
//  10. 启动自检：主文件解析失败时自动从最近备份回滚
//  11. memory_recall：跨会话召回
//  12. 深度反思（reflect）：纯本地主题聚类 + 趋势统计 + 冲突提醒 + 遗忘建议，
//      报告写入 longterm/reflections/，可配置启动时自动执行
//  13. 知识页：Web API 条目浏览/搜索/pin/unpin/安全删除 + 设置页三 tab 界面
//
// 官方契约要点（rc.5，逐条核对过 lib 源码）：
//   - 工具体签名是 execute(args, exec)，不是 call()；exec.agent.id 即会话 id
//   - output.render(args, value) 必须返回 ContentBlock[]（[{type:'text',text}]）
//   - 工具参数 schema 字段名是 parameters（JSON Schema 对象）
//   - PromptSection = { name, order, text }；缺 name/text 会破坏提示词装配
//   - approval.request(req) → 'allowed-once'|'rejected'|'cancelled'|'unavailable'
//   - 命令 handler(invocation) -> { kind: 'success'|'error', text }
//   - 可选服务用 ctx.inject([name], child => ...)，不用反射 hack
// ============================================================================

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import os from 'node:os'
import * as db from './db.mjs'
import * as embed from './embed.mjs'

export const inject = ['tools', 'systemPrompt']

// 记忆根目录：默认 ~/.dsh/memory（可用环境变量 DSH_MEMORY_ROOT 覆盖）
// v0.5：SQLite 为主存储（~/.dsh/biomemory/biomemory.db），Markdown 保留为
// 迁移源与只读备份（首次启动自动导入）
const MEMORY_ROOT = process.env.DSH_MEMORY_ROOT || path.join(os.homedir(), '.dsh', 'memory')
const TOOL_NAME = 'memory'
const REQUEST_MARKER = '[dsh-biomemory]'

// ---------- 配置（默认值，可在 apply(config) 覆盖） ----------

const DEFAULTS = {
  halfLifeDays: 7,        // 半衰期：权重每过半衰期衰减一半
  decayThreshold: 3,      // 权重低于此值 → 归档
  consolidateThreshold: 3, // 单条引用 ≥ 此次数 → 巩固加权
  weightCap: 20,          // 巩固权重上限（防膨胀）
  hotTokenLimit: 5000,    // 快照注入热区 token 上限
  maxQueryResults: 20,    // 查询返回上限
  approvalFallback: 'auto', // 审批不可用（策略 never/服务缺失）时：auto=自动保存并审计 / deny=拒绝写入
  autoDreamDays: 7,       // 启动时距上次代谢 ≥ 此天数 → 自动执行（0=关闭）
  autoReflectDays: 3,     // 启动时距上次反思 ≥ 此天数 → 自动执行（0=关闭）
  conflictOverlap: 3,     // 冲突仲裁：行为与单条偏好的专有双字重叠阈值（P0-003 二次验证）
}

// 冲突阈值从配置读取（模块加载时为默认，apply 时更新）
let CONFLICT_OVERLAP_THRESHOLD = 3

let CFG = { ...DEFAULTS }

// ---------- 数据层：Markdown 文件读写（透明、可读改） ----------

const PATHS = {
  hotBehavior: path.join(MEMORY_ROOT, 'hot', 'behavior.md'),
  hotKnowledge: path.join(MEMORY_ROOT, 'hot', 'knowledge.md'),
  preferences: path.join(MEMORY_ROOT, 'preferences.md'),
  audit: path.join(MEMORY_ROOT, 'audit.log'),       // 旧版人类可读审计（兼容）
  auditJson: path.join(MEMORY_ROOT, 'audit.jsonl'), // v0.3 结构化审计
  archive: path.join(MEMORY_ROOT, 'archive'),
  backups: path.join(MEMORY_ROOT, 'backups'),
  config: path.join(MEMORY_ROOT, 'biomemory.config.json'), // 持久化配置（设置页写入，透明可改）
}

// 配置持久化：从 biomemory.config.json 读取（不存在则用默认）
function loadConfig() {
  try {
    const raw = readFile(PATHS.config)
    if (!raw.trim()) return { ...DEFAULTS }
    const saved = JSON.parse(raw)
    const merged = { ...DEFAULTS }
    for (const k of Object.keys(DEFAULTS)) {
      const v = saved[k]
      if (k === 'approvalFallback') {
        if (v === 'auto' || v === 'deny') merged[k] = v
        continue
      }
      if (v === undefined || !Number.isFinite(Number(v))) continue
      const n = Number(v)
      if (k === 'autoDreamDays' || k === 'autoReflectDays') { if (n >= 0) merged[k] = n } // 0=关闭
      else if (n > 0) merged[k] = n
    }
    if (typeof saved.petEndpoint === 'string') merged.petEndpoint = saved.petEndpoint
    return merged
  } catch {
    return { ...DEFAULTS }
  }
}

function saveConfig(next) {
  const out = {}
  for (const k of Object.keys(DEFAULTS)) out[k] = next[k]
  out.petEndpoint = next.petEndpoint || null
  writeFile(PATHS.config, JSON.stringify(out, null, 2))
}

function ensureDirs() {
  for (const dir of [
    path.join(MEMORY_ROOT, 'hot'),
    path.join(MEMORY_ROOT, 'projects'),
    path.join(MEMORY_ROOT, 'longterm'),
    PATHS.archive,
    PATHS.backups,
  ]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// ---------- v0.5：SQLite 初始化 + Markdown 迁移 ----------

// 首次启动：把现有 Markdown（hot/projects/longterm/preferences）导入 SQLite。
// 迁移后 Markdown 保留为只读备份（不删除）；meta 表记录 migrated_at。
function migrateMarkdownToDb() {
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
          fp: e.fp,
          layer,
          fragment_type: fragmentType,
          kind: e.kind,
          mode: e.mode,
          text: e.text,
          weight: e.weight,
          hits: e.hits,
          pinned: e.pinned,
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

// "2026-08-16 13:00" → ISO
function tsToIso(ts) {
  const m = String(ts).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).toISOString()
}

// v0.5 向量索引：给无向量的活跃条目补算嵌入（模型可用时）
async function ensureVectors() {
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

function readFile(p) {
  try { return fs.readFileSync(p, 'utf-8') } catch { return '' }
}

function writeFile(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text, 'utf-8')
}

function appendFile(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.appendFileSync(p, text, 'utf-8')
}

function nowStamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function isoNow() { return new Date().toISOString() }

// ---------- 条目解析（兼容新旧格式） ----------

// 解析单条记忆行 → { raw, kind, mode, fp, weight, hits, ts, pinned, text }
function parseEntryLine(line) {
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

function formatEntryLine(e) {
  const parts = [`- [${e.kind}|${e.mode}]`, `[fp:${e.fp}]`, `[w:${e.weight}]`, `[h:${e.hits}]`]
  if (e.ts) parts.push(`[t:${e.ts}]`)
  if (e.pinned) parts.push('[pin]')
  parts.push(e.text)
  return parts.join(' ')
}

// 读取文件中的条目行
function readEntries(p) {
  const out = []
  for (const line of readFile(p).split('\n')) {
    const e = parseEntryLine(line.trim())
    if (e) out.push(e)
  }
  return out
}

// 扫描全部记忆文件（hot/projects/longterm/archive），返回 [{layer, file, entries}]
function scanAllFiles() {
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
function rewriteFile(p, entries) {
  const lines = readFile(p).split('\n')
  const byLine = new Map()
  for (const line of lines) {
    const e = parseEntryLine(line.trim())
    if (e) byLine.set(e.fp, line)
  }
  const newLines = []
  let lastHeader = null
  for (const line of lines) {
    const e = parseEntryLine(line.trim())
    if (e) { lastHeader = null; continue } // 条目行由下面统一重建
    if (line.trim().startsWith('## ')) lastHeader = line
  }
  // 简化：直接重写文件，仅保留头部注释和条目
  const header = []
  for (const line of lines) {
    if (!parseEntryLine(line.trim()) && !line.trim().startsWith('- [')) header.push(line)
  }
  const body = entries.map((e) => formatEntryLine(e))
  const text = header.join('\n').replace(/\n{3,}/g, '\n\n').trim() + (body.length ? '\n' + body.join('\n') : '') + '\n'
  writeFile(p, text)
}

// ---------- 审计（v0.5：SQLite audit_log 表；兼容旧 JSONL 日志） ----------

function audit(event, data = {}) {
  db.openDb()
  const entryId = data.entry_id
  const detail = { ...data }
  delete detail.entry_id
  db.audit(event, { entry_id: entryId, detail })
  // 旧版可读日志同步（一行摘要）
  const stamp = nowStamp()
  const brief = data.text ? data.text.slice(0, 60) : ''
  appendFile(PATHS.audit, `[${stamp}] ${event} ${data.fp || ''} ${brief}\n`)
  return { t: isoNow(), event, ...data }
}

function queryAudit({ sinceDays, type, entryId, actor, limit = 50 } = {}) {
  return db.queryAudit({ sinceDays, type, entryId, actor, limit })
}

// 审计聚合统计（文档 P1-003）：groupBy = action | day | entry
function auditAggregate({ sinceDays, groupBy = 'action' } = {}) {
  return db.auditAggregate({ sinceDays, groupBy })
}

// ---------- 工具函数 ----------

function fingerprint(text) {
  // 内容前 20 字的简单指纹（去重用）
  const t = text.replace(/\s+/g, '').slice(0, 20)
  let h = 0
  for (let i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

function isImportant(text, track) {
  // 分级：用户偏好/项目决策/禁忌教训 = 重要（需审批）；普通事实 = 自动
  const importantHints = /偏好|喜欢|不要|禁止|必须|以后都|正式名|规则|决策|教训|踩坑|千万|千万别|禁忌|红线|不得/
  return track === 'user' || importantHints.test(text)
}

// 粗略 token 估算：中文字符≈1 token，其余按 4 字符/token
function estimateTokens(s) {
  let zh = 0, other = 0
  for (const ch of s) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) zh++
    else other++
  }
  return zh + Math.ceil(other / 4)
}

// ---------- 写入记忆（带审计；approval 在调用方 gate） ----------

function writeEntry({ track, text, sessionId, approved, mode }) {
  ensureDirs()
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
    fp,
    layer,
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
  petNotify('记忆已保存', `${track === 'user' ? '偏好' : '经验'}：${text}`)
  return { ok: true, fp }
}

// ---------- 记忆钉（锁定不参与衰减） ----------

function setPin(fp, pinned) {
  db.openDb()
  const e = db.getByFp(fp)
  if (!e) return { ok: false, error: `未找到 [fp:${fp}]` }
  const ok = db.setPinFp(fp, pinned, pinned ? 'memory pin' : undefined)
  if (!ok) return { ok: false, error: `未找到 [fp:${fp}]` }
  db.audit(pinned ? 'PIN' : 'UNPIN', { entry_id: e.entry_id, detail: { fp, text: e.text } })
  return { ok: true, fp, pinned, text: e.text }
}

function findByText(q) {
  db.openDb()
  const ql = q.toLowerCase()
  for (const e of db.allEntries()) {
    if ((e.text || '').toLowerCase().includes(ql)) return e
  }
  return null
}

// ---------- 记忆代谢（dream：衰减 + 巩固 + 冲突仲裁 + 归档） ----------

function backupNow() {
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
function latestBackup() {
  if (!fs.existsSync(PATHS.backups)) return null
  const dirs = fs.readdirSync(PATHS.backups).filter((d) => /^\d{12}$/.test(d)).sort().reverse()
  return dirs.length ? path.join(PATHS.backups, dirs[0]) : null
}

// 中文双字 bigram 集合（主题相似度/冲突检测共用）
function zhBigrams(s) {
  const out = new Set()
  const chars = s.replace(/[^\u4e00-\u9fff]/g, '')
  for (let i = 0; i < chars.length - 1; i++) out.add(chars.slice(i, i + 2))
  return out
}

// 冲突仲裁（v0.5 修正，对应文档 P0-003 二次验证）：
//   1) 教训/遵守语境排除：行为记录若为「踩坑教训/事故复盘/经验总结」
//      （含教训词），说明是偏好强化记录而非当前矛盾，不判冲突
//   2) 逐条偏好比对（非整文件）：行为条目与【单条】偏好做双字重叠，
//      避免整文件并集导致泛词误判
//   3) 泛化词过滤：偏好中的通用双字（网络/下载/镜像/用户/服务…）不计入
//      重叠——只有「专有词重叠 ≥ 阈值」才构成冲突证据
const CONFLICT_LEARN_HINTS = /教训|踩坑|事故复盘|切记|务必|禁止|不要|严禁|不得|一律|必须|先查|先确认|经验总结|复盘|注意点|注意事项|踩过的坑|以后注意|以后都|误删|误操作/
const CONFLICT_GENERIC_BIGRAMS = new Set([
  '网络', '下载', '镜像', '用户', '数据', '文件', '程序', '插件', '安装', '删除', '清理',
  '更新', '版本', '使用', '进行', '一个', '这个', '可以', '需要', '直接', '本地', '系统',
  '项目', '工具', '命令', '配置', '设置', '默认', '完全', '不要', '没有', '不是', '已经',
  '之后', '之前', '时候', '服务', '加速', '速服', '告知', '访问', '打开',
])

function detectConflict(entry, prefsText) {
  if (CONFLICT_LEARN_HINTS.test(entry.text)) return false
  const prefLines = String(prefsText || '').split('\n').map((l) => l.trim()).filter((l) => l.length > 4)
  if (!prefLines.length) return false
  const eb = zhBigrams(entry.text)
  let maxOverlap = 0
  for (const line of prefLines) {
    const pb = zhBigrams(line)
    let ov = 0
    for (const b of eb) if (pb.has(b) && !CONFLICT_GENERIC_BIGRAMS.has(b)) ov++
    if (ov > maxOverlap) maxOverlap = ov
  }
  return maxOverlap >= CONFLICT_OVERLAP_THRESHOLD
}

// 执行代谢（v0.5：SQLite 版 + 断点续跑）。opts: { dryRun, resume }
// 返回 { scanned, decayed, consolidated, conflicted, archived, backup }
function runDream(opts = {}) {
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
    // 3. 冲突仲裁：行为与偏好冲突 → 偏好优先，行为降权
    if (e.kind === '行为' && detectConflict(e, prefsText)) {
      report.conflicted++
      report.items.push({ op: 'CONFLICT', layer: e.layer, fp: e.fp, entry_id: e.entry_id, to: Math.max(1, e.weight * 0.5) })
      e.weight = Math.max(1, Math.round(e.weight * 0.5 * 10) / 10)
      changed = true
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

// 贪心主题聚类：TF 向量余弦相似度 ≥ 0.25 的条目归为一簇（复用 tokenize/余弦，
// 比 bigram Jaccard 更能容忍长句；共享专有名词即可聚，功能词不会误触发）
function clusterEntries(entries) {
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
function latestReflection() {
  const dir = path.join(MEMORY_ROOT, 'longterm', 'reflections')
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().reverse()
  return files.length ? path.join(dir, files[0]) : null
}

// 执行深度反思。opts: { dryRun }
// 返回 { scanned, recent7, prev7, clusters, conflicts, forget, reportFile, text, dryRun }
function runReflect(opts = {}) {
  const dryRun = opts.dryRun === true
  const all = scanAllFiles()
  const entries = []
  for (const f of all) for (const e of f.entries) entries.push({ layer: f.layer, ...e })
  const DAY = 86400000
  const now = Date.now()
  const ageOf = (e) => {
    if (!e.ts) return null
    const t = new Date(e.ts.replace(' ', 'T'))
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
    '## 潜在冲突',
    ...(conflicts.length ? conflicts.map((c) => `- [${c.layer}] [fp:${c.fp}] ${c.text}`) : ['（无）']),
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

// ---------- 语义检索（纯 JS TF-IDF + cosine，无外部依赖） ----------

function tokenize(s) {
  const tokens = []
  // 中文：先全部单字，再全部双字（双字在单字之后，保证前缀语义）
  const zh = s.replace(/[^\u4e00-\u9fff]/g, '')
  for (let i = 0; i < zh.length; i++) tokens.push(zh[i])
  for (let i = 0; i < zh.length - 1; i++) tokens.push(zh.slice(i, i + 2))
  // 英文/数字：小写单词
  for (const w of s.toLowerCase().match(/[a-z0-9_]+/g) || []) {
    if (w.length > 1) tokens.push(w)
  }
  return tokens
}

function tfidfVectors(entries) {
  const N = entries.length || 1
  const df = new Map()
  const vecs = []
  for (const e of entries) {
    const toks = tokenize(e.text)
    const tf = new Map()
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1)
    for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1)
    vecs.push({ fp: e.fp, tf })
  }
  for (const v of vecs) {
    v.w = new Map()
    for (const [t, c] of v.tf) {
      v.w.set(t, c * Math.log((N + 1) / (1 + (df.get(t) || 1))))
    }
  }
  return vecs
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (const [t, w] of a) {
    dot += w * (b.get(t) || 0)
    na += w * w
  }
  for (const [, w] of b) nb += w * w
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function semanticSearch(query, entries, topN = 5) {
  if (!entries.length) return []
  const vecs = tfidfVectors(entries)
  const qw = new Map()
  for (const t of tokenize(query)) qw.set(t, (qw.get(t) || 0) + 1)
  const scored = []
  for (let i = 0; i < entries.length; i++) {
    const s = cosine(qw, vecs[i].w)
    if (s > 0) scored.push({ fp: entries[i].fp, score: s })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topN)
}

// ---------- 自动巩固（用进废退）+ 安全删除 ----------

// 被查询/召回的条目 hits+1（用进废退，SQLite 版本）
function consolidateHits(fpSet) {
  if (!fpSet || !fpSet.size) return 0
  db.openDb()
  for (const fp of fpSet) {
    db.touchEntry(fp, { hitsDelta: 1 })
  }
  return fpSet.size
}

// 安全删除：先备份数据库再删条目（可回滚）
function removeEntry(fp) {
  db.openDb()
  const e = db.getByFp(fp)
  if (!e) return { ok: false, error: `未找到 [fp:${fp}]` }
  const bk = db.backupDb()
  db.removeByFp(fp)
  db.audit('REMOVE', { entry_id: e.entry_id, detail: { fp, text: e.text, backup: bk } })
  return { ok: true, fp, layer: e.layer, text: e.text, backup: bk }
}

// 条目状态（知识页状态色）：conflict=与偏好冲突（红）/ warning=低权重待处理（黄）/ ok=正常（绿）
function entryStatus(e, prefsText) {
  if (e.kind === '行为' && detectConflict(e, prefsText)) return 'conflict'
  if (e.status !== 'archived' && Number(e.weight) < CFG.decayThreshold) return 'warning'
  return 'ok'
}

// 编辑条目文本：保留 fp/锁定/权重等元数据，清空旧向量（文本变了向量失效），审计可追溯
function updateEntryText(fp, text) {
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

// ---------- 查询（v0.5：exact / semantic / hybrid 三模式，命中自动巩固） ----------

async function queryEntries(query, limit = CFG.maxQueryResults, opts = {}) {
  db.openDb()
  const mode = opts.mode || 'hybrid'
  const projectId = opts.projectId || undefined
  const topK = opts.topK || limit
  const minWeight = opts.minWeight ?? 0.1
  const fragmentTypes = Array.isArray(opts.fragmentTypes) && opts.fragmentTypes.length ? new Set(opts.fragmentTypes) : null
  const includeArchived = opts.includeArchived === true

  const ql = (query || '').toLowerCase()
  let entries = db.allEntries({ includeArchived })
  if (projectId) entries = entries.filter((e) => e.project_id === projectId)
  if (fragmentTypes) entries = entries.filter((e) => fragmentTypes.has(e.fragment_type))

  // 关键词精确命中（低配时的兜底 + 自动巩固）
  const kwHits = new Set()
  if (ql) {
    for (const e of entries) {
      if ((e.text || '').toLowerCase().includes(ql)) kwHits.add(e.fp)
    }
  }
  // 三模式检索
  const vectorEntries = db.entriesWithVectors({ includeArchived })
  const results = await embed.search({
    query: query || '',
    mode,
    entries,
    vectorEntries: vectorEntries.length ? vectorEntries : null,
    topN: topK,
    minWeight,
  })
  const out = []
  const hitFps = new Set()
  for (const r of results) {
    const e = r.entry
    if (!e) continue
    const isSem = mode !== 'exact' && !kwHits.has(e.fp)
    out.push({ layer: e.layer, fp: e.fp, text: e.text, weight: e.weight, semantic: isSem, score: r.score, fragment_type: e.fragment_type })
    if (ql) hitFps.add(e.fp)
  }
  // 精确关键词命中未进 top-N 的也补入（保底不丢）
  if (ql && kwHits.size) {
    const inOut = new Set(out.map((o) => o.fp))
    for (const e of entries) {
      if (kwHits.has(e.fp) && !inOut.has(e.fp) && out.length < limit) {
        out.push({ layer: e.layer, fp: e.fp, text: e.text, weight: e.weight, semantic: false })
        inOut.add(e.fp)
      }
    }
  }
  // 用进废退：带关键词的真实召回才巩固（list 浏览不计）
  if (ql && hitFps.size) {
    const files = consolidateHits(hitFps)
    if (files) db.audit('RECALL', { detail: { count: hitFps.size, files } })
  }
  return out.slice(0, limit)
}

// ---------- 冻结快照（会话启动注入 system prompt；注册即冻结） ----------

function renderSnapshot() {
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
  const parts = []
  if (prefs) parts.push('## 用户偏好（最高优先级）\n' + prefs)
  if (pinned.length) parts.push('## 锁定记忆（最高优先级，不参与衰减）\n' + pinned.join('\n'))
  if (kb.length) parts.push('## 近期知识记忆\n' + kb.sort(rank).map(fmt).join('\n'))
  if (bb.length) parts.push('## 近期行为记忆\n' + bb.sort(rank).map(fmt).join('\n'))
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

// ---------- 审批门（分级：重要 ask / 普通 auto；审批不可用按 approvalFallback 降级） ----------

async function gateWrite(ctx, { track, text }) {
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

function selfHeal() {
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

// ---------- 桌宠联动（完全可选，配置 petEndpoint 启用） ----------

let PET_ENDPOINT = null

function petRequest(pathname, payload, timeoutMs = 1200) {
  if (!PET_ENDPOINT) return
  try {
    const u = new URL(PET_ENDPOINT)
    const req = http.request({
      host: u.hostname,
      port: u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80),
      path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) },
      timeout: timeoutMs,
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => { /* 桌宠不在线则静默 */ })
    req.end(payload)
  } catch { /* ignore */ }
}

function petNotify(title, text) {
  petRequest('/notify', JSON.stringify({ title, text: text.slice(0, 60), seconds: 5, kind: '记忆' }))
}

// ---------- 工具定义（官方 ToolDefinition：parameters + output + execute） ----------

function makeMemoryTool(ctx) {
  return {
    name: TOOL_NAME,
    description: [
      '跨会话记忆系统：保存/查询值得记住的事实、偏好、教训。',
      '用法: memory action=add text="..." [track=user|agent] —— 保存（重要项自动请求审批，审批不可用时按配置自动保存）',
      '      memory action=query text="关键词" [mode=hybrid|exact|semantic] [projectId=项目] [topK=10] [minWeight=0.1] [fragmentTypes=decision,preference] [includeArchived=false] —— 查询',
      '           （hybrid=精确+语义混合（默认）；exact=关键词精确；semantic=向量语义；命中自动巩固）',
      '      memory action=remove fp="指纹" —— 删除一条（自动备份，可回滚）',
      '      memory action=list —— 列出全部条目',
      '      memory action=pin fp="指纹" —— 锁定（不参与衰减）',
      '      memory action=unpin fp="指纹" —— 解锁',
      '      memory action=dream [dryRun=true] [resume=true] —— 记忆代谢（衰减/巩固/归档，支持断点续跑）',
      '      memory action=reflect [dryRun=true] —— 深度反思（主题聚类/趋势/冲突/遗忘建议）',
      '      memory action=audit [type="DECAY"] [sinceDays=7] [aggregate=true] [groupBy=action|day|entry] —— 结构化审计查询/聚合',
      '保存原则：用户偏好/纠正/项目决策/踩坑教训要保存；琐事、一次性路径、可从代码重新推导的事实不保存。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'query', 'remove', 'list', 'pin', 'unpin', 'dream', 'reflect', 'audit'], description: '操作' },
        text: { type: 'string', description: 'add 的内容 或 query 的关键词' },
        track: { type: 'string', enum: ['user', 'agent'], description: 'user=用户偏好/知识；agent=行为/教训（默认 agent）' },
        fp: { type: 'string', description: 'remove/pin/unpin 时按指纹' },
        dryRun: { type: 'boolean', description: 'dream/reflect 时预览不执行' },
        type: { type: 'string', description: 'audit 过滤事件类型' },
        sinceDays: { type: 'number', description: 'audit 只看最近 N 天' },
        mode: { type: 'string', enum: ['hybrid', 'exact', 'semantic'], description: 'query 检索模式（默认 hybrid）' },
        projectId: { type: 'string', description: 'query 限定项目范围' },
        topK: { type: 'number', description: 'query 返回结果数量上限' },
        minWeight: { type: 'number', description: 'query 最低权重阈值' },
        fragmentTypes: { type: 'string', description: 'query 限定片段类型（逗号分隔：decision,preference,fact,event,note）' },
        includeArchived: { type: 'boolean', description: 'query 是否包含冷归档记忆' },
        aggregate: { type: 'boolean', description: 'audit 聚合统计模式' },
        groupBy: { type: 'string', enum: ['action', 'day', 'entry'], description: 'audit 聚合维度（默认 action）' },
        resume: { type: 'boolean', description: 'dream 断点续跑（默认 true）' },
      },
      required: ['action'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          error: { type: 'string' },
          skipped: { type: 'boolean' },
          reason: { type: 'string' },
          fp: { type: 'string' },
          mode: { type: 'string' },
          note: { type: 'string' },
          report: { type: 'object', additionalProperties: true },
          entries: {
            type: 'array',
            items: { type: 'object', properties: { layer: { type: 'string' }, text: { type: 'string' } }, additionalProperties: true },
          },
        },
        required: ['ok'],
      },
      render(args, value) {
        if (!value.ok) return [{ type: 'text', text: value.error || 'memory 操作失败' }]
        if (Array.isArray(value.entries)) {
          if (!value.entries.length) return [{ type: 'text', text: '（无匹配记忆）' }]
          return [{ type: 'text', text: value.entries.map((e) => `- [${e.layer}]${e.semantic ? '（语义）' : ''} ${e.text}`).join('\n') }]
        }
        if (value.report) {
          const r = value.report
          if (Array.isArray(r.clusters)) {
            // 深度反思报告
            const head = `【深度反思${r.dryRun ? '预览' : ''}】条目 ${r.scanned}：主题聚类 ${r.clusters.length} · 潜在冲突 ${r.conflicts.length} · 遗忘候选 ${r.forget.length}\n近 7 天写入 ${r.recent7} 条（上一周 ${r.prev7} 条）`
            const detail = r.clusters.slice(0, 5).map((c) => `- 主题（${c.size} 条）：${c.members.slice(0, 2).map((m) => m.text).join(' / ')}`).join('\n')
            const fileNote = r.reportFile ? `\n报告：${r.reportFile}` : '（预览不落盘）'
            return [{ type: 'text', text: detail ? `${head}\n${detail}${fileNote}` : `${head}${fileNote}` }]
          }
          const head = `${r.dryRun ? '【预览】' : ''}扫描 ${r.scanned} 条：衰减 ${r.decayed} · 巩固 ${r.consolidated} · 冲突 ${r.conflicted} · 归档 ${r.archived}\n备份：${r.backup}`
          const detail = r.items.slice(0, 15).map((it) => `- ${it.op} [${it.layer}] [fp:${it.fp}] ${it.to !== undefined ? `→ ${it.to}` : ''}`).join('\n')
          return [{ type: 'text', text: detail ? `${head}\n${detail}` : head }]
        }
        if (value.skipped) return [{ type: 'text', text: '重复记忆，已跳过' }]
        if (value.note) return [{ type: 'text', text: value.note }]
        return [{ type: 'text', text: `已保存 [fp:${value.fp}]（${value.mode || 'auto'}）` }]
      },
    },
    presentCall(args) {
      return { card: 'generic', title: `记忆：${args?.action || ''}`, kind: 'other', rawInput: args }
    },
    async execute(args, exec) {
      const { action, text = '', track = 'agent', fp, dryRun, type, sinceDays, mode, projectId, topK, minWeight, fragmentTypes, includeArchived, aggregate, groupBy, resume } = args || {}
      const sessionId = exec.agent?.id
      if (action === 'add') {
        if (!text.trim()) return { ok: false, error: 'text 必填' }
        const g = await gateWrite(ctx, { track, text: text.trim() })
        if (!g.approved) return { ok: false, error: `写入未获批准（${g.outcome || 'denied'}）——重要记忆需人工审批（可设置 approvalFallback=auto 自动保存）` }
        const r = writeEntry({ track, text: text.trim(), sessionId, approved: g.mode === 'ask', mode: g.mode })
        return { ok: true, ...r, mode: g.mode }
      }
      if (action === 'query') {
        const fts = typeof fragmentTypes === 'string' && fragmentTypes.trim()
          ? fragmentTypes.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined
        return { ok: true, entries: await queryEntries(text, topK || CFG.maxQueryResults, { mode, projectId, topK: topK || CFG.maxQueryResults, minWeight, fragmentTypes: fts, includeArchived }) }
      }
      if (action === 'list') return { ok: true, entries: await queryEntries('', topK || 200, { mode: 'exact' }) }
      if (action === 'remove') {
        if (!fp) return { ok: false, error: 'fp 必填（先 query 找到指纹）' }
        const r = removeEntry(fp)
        return r.ok ? { ok: true, note: `已删除 [fp:${fp}]（备份：${r.backup}）` } : r
      }
      if (action === 'pin' || action === 'unpin') {
        if (!fp) return { ok: false, error: 'fp 必填（先 query 找到指纹）' }
        const r = setPin(fp, action === 'pin')
        return r.ok ? { ok: true, note: `已${action === 'pin' ? '锁定' : '解锁'} [fp:${fp}]` } : r
      }
      if (action === 'dream') {
        const r = runDream({ dryRun: dryRun === true, resume })
        return { ok: true, report: { ...r, dryRun: dryRun === true } }
      }
      if (action === 'reflect') {
        const r = runReflect({ dryRun: dryRun === true })
        return { ok: true, report: { ...r, dryRun: dryRun === true } }
      }
      if (action === 'audit') {
        if (aggregate === true) {
          const agg = auditAggregate({ sinceDays, groupBy: groupBy || 'action' })
          if (!agg.length) return { ok: true, note: '（无匹配审计记录）' }
          return { ok: true, note: '审计聚合统计：\n' + agg.map((a) => `- ${a.key}: ${a.count}`).join('\n') }
        }
        const recs = queryAudit({ sinceDays, type })
        if (!recs.length) return { ok: true, note: '（无匹配审计记录）' }
        return { ok: true, note: recs.slice(-20).map((r) => `${r.t.slice(0, 16)} ${r.action} ${r.entry_id || ''} ${r.detail || ''}`).join('\n') }
      }
      return { ok: false, error: '未知 action' }
    },
  }
}

function makeRecallTool() {
  return {
    name: 'memory_recall',
    description: '跨会话记忆召回：查询长期记忆体与项目档案（与 memory query 相同，语义上用于"你还记得…吗"场景）',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: '查询关键词' } },
      required: ['text'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          entries: {
            type: 'array',
            items: { type: 'object', properties: { layer: { type: 'string' }, text: { type: 'string' } }, additionalProperties: true },
          },
        },
        required: ['ok'],
      },
      render(args, value) {
        if (!Array.isArray(value.entries) || !value.entries.length) return [{ type: 'text', text: '（无匹配记忆）' }]
        return [{ type: 'text', text: value.entries.map((e) => `- [${e.layer}] ${e.text}`).join('\n') }]
      },
    },
    presentCall(args) {
      return { card: 'generic', title: '记忆召回', kind: 'other', rawInput: args }
    },
    async execute(args) {
      return { ok: true, entries: queryEntries((args || {}).text || '') }
    },
  }
}

// ---------- 命令（官方可选服务模式：ctx.inject(['commands'], child => ...)） ----------

function registerMemoryCommand(ctx) {
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'memory',
      description: '记忆管理：list / query <词> / add <内容> / remove <fp> / pin <fp> / unpin <fp> / dream [--dry-run] / reflect [--dry-run] / entries [词] / audit [--since 7d] [--type DECAY]',
      handler(invocation) {
        const { rawInput, agent } = invocation
        const tokens = (rawInput || '').trim().split(/\s+/)
        const verb = tokens[0]
        const rest = tokens.slice(1)
        const sessionId = agent?.id
        if (verb === 'list') {
          const es = queryEntries('')
          return { kind: 'success', text: es.length ? es.map((e) => `- [${e.layer}] ${e.text}`).join('\n') : '（记忆为空）' }
        }
        if (verb === 'query') {
          const q = rest.join(' ')
          const es = queryEntries(q)
          return { kind: 'success', text: es.length ? es.map((e) => `- [${e.layer}] ${e.text}`).join('\n') : `（无匹配：${q}）` }
        }
        if (verb === 'add') {
          if (!rest.length) return { kind: 'success', text: '用法: /memory add <内容>' }
          const q = rest.join(' ')
          const r = writeEntry({ track: 'agent', text: q, sessionId, approved: true })
          return { kind: 'success', text: r.skipped ? '重复，已跳过' : `已保存 [fp:${r.fp}]（人类发起）` }
        }
        if (verb === 'remove') {
          const fp = rest[0]
          if (!fp) return { kind: 'success', text: '用法: /memory remove <fp>' }
          const r = removeEntry(fp)
          return { kind: 'success', text: r.ok ? `已删除 [fp:${fp}]（备份：${r.backup}）` : r.error }
        }
        if (verb === 'entries') {
          const q = rest.join(' ')
          const es = queryEntries(q, 50).map((e) => {
            const meta = []
            if (e.weight !== undefined) meta.push(`w${e.weight}`)
            if (e.hits !== undefined) meta.push(`h${e.hits}`)
            if (e.ts) meta.push(e.ts)
            if (e.pinned) meta.push('PIN')
            if (e.semantic) meta.push('语义')
            return `- [${e.layer}] [${meta.join(' ')}] ${e.text}`
          })
          return { kind: 'success', text: es.length ? es.join('\n') : (q ? `（无匹配：${q}）` : '（记忆为空）') }
        }
        if (verb === 'reflect') {
          const dryRun = rest.includes('--dry-run')
          const r = runReflect({ dryRun })
          const head = `${dryRun ? '【预览】' : ''}条目 ${r.scanned}：主题聚类 ${r.clusters.length} · 冲突 ${r.conflicts.length} · 遗忘候选 ${r.forget.length} · 近7天写入 ${r.recent7}（上周 ${r.prev7}）`
          const detail = r.clusters.slice(0, 5).map((c) => `- 主题（${c.size} 条）：${c.members.slice(0, 2).map((m) => m.text).join(' / ')}`).join('\n')
          return { kind: 'success', text: detail ? `${head}\n${detail}` : head }
        }
        if (verb === 'pin' || verb === 'unpin') {
          const fp = rest[0]
          if (!fp) return { kind: 'success', text: `用法: /memory ${verb} <fp>` }
          const r = setPin(fp, verb === 'pin')
          return { kind: 'success', text: r.ok ? `已${verb === 'pin' ? '锁定' : '解锁'} [fp:${fp}]` : r.error }
        }
        if (verb === 'dream') {
          const dryRun = rest.includes('--dry-run')
          const r = runDream({ dryRun })
          const head = `${dryRun ? '【预览】' : ''}扫描 ${r.scanned} 条：衰减 ${r.decayed} · 巩固 ${r.consolidated} · 冲突 ${r.conflicted} · 归档 ${r.archived}`
          const detail = r.items.slice(0, 20).map((it) => `- ${it.op} [${it.layer}] [fp:${it.fp}]${it.to !== undefined ? ` → ${it.to}` : ''}`).join('\n')
          return { kind: 'success', text: detail ? `${head}\n备份：${r.backup}\n${detail}` : `${head}\n备份：${r.backup}` }
        }
        if (verb === 'audit') {
          let sinceDays
          let type
          for (let i = 0; i < rest.length; i++) {
            if (rest[i] === '--since' && rest[i + 1]) {
              const m = rest[i + 1].match(/^(\d+)d?$/)
              if (m) sinceDays = Number(m[1])
              i++
            }
            if (rest[i] === '--type' && rest[i + 1]) { type = rest[i + 1].toUpperCase(); i++ }
          }
          const recs = queryAudit({ sinceDays, type })
          return { kind: 'success', text: recs.length ? recs.slice(-20).map((r) => `${r.t.slice(0, 16)} ${r.event} ${r.fp || ''} ${r.approved ? '[' + r.approved + ']' : ''} ${r.text || ''}`).join('\n') : '（无匹配审计记录）' }
        }
        return { kind: 'success', text: '用法: /memory list | query <词> | add <内容> | remove <fp> | pin <fp> | unpin <fp> | entries [词] | dream [--dry-run] | reflect [--dry-run] | audit [--since 7d] [--type DECAY]' }
      },
    })
  })
}

// ---------- 插件挂载 ----------

// 调试日志：默认关闭，设 DSH_MEMORY_DEBUG=1 开启
const DBG = process.env.DSH_MEMORY_DEBUG === '1'
function dbgLog(msg) {
  if (!DBG) return
  try {
    fs.appendFileSync(path.join(MEMORY_ROOT, 'pet-events.log'),
      new Date().toISOString().slice(11, 19) + ' ' + msg + '\n', 'utf-8')
  } catch { /* ignore */ }
}

// 事件节流：assistant/chunk 每 2 秒最多转发一次
const CHUNK_THROTTLE_MS = 2000
let _lastChunkAt = 0

function petEvent(type, meta) {
  if (!PET_ENDPOINT) return
  try {
    if (type === 'assistant/chunk') {
      const now = Date.now()
      if (now - _lastChunkAt < CHUNK_THROTTLE_MS) return
      _lastChunkAt = now
    }
    dbgLog(`→ petEvent(${type})`)
    petRequest('/event', JSON.stringify({ type, ...meta }), 800)
  } catch { /* ignore */ }
}

// 读取请求体（Web API 用）
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

export function apply(ctx, config = {}) {
  ensureDirs()
  // v0.5：SQLite 初始化 + Markdown 一次性迁移（meta 幂等）
  let migrateResult = null
  try {
    migrateResult = migrateMarkdownToDb()
    if (migrateResult.migrated) dbgLog(`migrate: imported=${migrateResult.imported}`)
  } catch (err) {
    dbgLog(`migrate failed: ${String(err && err.message || err)}`)
  }
  // 配置优先级：bundle 传入 config > 持久化 biomemory.config.json > 默认值
  const persisted = loadConfig()
  CFG = { ...DEFAULTS, ...persisted, ...(typeof config === 'object' && config ? config : {}) }
  CONFLICT_OVERLAP_THRESHOLD = Number(CFG.conflictOverlap) || 3
  PET_ENDPOINT = typeof CFG.petEndpoint === 'string' ? CFG.petEndpoint : null
  selfHeal()
  dbgLog('=== apply 执行 ===')

  // v0.5：后台预建向量索引（模型可用时，不阻塞启动）
  setTimeout(() => { ensureVectors().then((r) => dbgLog(`vectors: ${JSON.stringify(r)}`)) }, 100)

  // 0. 启动自动代谢/反思（距上次执行 ≥ 配置天数时自动执行，0=关闭）
  try {
    if (CFG.autoDreamDays > 0) {
      const lb = latestBackup()
      if (!lb || Date.now() - fs.statSync(lb).mtimeMs >= CFG.autoDreamDays * 86400000) {
        const r = runDream()
        audit('AUTO-DREAM', { scanned: r.scanned, decayed: r.decayed, archived: r.archived })
        dbgLog(`auto dream: scanned=${r.scanned}`)
      }
    }
    if (CFG.autoReflectDays > 0) {
      const lr = latestReflection()
      if (!lr || Date.now() - fs.statSync(lr).mtimeMs >= CFG.autoReflectDays * 86400000) {
        const r = runReflect()
        audit('AUTO-REFLECT', { reportFile: r.reportFile })
        dbgLog(`auto reflect: ${r.reportFile}`)
      }
    }
  } catch (err) {
    dbgLog(`auto run failed: ${String(err && err.message || err)}`)
  }

  // 1. 动态记忆上下文（每次对话/新会话组装提示词时自动重新求值 → 最新记忆同步）
  //    官方契约：PromptContext.text 支持 string | (context) => string，
  //    provider 形式每次 assemble 时重新渲染 renderSnapshot()——
  //    新增的记忆、权重变化、锁定状态都会实时反映，无需重启
  ctx.systemPrompt.context({
    name: 'memory:snapshot',
    order: -50,
    text: () => renderSnapshot(),
  })

  // 2. memory 工具 + memory_recall 工具
  ctx.tools.register(makeMemoryTool(ctx))
  ctx.tools.register(makeRecallTool())

  // 3. /memory 命令（可选服务，commands 缺失自动跳过）
  registerMemoryCommand(ctx)

  // 4. 设置页 Web API（官方契约：ctx.webServer.register，kind=prefix；webServer 缺失时自动跳过）
  //    端点：/biomemory/api/status   GET  记忆统计+配置
  //          /biomemory/api/config   GET 配置 / POST 更新配置
  //          /biomemory/api/dream    POST 触发记忆代谢 { dryRun }
  //          /biomemory/api/reflect  POST 触发深度反思 { dryRun }
  //          /biomemory/api/entries  GET 条目浏览/搜索 ?q=&layer=&limit=（知识页）
  //          /biomemory/api/entries/pin|unpin|remove  POST 条目操作
  //          /biomemory/api/audit    GET 审计查询 ?sinceDays=&type=
  //    注：不能直接访问 ctx.webServer —— Cordis service 未注入时 Proxy getter 抛
  //    "cannot get property without inject"（?. 拦不住）。用 ctx.inject 懒注入：
  //    依赖就绪后自动执行注册，缺失时静默跳过（官方 dsh-client-ui-theme 同款写法）。
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(() => httpCtx.webServer.register({
    kind: 'prefix',
    path: '/biomemory/api',
    handler: async (req, res) => {
      // URL 基准仅用于解析路径（无网络请求发生）
      const url = new URL(req.url ?? '/', 'https://dsh.invalid')
      const p = url.pathname.replace(/^\/biomemory\/api/, '') || '/'
      res.setHeader('content-type', 'application/json; charset=utf-8')
      const send = (code, body) => {
        res.statusCode = code
        res.end(JSON.stringify(body))
      }
      try {
        if (req.method === 'GET' && p === '/status') {
          const s = db.stats()
          const auditRecs = queryAudit({})
          // 概览页图表数据：类型分布 / 权重分布 / 近 7 天审计聚合
          const conn = db.openDb()
          const byType = conn.prepare('SELECT fragment_type AS k, COUNT(*) AS c FROM entries GROUP BY fragment_type ORDER BY c DESC').all().map((r) => ({ key: r.k, count: r.c }))
          const byWeight = conn.prepare("SELECT CASE WHEN weight >= 10 THEN '10+' WHEN weight >= 5 THEN '5-9' WHEN weight >= 3 THEN '3-4' ELSE '<3' END AS k, COUNT(*) AS c FROM entries GROUP BY k ORDER BY c DESC").all().map((r) => ({ key: r.k, count: r.c }))
          const audit7d = auditAggregate({ sinceDays: 7 })
          return send(200, { ok: true, stats: { total: s.total, pinned: s.pinned, layers: s.layers, memoryRoot: MEMORY_ROOT, auditCount: auditRecs.length, dbPath: s.dbPath, vectors: db.vectorCount(), model: embed.modelInfo(), migration: db.migrationStatus(), byType, byWeight, audit7d }, config: CFG, petEndpoint: PET_ENDPOINT })
        }
        if (req.method === 'GET' && p === '/config') {
          return send(200, { ok: true, config: CFG, petEndpoint: PET_ENDPOINT })
        }
        if (req.method === 'POST' && p === '/config') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          const allowed = ['halfLifeDays', 'decayThreshold', 'consolidateThreshold', 'weightCap', 'hotTokenLimit', 'maxQueryResults', 'approvalFallback', 'autoDreamDays', 'autoReflectDays', 'petEndpoint']
          // reset：恢复默认（删除持久化文件）
          if (body.reset === true) {
            try { fs.unlinkSync(PATHS.config) } catch { /* ignore */ }
            CFG = { ...DEFAULTS }
            PET_ENDPOINT = typeof CFG.petEndpoint === 'string' ? CFG.petEndpoint : null
            audit('CONFIG', { changed: 'reset' })
            return send(200, { ok: true, config: CFG, petEndpoint: PET_ENDPOINT, reset: true })
          }
          const next = { ...CFG }
          for (const k of allowed) {
            if (body[k] !== undefined) {
              if (k === 'petEndpoint') next[k] = typeof body[k] === 'string' && body[k] ? body[k] : null
              else if (k === 'approvalFallback') next[k] = body[k] === 'deny' ? 'deny' : 'auto'
              else {
                const v = Number(body[k])
                if (Number.isFinite(v) && v >= 0) next[k] = v
              }
            }
          }
          CFG = next
          PET_ENDPOINT = typeof CFG.petEndpoint === 'string' ? CFG.petEndpoint : null
          saveConfig(CFG) // 持久化：重启后保留
          audit('CONFIG', { changed: Object.keys(body).filter((k) => allowed.includes(k)).join(',') })
          return send(200, { ok: true, config: CFG, petEndpoint: PET_ENDPOINT })
        }
        if (req.method === 'POST' && p === '/dream') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          const r = runDream({ dryRun: body.dryRun === true })
          return send(200, { ok: true, report: { ...r, dryRun: body.dryRun === true } })
        }
        if (req.method === 'POST' && p === '/reflect') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          const r = runReflect({ dryRun: body.dryRun === true })
          return send(200, { ok: true, report: { ...r, dryRun: body.dryRun === true } })
        }
        if (req.method === 'GET' && p === '/entries') {
          const q = url.searchParams.get('q') || ''
          const layer = url.searchParams.get('layer') || ''
          const mode = url.searchParams.get('mode') || 'hybrid'
          const limit = Math.min(500, Number(url.searchParams.get('limit')) || 200)
          const prefsText = readFile(PATHS.preferences)
          // v0.5：带关键词走三模式检索（hybrid 语义优先）；纯浏览走精确列表
          if (q) {
            const res = await queryEntries(q, limit, { mode, minWeight: 0 })
            const seen = new Set()
            const merged = []
            for (const r of res) {
              if (seen.has(r.fp)) continue
              seen.add(r.fp)
              merged.push({ layer: r.layer, fp: r.fp, kind: r.kind, mode: r.mode, weight: r.weight, hits: r.hits, ts: r.ts, pinned: r.pinned, text: r.text, fragment_type: r.fragment_type, semantic: r.semantic, status: entryStatus(r, prefsText) })
            }
            return send(200, { ok: true, entries: merged.slice(0, limit), mode })
          }
          const all = db.listEntries({ layer: layer || undefined, limit: 1000 })
          all.sort((a, b) => (b.pinned - a.pinned) || (b.weight - a.weight) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
          return send(200, { ok: true, entries: all.slice(0, limit).map((e) => ({ layer: e.layer, fp: e.fp, kind: e.kind, mode: e.mode, weight: e.weight, hits: e.hits, ts: e.created_at, pinned: e.pinned, text: e.text, fragment_type: e.fragment_type, status: entryStatus(e, prefsText) })) })
        }
        if (req.method === 'GET' && p === '/vectors') {
          // 手动触发向量索引补算（POST /vectors 亦可）
          const r = await ensureVectors()
          return send(200, { ok: true, ...r })
        }
        if (req.method === 'POST' && p === '/vectors') {
          const r = await ensureVectors()
          return send(200, { ok: true, ...r })
        }
        if (req.method === 'GET' && p === '/audit/aggregate') {
          const sinceDays = Number(url.searchParams.get('sinceDays')) || undefined
          const groupBy = url.searchParams.get('groupBy') || 'action'
          const agg = auditAggregate({ sinceDays, groupBy })
          return send(200, { ok: true, entries: agg })
        }
        if (req.method === 'POST' && p === '/entries/pin') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          if (!body.fp) return send(400, { ok: false, error: 'fp 必填' })
          const r = setPin(body.fp, true)
          return r.ok ? send(200, { ok: true, fp: r.fp, pinned: true }) : send(404, r)
        }
        if (req.method === 'POST' && p === '/entries/unpin') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          if (!body.fp) return send(400, { ok: false, error: 'fp 必填' })
          const r = setPin(body.fp, false)
          return r.ok ? send(200, { ok: true, fp: r.fp, pinned: false }) : send(404, r)
        }
        if (req.method === 'POST' && p === '/entries/remove') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          if (!body.fp) return send(400, { ok: false, error: 'fp 必填' })
          const r = removeEntry(body.fp)
          return r.ok ? send(200, { ok: true, fp: r.fp, backup: r.backup }) : send(404, r)
        }
        if (req.method === 'POST' && p === '/entries/update') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          if (!body.fp || !String(body.text ?? '').trim()) return send(400, { ok: false, error: 'fp 与 text 必填' })
          const r = updateEntryText(body.fp, body.text)
          return r.ok ? send(200, { ok: true, fp: r.fp, text: r.text, note: r.note }) : send(404, r)
        }
        if (req.method === 'GET' && p === '/audit') {
          const sinceDays = Number(url.searchParams.get('sinceDays')) || undefined
          const type = url.searchParams.get('type') || undefined
          const recs = queryAudit({ sinceDays, type })
          return send(200, { ok: true, entries: recs.slice(-50) })
        }
        return send(404, { ok: false, error: 'not found' })
      } catch (err) {
        return send(500, { ok: false, error: String(err && err.message || err) })
      }
    },
  }), 'dsh-biomemory: settings web API')
  })

  // 5. DSH 事件 → 桌宠状态机（默认关闭）
  ctx.on('session/event', (session, rawEvent) => {
    const ev = rawEvent ?? {}
    const evType = typeof ev.type === 'string' ? ev.type : ''
    const sessionId = session?.id ?? session?.sessionId
    const data = ev.data ?? {}
    const reason = data?.reason?.kind ?? data?.reason
    dbgLog(`session/event → ${evType} (session=${sessionId ?? '?'})`)
    switch (evType) {
      case 'step/start':
        petEvent('step/start', { sessionId })
        break
      case 'assistant/chunk': {
        const ct = data?.chunk?.type
        if (ct === 'text-delta' || ct === 'reasoning-delta' || ct === 'tool-call-delta') {
          petEvent('assistant/chunk', { sessionId })
        }
        break
      }
      case 'tool/call':
        petEvent('tool/call', { toolName: data?.name, sessionId })
        break
      case 'turn/end':
        if (typeof reason === 'string') petEvent('turn/end', { reason, sessionId })
        break
      case 'approval/asked':
        petEvent('approval/asked', { sessionId })
        break
      case 'approval/decided':
        petEvent('approval/decided', { sessionId })
        break
      default:
        break
    }
  }, { global: true })
}

// ---------- 测试用内部接口（不参与 DSH 装配） ----------

export const __internals = {
  MEMORY_ROOT,
  parseEntryLine,
  formatEntryLine,
  fingerprint,
  isImportant,
  estimateTokens,
  detectConflict,
  zhBigrams,
  runDream,
  runReflect,
  clusterEntries,
  latestReflection,
  consolidateHits,
  removeEntry,
  updateEntryText,
  entryStatus,
  semanticSearch,
  tokenize,
  queryAudit,
  auditAggregate,
  queryEntries,
  setPin,
  scanAllFiles,
  backupNow,
  latestBackup,
  migrateMarkdownToDb,
  ensureVectors,
  setConfig: (c) => { CFG = { ...DEFAULTS, ...c } },
  getConfig: () => ({ ...CFG }),
  paths: PATHS,
}
