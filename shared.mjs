// ============================================================================
// dsh-biomemory · 共享基础（shared.mjs）—— 配置 / 常量 / 基础工具 / 审计
//
// 从 index.mjs 拆出（v0.6 架构升级）：配置默认值与持久化、路径常量、
// 纯工具函数（文件读写/时间/指纹/重要性判断/token 估算）、审计写入。
// 供 store/retrieve/meta/snapshot/gate/interface 各模块复用，避免循环依赖。
// ============================================================================

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import * as db from './db.mjs'

// 记忆根目录：默认 ~/.dsh/memory（可用环境变量 DSH_MEMORY_ROOT 覆盖）
// v0.5：SQLite 为主存储（~/.dsh/biomemory/biomemory.db），Markdown 保留为
// 迁移源与只读备份（首次启动自动导入）
export const MEMORY_ROOT = process.env.DSH_MEMORY_ROOT || path.join(os.homedir(), '.dsh', 'memory')

export const TOOL_NAME = 'memory'
export const REQUEST_MARKER = '[dsh-biomemory]'

// ---------- 配置（默认值，可在 apply(config) 覆盖） ----------

export const DEFAULTS = {
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
export let CONFLICT_OVERLAP_THRESHOLD = 3

export let CFG = { ...DEFAULTS }

// ESM 导出不可被导入方赋值：统一经 setter 修改（index/各模块一致）
export function setConfig(next) {
  CFG = { ...DEFAULTS, ...(next ?? {}) }
}
export function getConfig() {
  return { ...CFG }
}
export function setConflictThreshold(n) {
  CONFLICT_OVERLAP_THRESHOLD = Number(n) || 3
}

// ---------- 数据层：Markdown 文件读写（透明、可读改） ----------

export const PATHS = {
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
export function loadConfig() {
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

export function saveConfig(next) {
  const out = {}
  for (const k of Object.keys(DEFAULTS)) out[k] = next[k]
  out.petEndpoint = next.petEndpoint || null
  writeFile(PATHS.config, JSON.stringify(out, null, 2))
}

export function ensureDirs() {
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

// "2026-08-16 13:00" → ISO
export function tsToIso(ts) {
  const m = String(ts).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).toISOString()
}

// ---------- 纯工具 ----------

export function readFile(p) {
  try { return fs.readFileSync(p, 'utf-8') } catch { return '' }
}

export function writeFile(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text, 'utf-8')
}

export function appendFile(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.appendFileSync(p, text, 'utf-8')
}

export function nowStamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function isoNow() { return new Date().toISOString() }

export function fingerprint(text) {
  // 内容前 20 字的简单指纹（去重用）
  const t = text.replace(/\s+/g, '').slice(0, 20)
  let h = 0
  for (let i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

export function isImportant(text, track) {
  // 分级：用户偏好/项目决策/禁忌教训 = 重要（需审批）；普通事实 = 自动
  const importantHints = /偏好|喜欢|不要|禁止|必须|以后都|正式名|规则|决策|教训|踩坑|千万|千万别|禁忌|红线|不得/
  return track === 'user' || importantHints.test(text)
}

// 粗略 token 估算：中文字符≈1 token，其余按 4 字符/token
export function estimateTokens(s) {
  let zh = 0, other = 0
  for (const ch of s) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) zh++
    else other++
  }
  return zh + Math.ceil(other / 4)
}

// ---------- 审计（v0.5：SQLite audit_log 表；兼容旧 JSONL 日志） ----------

export function audit(event, data = {}) {
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

export function queryAudit({ sinceDays, type, entryId, actor, limit = 50 } = {}) {
  return db.queryAudit({ sinceDays, type, entryId, actor, limit })
}

// 审计聚合统计（文档 P1-003）：groupBy = action | day | entry
export function auditAggregate({ sinceDays, groupBy = 'action' } = {}) {
  return db.auditAggregate({ sinceDays, groupBy })
}

// ---------- 调试日志 ----------

const DBG = process.env.DSH_MEMORY_DEBUG === '1'
export function dbgLog(msg) {
  if (!DBG) return
  try {
    fs.appendFileSync(path.join(MEMORY_ROOT, 'pet-events.log'), `[${new Date().toISOString()}] ${msg}\n`)
  } catch { /* 忽略 */ }
}

// ---------- 冲突仲裁（v0.5 P0-003 二次验证） ----------

// 中文双字 bigram 集合（主题相似度/冲突检测共用）
export function zhBigrams(s) {
  const out = new Set()
  const chars = s.replace(/[^\u4e00-\u9fff]/g, '')
  for (let i = 0; i < chars.length - 1; i++) out.add(chars.slice(i, i + 2))
  return out
}

// 教训/遵守语境排除 + 泛化词过滤（与 index.mjs 原实现一致，搬移到此）
const CONFLICT_LEARN_HINTS = /教训|踩坑|事故复盘|切记|务必|禁止|不要|严禁|不得|一律|必须|先查|先确认|经验总结|复盘|注意点|注意事项|踩过的坑|以后注意|以后都|误删|误操作/
const CONFLICT_GENERIC_BIGRAMS = new Set([
  '网络', '下载', '镜像', '用户', '数据', '文件', '程序', '插件', '安装', '删除', '清理',
  '更新', '版本', '使用', '进行', '一个', '这个', '可以', '需要', '直接', '本地', '系统',
  '项目', '工具', '命令', '配置', '设置', '默认', '完全', '不要', '没有', '不是', '已经',
  '之后', '之前', '时候', '服务', '加速', '速服', '告知', '访问', '打开',
])

export function detectConflict(entry, prefsText) {
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
