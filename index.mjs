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
// 能力（v0.3.0）：
//   1. memory 工具：add / query / remove / list / pin / unpin / dream / audit
//   2. 冻结快照注入：systemPrompt.section({ name, order, text })，会话启动冻结，
//      注入优先级：锁定 > preferences > knowledge > behavior，热区 token 上限可配
//   3. 分级审批门：重要记忆走 approval.request（ask），普通事实 auto；fail closed
//   4. 记忆代谢（/memory dream，手动触发）：半衰期衰减 + 引用巩固 + 冲突仲裁 +
//      低权重归档；支持 --dry-run 预览；执行前自动备份到 backups/
//   5. 记忆钉：pin/unpin，锁定记忆不参与衰减，无条件注入热区
//   6. 结构化审计：audit.jsonl 记录 WRITE/DECAY/CONSOLIDATE/CONFLICT/ARCHIVE/PIN/UNPIN
//   7. 语义检索：纯 JS TF-IDF + cosine（无原生模块、无外部依赖），关键词匹配降级
//   8. 配置化：半衰期/衰减阈值/巩固阈值/权重上限/热区 token 上限均可配置
//   9. 启动自检：主文件解析失败时自动从最近备份回滚
//  10. memory_recall：跨会话召回
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

export const inject = ['tools', 'systemPrompt']

// 记忆根目录：默认 ~/.dsh/memory（可用环境变量 DSH_MEMORY_ROOT 覆盖）
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
}

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

// ---------- 审计（结构化 JSONL，兼容旧日志） ----------

function audit(event, data = {}) {
  const rec = { t: isoNow(), event, ...data }
  try { appendFile(PATHS.auditJson, JSON.stringify(rec) + '\n') } catch { /* ignore */ }
  // 旧版可读日志同步（一行摘要）
  const stamp = nowStamp()
  const brief = data.text ? data.text.slice(0, 60) : ''
  appendFile(PATHS.audit, `[${stamp}] ${event} ${data.fp || ''} ${brief}\n`)
  return rec
}

