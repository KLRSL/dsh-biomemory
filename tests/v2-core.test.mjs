// v2 核心：触发信号 / 类型推断 / 新列与工作流链（node:test，完全隔离）
import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'biomem-v2-'))
process.env.DSH_MEMORY_ROOT = tmp
process.env.DSH_BIOMEMORY_DIR = path.join(tmp, 'biomemory')

const T = await import('../trigger.mjs')
const db = await import('../db.mjs')
const store = await import('../store.mjs')
const C = await import('../compact.mjs')
const R = await import('../recall.mjs')
db.openDb()

beforeEach(() => {
  const c = db.openDb()
  c.exec('DELETE FROM entries')
  c.exec('DELETE FROM chains')
  c.exec('DELETE FROM trigger_counts')
})

after(() => { try { db.closeDb() } catch {}; fs.rmSync(tmp, { recursive: true, force: true }) })

// ---------- trigger 提取 ----------

test('triggersFromText：抽出文件名与错误代号', () => {
  const out = T.triggersFromText('改完 package.json 后跑 node --test，报 MODULE_NOT_FOUND 错误')
  assert.ok(out.includes('file:package.json'), JSON.stringify(out))
  assert.ok(out.includes('err:module_not_found'), JSON.stringify(out))
})

test('triggersFromText：Windows 路径取 basename', () => {
  const out = T.triggersFromText('打开 projects/demo/src/db.mjs 看 schema')
  assert.ok(out.includes('file:db.mjs'), JSON.stringify(out))
})

test('triggersFromToolCalls：工具名 + 参数里的文件', () => {
  const out = T.triggersFromToolCalls([{ name: 'pwsh', arguments: JSON.stringify({ command: 'node --test tests/v2-core.test.mjs' }) }])
  assert.ok(out.includes('tool:pwsh'), JSON.stringify(out))
  assert.ok(out.includes('file:v2-core.test.mjs'), JSON.stringify(out))
})

test('normalizeTrigger：小写去空白、超长截断', () => {
  assert.equal(T.normalizeTrigger(' File:Package.JSON '), 'file:package.json')
  assert.equal(T.normalizeTrigger(''), null)
  assert.equal(T.normalizeTrigger('x'.repeat(200)).length, 96)
})

// ---------- 类型推断与优先级 ----------

test('inferType：教训→error / 流程→workflow / 决定→decision / 其它→fact', () => {
  assert.equal(T.inferType({ text: '教训：改 package.json 前先跑测试' }), 'error')
  assert.equal(T.inferType({ text: '流程是先把依赖装好，再跑构建' }), 'workflow')
  assert.equal(T.inferType({ text: '决定：以后插件发布统一走 Gitee' }), 'decision')
  assert.equal(T.inferType({ text: '这个仓库的入口是 index.mjs' }), 'fact')
})

test('优先级：workflow < error < decision < fact', () => {
  assert.ok(T.priorityOf('workflow') < T.priorityOf('error'))
  assert.ok(T.priorityOf('error') < T.priorityOf('decision'))
  assert.ok(T.priorityOf('decision') < T.priorityOf('fact'))
  assert.equal(T.priorityOf('未知'), 9)
})

test('makeKey：首句归一化；过短返回 null', () => {
  assert.equal(T.makeKey('决定：以后都用 Gitee 同步'), '决定以后都用gitee同步')
  assert.equal(T.makeKey('短'), null)
})

// ---------- 新列 / 触发召回 / 工作流链 ----------

test('db：realm/mtype/trigger/mkey 可写入读回', () => {
  db.upsertEntry({ fp: 'v2-1', text: '改 package.json 前先跑测试', realm: 'project:x', mtype: 'workflow', trigger: 'file:package.json', mkey: 'x' })
  const e = db.getByFp('v2-1')
  assert.equal(e.realm, 'project:x')
  assert.equal(e.mtype, 'workflow')
  assert.equal(e.trigger, 'file:package.json')
  assert.equal(e.mkey, 'x')
})

test('db.byTrigger：命中活跃条目，同 realm 优先', () => {
  db.upsertEntry({ fp: 'v2-a', text: 'A', trigger: 'file:a.json', realm: 'other' })
  db.upsertEntry({ fp: 'v2-b', text: 'B', trigger: 'file:a.json', realm: 'project:x' })
  const hits = db.byTrigger(['file:a.json'], { realm: 'project:x' })
  assert.equal(hits.length, 2)
  assert.equal(hits[0].fp, 'v2-b', '同 realm 的排前面')
})

test('db：墓碑后 byTrigger 不再命中，countByTrigger 减一', () => {
  db.upsertEntry({ fp: 'v2-c', text: 'C', trigger: 'file:c.json', realm: 'project:x' })
  assert.equal(db.countByTrigger('file:c.json'), 1)
  db.setStatus('v2-c', 'deleted')
  assert.equal(db.countByTrigger('file:c.json'), 0)
  assert.equal(db.byTrigger(['file:c.json']).length, 0)
})

test('db：工作流链 写入 / 读取 / 计数', () => {
  db.chainUpsert({ trigger: 'file:pkg.json', realm: 'project:x', steps: ['看 package.json', '跑测试'] })
  const c = db.chainGet('file:pkg.json')
  assert.deepEqual(c.steps, ['看 package.json', '跑测试'])
  db.chainTouched('file:pkg.json')
  assert.equal(db.chainGet('file:pkg.json').use_count, 1)
  assert.equal(db.chainAll().length, 1)
})


// ---------- 写入路径：同键覆盖 / 工作流升级 ----------

