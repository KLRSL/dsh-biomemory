// ============================================================================
// dsh-biomemory · 检索层（retrieve.mjs）
//
// v0.9.0（2026-09-29，用户决策）：**移除嵌入模型与语义检索**。
//   - 不再有 exact/semantic/hybrid 三模式；query 只有一种确定性检索：
//     命中字段权重（text 1.0 / summary 0.5 / entities 0.25）
//     + 命中次数有界加成（每多命中一次 +0.1，最多计 5 次）
//     + weight 有界加成（最多把相关度抬高 50%，按 weightCap 归一）
//     score = relevance · (1 + 0.5 · min(weight, weightCap) / weightCap)
//   - 同分退化为 weight 降序 → created_at 降序 → entry_id 升序（全序、确定性）。
//   - 移除理由：本地嵌入模型（bge-small-zh-v1.5）需额外下载 ~90MB ONNX 权重，
//     并拖入 @huggingface/transformers + onnxruntime 重型依赖；关键词检索已足够，
//     且完全离线、零依赖、可复现。
//   - tokenize / cosine 保留：meta.mjs 的主题聚类（词频余弦，≥0.25 归簇）仍在使用，
//     它们是纯 JS、不依赖任何模型。
//
// 从 index.mjs 拆出；依赖 shared / store / db。
// ============================================================================

import * as db from './db.mjs'
import { CFG, prefsText,  } from './shared.mjs'
import { entryStatus, consolidateHits } from './store.mjs'

// ---------- 纯 JS 分词与词频余弦（聚类用；无外部依赖） ----------

export function tokenize(s) {
  const tokens = []
  // 中文：先全部单字，再全部双字（双字在单字之后，保证前缀语义）
  const zh = String(s ?? '').replace(/[^\u4e00-\u9fff]/g, '')
  for (let i = 0; i < zh.length; i++) tokens.push(zh[i])
  for (let i = 0; i < zh.length - 1; i++) tokens.push(zh.slice(i, i + 2))
  // 英文/数字：小写单词
  for (const w of String(s ?? '').toLowerCase().match(/[a-z0-9_]+/g) || []) {
    if (w.length > 1) tokens.push(w)
  }
  return tokens
}

/** 词频 Map 之间的余弦相似度（输入为 Map<token, weight>） */
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (const [t, w] of a) {
    dot += w * (b.get(t) || 0)
    na += w * w
  }
  for (const [, w] of b) nb += w * w
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// ---------- 确定性相关度检索（原 embed.mjs 的 exact 分支，迁入本层） ----------

/** 命中字段的权重：正文 > 摘要 > 实体（实体常是短标签，命中信息量最低） */
export const EXACT_FIELD_WEIGHTS = { text: 1, summary: 0.5, entities: 0.25 }
/** 命中次数加成：每多命中一次 +0.1，最多计 5 次（有界，防长文本霸榜） */
const EXACT_OCC_BONUS = 0.1
const EXACT_MAX_OCCURRENCES = 5
/** weight 加成上限比例：weight 最多把相关度抬高 50% */
const EXACT_WEIGHT_RATIO = 0.5

/** 统一探针文本（text + summary + entities），供命中判定与相关度计算共用 */
function probeText(entry) {
  const entities = Array.isArray(entry?.entities) ? entry.entities.join(' ') : ''
  return `${entry?.text ?? ''} ${entry?.summary ?? ''} ${entities}`.toLowerCase()
}

function countOccurrences(haystack, needle) {
  let n = 0
  let i = haystack.indexOf(needle)
  while (i !== -1 && n < EXACT_MAX_OCCURRENCES) {
    n++
    i = haystack.indexOf(needle, i + needle.length)
  }
  return n
}

/** 相关度（确定性；空查询 = 浏览模式，返回中性 1，此时由 weight 决定顺序）
 *  返回 { relevance, occurrences, fields }；relevance ∈ [0, 2.25] */
export function exactRelevance(query, entry) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return { relevance: 1, occurrences: 0, fields: 0 }
  const text = String(entry?.text ?? '').toLowerCase()
  const summary = String(entry?.summary ?? '').toLowerCase()
  const entities = Array.isArray(entry?.entities) ? entry.entities.join(' ').toLowerCase() : ''
  let relevance = 0
  let occurrences = 0
  let fields = 0
  for (const [value, w] of [[text, EXACT_FIELD_WEIGHTS.text], [summary, EXACT_FIELD_WEIGHTS.summary], [entities, EXACT_FIELD_WEIGHTS.entities]]) {
    if (!value.includes(q)) continue
    fields++
    relevance += w
    occurrences += countOccurrences(value, q)
  }
  if (!fields) {
    // 仅跨字段边界命中（按拼接串判定）→ 记为弱命中，保住召回，不丢条目
    return probeText(entry).includes(q)
      ? { relevance: 0.5, occurrences: 1, fields: 0 }
      : { relevance: 0, occurrences: 0, fields: 0 }
  }
  return { relevance: relevance + EXACT_OCC_BONUS * Math.min(occurrences, EXACT_MAX_OCCURRENCES), occurrences, fields }
}

