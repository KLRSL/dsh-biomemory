// ============================================================================
// dsh-memory-layer 单元测试（node:test，完全隔离）
//
// 隔离策略：
//   - 测试开始前创建临时记忆根目录（os.tmpdir() 下 mkdtemp）
//   - 用 process.env.DSH_MEMORY_ROOT 指向临时目录后再动态 import index.mjs
//   - after 钩子递归删除临时目录
//   - 每个文件型用例各自写自己的记忆文件（互不依赖、顺序无关）
//
// ============================================================================

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ---------- 隔离环境：临时记忆根 + 临时 SQLite 目录 ----------

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biomem-'))
process.env.DSH_MEMORY_ROOT = tmpDir
process.env.DSH_BIOMEMORY_DIR = path.join(tmpDir, 'biomemory')

// 必须在设置环境变量之后再加载被测模块（根目录在 import 时读取）
const mod = await import('../index.mjs')
const I = mod.__internals
// v0.5：数据层为 SQLite，先初始化 + 迁移（临时库为空 → migrated 幂等）
import { openDb, closeDb, upsertEntry } from '../db.mjs'
openDb()
const migration = I.migrateMarkdownToDb()
if (migration.migrated) console.log(`[test] migration: imported=${migration.imported}`)

// 每个数据层用例前清空测试库（避免用例间计数漂移）
import { beforeEach } from 'node:test'
beforeEach(() => {
  const db = openDb()
  db.exec('DELETE FROM entries')
  db.exec('DELETE FROM meta')
})

