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
