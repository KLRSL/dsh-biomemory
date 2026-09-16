// ============================================================================
// dsh-biomemory · v0.5 嵌入与语义检索层（embed.mjs）
//
// 对应 v0.5 技术文档 §3.4（语义检索）/ §4.2（嵌入模型）：
//   - 模型：bge-small-zh-v1.5（中文专用，512 维），本地离线运行
//     （~/.dsh/models/bge-small-zh-v1.5，hf-mirror 下载，transformer.js 加载）
//   - 懒加载：首次语义检索时初始化，模型缺失/加载失败 → 返回 null，
//     调用方降级关键词检索（TF-IDF），记忆功能不受影响
//   - 三种检索模式：exact（精确）/ semantic（语义）/ hybrid（混合）
//   - exact 排序（v0.6.6 修正）：与 semantic/hybrid 一样「按相关度」，weight 只做有界加成——
//     relevance = Σ 命中字段权重（text 1.0 / summary 0.5 / entities 0.25）
//                 + 0.1 · min(命中次数, 5)
//     score     = relevance · (1 + 0.5 · min(weight, weightCap) / weightCap)
//     旧实现直接 score = weight → 低权重但更相关的条目被高权重擦边命中者压在后面；
//     现在 weight 最多把分数抬高 50%（与 hybridFuse 的 boost ≤ base·50% 同构、同用 weightCap
//     归一并各自独立计算），因此「同分靠 weight 定序、重要记忆仍有优势」都成立。
//   - 混合融合：Reciprocal Rank Fusion 变体（文档 §3.4.2）：
//     score = α/(k+rank_exact) + β/(k+rank_semantic) + γ·k·(weight/weightCap)
//     v0.6.5 修正：第三项必须与 RRF 项同量级——RRF 单项 ≤ max(α,β)/k ≈ 0.008，
//     而原始 γ·weight（γ=0.2、weight 1~20）等于 0.2~4，融合退化为「按 weight 排序」，
//     语义/精确排名被完全淹没；现按 weightCap 归一到 0~1 再乘 k，weight 只做 ±0.2 微调。
//     默认 α=0.3 β=0.5 γ=0.2 k=60
//   - 回忆强化：命中后 weight +0.05/+0.08（文档 §3.1.2）
// ============================================================================

import path from 'node:path'
import os from 'node:os'
import { CFG } from './shared.mjs'

const MODEL_ID = 'bge-small-zh-v1.5'
const MODELS_ROOT = process.env.DSH_MODELS_ROOT || path.join(os.homedir(), '.dsh', 'models')

let _extractor = null
let _loading = null
let _modelOk = false

/** 初始化嵌入模型（懒加载，幂等）。返回提取器或 null（不可用） */
export async function getExtractor() {
  if (_modelOk) return _extractor
  if (_loading) return _loading
  _loading = (async () => {
    try {
      const mod = await import('@huggingface/transformers')
      const { pipeline, env } = mod
      env.localModelPath = MODELS_ROOT + '/'
      env.allowRemoteModels = false
      const extractor = await pipeline('feature-extraction', MODEL_ID, {
        local_files_only: true,
      })
      _extractor = extractor
      _modelOk = true
      return _extractor
    } catch (err) {
      console.warn('[dsh-biomemory] 嵌入模型不可用，语义检索降级为关键词检索：', err instanceof Error ? err.message : String(err))
      _modelOk = false
      return null
    } finally {
      _loading = null
    }
  })()
  return _loading
}

/** 模型是否可用（同步判断，供状态页显示） */
export function isModelReady() { return _modelOk }

/** 模型信息 */
export function modelInfo() {
  return { id: MODEL_ID, dim: 512, path: path.join(MODELS_ROOT, MODEL_ID), ready: _modelOk, offline: true }
}

/** 文本 → 512 维归一化向量；失败返回 null */
export async function embed(text) {
  const extractor = await getExtractor()
  if (!extractor) return null
  try {
    const out = await extractor(String(text).slice(0, 2000), { pooling: 'mean', normalize: true })
    return new Float32Array(out.data)
  } catch {
    return null
  }
}

/** 批量嵌入（迁移/索引重建用），逐条容错 */
export async function embedMany(texts, { onProgress } = {}) {
  const extractor = await getExtractor()
  if (!extractor) return null
  const results = []
  for (let i = 0; i < texts.length; i++) {
    try {
      const out = await extractor(String(texts[i] ?? '').slice(0, 2000), { pooling: 'mean', normalize: true })
      results.push(new Float32Array(out.data))
    } catch {
      results.push(null)
    }
    onProgress?.(i + 1, texts.length)
  }
  return results
}