/** 确定性检索，返回 [{ entry, rank, score, relevance }]。
 *  score = relevance · (1 + 0.5 · min(weight, weightCap) / weightCap) */
export function exactSearch(query, entries, topN = 10, minWeight = 0.1, { weightCap = CFG.weightCap } = {}) {
  const q = String(query ?? '').trim().toLowerCase()
  const cap = Number(weightCap) > 0 ? Number(weightCap) : 20
  const scored = []
  for (const entry of entries) {
    if (entry.weight < minWeight) continue
    if (entry.status === 'archived') continue
    if (q && !probeText(entry).includes(q)) continue
    const { relevance } = exactRelevance(q, entry)
    const w = Math.min(Number(entry.weight) || 0, cap)
    scored.push({ entry, score: relevance * (1 + EXACT_WEIGHT_RATIO * w / cap), relevance })
  }
  scored.sort((a, b) =>
    b.score - a.score ||
    (Number(b.entry.weight) || 0) - (Number(a.entry.weight) || 0) ||
    String(b.entry.created_at ?? '').localeCompare(String(a.entry.created_at ?? '')) ||
    String(a.entry.entry_id ?? '').localeCompare(String(b.entry.entry_id ?? '')))
  return scored.slice(0, topN).map((s, i) => ({ entry: s.entry, rank: i + 1, score: s.score, relevance: s.relevance }))
}

// ---------- 查询入口（v0.9.0：单模式，命中自动巩固） ----------

/** 检索记忆。opts.mode 已废弃（保留参数仅为兼容旧调用，取值一律忽略）。 */
export async function queryEntries(query, limit = CFG.maxQueryResults, opts = {}) {
  db.openDb()
  const projectId = opts.projectId || undefined
  const topK = opts.topK || limit
  const minWeight = opts.minWeight ?? 0.1
  const fragmentTypes = Array.isArray(opts.fragmentTypes) && opts.fragmentTypes.length ? new Set(opts.fragmentTypes) : null
  const includeArchived = opts.includeArchived === true
  const layer = opts.layer || undefined
  const prefsTextStr = prefsText()

  const ql = (query || '').toLowerCase()
  let entries = db.allEntries({ includeArchived })
  if (layer) entries = entries.filter((e) => e.layer === layer)
  if (projectId) entries = entries.filter((e) => e.project_id === projectId)
  if (fragmentTypes) entries = entries.filter((e) => fragmentTypes.has(e.fragment_type))

  // 关键词精确命中（自动巩固的判据）
  const kwHits = new Set()
  if (ql) {
    for (const e of entries) {
      if ((e.text || '').toLowerCase().includes(ql)) kwHits.add(e.fp)
    }
  }

  const results = exactSearch(query || '', entries, topK, minWeight)

  const out = []
  const hitFps = new Set()
  for (const r of results) {
    const e = r.entry
    if (!e) continue
    out.push({ layer: e.layer, fp: e.fp, text: e.text, weight: e.weight, score: r.score, fragment_type: e.fragment_type, memory_class: e.memory_class, source_ref: e.source_ref, created_at: e.created_at, status: entryStatus(e, prefsTextStr), kind: e.kind, mode: e.mode, hits: e.hits, pinned: !!e.pinned, ts: e.created_at })
    if (ql && kwHits.has(e.fp)) hitFps.add(e.fp) // 只给真实关键词命中加固
  }
  // 精确关键词命中未进 top-N 的也补入（保底不丢）
  if (ql && kwHits.size) {
    const inOut = new Set(out.map((o) => o.fp))
    for (const e of entries) {
      if (kwHits.has(e.fp) && !inOut.has(e.fp) && out.length < limit) {
        out.push({ layer: e.layer, fp: e.fp, text: e.text, weight: e.weight, memory_class: e.memory_class, source_ref: e.source_ref, status: entryStatus(e, prefsTextStr), fragment_type: e.fragment_type, kind: e.kind, mode: e.mode, hits: e.hits, pinned: !!e.pinned, ts: e.created_at, created_at: e.created_at })
        inOut.add(e.fp)
      }
    }
  }
  // 用进废退：带关键词的真实召回才巩固（list 浏览不计）
  if (ql && hitFps.size) {
    const files = consolidateHits(hitFps)
  }
  // DSH 0.1.2-rc.1 起工具返回值须为 lossless JSON（dsh-tools 校验拒绝 undefined/NaN/-0）
  for (const it of out) for (const k of Object.keys(it)) if (it[k] === undefined || (typeof it[k] === 'number' && !Number.isFinite(it[k]))) it[k] = null
  return out.slice(0, limit)
}
