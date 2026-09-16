// ============================================================================
// dsh-biomemory v0.6.6 专项测试：exact 排序语义修正
//
// 目标语义：exact 与 semantic/hybrid 一致「按相关度」排序，weight 只做有界次要因子——
//   score = relevance · (1 + 0.5 · min(weight, weightCap) / weightCap)
//   relevance = Σ 命中字段权重（text 1.0 / summary 0.5 / entities 0.25）+ 0.1·min(命中次数, 5)
//
// 覆盖四类用例（外加既有行为回归）：
//   1. exact 模式下低 weight 但更相关者排前（单元 + queryEntries 端到端）
//   2. 同分（relevance 相同）时高 weight 在前；空查询浏览仍按 weight 降序（契约不破）
//   3. 与 semantic/hybrid 互不污染（exact 不读向量层；semantic 只看相似度；hybrid 仍按 RRF）
//   4. 确定性：同输入两次一致；输入乱序结果一致
// 运行: node --test tests\exact-order.test.mjs
// ============================================================================

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biomem-exact-'))
process.env.DSH_MEMORY_ROOT = tmpDir
process.env.DSH_BIOMEMORY_DIR = path.join(tmpDir, 'biomemory')

const mod = await import('../index.mjs')
const I = mod.__internals
const db = await import('../db.mjs')
const embed = await import('../embed.mjs')

const CAP = 20 // 与 CFG.weightCap 默认值一致，显式传入避免全局配置漂移影响断言