after(() => {
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ---------- 文件辅助 ----------

function writeMemFile(rel, content) {
  const p = path.join(tmpDir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content, 'utf-8')
}

function readMemFile(rel) {
  const p = path.join(tmpDir, rel)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''
}

function firstEntry(rel) {
  return readMemFile(rel)
    .split('\n')
    .map((l) => I.parseEntryLine(l.trim()))
    .find(Boolean)
}

// ============================================================================
// 1. parseEntryLine
// ============================================================================

test('解析新格式条目行（w/h/t/pin 全字段）', () => {
  const e = I.parseEntryLine(
    '- [行为|自动] [fp:abc123] [w:12] [h:3] [t:2026-08-16 13:00] [pin] 用户偏好测试内容'
  )
  assert.ok(e, '应能解析新格式行')
  assert.equal(e.kind, '行为')
  assert.equal(e.mode, '自动')
  assert.equal(e.fp, 'abc123')
  assert.equal(e.weight, 12)
  assert.equal(e.hits, 3)
  assert.equal(e.ts, '2026-08-16 13:00')
  assert.equal(e.pinned, true)
  assert.equal(e.text, '用户偏好测试内容')
})

test('解析旧格式条目行（无元数据，默认 weight=10）', () => {
  const e = I.parseEntryLine('- [知识|自动] [fp:def456] 普通事实记录')
  assert.ok(e, '应能解析旧格式行')
  assert.equal(e.kind, '知识')
  assert.equal(e.mode, '自动')
  assert.equal(e.fp, 'def456')
  assert.equal(e.weight, 10)
  assert.equal(e.hits, 0)
  assert.equal(e.ts, null)
  assert.equal(e.pinned, false)
  assert.equal(e.text, '普通事实记录')
})

test('解析无指纹旧格式行（自动计算 fp）', () => {
  const e = I.parseEntryLine('- [行为|自动] 没有指纹的文本')
  assert.ok(e)
  assert.equal(e.fp, I.fingerprint('没有指纹的文本'))
  assert.equal(e.weight, 10)
  assert.equal(e.text, '没有指纹的文本')
})

test('非法行返回 null', () => {
  assert.equal(I.parseEntryLine(''), null)
  assert.equal(I.parseEntryLine('not an entry'), null)
  assert.equal(I.parseEntryLine('- 普通列表项'), null)
  assert.equal(I.parseEntryLine('## 2026-08-16 · 会话 x'), null)
  assert.equal(I.parseEntryLine('* [知识|自动] 星号开头'), null)
})

// ============================================================================
// 2. formatEntryLine 与 parseEntryLine 往返
// ============================================================================

test('formatEntryLine 与 parseEntryLine 往返一致', () => {
  const e = {
    kind: '行为',
    mode: '自动',
    fp: 'abc123',
    weight: 12,
    hits: 3,
    ts: '2026-08-16 13:00',
    pinned: true,
    text: '内容文本',
  }
  const line = I.formatEntryLine(e)
  assert.equal(
    line,
    '- [行为|自动] [fp:abc123] [w:12] [h:3] [t:2026-08-16 13:00] [pin] 内容文本'
  )
  const back = I.parseEntryLine(line)
  assert.deepEqual(back, e)
})

test('formatEntryLine 无 ts/pin 时不输出对应字段', () => {
  // 注意：fp 必须是 [0-9a-f]+（parseEntryLine 的 fp 正则），'x1' 会被当成普通文本
  const e = { kind: '知识', mode: '自动', fp: 'a1b2', weight: 10, hits: 0, ts: null, pinned: false, text: '普通' }
  const line = I.formatEntryLine(e)
  assert.equal(line, '- [知识|自动] [fp:a1b2] [w:10] [h:0] 普通')
  assert.deepEqual(I.parseEntryLine(line), e)
})

// ============================================================================
// 3. fingerprint
// ============================================================================

test('fingerprint：相同文本指纹一致，不同文本不同', () => {
  assert.equal(I.fingerprint('深度学习模型训练'), I.fingerprint('深度学习模型训练'))
  assert.equal(I.fingerprint('猫咪吃饭'), I.fingerprint('猫咪吃饭'))
  assert.notEqual(I.fingerprint('深度学习模型训练'), I.fingerprint('猫咪吃饭'))
  assert.notEqual(I.fingerprint('记忆A'), I.fingerprint('记忆B'))
  // 空白不影响指纹（指纹基于去空白后的前 20 字）
  assert.equal(I.fingerprint('abc 123'), I.fingerprint('abc123'))
})

// ============================================================================
// 4. isImportant
// ============================================================================

test('isImportant：关键词命中为 true', () => {
  assert.equal(I.isImportant('这是用户偏好，必须遵守', 'agent'), true)
  assert.equal(I.isImportant('切记不要删除该目录', 'agent'), true)
  assert.equal(I.isImportant('这是一个踩坑教训', 'agent'), true)
  assert.equal(I.isImportant('项目决策：采用官方契约', 'agent'), true)
})

test('isImportant：普通事实为 false', () => {
  assert.equal(I.isImportant('今天天气不错', 'agent'), false)
  assert.equal(I.isImportant('记录了三个文件路径', 'agent'), false)
})

test('isImportant：track=user 恒为 true', () => {
  assert.equal(I.isImportant('今天天气不错', 'user'), true)
  assert.equal(I.isImportant('随便一句话', 'user'), true)
})

// ============================================================================
// 5. estimateTokens
// ============================================================================

test('estimateTokens：中文≈1 token，英文 4 字符≈1', () => {
  assert.equal(I.estimateTokens('你好世界'), 4)
  assert.equal(I.estimateTokens('abcd'), 1)
  assert.equal(I.estimateTokens('你好世界abcd'), 5) // 4 中文 + ceil(4/4)
  assert.equal(I.estimateTokens('hello world'), 3) // 11 字符 → ceil(11/4)
  assert.equal(I.estimateTokens('中文abc'), 3) // 2 中文 + ceil(3/4)
  assert.equal(I.estimateTokens(''), 0)
})

// ============================================================================
// 6. setPin / unpin（v0.5：SQLite 数据层）
// ============================================================================

test('setPin：pin 后条目 pinned=true，unpin 恢复', async () => {
  const db = await import('../db.mjs')
  db.openDb()
  const id = db.upsertEntry({ fp: 'e5e5e5', layer: 'longterm', fragment_type: 'fact', kind: '行为', text: '需要钉住的记忆条目', weight: 10 })
  assert.ok(id, 'upsert 应成功')

  const r1 = I.setPin('e5e5e5', true)
  assert.equal(r1.ok, true)
  assert.equal(r1.pinned, true)
  assert.equal(db.getByFp('e5e5e5').pinned, true, 'SQLite 中 pinned=true')
  // v0.8.0：钉住不再把权重清零（旧实现 weight=1 → 一解锁就低于 decayThreshold 被归档）。
  assert.equal(db.getByFp('e5e5e5').weight, 10, '钉住不改权重')

  const r2 = I.setPin('e5e5e5', false)
  assert.equal(r2.ok, true)
  assert.equal(r2.pinned, false)
  assert.equal(db.getByFp('e5e5e5').pinned, false, 'SQLite 中 pinned=false')

  const r3 = I.setPin('zzzzzz', true)
  assert.equal(r3.ok, false)
  assert.ok(r3.error.includes('未找到'))
})

// ============================================================================
// 8. detectConflict
// ============================================================================



// ============================================================================
// 9. runDream dry-run（v0.5：SQLite 数据层）
// ============================================================================


// ============================================================================
// 10. runDream 执行（归档低权重、保留高权重；断点检查点清空）
// ============================================================================


// ============================================================================
// 11. queryAudit
// ============================================================================


// ============================================================================
// 12. tokenize（纯 JS 分词；查询路径在用）
// ============================================================================

test('tokenize：中文单字+双字、英文单词', () => {
  // 当前实现：先全部单字，再全部双字（双字在单字之后）
  assert.deepEqual(I.tokenize('深度学习'), ['深', '度', '学', '习', '深度', '度学', '学习'])
  assert.deepEqual(I.tokenize('猫咪吃鱼'), ['猫', '咪', '吃', '鱼', '猫咪', '咪吃', '吃鱼'])
  assert.deepEqual(I.tokenize('hello world'), ['hello', 'world'])
  assert.deepEqual(I.tokenize('abc'), ['abc'], '长度>1 的英文单词应保留')
  assert.deepEqual(I.tokenize('a'), [], '单字母单词不产出 token')
  assert.deepEqual(I.tokenize(''), [])
  assert.deepEqual(I.tokenize('模型训练'), ['模', '型', '训', '练', '模型', '型训', '训练'])
})

// ============================================================================
// 附加：配置化 setConfig / getConfig
// ============================================================================

test('setConfig/getConfig：配置可覆盖并回读', () => {
  const before = I.getConfig()
  assert.equal(before.weightCap, 20)
  I.setConfig({ weightCap: 30, decayThreshold: 5 })
  const after = I.getConfig()
  assert.equal(after.weightCap, 30)
  assert.equal(after.decayThreshold, 5)
  assert.equal(after.maxQueryResults, 20, '未覆盖的配置保留默认值')
  I.setConfig({}) // 还原默认
  assert.equal(I.getConfig().weightCap, 20)
})

// ============================================================================
// 15. clusterEntries —— 深度反思主题聚类
// ============================================================================


// ============================================================================
// 16. runReflect —— 深度反思报告
// ============================================================================



// ============================================================================
// 17. consolidateHits —— 自动巩固（用进废退）
// ============================================================================

test('consolidateHits：命中条目 hits+1，未命中不变（v0.5：SQLite）', async () => {
  const db = await import('../db.mjs')
  db.openDb()
  db.upsertEntry({ fp: 'h1', layer: 'longterm', fragment_type: 'fact', text: '巩固测试条目甲', weight: 10, hits: 3 })
  db.upsertEntry({ fp: 'h2', layer: 'longterm', fragment_type: 'fact', text: '巩固测试条目乙', weight: 10, hits: 1 })

  const files = I.consolidateHits(new Set(['h1']))
  assert.ok(files >= 1, '至少一个条目被巩固')
  assert.equal(db.getByFp('h1').hits, 4, 'h1 引用 +1 → hits:4')
  assert.equal(db.getByFp('h2').hits, 1, 'h2 未命中保持不变')
})

test('queryEntries 带关键词查询自动巩固命中条目（v0.5：SQLite）', async () => {
  const db = await import('../db.mjs')
  db.openDb()
  db.upsertEntry({ fp: 'q1', layer: 'longterm', fragment_type: 'fact', kind: '行为', text: '查询巩固目标记忆', weight: 10, hits: 0 })
  db.upsertEntry({ fp: 'q2', layer: 'longterm', fragment_type: 'fact', kind: '行为', text: '无关的另一条', weight: 10, hits: 0 })

  const es = await I.queryEntries('查询巩固', 20, { mode: 'exact' })
  assert.ok(es.some((e) => e.fp === 'q1'), '关键词应命中 q1')
  assert.equal(db.getByFp('q1').hits, 1, 'q1 被自动巩固 hits:1')
  assert.equal(db.getByFp('q2').hits, 0, 'q2 未被巩固')
})

// ============================================================================
// 18. removeEntry —— 安全删除（先备份）
// ============================================================================

test('removeEntry：删除条目并自动备份数据库（v0.5：SQLite）', async () => {
  const db = await import('../db.mjs')
  db.openDb() // db2 = 数据库实例（仅用于 prepare 等原生调用）
  db.upsertEntry({ fp: 'r1', layer: 'longterm', fragment_type: 'fact', kind: '知识', text: '待删除记忆条目', weight: 10 })

  const r = I.removeEntry('r1')
  assert.equal(r.ok, true)
  assert.ok(r.backup, '应返回备份路径')
  assert.ok(fs.existsSync(r.backup), '备份 .db 文件存在')
  assert.ok(db.listBackups().length >= 1, '备份列表非空')
  assert.equal(db.getByFp('r1'), undefined, '条目已从 SQLite 删除')
  assert.ok(I.removeEntry('nope').ok === false, '不存在的 fp 返回失败')
})

// ============================================================================
// 19. 记忆类别与来源（v0.6.1：memory_class / source_ref，建议≠决定）
// ============================================================================

test('inferMemoryClass：用户决定/偏好/事实 与 模型建议/推测 正确区分', async () => {
  const { inferMemoryClass } = await import('../store.mjs')
  assert.equal(inferMemoryClass({ track: 'user', text: '大家都决定用 React 18 方案' }), 'user_decision')
  assert.equal(inferMemoryClass({ track: 'user', text: '用户更喜欢暗色主题' }), 'user_preference')
  assert.equal(inferMemoryClass({ track: 'user', text: '今天部署了 3 个服务' }), 'fact')
  assert.equal(inferMemoryClass({ track: 'agent', text: '建议改用镜像源，可以试试 npmmirror' }), 'model_suggestion')
  assert.equal(inferMemoryClass({ track: 'agent', text: '推测可能是内存泄漏导致' }), 'model_inference')
})

test('writeEntry：落库 memory_class + source_ref（来源可溯源，建议≠决定）', async () => {
  const db = await import('../db.mjs')
  const { writeEntry } = await import('../store.mjs')
  const a = writeEntry({ track: 'user', text: '拍板：桌宠 UI 用 dsh-fuse 设计令牌', sessionId: 's-abc', source: '用户原话' })
  const b = writeEntry({ track: 'agent', text: '建议桌宠动画可以用 QPropertyAnimation 实现', sessionId: 's-abc' })
  const ea = db.getByFp(a.fp)
  const eb = db.getByFp(b.fp)
  assert.equal(ea.memory_class, 'user_decision')
  assert.equal(ea.source_ref, '用户原话')
  assert.equal(eb.memory_class, 'model_suggestion')
  assert.equal(eb.source_ref, 'session:s-abc')
})

test('db schema：source_ref / memory_class 列存在并可查询', async () => {
  const db = await import('../db.mjs')
  const cols = db.openDb().prepare("PRAGMA table_info(entries)").all().map((c) => c.name)
  assert.ok(cols.includes('source_ref'))
  assert.ok(cols.includes('memory_class'))
})

// ============================================================================
// 20. 快照注入预算硬上限（v0.6.5：prefs/pinned 逐条截断 + kb 保底）
// ============================================================================

test('renderSnapshot：prefs 超大时被逐条截断，且 kb 仍保留内容、总量不超 hotTokenLimit', async () => {
  const db = await import('../db.mjs')
  const cfg = I.getConfig()
  const limit = cfg.hotTokenLimit
  // 40 条超长偏好（每条 400 中文 ≈400 token → 合计 ≈16k token，远超 5000）
  for (let i = 0; i < 40; i++) {
    db.upsertEntry({ fp: `snap-p${i}`, layer: 'longterm', fragment_type: 'preference', kind: '偏好', text: `偏好条目不重复内容编号${i} ` + '甲'.repeat(380) })
  }
  // 一条知识点（必须仍能进快照：旧实现 budget 变负导致 kb 整段丢弃）
  db.upsertEntry({ fp: 'snap-k1', layer: 'longterm', fragment_type: 'fact', kind: '知识', text: '知识保底条目：预算截断后仍应注入' })
  const { renderSnapshot } = await import('../snapshot.mjs')
  const text = renderSnapshot()
  const tokens = I.estimateTokens(text)
  assert.ok(tokens <= limit, `注入总量必须 ≤ hotTokenLimit（${tokens} ≤ ${limit}）`)
  assert.ok(text.includes('## 用户偏好'), '偏好段保留')
  assert.ok(text.includes('## 近期知识记忆'), '知识段保留（预算保底，不被整段丢弃）')
  assert.ok(text.includes('知识保底条目'), '知识条目内容在快照内')
  // 偏好被逐条截断：40 条 → 只剩预算内的若干条（旧实现 prefs 整段不截断 → 全量注入）
  const prefLines = text.split('## 近期知识记忆')[0].split('\n').filter((l) => l.startsWith('- ['))
  assert.ok(prefLines.length > 0, '至少保留一条偏好')
  assert.ok(prefLines.length < 40, `超预算的偏好条目应被逐条截断（实际保留 ${prefLines.length}/40）`)
  // 截断标记可见，便于人工排查
  assert.ok(text.includes('预算已满'), '应给出截断标记')
})

// ============================================================================
// 21. 审计双写：人类可读镜像必须跟着写入（v0.6.8 修复）
//
// 回归背景（2026-09-17 实查）：store.mjs 原先 8 处、retrieve.mjs 1 处直接调
// db.audit（只写 SQLite audit_log 表），而镜像 <MEMORY_ROOT>/audit.log 的追加
// 逻辑在 shared.mjs::audit 里 → 经 memory 工具写入/编辑/删除的记忆全都不进镜像
// （实查镜像里 WRITE 行止于 2026-08-19，只剩 DECAY/CONSOLIDATE 等代谢事件），
// 与文档「SQLite audit_log 表 + 人类可读镜像」不符。本用例锁死该行为。
// ============================================================================

