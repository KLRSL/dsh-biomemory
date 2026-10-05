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
// v0.5：SQLite 为主存储（~/.dsh/biomemory/biomemory.db）。
// v0.6.1：单轨制——SQLite 是唯一运行时数据源；Markdown（hot/projects/longterm/
// preferences）保留为只读备份与人工查看层，不再参与任何运行时写入/读取
// （仅首次启动的一次性历史迁移会读它，之后永不读取）。
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
  approvalFallback: 'deny', // v0.6.5 起默认 deny（fail-closed）：审批服务缺失/请求异常/非授予结果 → 拒绝写入并记审计；auto=自动保存并审计（旧行为，需显式设置）
  nearDuplicateThreshold: 0.7, // v0.8.0：写入去重——与已有同类条目的中文 bigram Jaccard ≥ 此值时不再新增（0=关闭；
                               // 实测「换了说法的同一件事」约 0.7~0.8，完全改写才会低于 0.6）
  nearDuplicateAction: 'merge', // v0.8.0：命中近重复怎么办——merge=合并进已有条目（追加「补充·日期」并提权，借鉴 @zheexinn/dsh-memory）/ skip=只提示不写
  sinkWindowMinutes: 5,   // v0.8.0：轮次结束后的「请沉淀」提醒有效窗口（分钟，可配）。
                          // 语义：一轮结束后短暂窗口内注入一次催促；超过窗口即丢弃（下一轮重新判断），
                          // 避免用户隔很久再发消息时被一条过期的「上一轮请沉淀」打扰。
}

// 冲突阈值从配置读取（模块加载时为默认，apply 时更新）

export let CFG = { ...DEFAULTS }

// ESM 导出不可被导入方赋值：统一经 setter 修改（index/各模块一致）
export function setConfig(next) {
  CFG = { ...DEFAULTS, ...(next ?? {}) }
}
export function getConfig() {
  return { ...CFG }
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
    // 2026-09-24 修复（根因：读路径只认数值，非数值字段一律被 continue 丢掉）：
    //   旧实现一律 Number()，于是 approvalFallback='auto'→Number=NaN→丢弃→落回
    //   默认 'deny'（fail-closed 意外生效，重要记忆写入被静默拒绝）；extractProvider/extractModel
    //   这类字符串被清空（按需抽取永久报「未配置抽取模型」）；preloadEmbeddings=true→丢弃→false
    //   （预热失效）；nearDuplicateAction='skip'→丢弃→merge；autoDreamDays=3 能读但 0 会被丢。
    //   ★教训：写路径按类型处理时，读路径必须逐字段对齐同一套类型规则——两处只改一处等于没改。
    for (const k of Object.keys(DEFAULTS)) {
      const v = saved[k]
      if (v === undefined) continue
      switch (k) {
        case 'approvalFallback':
          // 枚举：只认 'auto'（自动写入）/'deny'（fail-closed），其余保持默认
          if (v === 'auto' || v === 'deny') merged[k] = v
          break
        case 'nearDuplicateAction':
          merged[k] = v === 'skip' ? 'skip' : 'merge'
          break
        default:
          // 其余为数值项：只接受有限正数（保持原语义）
          if (Number.isFinite(Number(v)) && Number(v) > 0) merged[k] = Number(v)
          break
      }
    }
    return merged
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveConfig(next) {
  const out = {}
  for (const k of Object.keys(DEFAULTS)) out[k] = next[k]
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

// 单轨制：偏好文本一律从 SQLite 读（v0.6.1 替代 readFile(PATHS.preferences)，
// 消除对 Markdown 的运行时依赖——手工编辑 Markdown 不再影响冲突检测）
export function prefsText() {
  db.openDb()
  const prefs = db.listEntries({ fragmentType: 'preference', status: 'active', limit: 500 })
  return prefs.map((e) => e.text).join('\n')
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

export function dbgLog(msg) {
  if (!DBG) return
  // 2026-09-29 修复：此前 try 块是**空的** —— 函数体虽然存在，却什么都不输出，
  // 于是 DSH_MEMORY_DEBUG=1 形同虚设，且 dbgLog 的所有调用方一起静默失效：
  //   index.mjs 迁移/apply、gate.mjs 自愈失败、recall.mjs 触发召回……
  // 排查"插件没生效""召回没命中"这类问题时没有任何线索。现写 stderr
  // （不污染 stdout：宿主可能把 stdout 当协议通道）。
  try {
    console.error(`[dsh-biomemory] ${msg}`)
  } catch { /* 忽略：日志失败绝不影响记忆本体 */ }
}

// ---------- 中文 bigram（去重 / 相似度共用） ----------

// 中文双字 bigram 集合（主题相似度/冲突检测共用）
export function zhBigrams(s) {
  const out = new Set()
  const chars = s.replace(/[^\u4e00-\u9fff]/g, '')
  for (let i = 0; i < chars.length - 1; i++) out.add(chars.slice(i, i + 2))
  return out
}

// 写入去重（v0.8.0）：中文 bigram Jaccard 相似度（0..1）——判断「即将写入的内容是否与已有条目高度重复」。
// 纯函数、零依赖、不触发嵌入模型，可安全地放在写入路径上同步调用。
// 写入去重实际使用的相似度：短文本上 Jaccard 偏严格（改几个字就掉到 0.6 以下），
// 因此在「两条长度相近（短/长 ≥ 0.6）」时取 Jaccard 与包含度 inter/min(|A|,|B|) 的较大者。
// 长度差太大时仍用 Jaccard，避免「短句被长条目完全包含」被误判成重复。
export function bigramSimilarity(a, b) {
  const A = zhBigrams(String(a || ''))
  const B = zhBigrams(String(b || ''))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  const jaccard = inter / (A.size + B.size - inter)
  const ratio = Math.min(A.size, B.size) / Math.max(A.size, B.size)
  if (ratio < 0.6) return jaccard
  return Math.max(jaccard, inter / Math.min(A.size, B.size))
}
