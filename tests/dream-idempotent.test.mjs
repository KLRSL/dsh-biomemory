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

test('沉淀提醒窗口可配（默认 5 分钟）：窗口内提醒，超窗口丢弃，调大后恢复提醒', async () => {
  const snap = await import('../snapshot.mjs')
  const ss = await import('../session-state.mjs')
  // 默认 5 分钟：30 分钟前的轮次已过期
  ss.markSummaryPending('s1')
  ss.setLastTurnEnd(Date.now() - 30 * 60 * 1000, 's1')
  assert.equal(snap.sessionSummarySectionText(), '', '默认窗口（5 分钟）外的轮次不再催促')
  assert.equal(ss.isSummaryPending(), false)
  // 窗口内（4 分钟）应提醒
  ss.markSummaryPending('s1')
  ss.setLastTurnEnd(Date.now() - 4 * 60 * 1000, 's1')
  assert.ok(snap.sessionSummarySectionText().includes('主动沉淀是默认行为'), '窗口内应注入「主动沉淀」提醒')
  // 调大窗口后，30 分钟前也提醒
  I.setConfig({ sinkWindowMinutes: 60 })
  ss.markSummaryPending('s1')
  ss.setLastTurnEnd(Date.now() - 30 * 60 * 1000, 's1')
  assert.ok(snap.sessionSummarySectionText().includes('主动沉淀是默认行为'), '调大窗口后应提醒')
  I.setConfig({ sinkWindowMinutes: 5 }) // 还原默认
})

test('写入去重（记忆原子化·merge 模式）：近重复合并进已有条目并提权，不产生碎片', () => {
  // 注意：精确指纹只看「前 20 字」，两条记忆若开头 20 字相同会先被判成 duplicate；
  // 近重复检测补的正是「换了说法/换了开头」的那一类。
  const first = store.writeEntry({ track: 'agent', text: '写入去重测试：dsh 启动前必须检查 3080 端口，防止重复拉起。' })
  assert.equal(first.ok, true)
  const again = store.writeEntry({ track: 'agent', text: '写入去重校验：dsh 启动前必须检查 3080 端口，防止重复拉起。' })
  assert.equal(again.merged, true)
  assert.equal(again.reason, 'near-duplicate-merged')
  assert.equal(again.fp, first.fp)
  assert.ok(again.similar.score >= 0.7, `相似度应达标，实际 ${again.similar && again.similar.score}`)
  const e = db.getByFp(first.fp)
  assert.ok(e.text.includes('【补充·'), '合并后应带「补充·日期」标记')
  assert.equal(e.weight, 11, '合并应提权 +1')
  assert.equal(auditCount('WRITE-MERGE'), 1)
  assert.equal(db.allEntries().filter((x) => x.fragment_type === 'lesson').length, 1, '不应新增碎片条目')
  // 不同主题仍正常写入
  const other = store.writeEntry({ track: 'agent', text: '码头进度条要同时支持百分比与分数两种写法（来自另一主题的独立条目）。' })
  assert.equal(other.ok, true)
  assert.equal(other.skipped, undefined)
  assert.equal(other.merged, undefined)
})

test('写入去重（skip 模式）：nearDuplicateAction=skip 时只提示、不写库', () => {
  const first = store.writeEntry({ track: 'agent', text: '跳过模式测试：码头横幅在贴顶时要翻到下方显示。' })
  I.setConfig({ nearDuplicateAction: 'skip' })
  const again = store.writeEntry({ track: 'agent', text: '跳过模式校验：码头横幅在贴顶时需要翻到下方显示。' })
  assert.equal(again.skipped, true)
  assert.equal(again.reason, 'near-duplicate')
  assert.equal(again.similar.fp, first.fp)
  assert.equal(auditCount('WRITE-SKIP'), 1)
  assert.equal(db.getByFp(first.fp).text.includes('【补充·'), false, 'skip 模式不应改写已有条目')
  I.setConfig({ nearDuplicateAction: 'merge' }) // 还原默认
})

test('restoreEntry 保留原 entry_id（审计关联不再悬空）', () => {
  const { fp } = store.writeEntry({ track: 'agent', text: '回滚测试条目：删除后从备份恢复应保留原 entry_id。' })
  const before = db.getByFp(fp).entry_id
  store.removeEntry(fp) // 先备份 DB 再删
  assert.equal(db.getByFp(fp), undefined)
  const r = store.restoreEntry(fp)
  assert.equal(r.ok, true)
  assert.equal(db.getByFp(fp).entry_id, before, '恢复后 entry_id 应与删除前一致')
  const auditRow = db.openDb().prepare("SELECT entry_id FROM audit_log WHERE action='RESTORE' ORDER BY id DESC LIMIT 1").get()
  assert.equal(auditRow.entry_id, before)
})

test('shouldRunAuto：0 关闭 / 无时间戳视为从未执行 / 未到期不执行', async () => {
  const { shouldRunAuto } = await import('../meta.mjs')
  const now = Date.now()
  assert.equal(shouldRunAuto(null, 3, now), true, '从未执行 → 需要执行')
  assert.equal(shouldRunAuto(null, 0, now), false, 'days=0 → 关闭')
  assert.equal(shouldRunAuto('garbage', 3, now), true, '时间戳非法 → 视为从未执行')
  assert.equal(shouldRunAuto(new Date(now - 2 * 86400000).toISOString(), 3, now), false, '未到期 → 不执行')
  assert.equal(shouldRunAuto(new Date(now - 3 * 86400000).toISOString(), 3, now), true, '已到期 → 执行')
})

test('巩固只认「最近被真实召回」的条目（与召回时间挂钩）', () => {
  const a = store.writeEntry({ track: 'agent', text: '巩固A：最近被召回，应被加权。' })
  const b = store.writeEntry({ track: 'agent', text: '巩固B：很久以前被召回，不应再加权。' })
  db.upsertEntry({ fp: a.fp, hits: 5, weight: 5, last_accessed: new Date().toISOString() })
  db.upsertEntry({ fp: b.fp, hits: 5, weight: 5, last_accessed: new Date(Date.now() - 30 * 86400000).toISOString() })
  const r = I.runDream()
  assert.equal(r.consolidated, 1, '只有最近召回的条目被巩固')
  assert.equal(db.getByFp(a.fp).weight, 6, '最近召回 → +1')
  assert.equal(db.getByFp(b.fp).weight, 5, '久未召回 → 不加权')
})