before(() => { db.openDb() })
after(() => {
  db.closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const ids = (res) => res.map((r) => r.entry.entry_id || r.entry.fp || r.fp)

// ============================================================================
// 1. 低 weight 但更相关者排前
// ============================================================================

// 「更相关」= 正文 + 摘要都命中且多次出现；「只擦边」= 仅实体标签命中一次
const REL_LOW = {
  entry_id: 'e-low-weight', fp: 'e-low-weight', layer: 'longterm', fragment_type: 'behavior',
  kind: '行为', text: '镜像源下载：npm 走镜像源下载，镜像源下载失败再回退官方源',
  summary: '镜像源下载配置要点', entities: [], weight: 1, status: 'active',
}
const REL_HIGH = {
  entry_id: 'e-high-weight', fp: 'e-high-weight', layer: 'longterm', fragment_type: 'fact',
  kind: '知识', text: '软件包管理的零散记录，与网络配置无关', summary: '',
  entities: ['镜像源下载'], weight: 20, status: 'active',
}

test('exact：低 weight 但更相关者排在高 weight 擦边命中者之前', async () => {
  assert.ok(REL_LOW.weight < REL_HIGH.weight, '构造前提：前者 weight 更低')
  const lowRel = embed.exactRelevance('镜像源下载', REL_LOW)
  const highRel = embed.exactRelevance('镜像源下载', REL_HIGH)
  // 前者命中正文+摘要且出现 3 次；后者仅实体标签命中 1 次
  assert.ok(lowRel.relevance > highRel.relevance, `相关度应更高（${lowRel.relevance} vs ${highRel.relevance}）`)

  const res = await embed.search({ query: '镜像源下载', mode: 'exact', entries: [REL_HIGH, REL_LOW], topN: 5, weightCap: CAP })
  assert.equal(ids(res)[0], 'e-low-weight', `更相关者应第一（实际 ${ids(res)}）`)
  // weight 仍有优势但被限幅：weight=20 的擦边命中者分数不会反超（≤50% 加成）
  const sLow = res.find((r) => r.entry.entry_id === 'e-low-weight').score
  const sHigh = res.find((r) => r.entry.entry_id === 'e-high-weight').score
  assert.ok(sLow > sHigh, `相关度主导总分（${sLow} > ${sHigh}）`)
  assert.ok(sHigh <= highRel.relevance * (1 + 0.5), `weight 加成不超过 +50%（${sHigh}）`)
})

test('queryEntries（exact）端到端：低 weight 更相关者同样排前', async () => {
  db.upsertEntry({ fp: 'eo-relevant', layer: 'hot/behavior', kind: '行为', text: REL_LOW.text, summary: REL_LOW.summary, weight: 1 })
  db.upsertEntry({ fp: 'eo-marginal', layer: 'longterm', kind: '知识', text: REL_HIGH.text, entities: REL_HIGH.entities, weight: 20 })
  const res = await I.queryEntries('镜像源下载', 10, { mode: 'exact', minWeight: 0 })
  const seen = res.map((e) => e.fp)
  assert.ok(seen.includes('eo-relevant') && seen.includes('eo-marginal'), `两条都应命中（实际 ${seen}）`)
  assert.equal(seen[0], 'eo-relevant', `更相关者应第一（实际 ${seen}）`)
})

// ============================================================================
// 2. 同分时高 weight 在前 + 空查询浏览契约不变
// ============================================================================

const TIE_LOW = {
  entry_id: 'tie-low', fp: 'tie-low', text: '同分排序验证：镜像源配置', summary: '', entities: [],
  weight: 3, status: 'active', created_at: '2026-01-01T00:00:00.000Z',
}
const TIE_HIGH = {
  entry_id: 'tie-high', fp: 'tie-high', text: '同分排序验证：镜像源配置（副本）', summary: '', entities: [],
  weight: 15, status: 'active', created_at: '2025-01-01T00:00:00.000Z',
}

test('exact：相关度同分时高 weight 在前（weight 未被架空）', async () => {
  const q = '同分排序验证'
  assert.equal(
    embed.exactRelevance(q, TIE_LOW).relevance,
    embed.exactRelevance(q, TIE_HIGH).relevance,
    '构造前提：两者相关度完全相同'
  )
  const res = await embed.search({ query: q, mode: 'exact', entries: [TIE_LOW, TIE_HIGH], topN: 5, weightCap: CAP })
  assert.equal(ids(res)[0], 'tie-high', `同分应由 weight 定序（实际 ${ids(res)}）`)
  assert.ok(res[0].score > res[1].score, '分数应体现 weight 加成')
})

test('exact：空查询（浏览/list）仍按 weight 降序——既有契约不破', async () => {
  const res = await embed.search({ query: '', mode: 'exact', entries: [TIE_LOW, TIE_HIGH], topN: 5, weightCap: CAP })
  assert.equal(res.length, 2, '空查询应返回全部（浏览模式）')
  assert.equal(ids(res)[0], 'tie-high', `浏览应按 weight 降序（实际 ${ids(res)}）`)
})

// ============================================================================
// 3. 与 semantic / hybrid 互不污染
// ============================================================================

test('三模式互不污染：exact 不读向量层、semantic 只看相似度、hybrid 仍按 RRF', () => {
  // 语义最相关（rank 1）但 weight=1；weight=20 者与查询向量正交
  const relEntry = { entry_id: 'mix-rel', fp: 'mix-rel', text: '深色模式偏好设置：镜像源下载', summary: '', entities: [], weight: 1, status: 'active' }
  const heavyEntry = { entry_id: 'mix-heavy', fp: 'mix-heavy', text: '界面配色无关条目', summary: '', entities: ['镜像源下载'], weight: 20, status: 'active' }
  const dir = new Float32Array(512); dir[0] = 1
  const orth = new Float32Array(512); orth[1] = 1
  const vecs = [{ entry: relEntry, vec: dir }, { entry: heavyEntry, vec: orth }]
  const q = '镜像源下载'

  // exact：只吃关键词相关度，向量层有/无都不影响（不互相污染 + 不依赖模型）
  const exactPure = embed.exactSearch(q, [relEntry, heavyEntry], 5, 0.1, { weightCap: CAP })
  assert.equal(ids(exactPure)[0], 'mix-rel', `exact 应按相关度（实际 ${ids(exactPure)}）`)
  assert.deepEqual(ids(exactPure), ['mix-rel', 'mix-heavy'], '高 weight 擦边命中者不得反超')

  // semantic：纯相似度排序（吃向量），与 weight 无关
  const sem = embed.semanticTopK(dir, vecs, 5, 0.1)
  assert.equal(ids(sem)[0], 'mix-rel', `语义最相似者应第一（实际 ${ids(sem)}）`)
  assert.ok(sem[0].sim > sem[1].sim, '相似度应递减')

  // hybrid：RRF 融合——用新的 exact rank 仍不得让 weight 淹没排名信号
  const fused = embed.hybridFuse(exactPure, sem, [relEntry, heavyEntry], 2, { weightCap: CAP })
  assert.equal(ids(fused)[0], 'mix-rel', `融合后仍应按排名（实际 ${ids(fused)}）`)
  for (const r of fused) assert.ok(r.score < 0.1, `融合分数应停留在 RRF 量级（${r.score}）`)
  // weight 项被限幅为 RRF 基分的 50%：heavy 条目总分 = 其 RRF 基分 × 1.5（不是 ×(1+γ·weight)）
  const baseHeavy = (0.3 + 0.5) / (60 + 2)
  const totalHeavy = fused.find((r) => r.entry.entry_id === 'mix-heavy').score
  assert.ok(Math.abs(totalHeavy - baseHeavy * 1.5) < 1e-12, `weight 加成应恰好限幅在 +50%（${totalHeavy} vs ${baseHeavy * 1.5}）`)
})

// ============================================================================
// 4. 确定性：同输入同输出（跑两次一致、输入乱序一致）
// ============================================================================

test('exact：确定性——同输入两次一致，输入乱序结果一致', () => {
  const pool = [
    { entry_id: 'p-a', text: '确定性验证：镜像源下载走国内镜像', summary: '', entities: [], weight: 4, status: 'active', created_at: '2026-02-02T00:00:00.000Z' },
    { entry_id: 'p-b', text: '确定性验证：镜像源', summary: '镜像源下载', entities: [], weight: 4, status: 'active', created_at: '2026-02-02T00:00:00.000Z' },
    { entry_id: 'p-c', text: '与查询无关的条目', summary: '', entities: ['镜像源下载'], weight: 20, status: 'active' },
    { entry_id: 'p-d', text: '确定性验证：镜像源下载、镜像源下载', summary: '', entities: [], weight: 1, status: 'active' },
    { entry_id: 'p-e', text: '又一条无关条目', summary: '', entities: [], weight: 30, status: 'active' },
    // p-f 与 p-b 相关度、weight 完全相同（同分），只能靠 created_at → entry_id 收敛
    { entry_id: 'p-f', text: '另一条', summary: '镜像源下载', entities: [], weight: 4, status: 'active' },
  ]
  const run = (entries) => embed.exactSearch('镜像源下载', entries, 10, 0.1, { weightCap: CAP })
    .map((r) => `${r.entry.entry_id}:${r.score}:${r.relevance}`)

  const first = run(pool)
  const second = run(pool)
  assert.deepEqual(second, first, '同输入两次结果必须一致')
  assert.deepEqual(run([...pool].reverse()), first, '输入乱序不应改变输出顺序与分数')
  assert.deepEqual(run([pool[2], pool[0], pool[5], pool[4], pool[3], pool[1]]), first, '任意输入顺序结果一致')
  assert.equal(first.length, 5, '无关条目不应进入结果（p-e 与查询无交集）')
  // 同分的 p-b / p-f 顺序稳定：created_at 更晚者在前
  const order = first.map((x) => x.split(':')[0])
  assert.ok(order.indexOf('p-b') < order.indexOf('p-f'), `同分应按 created_at 定序（实际 ${order}）`)
})
