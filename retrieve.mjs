// ============================================================================
// dsh-biomemory · 检索层（retrieve.mjs，v0.6 架构升级）
//
// 查询与语义检索：
//   - 纯 JS TF-IDF + cosine（降级用）
//   - queryEntries：exact / semantic / hybrid 三模式（混合 RRF 融合在 embed.mjs）
//   - 命中自动巩固（用进废退）+ 浏览场景冲突置顶
// 从 index.mjs 拆出；依赖 shared / store / db / embed。
// ============================================================================

import * as db from './db.mjs'
import * as embed from './embed.mjs'
import { PATHS, CFG, dbgLog, prefsText } from './shared.mjs'
import { entryStatus, consolidateHits } from './store.mjs'

// ---------- 纯 JS TF-IDF + cosine（无外部依赖，语义检索降级） ----------

export function tokenize(s) {
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

export function tfidfVectors(entries) {
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

export function semanticSearch(query, entries, topN = 5) {
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

// ---------- 查询（v0.5：exact / semantic / hybrid 三模式，命中自动巩固） ----------

export async function queryEntries(query, limit = CFG.maxQueryResults, opts = {}) {
  db.openDb()
  const mode = opts.mode || 'hybrid'
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
    out.push({ layer: e.layer, fp: e.fp, text: e.text, weight: e.weight, semantic: isSem, score: r.score, fragment_type: e.fragment_type, memory_class: e.memory_class, source_ref: e.source_ref, created_at: e.created_at, status: entryStatus(e, prefsTextStr), kind: e.kind, mode: e.mode, hits: e.hits, pinned: !!e.pinned, ts: e.created_at })
    if (ql) hitFps.add(e.fp)
  }
  // 精确关键词命中未进 top-N 的也补入（保底不丢）
  if (ql && kwHits.size) {
    const inOut = new Set(out.map((o) => o.fp))
    for (const e of entries) {
      if (kwHits.has(e.fp) && !inOut.has(e.fp) && out.length < limit) {
        out.push({ layer: e.layer, fp: e.fp, text: e.text, weight: e.weight, semantic: false, memory_class: e.memory_class, source_ref: e.source_ref, status: entryStatus(e, prefsTextStr), fragment_type: e.fragment_type, kind: e.kind, mode: e.mode, hits: e.hits, pinned: !!e.pinned, ts: e.created_at, created_at: e.created_at })
        inOut.add(e.fp)
      }
    }
  }
  // 用进废退：带关键词的真实召回才巩固（list 浏览不计）
  if (ql && hitFps.size) {
    const files = consolidateHits(hitFps)
    if (files) db.audit('RECALL', { detail: { count: hitFps.size, files } })
  }
  // 浏览场景（无关键词，无相关性可言）：与偏好冲突的行为记忆置顶（冲突浮出，供用户裁决）
  if (!ql) {
    out.sort((a, b) => (b.status === 'conflict') - (a.status === 'conflict'))
  }
  // DSH 0.1.2-rc.1 起工具返回值须为 lossless JSON（dsh-tools 校验拒绝 undefined/NaN/-0）
  for (const it of out) for (const k of Object.keys(it)) if (it[k] === undefined || (typeof it[k] === 'number' && !Number.isFinite(it[k]))) it[k] = null
  return out.slice(0, limit)
}
