// ============================================================================
// dsh-biomemory v0.5 专项测试：SQLite 数据层 / 迁移 / 确定性检索 / 审计 / 备份
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
// 3. 确定性检索（v0.9.0 起为唯一检索方式；semantic / hybrid 已移除）
// ============================================================================

const SAMPLE_ENTRIES = [
  { entry_id: 's1', fp: 's1', text: '用户喜欢用暗色主题，界面要深色', summary: '', entities: [], weight: 8, status: 'active', fragment_type: 'preference' },
  { entry_id: 's2', fp: 's2', text: '服务器部署在 10.0.0.5，端口 8080', summary: '', entities: [], weight: 6, status: 'active', fragment_type: 'fact' },
  { entry_id: 's3', fp: 's3', text: '用户偏好深色模式的代码编辑器', summary: '', entities: [], weight: 7, status: 'active', fragment_type: 'preference' },
]

test('精确检索：关键词命中并排序', async () => {
  for (const e of SAMPLE_ENTRIES) db.upsertEntry(e)
  const res = await I.queryEntries('端口 8080', 10)
  assert.equal(res[0].fp, 's2')
  const dark = await I.queryEntries('深色', 10)
  assert.ok(dark.some((e) => e.fp === 's1' || e.fp === 's3'), `深色相关应命中（实际 ${dark.map((e) => e.fp)}）`)
  // 词不相同即不命中：旧「语义近义」行为随嵌入模型一并移除
  const none = await I.queryEntries('完全无关的查询词xyz', 10)
  assert.equal(none.length, 0, '无关查询不应返回条目')
})

test('mode 参数已废弃：传入不改变结果，结果也不再带 semantic 标记', async () => {
  const a = await I.queryEntries('深色', 10)
  const b = await I.queryEntries('深色', 10, { mode: 'semantic' })
  assert.deepEqual(b.map((e) => e.fp), a.map((e) => e.fp), 'mode 参数应被忽略')
  for (const e of a) assert.equal('semantic' in e, false, '结果不应再含 semantic 字段')
})

// ============================================================================
// 5. 审计聚合（文档 P1-003）
// ============================================================================


// ============================================================================
// 6. 断点续跑（文档 P0-002）
// ============================================================================


// ============================================================================
// 7. 备份 / 恢复（文档 §4.5）
// ============================================================================

test('backupDb：创建 .db 副本并保留最近 7 次', () => {
  db.upsertEntry({ fp: 'bk1', text: '备份测试' })
  const p1 = db.backupDb()
  assert.ok(fs.existsSync(p1), '备份文件存在')
  const p2 = db.backupDb()
  assert.notEqual(p1, p2, '每次备份独立文件')
  // 紧密循环里的备份可能落在同一毫秒（时间戳只有毫秒精度）：必须仍然各自独立成文件，
  // 否则后一次会静默覆盖前一次（v0.6.7 修）
  const tight = [db.backupDb(), db.backupDb(), db.backupDb()]
  assert.equal(new Set(tight).size, tight.length, '同一毫秒内的备份也不得撞名')
  for (const p of [p1, p2, ...tight]) assert.ok(fs.existsSync(p), `备份文件存在：${p}`)
  const backups = db.listBackups()
  assert.ok(backups.length >= 2, '备份列表 ≥2')
  assert.ok(backups.length <= 7, '不超过 7 次')
})

// ============================================================================
// 10. 编辑条目（updateEntryText）+ 冲突置顶（v0.5.2：可编辑能力 + 冲突浮出）
// ============================================================================


// ============================================================================
// 9. webServer 状态端点数据（db.stats 集成）
// ============================================================================


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
  const m = db.migrationStatus()
  assert.ok('migrated' in m)
})

// ============================================================================
// 13. queryEntries 字段对齐（v0.6.5）
// ============================================================================

test('queryEntries：返回 hits/pinned/mode/ts/kind 且支持 layer 筛选（v0.6.5）', async () => {
  db.upsertEntry({ fp: 'qa-hit', layer: 'hot/behavior', kind: '行为', mode: '自动', text: '字段对齐测试：镜像源下载', weight: 10, hits: 7, pinned: 1 })
  db.upsertEntry({ fp: 'qa-other', layer: 'longterm', kind: '知识', text: '字段对齐测试：另一分层', weight: 9, hits: 2 })
  const res = await I.queryEntries('字段对齐测试', 20, { mode: 'exact' })
  const hit = res.find((e) => e.fp === 'qa-hit')
  assert.ok(hit, '关键词应命中 qa-hit')
  // 前端显示依赖这些字段：缺一个就会显示「命中 undefined」或丢失 PIN 态
  assert.equal(hit.hits, 7, 'hits 应回传')
  assert.equal(hit.pinned, true, 'pinned 应回传（PIN 态）')
  assert.equal(hit.mode, '自动', 'mode 应回传')
  assert.ok(hit.ts, 'ts 应回传（created_at 兜底）')
  assert.equal(hit.kind, '行为', 'kind 应回传')
  assert.equal(hit.layer, 'hot/behavior', 'layer 应回传')
  // layer 筛选：只返回指定分层（GET /entries?q=...&layer=... 的 q 分支修复点）
  const only = await I.queryEntries('字段对齐测试', 20, { mode: 'exact', layer: 'hot/behavior' })
  assert.ok(only.some((e) => e.fp === 'qa-hit'), 'layer 命中的条目应保留')
  assert.ok(!only.some((e) => e.fp === 'qa-other'), '其它分层应被 layer 过滤掉')
  // 工具返回值须为 lossless JSON：不允许 undefined/NaN
  for (const e of res) for (const k of Object.keys(e)) {
    assert.notEqual(e[k], undefined, `${k} 不应为 undefined`)
    assert.ok(!(typeof e[k] === 'number' && !Number.isFinite(e[k])), `${k} 不应为 NaN`)
  }
})


// ============================================================================
// 10. 编辑条目（updateEntryText）+ 冲突置顶（v0.5.2：可编辑能力 + 冲突浮出）
// ============================================================================