test('writeEntry：同 realm+type+key 的新条覆盖旧条（旧条墓碑，不物理删）', () => {
  const a = store.writeEntry({ track: 'agent', text: '决定：发布都走 Gitee 同步', approved: true, mode: 'auto', realm: 'user' })
  const b = store.writeEntry({ track: 'agent', text: '决定：发布都走 Gitee 同步（改版）', approved: true, mode: 'auto', realm: 'user' })
  assert.ok(a.fp && b.fp)
  assert.equal(db.getByFp(a.fp)?.status, 'deleted', '旧条目标墓碑')
  assert.equal(db.getByFp(b.fp)?.status, 'active', '新条是活跃')
})

test('writeEntry：新字段落库（realm/mtype/trigger）', () => {
  const r = store.writeEntry({ track: 'agent', text: '教训：改 package.json 前必须跑测试', approved: true, mode: 'auto', realm: 'project:x' })
  const e = db.getByFp(r.fp)
  assert.equal(e.realm, 'project:x')
  assert.equal(e.mtype, 'error')
  assert.equal(e.trigger, 'file:package.json')
})

test('适配层：同一 trigger 第 4 条起升级 workflow 并生成链', () => {
  for (let i = 1; i <= 4; i++) {
    store.writeEntry({ track: 'agent', text: `第${i}步：遇到 config.json 就先备份再改（流程）`, approved: true, mode: 'auto', realm: 'project:y' })
  }
  const rows = db.byTrigger(['file:config.json'], { realm: 'project:y' })
  assert.equal(rows.length, 4)
  assert.ok(rows.every((e) => e.mtype === 'workflow'), '全部升级为 workflow')
  const chain = db.chainGet('file:config.json')
  assert.equal(chain.steps.length, 4)
  assert.ok(chain.steps[0].startsWith('第1步'), JSON.stringify(chain.steps))
})

// ---------- 清理层：五条规则 ----------

test('compact：fact 过期进墓碑；dryRun 不动数据', () => {
  const old = new Date(Date.now() - 40 * 86400000).toISOString()
  db.upsertEntry({ fp: 'c-old-fact', text: '过期的普通事实', mtype: 'fact', realm: 'user', created_at: old, last_accessed: old, hits: 0 })
  const dry = C.compact({ dryRun: true })
  assert.equal(dry.tombstoned >= 1, true)
  assert.equal(db.getByFp('c-old-fact').status, 'active', 'dryRun 不改状态')
  const real = C.compact({})
  assert.equal(real.tombstoned >= 1, true)
  assert.equal(db.getByFp('c-old-fact').status, 'deleted', '实跑进墓碑')
})

test('compact：workflow 久未使用降权；error/decision 永不自动淘汰', () => {
  const old = new Date(Date.now() - 200 * 86400000).toISOString()
  db.upsertEntry({ fp: 'c-old-wf', text: '老流程', mtype: 'workflow', realm: 'user', created_at: old, last_accessed: old, hits: 0, weight: 10 })
  db.upsertEntry({ fp: 'c-old-err', text: '老教训', mtype: 'error', realm: 'user', created_at: old, last_accessed: old, hits: 0, weight: 10 })
  db.upsertEntry({ fp: 'c-old-dec', text: '老决定', mtype: 'decision', realm: 'user', created_at: old, last_accessed: old, hits: 0, weight: 10 })
  C.compact({})
  assert.equal(db.getByFp('c-old-wf').weight, 5, 'workflow 降权一半')
  assert.equal(db.getByFp('c-old-err').status, 'active', 'error 保留')
  assert.equal(db.getByFp('c-old-dec').status, 'active', 'decision 保留')
})

test('dump：导出 Markdown，含类型分节与工作流链', () => {
  const r = C.dump({ dir: tmp })
  assert.ok(fs.existsSync(r.file))
  const text = fs.readFileSync(r.file, 'utf-8')
  assert.ok(text.includes('记忆导出'))
  assert.ok(text.includes('工作流链') || r.chains === 0)
})

// ---------- 召回层：预算与优先级 ----------

test('recallBySignals：无信号不注入', () => {
  const r = R.recallBySignals({ cwd: '', toolCalls: [] })
  assert.equal(r.text, '')
  assert.equal(r.items.length, 0)
})

test('recallBySignals：命中 trigger 才注入，且按类型优先级排序、受预算约束', () => {
  db.upsertEntry({ fp: 'r-fact', text: '关于 build.json 的普通事实', mtype: 'fact', trigger: 'file:build.json', realm: 'user', last_accessed: db.isoNow() })
  db.upsertEntry({ fp: 'r-wf', text: '关于 build.json 的流程', mtype: 'workflow', trigger: 'file:build.json', realm: 'user', last_accessed: db.isoNow() })
  db.upsertEntry({ fp: 'r-other', text: '无关记忆', mtype: 'workflow', trigger: 'file:other.json', realm: 'user' })
  const r = R.recallBySignals({ toolCalls: [{ name: 'pwsh', arguments: '{"command":"node build.json"}' }] }, { maxItems: 8, maxChars: 1200 })
  assert.ok(r.text.includes('build.json'))
  assert.equal(r.text.includes('无关记忆'), false, '未命中不入注入')
  assert.ok(r.text.indexOf('流程') < r.text.indexOf('普通事实'), 'workflow 排在 fact 前')
  const tight = R.recallBySignals({ toolCalls: [{ name: 'pwsh', arguments: '{"command":"node build.json"}' }] }, { maxItems: 1, maxChars: 1200 })
  assert.equal(tight.items.length, 1, '预算 maxItems=1 生效')
})