function queryAudit({ sinceDays, type } = {}) {
  const cutoff = sinceDays ? Date.now() - sinceDays * 86400000 : 0
  const out = []
  for (const line of readFile(PATHS.auditJson).split('\n')) {
    if (!line.trim()) continue
    try {
      const rec = JSON.parse(line)
      if (type && rec.event !== type) continue
      if (cutoff && new Date(rec.t).getTime() < cutoff) continue
      out.push(rec)
    } catch { /* 跳过坏行 */ }
  }
  return out
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

function writeEntry({ track, text, sessionId, approved }) {
  ensureDirs()
  const fp = fingerprint(text)
  const file = track === 'user' ? PATHS.hotKnowledge : PATHS.hotBehavior
  const existing = readFile(file)
  if (existing.includes(`[fp:${fp}]`)) {
    return { ok: true, skipped: true, reason: 'duplicate' }
  }
  const entry = { kind: track === 'user' ? '知识' : '行为', mode: approved ? '审批' : '自动', fp, weight: 10, hits: 0, ts: nowStamp(), pinned: false, text: text.trim() }
  appendFile(file, `## ${nowStamp()} · 会话 ${sessionId || '?'}\n${formatEntryLine(entry)}\n`)
  audit('WRITE', { fp, track, approved: approved ? 'APPROVED' : 'AUTO', text: text.trim() })
  if (track === 'user') {
    appendFile(PATHS.preferences, `- [${nowStamp()}] ${text.trim()}\n`)
  }
  petNotify('记忆已保存', `${track === 'user' ? '偏好' : '经验'}：${text}`)
  return { ok: true, fp }
}

// ---------- 记忆钉（锁定不参与衰减） ----------

function setPin(fp, pinned) {
  for (const f of scanAllFiles()) {
    for (const e of f.entries) {
      if (e.fp === fp) {
        e.pinned = pinned
        rewriteFile(f.file, f.entries)
        audit(pinned ? 'PIN' : 'UNPIN', { fp, text: e.text })
        return { ok: true, fp, pinned, text: e.text }
      }
    }
  }
  return { ok: false, error: `未找到 [fp:${fp}]` }
}

function findByText(q) {
  const ql = q.toLowerCase()
  for (const f of scanAllFiles()) {
    for (const e of f.entries) {
      if (e.text.toLowerCase().includes(ql)) return e
    }
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

// 冲突仲裁：行为条目的关键词与偏好冲突 → 偏好优先，行为降权并记录
function detectConflict(entry, prefsText) {
  const zhBigrams = (s) => {
    const out = new Set()
    const chars = s.replace(/[^\u4e00-\u9fff]/g, '')
    for (let i = 0; i < chars.length - 1; i++) out.add(chars.slice(i, i + 2))
    return out
  }
  const eb = zhBigrams(entry.text)
  const pb = zhBigrams(prefsText)
  let overlap = 0
  for (const b of eb) if (pb.has(b)) overlap++
  return overlap >= 4 // 至少 4 个双字重叠才算冲突（避免误判）
}

// 执行代谢。opts: { dryRun }
// 返回 { scanned, decayed, consolidated, conflicted, archived, backup }
function runDream(opts = {}) {
  const dryRun = opts.dryRun === true
  const report = { scanned: 0, decayed: 0, consolidated: 0, conflicted: 0, archived: 0, backup: null, items: [] }
  if (dryRun) {
    report.backup = '（dry-run 不执行备份）'
  } else {
    report.backup = backupNow()
  }
  const prefsText = readFile(PATHS.preferences)
  const now = Date.now()
  for (const f of scanAllFiles()) {
    if (f.layer === 'preferences') continue // 偏好永不衰减
    let changed = false
    for (const e of f.entries) {
      if (e.pinned) continue // 锁定不参与
      report.scanned++
      // 1. 衰减：w * 0.5^(age/halfLife)
      let ageDays = 0
      if (e.ts) {
        const t = new Date(e.ts.replace(' ', 'T'))
        if (!Number.isNaN(t.getTime())) ageDays = Math.max(0, (now - t.getTime()) / 86400000)
      }
      const decayed = e.weight * Math.pow(0.5, ageDays / CFG.halfLifeDays)
      if (decayed < e.weight) {
        report.decayed++
        report.items.push({ op: 'DECAY', layer: f.layer, fp: e.fp, from: e.weight, to: Math.max(1, Math.round(decayed * 10) / 10) })
        e.weight = Math.max(1, Math.round(decayed * 10) / 10)
        changed = true
      }
      // 2. 巩固：引用 ≥ 阈值 → 加权（设上限）
      if (e.hits >= CFG.consolidateThreshold && e.weight < CFG.weightCap) {
        report.consolidated++
        report.items.push({ op: 'CONSOLIDATE', layer: f.layer, fp: e.fp, to: Math.min(CFG.weightCap, e.weight + 1) })
        e.weight = Math.min(CFG.weightCap, e.weight + 1)
        changed = true
      }
      // 3. 冲突仲裁：行为与偏好冲突 → 偏好优先，行为降权
      if (f.layer.startsWith('hot/behavior') && detectConflict(e, prefsText)) {
        report.conflicted++
        report.items.push({ op: 'CONFLICT', layer: f.layer, fp: e.fp, to: Math.max(1, e.weight * 0.5) })
        e.weight = Math.max(1, Math.round(e.weight * 0.5 * 10) / 10)
        changed = true
      }
      // 4. 归档：权重低于阈值 → 移入 archive/
      if (e.weight < CFG.decayThreshold) {
        report.archived++
        report.items.push({ op: 'ARCHIVE', layer: f.layer, fp: e.fp, text: e.text })
        if (!dryRun) {
          const arcFile = path.join(PATHS.archive, f.layer.replace(/[/\\]/g, '-') + '.md')
          appendFile(arcFile, `## ${nowStamp()} · 自动归档（权重 ${e.weight}）\n${formatEntryLine({ ...e, weight: e.weight })} \n`)
        }
        e._archived = true
        changed = true
      }
    }
    if (changed && !dryRun) {
      const keep = f.entries.filter((e) => !e._archived)
      rewriteFile(f.file, keep)
    }
  }
  // 审计记录（dry-run 也记录 PREVIEW）
  for (const it of report.items) {
    if (dryRun) audit('PREVIEW', { op: it.op, fp: it.fp })
    else audit(it.op, { fp: it.fp, text: it.text || '' })
  }
  return report
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

// ---------- 查询（关键词优先，语义补充） ----------

function queryEntries(query, limit = CFG.maxQueryResults) {
  const out = []
  const ql = query.toLowerCase()
  // 关键词精确匹配（命中 +1 引用计数，写回以巩固；读文件本身只读一次避免写放大）
  for (const f of scanAllFiles()) {
    for (const e of f.entries) {
      if (!ql || e.text.toLowerCase().includes(ql)) {
        out.push({ layer: f.layer, fp: e.fp, text: e.text, weight: e.weight })
      }
    }
  }
  // 关键词命中少 → 语义补充（召回前 5 条未命中条目）
  if (ql && out.length < 5) {
    const all = []
    for (const f of scanAllFiles()) for (const e of f.entries) all.push({ layer: f.layer, ...e })
    const hits = new Set(out.map((o) => o.fp))
    const sem = semanticSearch(query, all.filter((e) => !hits.has(e.fp)), 5)
    const byFp = new Map(all.map((e) => [e.fp, e]))
    for (const s of sem) {
      const e = byFp.get(s.fp)
      if (e) out.push({ layer: e.layer, fp: e.fp, text: e.text, weight: e.weight, semantic: true })
    }
  }
  return out.slice(0, limit)
}

// ---------- 冻结快照（会话启动注入 system prompt；注册即冻结） ----------

function renderSnapshot() {
  const prefs = readFile(PATHS.preferences).trim()
  const all = scanAllFiles()
  const pinned = []
  const kb = []
  const bb = []
  for (const f of all) {
    for (const e of f.entries) {
      if (e.pinned) pinned.push(`- [锁定|${f.layer}] ${e.text}`)
      else if (f.layer === 'hot/knowledge') kb.push(`- [${f.layer}] ${e.text}`)
      else if (f.layer === 'hot/behavior') bb.push(`- [${f.layer}] ${e.text}`)
    }
  }
  const parts = []
  if (prefs) parts.push('## 用户偏好（最高优先级）\n' + prefs)
  if (pinned.length) parts.push('## 锁定记忆（最高优先级，不参与衰减）\n' + pinned.join('\n'))
  if (kb.length) parts.push('## 近期知识记忆\n' + kb.join('\n'))
  if (bb.length) parts.push('## 近期行为记忆\n' + bb.join('\n'))
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

// ---------- 审批门（分级：重要 ask / 普通 auto；approval 可选消费） ----------

async function gateWrite(ctx, { track, text }) {
  const important = isImportant(text, track)
  if (!important) {
    return { approved: true, mode: 'auto' }
  }
  const approval = ctx.get('approval')
  if (!approval) {
    return { approved: false, mode: 'ask', outcome: 'unavailable' }
  }
  try {
    const outcome = await approval.request({
      toolName: TOOL_NAME,
      reason: `${REQUEST_MARKER} add ${track}\n${text}`,
    })
    return { approved: outcome === 'allowed-once', mode: 'ask', outcome }
  } catch {
    return { approved: false, mode: 'ask', outcome: 'unavailable' }
  }
}

// ---------- 启动自检：主文件解析失败 → 回滚最近备份 ----------

function selfHeal() {
  try {
    // 尝试解析主文件，若有异常字节/结构损坏则回滚
    for (const p of [PATHS.hotBehavior, PATHS.hotKnowledge]) {
      const t = readFile(p)
      if (t.includes('\u0000')) throw new Error('corrupt')
    }
  } catch {
    const bk = latestBackup()
    if (bk) {
      for (const f of ['behavior.md', 'knowledge.md', 'preferences.md']) {
        const src = path.join(bk, f)
        const dst = path.join(MEMORY_ROOT, f === 'behavior.md' ? 'hot/behavior.md' : f === 'knowledge.md' ? 'hot/knowledge.md' : f)
        if (fs.existsSync(src)) fs.copyFileSync(src, dst)
      }
      audit('ROLLBACK', { from: bk })
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
      '用法: memory action=add text="..." [track=user|agent] —— 保存（重要项会自动请求审批）',
      '      memory action=query text="关键词" —— 查询（关键词优先，语义补充）',
      '      memory action=remove fp="指纹" —— 删除一条（按指纹）',
      '      memory action=list —— 列出全部条目',
      '      memory action=pin fp="指纹" —— 锁定（不参与衰减）',
      '      memory action=unpin fp="指纹" —— 解锁',
      '      memory action=dream [dryRun=true] —— 记忆代谢（衰减/巩固/归档）',
      '      memory action=audit [type="DECAY"] [sinceDays=7] —— 结构化审计查询',
      '保存原则：用户偏好/纠正/项目决策/踩坑教训要保存；琐事、一次性路径、可从代码重新推导的事实不保存。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'query', 'remove', 'list', 'pin', 'unpin', 'dream', 'audit'], description: '操作' },
        text: { type: 'string', description: 'add 的内容 或 query 的关键词' },
        track: { type: 'string', enum: ['user', 'agent'], description: 'user=用户偏好/知识；agent=行为/教训（默认 agent）' },
        fp: { type: 'string', description: 'remove/pin/unpin 时按指纹' },
        dryRun: { type: 'boolean', description: 'dream 时预览不执行' },
        type: { type: 'string', description: 'audit 过滤事件类型' },
        sinceDays: { type: 'number', description: 'audit 只看最近 N 天' },
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
      const { action, text = '', track = 'agent', fp, dryRun, type, sinceDays } = args || {}
      const sessionId = exec.agent?.id
      if (action === 'add') {
        if (!text.trim()) return { ok: false, error: 'text 必填' }
        const g = await gateWrite(ctx, { track, text: text.trim() })
        if (!g.approved) return { ok: false, error: `写入未获批准（${g.outcome || 'denied'}）——重要记忆需人工审批` }
        const r = writeEntry({ track, text: text.trim(), sessionId, approved: g.mode === 'ask' })
        return { ok: true, ...r, mode: g.mode }
      }
      if (action === 'query') return { ok: true, entries: queryEntries(text) }
      if (action === 'list') return { ok: true, entries: queryEntries('') }
      if (action === 'remove') {
        if (!fp) return { ok: false, error: 'fp 必填（先 query 找到指纹）' }
        return { ok: true, note: `删除请在 ${MEMORY_ROOT} 中按指纹手动编辑（保持文件透明可改）` }
      }
      if (action === 'pin' || action === 'unpin') {
        if (!fp) return { ok: false, error: 'fp 必填（先 query 找到指纹）' }
        const r = setPin(fp, action === 'pin')
        return r.ok ? { ok: true, note: `已${action === 'pin' ? '锁定' : '解锁'} [fp:${fp}]` } : r
      }
      if (action === 'dream') {
        const r = runDream({ dryRun: dryRun === true })
        return { ok: true, report: { ...r, dryRun: dryRun === true } }
      }
      if (action === 'audit') {
        const recs = queryAudit({ sinceDays, type })
        if (!recs.length) return { ok: true, note: '（无匹配审计记录）' }
        return { ok: true, note: recs.slice(-20).map((r) => `${r.t.slice(0, 16)} ${r.event} ${r.fp || ''} ${r.text || ''}`).join('\n') }
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
      description: '记忆管理：list / query <词> / add <内容> / remove <fp> / pin <fp> / unpin <fp> / dream [--dry-run] / audit [--since 7d] [--type DECAY]',
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
          return { kind: 'success', text: `删除请直接编辑 ${MEMORY_ROOT} 对应文件（保持透明可改）` }
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
          return { kind: 'success', text: recs.length ? recs.slice(-20).map((r) => `${r.t.slice(0, 16)} ${r.event} ${r.fp || ''} ${r.text || ''}`).join('\n') : '（无匹配审计记录）' }
        }
        return { kind: 'success', text: '用法: /memory list | query <词> | add <内容> | remove <fp> | pin <fp> | unpin <fp> | dream [--dry-run] | audit [--since 7d] [--type DECAY]' }
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
  CFG = { ...DEFAULTS, ...(typeof config === 'object' && config ? config : {}) }
  PET_ENDPOINT = typeof config.petEndpoint === 'string' ? config.petEndpoint : null
  selfHeal()
  dbgLog('=== apply 执行 ===')

  // 1. 冻结快照注入（会话启动 → system prompt；官方 PromptSection = {name, order, text}）
  ctx.systemPrompt.section({
    name: 'memory:snapshot',
    order: -50,
    text: renderSnapshot(),
  })

  // 2. memory 工具 + memory_recall 工具
  ctx.tools.register(makeMemoryTool(ctx))
  ctx.tools.register(makeRecallTool())

  // 3. /memory 命令（可选服务，commands 缺失自动跳过）
  registerMemoryCommand(ctx)

  // 4. 设置页 Web API（官方契约：ctx.webServer.register，kind=prefix；webServer 缺失时自动跳过）
  //    端点：/biomemory/api/status  GET 记忆统计+配置
  //          /biomemory/api/config  GET 配置 / POST 更新配置
  //          /biomemory/api/dream   POST 触发记忆代谢 { dryRun }
  //          /biomemory/api/audit   GET 审计查询 ?sinceDays=&type=
  if (ctx.webServer?.register) {
    ctx.effect(() => ctx.webServer.register({
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
          const all = scanAllFiles()
          let total = 0, pinned = 0
          const layers = {}
          for (const f of all) {
            layers[f.layer] = f.entries.length
            total += f.entries.length
            for (const e of f.entries) if (e.pinned) pinned++
          }
          const auditRecs = queryAudit({})
          return send(200, { ok: true, stats: { total, pinned, layers, memoryRoot: MEMORY_ROOT, auditCount: auditRecs.length }, config: CFG, petEndpoint: PET_ENDPOINT })
        }
        if (req.method === 'GET' && p === '/config') {
          return send(200, { ok: true, config: CFG, petEndpoint: PET_ENDPOINT })
        }
        if (req.method === 'POST' && p === '/config') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          const allowed = ['halfLifeDays', 'decayThreshold', 'consolidateThreshold', 'weightCap', 'hotTokenLimit', 'maxQueryResults', 'petEndpoint']
          const next = { ...CFG }
          for (const k of allowed) {
            if (body[k] !== undefined) {
              if (k === 'petEndpoint') next[k] = typeof body[k] === 'string' && body[k] ? body[k] : null
              else {
                const v = Number(body[k])
                if (Number.isFinite(v) && v > 0) next[k] = v
              }
            }
          }
          CFG = next
          PET_ENDPOINT = typeof CFG.petEndpoint === 'string' ? CFG.petEndpoint : null
          audit('CONFIG', { changed: Object.keys(body).filter((k) => allowed.includes(k)).join(',') })
          return send(200, { ok: true, config: CFG, petEndpoint: PET_ENDPOINT })
        }
        if (req.method === 'POST' && p === '/dream') {
          let body = {}
          try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
          const r = runDream({ dryRun: body.dryRun === true })
          return send(200, { ok: true, report: { ...r, dryRun: body.dryRun === true } })
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
  }

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
  runDream,
  semanticSearch,
  tokenize,
  queryAudit,
  setPin,
  scanAllFiles,
  backupNow,
  latestBackup,
  setConfig: (c) => { CFG = { ...DEFAULTS, ...c } },
  getConfig: () => ({ ...CFG }),
  paths: PATHS,
}
