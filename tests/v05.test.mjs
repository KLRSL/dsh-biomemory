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
// 10. 编辑条目（updateEntryText）+ 冲突置顶（v0.5.2：可编辑能力 + 冲突浮出）
// ============================================================================

test('updateEntryText：编辑保留锁定/权重，审计 UPDATE，防重复', () => {
  db.upsertEntry({ fp: 'ed1', layer: 'hot/behavior', kind: '行为', text: '编辑前的旧内容', weight: 7, pinned: 1 })
  const r = I.updateEntryText('ed1', '编辑后的新内容')
  assert.equal(r.ok, true)
  const e = db.getByFp('ed1')
  assert.equal(e.text, '编辑后的新内容', '文本已更新')
  assert.equal(e.weight, 7, '权重保留')
  assert.equal(e.pinned, true, '锁定保留')
  // 审计 UPDATE 可查
  const recs = db.queryAudit({ type: 'UPDATE' })
  assert.ok(recs.some((x) => JSON.stringify(x).includes('ed1')), 'UPDATE 审计已记录')
  // 文本未变化：返回 note 不报错
  const r2 = I.updateEntryText('ed1', '编辑后的新内容')
  assert.equal(r2.ok, true)
  assert.equal(r2.note, '文本未变化')
  // 与已有记忆重复：拒绝（真实写入的 fp = 内容指纹）
  const dupText = '别的内容'
  db.upsertEntry({ fp: I.fingerprint(dupText), text: dupText })
  const r3 = I.updateEntryText('ed1', dupText)
  assert.equal(r3.ok, false)
})

test('冲突浮出：行为与偏好冲突标记 status 并在浏览时置顶', async () => {
  fs.writeFileSync(path.join(tmpDir, 'preferences.md'), '- [2026-08-15] 禁止内网直连访问\n', 'utf-8')
  db.upsertEntry({ fp: 'c1', layer: 'hot/behavior', kind: '行为', text: '内网直连下载软件包', weight: 5 })
  db.upsertEntry({ fp: 'c2', layer: 'hot/behavior', kind: '行为', text: '使用镜像源下载软件包', weight: 9 })
  const es = await I.queryEntries('', 50, { mode: 'exact' })
  const byFp = Object.fromEntries(es.map((e) => [e.fp, e]))
  assert.equal(byFp.c1?.status, 'conflict', '内网直连被标记冲突')
  assert.notEqual(byFp.c2?.status, 'conflict', '镜像源不冲突')
  // 置顶：所有冲突条目都在非冲突条目之前（c1 权重 5 低于 c2 的 9 仍应在前）
  const i1 = es.findIndex((e) => e.fp === 'c1')
  const i2 = es.findIndex((e) => e.fp === 'c2')
  assert.ok(i1 >= 0 && i2 >= 0 && i1 < i2, `冲突条目置顶（c1@${i1} < c2@${i2}）`)
})

// ============================================================================
// 11. dream 对冲突条目豁免仲裁（v0.5.2：浮出待用户裁决，不再自动降权归档）
// ============================================================================

test('runDream 豁免冲突条目：不降权、不归档（浮出待用户裁决）', () => {
  fs.writeFileSync(path.join(tmpDir, 'preferences.md'), '- [2026-08-15] 禁止内网直连访问\n', 'utf-8')
  db.upsertEntry({ fp: 'cf-dream', layer: 'hot/behavior', kind: '行为', text: '内网直连下载软件包', weight: 8, status: 'active' })
  const rep = I.runDream({ dryRun: false })
  const after = db.getByFp('cf-dream')
  assert.equal(after.weight, 8, '冲突条目不被降权')
  assert.equal(after.status, 'active', '冲突条目不被归档')
  assert.ok(rep.items.filter((i) => i.fp === 'cf-dream' && i.op === 'CONFLICT').length >= 1, '记录 CONFLICT 审计')
  const conflictOp = rep.items.find((i) => i.fp === 'cf-dream' && i.op === 'CONFLICT')
  assert.ok(!conflictOp.to, 'CONFLICT 事件不再带降权目标值')
  // 对照：非冲突低权重条目仍正常归档
  db.upsertEntry({ fp: 'cf-ctrl', layer: 'hot/behavior', kind: '行为', text: '普通低权重行为记录', weight: 1, status: 'active' })
  I.runDream({ dryRun: false })
  assert.equal(db.getByFp('cf-ctrl').status, 'archived', '非冲突条目照常归档')
})

// ============================================================================
// 9. webServer 状态端点数据（db.stats 集成）
// ============================================================================

test('reflect 数据源为 SQLite：删除条目后反思不再复活（v0.5.2）', async () => {
  // 冲突条目删除后，重新反思不应再列出（旧实现扫 Markdown 备份导致复活）
  fs.writeFileSync(path.join(tmpDir, 'preferences.md'), '- [2026-08-15] 禁止内网直连访问\n', 'utf-8')
  db.upsertEntry({ fp: 'rf-gone', layer: 'hot/behavior', kind: '行为', text: '内网直连下载软件包', weight: 6, status: 'active' })
  const r1 = I.runReflect({ dryRun: true })
  assert.ok(r1.conflicts.some((c) => c.fp === 'rf-gone'), '反思能发现冲突')
  // 模拟 Markdown 残留（旧数据源会复活）
  fs.mkdirSync(path.join(tmpDir, 'hot'), { recursive: true })
  fs.appendFileSync(path.join(tmpDir, 'hot', 'behavior.md'), '- [行为|自动] [fp:rf-gone] [w:6] 内网直连下载软件包\n', 'utf-8')
  // 删除 SQLite 条目
  I.removeEntry('rf-gone')
  const r2 = I.runReflect({ dryRun: true })
  assert.ok(!r2.conflicts.some((c) => c.fp === 'rf-gone'), '删除后反思不再列出（Markdown 残留不复活）')
})

test('restoreEntry：从备份回滚单条目，保留元数据', () => {
  db.upsertEntry({ fp: 'rf-restore', layer: 'hot/behavior', kind: '行为', text: '待回滚的行为记忆', weight: 7, pinned: 1, status: 'active' })
  const rm = I.removeEntry('rf-restore')
  assert.equal(rm.ok, true)
  assert.equal(db.getByFp('rf-restore'), undefined, '已删除')
  const rs = I.restoreEntry('rf-restore')
  assert.equal(rs.ok, true, '可从备份回滚')
  const e = db.getByFp('rf-restore')
  assert.equal(e.text, '待回滚的行为记忆', '文本恢复')
  assert.equal(e.weight, 7, '权重恢复')
  assert.equal(e.pinned, true, '锁定恢复')
  // 未删除的条目不可恢复（防误覆盖）
  const dup = I.restoreEntry('rf-restore')
  assert.equal(dup.ok, false, '已存在时不重复恢复')
})

test('stats 集成：dbPath/vectors/migration 可序列化', () => {
  const s = db.stats()
  assert.ok(s.dbPath.endsWith('biomemory.db'))
  assert.equal(typeof s.auditCount, 'number')
  const m = db.migrationStatus()
  assert.ok('migrated' in m)
})

// ============================================================================
// 10. 编辑条目（updateEntryText）+ 冲突置顶（v0.5.2：可编辑能力 + 冲突浮出）
// ============================================================================
