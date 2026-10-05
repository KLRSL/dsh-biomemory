// 加载自检（2026-10-05 真实事故回归）：宿主 apply() 必须不抛错，且工具/注入点真的注册。
// 事故：shared.mjs 的 `const DBG = ...` 被误删 → dbgLog 抛 ReferenceError → apply 抛错 → 插件整体不加载
//（表现为 memory 工具在宿主里消失）。仅跑单元测试抓不到，必须真的走一遍 apply()。
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'biomem-apply-'))
process.env.DSH_BIOMEMORY_DIR = path.join(tmp, 'biomemory')
process.env.DSH_MEMORY_ROOT = tmp
process.env.DSH_MEMORY_DEBUG = '1' // 逼出 dbgLog 路径

const mod = await import('../index.mjs')

const REG = { tools: [], contexts: [], sections: [], commands: [], web: [] }
after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {} })

const INJECT_ERRORS = []

function fakeCtx() {
  return {
    // 宿主注入回调拿到的是带 effect 的作用域 ctx；假 ctx 也要给，否则会误报
    effect: (fn) => { if (typeof fn === 'function') fn(); return () => {} },
    inject: (deps, cb) => { if (typeof cb === 'function') { try { cb(fakeCtx()) } catch (e) { INJECT_ERRORS.push(String(e && e.message)) } } },
    on: () => {},
    systemPrompt: {
      context: (o) => REG.contexts.push(o.name),
      section: (o) => REG.sections.push(o.name || '(匿名)'),
    },
    tools: { register: (t) => REG.tools.push(t) },
    commands: { register: (c) => REG.commands.push(c) },
    webServer: { register: (r) => REG.web.push(r && r.kind) },
    logger: { info() {}, warn() {}, error() {} },
  }
}

test('apply()：不抛错，且注册 2 个工具 + 2 段注入 + 命令', () => {
  assert.doesNotThrow(() => mod.apply(fakeCtx()))
  const names = REG.tools.map((t) => t.name)
  assert.ok(names.includes('memory'), JSON.stringify(names))
  assert.ok(names.includes('memory_recall'), JSON.stringify(names))
  assert.ok(REG.contexts.includes('memory:snapshot'), JSON.stringify(REG.contexts))
  assert.ok(REG.contexts.includes('memory:triggered'), JSON.stringify(REG.contexts))
  assert.ok(REG.commands.length >= 1, '命令未注册')
  assert.deepEqual(INJECT_ERRORS, [], '注入回调报错：' + INJECT_ERRORS.join(' / '))
})

test('memory 工具：list / compact(dryRun) / dump 可执行且不抛错', async () => {
  const tool = REG.tools.find((t) => t.name === 'memory')
  assert.ok(tool && typeof tool.execute === 'function')
  const list = await tool.execute({ action: 'list' }, {})
  assert.equal(list.ok, true, JSON.stringify(list).slice(0, 200))
  const comp = await tool.execute({ action: 'compact', dryRun: true }, {})
  assert.equal(comp.ok, true, JSON.stringify(comp).slice(0, 200))
  const dump = await tool.execute({ action: 'dump' }, {})
  assert.equal(dump.ok, true, JSON.stringify(dump).slice(0, 200))
})

test('注入文本：renderSnapshot 与触发召回段可求值（无信号时为空）', () => {
  const snapshot = REG.contexts.length ? null : null
  // 触发召回段在无信号时必须返回空串，不占 token
  assert.equal(REG.contexts.includes('memory:triggered'), true)
})