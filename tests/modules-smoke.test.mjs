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
const snapshot = await import('../snapshot.mjs')
const gate = await import('../gate.mjs')
const ss = await import('../session-state.mjs')
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

test('gate.gateWrite 普通内容 auto', async () => {
  const r = await gate.gateWrite({ get: () => undefined }, { track: 'agent', text: '普通事实' })
  assert.equal(r.mode, 'auto')
})

// ---------- v0.6.5：审批门 fail-closed ----------



test('gate：接受运行时全部授予词（含大小写/下划线变体），非授予词一律拒绝', async () => {
  const agent = { session: { seq: 1 } }
  const ctxOf = (outcome) => ({ get: () => ({ request: async () => outcome }) })
  shared.setConfig({ approvalFallback: 'deny' })
  // 授予语义：运行时 'allowed-once'（dsh-user-approval 契约）及其大小写/分隔符变体
  for (const granted of ['allowed-once', 'ALLOWED-ONCE', 'allowed_once', 'Allowed-Once']) {
    const r = await gate.gateWrite(ctxOf(granted), { track: 'user', text: '重要偏好测试', agent })
    assert.equal(r.approved, true, `${granted} 应视为授予`)
    assert.equal(r.mode, 'ask')
  }
  // 非授予语义：rejected/cancelled/unavailable/未知词 → 拒绝（不 fail-open）
  for (const denied of ['rejected', 'cancelled', 'unavailable', 'weird-value']) {
    const r = await gate.gateWrite(ctxOf(denied), { track: 'user', text: '重要偏好测试', agent })
    assert.equal(r.approved, false, `${denied} 应拒绝`)
    assert.equal(r.mode, 'ask')
  }
  // 显式回到旧行为：approvalFallback='auto' 时非授予词仍按降级保存（审计标记）
  shared.setConfig({ approvalFallback: 'auto' })
  const r2 = await gate.gateWrite(ctxOf('unavailable'), { track: 'user', text: '重要偏好测试', agent })
  assert.equal(r2.approved, true, 'auto 策略保留旧行为')
  assert.equal(r2.mode, 'fallback')
  shared.setConfig({}) // 还原默认（deny）
  assert.equal(shared.getConfig().approvalFallback, 'deny', '默认策略为 deny（fail-closed）')
})

// ---------- v0.7.1：审批请求必须带 agent（官方契约 req.agent.session） ----------

test('gate（v0.7.1）：request 载荷透传 agent/callId，undefined 的 signal 不带字段', async () => {
  shared.setConfig({ approvalFallback: 'deny' })
  const agent = { session: { seq: 7 } }
  let seen = null
  const ctx = { get: () => ({ request: async (req) => { seen = req; return 'allowed-once' } }) }
  const r = await gate.gateWrite(ctx, { track: 'user', text: '重要偏好：载荷必须带 agent', agent, callId: 'call-123', signal: undefined })
  assert.equal(r.approved, true)
  assert.equal(seen?.agent, agent, 'req.agent 必须原样透传（官方实现第一行取 req.agent.session）')
  assert.equal(seen?.toolName, shared.TOOL_NAME)
  assert.equal(seen?.callId, 'call-123')
  assert.ok(String(seen?.reason).includes('重要偏好：载荷必须带 agent'), 'reason 带上待审内容')
  assert.ok(!('signal' in seen), 'signal 为 undefined 时不带该字段')
})

test('gate（v0.7.1）：缺 agent 时 fail-closed 兜底，不再崩在 reading \'session\'', async () => {
  shared.setConfig({ approvalFallback: 'deny' })
  let called = false
  const ctx = { get: () => ({ request: async () => { called = true; return 'allowed-once' } }) }
  const r = await gate.gateWrite(ctx, { track: 'user', text: '重要决策：无 agent 场景' })
  assert.equal(called, false, '没有 agent 时不应再调用 request（官方实现会抛 Cannot read properties of undefined）')
  assert.equal(r.approved, false)
  assert.equal(r.mode, 'ask')
})