/** 余弦相似度（向量已归一化时即点积） */
export function cosine(a, b) {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

/** 暴力 top-k 语义检索：vec 与 entriesWithVectors 结果比对 */
export function semanticTopK(queryVec, entries, topN = 10, minWeight = 0.1) {
  const scored = []
  for (const { entry, vec } of entries) {
    if (entry.weight < minWeight) continue
    if (entry.status === 'archived') continue
    const sim = cosine(queryVec, vec)
    scored.push({ entry, sim })
  }
  scored.sort((a, b) => b.sim - a.sim)
  return scored.slice(0, topN).map((s, i) => ({ ...s, rank: i + 1 }))
}

// ---------- exact 相关度（v0.6.6：排序语义修正，确定性、与 weight 解耦） ----------

/** 命中字段的权重：正文 > 摘要 > 实体（实体常是短标签，命中信息量最低） */
export const EXACT_FIELD_WEIGHTS = { text: 1, summary: 0.5, entities: 0.25 }
/** 命中次数加成：每多命中一次 +0.1，最多计 5 次（有界，防长文本霸榜） */
const EXACT_OCC_BONUS = 0.1
const EXACT_MAX_OCCURRENCES = 5
/** weight 加成上限比例：weight 最多把相关度抬高 50%（与 hybridFuse 的 50% 限幅同构） */
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

/** exact 相关度（确定性；空查询 = 浏览模式，返回中性 1，此时由 weight 决定顺序）
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
    // 仅跨字段边界命中（旧实现按拼接串判定）→ 记为弱命中，保住召回，不丢条目
    return probeText(entry).includes(q)
      ? { relevance: 0.5, occurrences: 1, fields: 0 }
      : { relevance: 0, occurrences: 0, fields: 0 }
  }
  return { relevance: relevance + EXACT_OCC_BONUS * Math.min(occurrences, EXACT_MAX_OCCURRENCES), occurrences, fields }
}

/** 精确检索（关键词 + 结构化过滤），返回 [{ entry, rank, score, relevance }]。
 *  排序语义（v0.6.6）：相关度为第一排序键，weight 是有界次要因子——
 *    score = relevance · (1 + 0.5 · min(weight, weightCap) / weightCap)
 *  同分（relevance 相同）退化为 weight 降序 → created_at 降序 → entry_id 升序（全序、确定性）。
 *  契约：命中集合、参数、返回的 entry/rank 与旧实现一致；hybrid 只取本函数的 rank，
 *  weight 在融合层仍由 hybridFuse 的 γ 项单独负责，两者互不污染。 */
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

/** 混合检索：RRF 融合（文档 §3.4.2）。weightCap 用于把 weight 归一到 RRF 量级（v0.6.5） */
export function hybridFuse(exactResults, semanticResults, allEntries, topN = 10, { alpha = 0.3, beta = 0.5, gamma = 0.2, k = 60, weightCap = 20 } = {}) {
  const byId = new Map()
  for (const e of allEntries) byId.set(e.entry_id, e)

  const scoreOf = new Map()
  const fuse = (results, weight) => {
    for (const r of results) {
      const cur = scoreOf.get(r.entry.entry_id) ?? 0
      scoreOf.set(r.entry.entry_id, cur + weight / (k + r.rank))
    }
  }
  fuse(exactResults, alpha)
  fuse(semanticResults, beta)
  // γ·(weight/weightCap)·k 项：把 0~weightCap 的权重归一到 0~1 再乘 k，使该项与 RRF 单项
  // （α/(k+rank) ≈ α/k ≈ 0.005）同量级；并整体限幅为各路 RRF 项的 50%，保证它只能在
  // 「两路都命中」的候选之间做微调，绝不淹没语义/精确的排名信号（v0.6.5 修正）。
  const boostCap = Number(weightCap) > 0 ? Number(weightCap) : 20
  const weightScale = gamma * k / boostCap
  for (const [id, e] of byId) {
    const base = scoreOf.get(id)
    if (base === undefined) continue
    const boost = weightScale * (Number(e.weight) || 0)
    scoreOf.set(id, base + Math.min(boost, base * 0.5))
  }
  const ranked = [...scoreOf.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id, score]) => ({ entry: byId.get(id), score }))
  return ranked
}

/** 统一检索入口：exact / semantic / hybrid
 *  - entries: 纯记忆对象数组（exact 分支用）
 *  - vectorEntries: [{ entry, vec }]（semantic/hybrid 分支用；缺失时降级 exact）
 *  - weightCap: weight 归一上限（exact 的加成与 hybrid 的 γ 项共用；默认取 CFG.weightCap） */
export async function search({ query, mode = 'hybrid', entries = [], vectorEntries = null, topN = 10, minWeight = 0.1, weightCap = CFG.weightCap }) {
  const exact = (n = topN) => exactSearch(query, entries, n, minWeight, { weightCap }).map((r) => ({ entry: r.entry, score: r.score }))
  if (mode === 'exact') return exact()
  if (mode === 'semantic') {
    if (!vectorEntries || vectorEntries.length === 0) return exact()
    const qv = await embed(query)
    if (!qv) return exact()
    return semanticTopK(qv, vectorEntries, topN, minWeight).map((r) => ({ entry: r.entry, score: r.sim }))
  }
  // hybrid：精确 + 语义并行，RRF 融合；语义不可用时退化为精确
  if (!vectorEntries || vectorEntries.length === 0) return exact()
  const exactR = exactSearch(query, entries, Math.max(topN * 2, 20), minWeight, { weightCap })
  const qv = await embed(query)
  if (!qv) return exact()
  const semanticR = semanticTopK(qv, vectorEntries, Math.max(topN * 2, 20), minWeight)
  return hybridFuse(exactR, semanticR, entries, topN, { weightCap })
}

/** 记忆内容 → 嵌入文本（摘要优先，文档 §4.2：summary 而非完整 source_text） */
export function embedTextOf(entry) {
  return entry.summary || entry.text || ''
}
