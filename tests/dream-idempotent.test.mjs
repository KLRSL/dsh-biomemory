// ============================================================================
// dsh-biomemory v0.8.0 回归测试：自动代谢判据 + 幂等衰减 + 取消归档 + 快照过滤
//
// 背景（fp:1fed41ef）：≤v0.7.0 的自动 dream 判据用 store.latestBackup()（单轨制后恒为 null）
// → 每次插件加载都跑一遍 dream；而 runDream 的衰减拿「当前权重 × 全龄因子」= 复合衰减，
// 重复执行指数加速，把 19 条行为记忆压到归档线以下。本文件锁死修复后的语义。
// ============================================================================

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biomem-v08-'))
process.env.DSH_MEMORY_ROOT = tmpDir
process.env.DSH_BIOMEMORY_DIR = path.join(tmpDir, 'biomemory')

const { __internals: I } = await import('../index.mjs')
const store = await import('../store.mjs')
const db = await import('../db.mjs')
const { renderSnapshot } = await import('../snapshot.mjs')

db.openDb()

beforeEach(() => {
  const d = db.openDb()
  d.exec('DELETE FROM entries')
  d.exec('DELETE FROM audit_log')
  d.exec('DELETE FROM meta')
})

after(() => {
  db.closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function backdate(fp, days) {
  const iso = new Date(Date.now() - days * 86400000).toISOString()
  db.openDb().prepare('UPDATE entries SET created_at = ? WHERE fp = ?').run(iso, fp)
  return iso
}

function auditCount(action) {
  return db.openDb().prepare('SELECT COUNT(*) n FROM audit_log WHERE action = ?').get(action).n
}

test('衰减幂等：同日重复执行 dream 不再叠加（复合衰减修复）', () => {
  const { fp } = store.writeEntry({ track: 'agent', text: '幂等衰减测试条目：验证 dream 重复执行不会复合衰减，权重只按增量时间下降。' })
  backdate(fp, 7) // 7 天龄 + 半衰期 7 天 → 第一轮应衰减到 ~5
  const r1 = I.runDream()
  const w1 = db.getByFp(fp).weight
  assert.equal(r1.decayed, 1)
  assert.ok(w1 > 4 && w1 < 6, `第一轮应衰减到 5 左右，实际 ${w1}`)
  assert.ok(db.metaGet('lastDreamAt'), 'dream 结束应写入 meta.lastDreamAt')

  const r2 = I.runDream()
  const w2 = db.getByFp(fp).weight
  assert.equal(r2.decayed, 0, '第二轮增量时间为 0，不应再衰减')
  assert.equal(w2, w1)
})

test('新条目不被上一轮代谢误伤：基准取 max(创建时间, 上次代谢时间)', () => {
  db.metaSet('lastDreamAt', new Date(Date.now() - 30 * 86400000).toISOString())
  const { fp } = store.writeEntry({ track: 'agent', text: '基准测试条目：创建时间晚于上次代谢，应只按创建至今的极短时间衰减。' })
  const r = I.runDream()
  const e = db.getByFp(fp)
  assert.ok(e.weight > 9.5, `新条目几乎不应衰减，实际 ${e.weight}`)
  assert.equal(e.status, 'active')
  assert.equal(r.archived, 0)
})

test('unarchiveEntry：归档行恢复为 active 并校准权重（审计 UNARCHIVE）', () => {
  const { fp } = store.writeEntry({ track: 'agent', text: '取消归档测试条目：先被压到权重 1 而归档，再恢复为 active。' })
  db.upsertEntry({ fp, weight: 1 })
  I.runDream()
  assert.equal(db.getByFp(fp).status, 'archived')

  const u = store.unarchiveEntry(fp, { weight: 10 })
  assert.equal(u.ok, true)
  const e = db.getByFp(fp)
  assert.equal(e.status, 'active')
  assert.equal(e.weight, 10)
  assert.equal(auditCount('UNARCHIVE'), 1)
  // 非归档状态的条目不能重复取消归档
  assert.equal(store.unarchiveEntry(fp).ok, false)
})

test('快照不注入归档条目（归档 = 退出注入，避免静默下架）', () => {
  const { fp } = store.writeEntry({ track: 'agent', text: '归档不注入测试：文本特征串 ZZZARCHIVEDZZZ。' })
  assert.ok(renderSnapshot().includes('ZZZARCHIVEDZZZ'))
  db.upsertEntry({ fp, status: 'archived' })
  assert.ok(!renderSnapshot().includes('ZZZARCHIVEDZZZ'))
})
