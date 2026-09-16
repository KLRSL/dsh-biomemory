// 拆分模块冒烟验证：直接 import 新模块，验证 store/retrieve/meta/snapshot/gate 可用
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'biomem-mod-'))
process.env.DSH_MEMORY_ROOT = tmp
process.env.DSH_BIOMEMORY_DIR = path.join(tmp, 'biomemory')

const shared = await import('../shared.mjs')
const store = await import('../store.mjs')
const retrieve = await import('../retrieve.mjs')
const meta = await import('../meta.mjs')
const snapshot = await import('../snapshot.mjs')
const gate = await import('../gate.mjs')
const ss = await import('../session-state.mjs')
const notify = await import('../notify.mjs')
import { openDb, closeDb } from '../db.mjs'
openDb()

after(() => { try { closeDb() } catch {}; fs.rmSync(tmp, { recursive: true, force: true }) })

test('store.writeEntry 写入 + 去重', () => {
  const r = store.writeEntry({ track: 'agent', text: '测试教训：拆分模块要验证', approved: true, mode: 'auto' })
  assert.ok(r.ok, '写入成功: ' + JSON.stringify(r))
  const r2 = store.writeEntry({ track: 'agent', text: '测试教训：拆分模块要验证', approved: true, mode: 'auto' })
  assert.ok(r2.skipped, '重复应被跳过')
})

test('retrieve.queryEntries exact 命中', async () => {
  const out = await retrieve.queryEntries('拆分模块', 10, { mode: 'exact' })
  assert.ok(Array.isArray(out))
})

test('meta.runReflect 可执行(无异常)', () => {
  const r = meta.runReflect({ dryRun: true })
  assert.ok(r.scanned >= 0)
  assert.ok(r.clusters)
})

test('snapshot.renderSnapshot 可执行', () => {
  const text = snapshot.renderSnapshot()
  assert.equal(typeof text, 'string')
})

test('session-state 标记流转', () => {
  ss.markSummaryPending('s1')
  assert.ok(ss.isSummaryPending())
  ss.clearSummaryPending()
  assert.ok(!ss.isSummaryPending())
})

test('notify 无 petEndpoint 静默', () => {
  notify.setPetEndpoint(null)
  notify.petNotify('测试', '静默')
  assert.ok(true)
})

test('gate.gateWrite 普通内容 auto', async () => {
  const r = await gate.gateWrite({ get: () => undefined }, { track: 'agent', text: '普通事实' })
  assert.equal(r.mode, 'auto')
})

// ---------- v0.6.5：审批门 fail-closed ----------

test('gate.gateWrite 默认 fail-closed：审批服务缺失 → 拒绝写入并记审计', async () => {
  shared.setConfig({ approvalFallback: 'deny' })
  const r = await gate.gateWrite({ get: () => undefined }, { track: 'user', text: '重要偏好：以后都用国内镜像源' })
  assert.equal(r.approved, false, '审批不可用且默认 deny → 必须拒绝（旧默认 auto 为静默免审批）')
  assert.equal(r.mode, 'ask')
  const recs = shared.queryAudit({ type: 'APPROVAL-UNAVAILABLE' })
  assert.ok(recs.length >= 1, '异常/缺失必须记审计（不静默）')
  assert.ok(JSON.stringify(recs).includes('service-missing'), '审计记录原因')
})

test('gate.gateWrite 默认 fail-closed：request 抛错 → 拒绝写入并记审计', async () => {
  shared.setConfig({ approvalFallback: 'deny' })
  const ctx = { get: () => ({ request: async () => { throw new Error('approval service down') } }) }
  const r = await gate.gateWrite(ctx, { track: 'user', text: '重要决策：必须记住这件事' })
  assert.equal(r.approved, false, 'request 抛错 → 拒绝')
  assert.ok(JSON.stringify(shared.queryAudit({ type: 'APPROVAL-UNAVAILABLE' })).includes('request-threw'), '审计记录 request-threw')
})

test('gate：接受运行时全部授予词（含大小写/下划线变体），非授予词一律拒绝', async () => {
  const ctxOf = (outcome) => ({ get: () => ({ request: async () => outcome }) })
  shared.setConfig({ approvalFallback: 'deny' })
  // 授予语义：运行时 'allowed-once'（dsh-user-approval 契约）及其大小写/分隔符变体
  for (const granted of ['allowed-once', 'ALLOWED-ONCE', 'allowed_once', 'Allowed-Once']) {
    const r = await gate.gateWrite(ctxOf(granted), { track: 'user', text: '重要偏好测试' })
    assert.equal(r.approved, true, `${granted} 应视为授予`)
    assert.equal(r.mode, 'ask')
  }
  // 非授予语义：rejected/cancelled/unavailable/未知词 → 拒绝（不 fail-open）
  for (const denied of ['rejected', 'cancelled', 'unavailable', 'weird-value']) {
    const r = await gate.gateWrite(ctxOf(denied), { track: 'user', text: '重要偏好测试' })
    assert.equal(r.approved, false, `${denied} 应拒绝`)
    assert.equal(r.mode, 'ask')
  }
  // 显式回到旧行为：approvalFallback='auto' 时非授予词仍按降级保存（审计标记）
  shared.setConfig({ approvalFallback: 'auto' })
  const r2 = await gate.gateWrite(ctxOf('unavailable'), { track: 'user', text: '重要偏好测试' })
  assert.equal(r2.approved, true, 'auto 策略保留旧行为')
  assert.equal(r2.mode, 'fallback')
  shared.setConfig({}) // 还原默认（deny）
  assert.equal(shared.getConfig().approvalFallback, 'deny', '默认策略为 deny（fail-closed）')
})
