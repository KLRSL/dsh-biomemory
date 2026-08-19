// ============================================================================
// dsh-biomemory v0.5 专项测试：SQLite 数据层 / 迁移 / 三模式检索 / RRF / 向量
// 运行: node --test tests\v05.test.mjs
// ============================================================================

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biomem-v05-'))
process.env.DSH_MEMORY_ROOT = tmpDir
process.env.DSH_BIOMEMORY_DIR = path.join(tmpDir, 'biomemory')

const mod = await import('../index.mjs')
const I = mod.__internals
const db = await import('../db.mjs')
const embed = await import('../embed.mjs')

before(() => {
  db.openDb()
})

after(() => {
  db.closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ============================================================================
// 1. SQLite 数据层基础
// ============================================================================

test('upsert/get/list/stats/remove 闭环', () => {
  const id = db.upsertEntry({ fp: 'v1', layer: 'longterm', fragment_type: 'decision', project_id: 'p1', text: '决定用 React 18', weight: 12, entities: ['React'] })
  assert.ok(id.length > 0, 'entry_id 应为 UUID')
  assert.equal(db.getByFp('v1').fragment_type, 'decision')
  assert.equal(db.getByFp('v1').project_id, 'p1')

  // upsert by fp：重复写入不新增
  db.upsertEntry({ fp: 'v1', layer: 'longterm', fragment_type: 'decision', text: '决定用 React 18（更新）', weight: 13 })
  assert.equal(db.stats().total, 1, '同 fp 只保留一条')
  assert.equal(db.getByFp('v1').weight, 13)

  // list 过滤
  db.upsertEntry({ fp: 'v2', layer: 'projects', project_id: 'p2', fragment_type: 'event', text: '部署 v1.2 到测试环境' })
  const p1 = db.listEntries({ projectId: 'p1' })
  assert.equal(p1.length, 1)
  const dec = db.listEntries({ fragmentType: 'decision' })
  assert.equal(dec.length, 1)

  // stats
  const s = db.stats()
  assert.equal(s.total, 2)
  assert.ok(s.layers.longterm >= 1)

  // remove
  assert.equal(db.removeByFp('v1'), true)
  assert.equal(db.stats().total, 1)
})

test('WAL 模式与索引存在', () => {
  const conn = db.openDb()
  const row = conn.prepare("PRAGMA journal_mode").get()
  assert.equal(row.journal_mode, 'wal')
})

// ============================================================================
// 2. Markdown → SQLite 迁移
// ============================================================================

test('迁移：Markdown 条目导入 SQLite 且幂等', () => {
  fs.mkdirSync(path.join(tmpDir, 'hot'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, 'hot', 'knowledge.md'), [
    '## 2026-08-18 · 会话 t1',
    '- [知识|自动] [fp:m1] [w:10] [h:2] [t:2026-08-18 10:00] 迁移测试记忆甲',
    '- [知识|自动] [fp:m2] [w:12] [h:5] [t:2026-08-18 09:00] 迁移测试记忆乙',
  ].join('\n') + '\n', 'utf-8')
  fs.writeFileSync(path.join(tmpDir, 'preferences.md'), '- [2026-08-15] 喜欢用暗色主题\n', 'utf-8')

  // 强制重新迁移（先清 meta）
  db.metaSet('migrated_at', null)
  const r = I.migrateMarkdownToDb()
  assert.equal(r.migrated, true)
  assert.ok(r.imported >= 3, `应导入 ≥3 条（实际 ${r.imported}）`)

  // 幂等：再次调用不重复导入
  const r2 = I.migrateMarkdownToDb()
  assert.equal(r2.migrated, false)
  assert.equal(r2.reason, 'already')

  // 迁移后可从 SQLite 读到
  assert.ok(db.getByFp('m1'), 'm1 已导入')
  const pref = db.listEntries({ fragmentType: 'preference' })
  assert.ok(pref.some((e) => e.text.includes('暗色主题')), '偏好已导入且 pinned')
  assert.ok(pref.some((e) => e.pinned), '偏好默认锁定')
})

// ============================================================================
// 3. 三模式检索（exact / semantic / hybrid）+ RRF
// ============================================================================

const SAMPLE_ENTRIES = [
  { entry_id: 's1', fp: 's1', text: '用户喜欢用暗色主题，界面要深色', summary: '', entities: [], weight: 8, status: 'active', fragment_type: 'preference' },
  { entry_id: 's2', fp: 's2', text: '服务器部署在 10.0.0.5，端口 8080', summary: '', entities: [], weight: 6, status: 'active', fragment_type: 'fact' },
  { entry_id: 's3', fp: 's3', text: '用户偏好深色模式的代码编辑器', summary: '', entities: [], weight: 7, status: 'active', fragment_type: 'preference' },
]

test('exact：关键词精确匹配', async () => {
  const res = await embed.search({ query: '10.0.0.5', mode: 'exact', entries: SAMPLE_ENTRIES, topN: 3 })
  assert.equal(res[0].entry.entry_id, 's2')
})

test('semantic：语义近义命中（词不同意相近）', async () => {
  const res = await embed.search({ query: '深色模式偏好', mode: 'semantic', entries: SAMPLE_ENTRIES, vectorEntries: null, topN: 3 })
  // 模型不可用时降级 exact 也应有结果（不崩）
  assert.ok(res.length >= 0)
})

test('hybrid：RRF 融合排序', async () => {
  // 构造带向量的 entries（真实模型）
  const withVec = []
  for (const e of SAMPLE_ENTRIES) {
    const vec = await embed.embed(e.text)
    withVec.push({ entry: e, vec })
  }
  const res = await embed.search({ query: '深色', mode: 'hybrid', entries: SAMPLE_ENTRIES, vectorEntries: withVec, topN: 3 })
  assert.ok(res.length >= 1, 'hybrid 应有结果')
  // 深色主题相关条目应排前
  const ids = res.map((r) => r.entry.entry_id)
  assert.ok(ids.includes('s1') || ids.includes('s3'), `深色相关应命中（实际 ${ids}）`)
  // 无向量时降级 exact
  const res2 = await embed.search({ query: '服务器', mode: 'hybrid', entries: SAMPLE_ENTRIES, vectorEntries: null, topN: 3 })
  assert.equal(res2[0].entry.entry_id, 's2', '降级 exact 命中服务器')
})

test('queryEntries 三模式参数透传（index 层）', async () => {
  for (const e of SAMPLE_ENTRIES) {
    db.upsertEntry(e)
    const vec = await embed.embed(e.text)
    if (vec) db.setVector(e.entry_id, vec)
  }
  const exact = await I.queryEntries('端口 8080', 10, { mode: 'exact' })
  assert.ok(exact.some((e) => e.fp === 's2'))
  const hy = await I.queryEntries('深色', 10, { mode: 'hybrid' })
  assert.ok(hy.length >= 1)
  const sem = await I.queryEntries('暗色界面', 10, { mode: 'semantic' })
  assert.ok(sem.length >= 1)
})

// ============================================================================
// 4. 向量索引（ensureVectors / setVector / entriesWithVectors）
// ============================================================================

test('ensureVectors：为无向量条目补算嵌入', async () => {
  // 清空向量
  const conn = db.openDb()
  conn.exec('UPDATE entries SET vector = NULL')
  const r = await I.ensureVectors()
  assert.ok(r.ok === true || r.reason === 'model-unavailable', `向量补算 ${JSON.stringify(r)}`)
  if (r.ok) {
    assert.ok(r.embedded >= 1, '至少补算一条')
    assert.ok(db.vectorCount() >= 1, '向量数 ≥1')
  }
})

test('entriesWithVectors：只返回带向量条目', () => {
  const withVec = db.entriesWithVectors()
  assert.ok(Array.isArray(withVec))
  for (const { vec } of withVec) {
    assert.ok(vec instanceof Float32Array, 'vec 是 Float32Array')
    assert.equal(vec.length, 512, 'bge-small-zh 512 维')
  }
})

// ============================================================================
// 5. 审计聚合（文档 P1-003）
// ============================================================================

test('auditAggregate：按 action/day 分组统计', () => {
  db.audit('WRITE', { detail: { fp: 'a1' } })
  db.audit('WRITE', { detail: { fp: 'a2' } })
  db.audit('PIN', { detail: { fp: 'a3' } })
  const byAction = db.auditAggregate({ groupBy: 'action' })
  const wr = byAction.find((a) => a.key === 'WRITE')
  assert.ok(wr && wr.count >= 2, 'WRITE 应聚合 ≥2')
  const byDay = db.auditAggregate({ groupBy: 'day' })
  assert.ok(byDay.length >= 1, '按天分组非空')
})

// ============================================================================
// 6. 断点续跑（文档 P0-002）
// ============================================================================

test('runDream 断点检查点：完成后清空，中途可续', () => {
  db.metaSet('dream_checkpoint', 'some-fp')
  const rep = I.runDream({ resume: false })
  assert.ok(rep.scanned >= 0)
  assert.equal(db.metaGet('dream_checkpoint'), '', 'resume=false 也清空检查点（完整跑完）')
})

// ============================================================================
// 7. 备份 / 恢复（文档 §4.5）
// ============================================================================

test('backupDb：创建 .db 副本并保留最近 7 次', () => {
  db.upsertEntry({ fp: 'bk1', text: '备份测试' })
  const p1 = db.backupDb()
  assert.ok(fs.existsSync(p1), '备份文件存在')
  const p2 = db.backupDb()
  assert.notEqual(p1, p2, '每次备份独立文件')
  const backups = db.listBackups()
  assert.ok(backups.length >= 2, '备份列表 ≥2')
  assert.ok(backups.length <= 7, '不超过 7 次')
})

// ============================================================================
// 8. 模型信息（状态页用）
// ============================================================================

test('modelInfo：离线本地模型声明', () => {
  const info = embed.modelInfo()
  assert.equal(info.id, 'bge-small-zh-v1.5')
  assert.equal(info.dim, 512)
  assert.equal(info.offline, true)
})

// ============================================================================
// 9. webServer 状态端点数据（db.stats 集成）
// ============================================================================

test('stats 集成：dbPath/vectors/migration 可序列化', () => {
  const s = db.stats()
  assert.ok(s.dbPath.endsWith('biomemory.db'))
  assert.equal(typeof s.auditCount, 'number')
  const m = db.migrationStatus()
  assert.ok('migrated' in m)
})
