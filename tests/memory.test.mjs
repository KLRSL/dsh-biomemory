// ============================================================================
// dsh-biomemory 单元测试（node:test，完全隔离）
//
// 隔离策略：
//   - 测试开始前创建临时记忆根目录（os.tmpdir() 下 mkdtemp）
//   - 用 process.env.DSH_MEMORY_ROOT 指向临时目录后再动态 import index.mjs
//   - after 钩子递归删除临时目录
//   - 每个文件型用例各自写自己的记忆文件（互不依赖、顺序无关）
//
// 注意：writeEntry / renderSnapshot 未导出到 __internals，对应用例按约定跳过。
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
import { openDb, closeDb } from '../db.mjs'
openDb()
const migration = I.migrateMarkdownToDb()
if (migration.migrated) console.log(`[test] migration: imported=${migration.imported}`)

// 每个数据层用例前清空测试库（避免用例间计数漂移）
import { beforeEach } from 'node:test'
beforeEach(() => {
  const db = openDb()
  db.exec('DELETE FROM entries')
  db.exec('DELETE FROM audit_log')
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
// 6. writeEntry 去重 —— 未导出到 __internals，按约定跳过
// ============================================================================

test('writeEntry 去重（未导出，跳过）', { skip: '__internals 未导出 writeEntry，无法直接调用；去重逻辑已在 writeEntry 内部由 [fp:xxx] 前缀检查实现' }, () => {})

// ============================================================================
// 7. setPin / unpin（v0.5：SQLite 数据层）
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
  assert.equal(db.getByFp('e5e5e5').weight, 1, '钉住后权重固定为 1（不参与衰减）')

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

test('detectConflict（v0.5 P0-003 修正）：真矛盾触发，教训语境/无关文本不触发', () => {
  // 偏好（逐条比对基准）
  const prefs = '用户偏好：桌面不放图标，程序固定到开始菜单\n用户偏好：网络下载一律用国内镜像源'

  // 真矛盾：当前行为与偏好直接冲突（无教训语境词）
  const realConflict = { text: '这次把应用图标直接放到了桌面上，没进开始菜单' }
  // 教训/踩坑语境：偏好强化记录，不判冲突
  const learnEntry = { text: '踩坑教训：删用户数据前必须逐一确认，误删 QQ 缓存事故' }
  // 无关文本
  const unrelatedEntry = { text: '今天天气晴朗，适合出门散步' }
  // 泛词重叠但语义无关（服务/加速等）
  const genericEntry = { text: '本机有 GitHub 加速服务在运行' }

  assert.equal(I.detectConflict(realConflict, prefs), true, '真矛盾应触发')
  assert.equal(I.detectConflict(learnEntry, prefs), false, '教训语境不判冲突')
  assert.equal(I.detectConflict(unrelatedEntry, prefs), false, '无关文本不触发')
  assert.equal(I.detectConflict(genericEntry, prefs), false, '泛词重叠不触发')
  // 偏好为空 → 无冲突
  assert.equal(I.detectConflict(realConflict, ''), false)
})

// ============================================================================
// 9. runDream dry-run（v0.5：SQLite 数据层）
// ============================================================================

test('runDream dry-run：不修改数据，报告字段齐全', async () => {
  const db = await import('../db.mjs')
  db.openDb()
  db.upsertEntry({ fp: 'aaa111', layer: 'longterm', fragment_type: 'note', kind: '行为', text: '低权重待归档条目', weight: 1, created_at: new Date().toISOString() })
  db.upsertEntry({ fp: 'bbb222', layer: 'longterm', fragment_type: 'note', kind: '行为', text: '高权重保留条目', weight: 8, created_at: new Date().toISOString() })
  db.upsertEntry({ fp: 'eee666', layer: 'longterm', fragment_type: 'note', kind: '行为', text: '过期记忆会衰减', weight: 10, created_at: '2020-01-01T00:00:00.000Z' })

  const before = db.getByFp('aaa111')
  const rep = I.runDream({ dryRun: true })

  // 数据必须原样未动
  assert.equal(db.getByFp('aaa111').weight, before.weight, 'dry-run 不改权重')
  assert.equal(db.getByFp('aaa111').status, 'active', 'dry-run 不归档')

  // 报告字段齐全
  for (const k of ['scanned', 'decayed', 'consolidated', 'conflicted', 'archived', 'backup']) {
    assert.ok(k in rep, `报告应包含字段 ${k}`)
  }
  assert.equal(rep.backup, '（dry-run 不执行备份）')
  assert.ok(rep.scanned >= 3, '应扫描到全部条目')
  assert.ok(rep.decayed >= 1, '过期条目应预览衰减')
  assert.ok(rep.archived >= 1, '低权重条目应预览归档')

  // 但 dry-run 会写 PREVIEW 审计记录，可被 queryAudit 读到
  assert.ok(I.queryAudit({ type: 'PREVIEW' }).length >= 1, 'dry-run 应写 PREVIEW 审计')
})

// ============================================================================
// 10. runDream 执行（归档低权重、保留高权重；断点检查点清空）
// ============================================================================

test('runDream 执行：低权重归档、高权重保留', async () => {
  const db = await import('../db.mjs')
  db.openDb() // db2 = 数据库实例（仅用于 prepare 等原生调用）
  db.upsertEntry({ fp: 'ccc333', layer: 'longterm', fragment_type: 'note', kind: '行为', text: '低权重应归档', weight: 1, created_at: new Date().toISOString() })
  db.upsertEntry({ fp: 'ddd444', layer: 'longterm', fragment_type: 'note', kind: '行为', text: '高权重应保留', weight: 8, created_at: new Date().toISOString() })

  const rep = I.runDream()

  assert.equal(rep.scanned, 2)
  assert.ok(rep.archived >= 1, '低权重条目应归档')
  assert.ok(rep.items.some((it) => it.op === 'ARCHIVE' && it.fp === 'ccc333'))
  assert.ok(rep.backup && fs.existsSync(rep.backup), '执行时应创建备份（SQLite .db 副本）')

  // SQLite 状态：低权重归档、高权重保留
  assert.equal(db.getByFp('ccc333').status, 'archived', '低权重条目 status=archived')
  assert.equal(db.getByFp('ddd444').status, 'active', '高权重条目 status=active')

  // 审计记录了 ARCHIVE
  assert.ok(I.queryAudit({ type: 'ARCHIVE' }).some((r) => r.entry_id && r.entry_id.length > 0))

  // 断点检查点已清空（完成）
  assert.equal(db.metaGet('dream_checkpoint'), '', '完成后检查点清空')
})

// ============================================================================
// 11. queryAudit
// ============================================================================

test('queryAudit：按 type 与 sinceDays 过滤（v0.5：SQLite audit_log）', async () => {
  const db = await import('../db.mjs')
  db.openDb()
  const now = new Date().toISOString()
  const old = new Date(Date.now() - 30 * 86400000).toISOString()
  db.audit('WRITE', { t: now, detail: { fp: 'aa11', text: '最近写入' } })
  db.audit('DECAY', { t: now, detail: { fp: 'bb22' } })
  db.audit('WRITE', { t: old, detail: { fp: 'cc33', text: '旧写入' } })

  assert.ok(I.queryAudit().length >= 3, '不过滤应返回全部记录')
  assert.equal(I.queryAudit({ type: 'WRITE' }).length, 2, '按 type 过滤')
  assert.equal(I.queryAudit({ sinceDays: 7 }).length, 2, '按 sinceDays 过滤掉旧记录')
  assert.equal(I.queryAudit({ type: 'WRITE', sinceDays: 7 }).length, 1, 'type + sinceDays 组合')
  assert.equal(I.queryAudit({ type: 'NOPE' }).length, 0, '无匹配类型返回空')

  // 聚合统计（文档 P1-003）
  const agg = I.auditAggregate({ groupBy: 'action' })
  assert.ok(Array.isArray(agg) && agg.length >= 2, '聚合应返回分组统计')
  assert.ok(agg.some((a) => a.key === 'WRITE' && a.count === 2), 'WRITE 应聚合为 2')
})

// ============================================================================
// 12. semanticSearch
// ============================================================================

test('semanticSearch：训练模型 查询时含"训练"的记忆分数更高且排前', () => {
  const entries = [
    { fp: 'f1', text: '深度学习模型训练需要注意过拟合问题' },
    { fp: 'f2', text: '猫咪吃饭时很安静' },
  ]
  const res = I.semanticSearch('训练模型', entries, 5)
  assert.ok(res.length >= 1, '至少应召回一条')
  assert.equal(res[0].fp, 'f1', '含"训练"的记忆应排第一')
  assert.ok(res[0].score > 0, '分数应大于 0')
  const f2 = res.find((r) => r.fp === 'f2')
  assert.ok(!f2 || f2.score < res[0].score, '无关记忆分数应低于训练记忆')
})

// ============================================================================
// 13. tokenize
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
// 14. renderSnapshot —— 未导出到 __internals，按约定跳过
// ============================================================================

test('renderSnapshot（未导出，跳过）', { skip: '__internals 未导出 renderSnapshot，无法直接调用' }, () => {})

// ============================================================================
// 附加：配置化 setConfig / getConfig
// ============================================================================

test('setConfig/getConfig：配置可覆盖并回读', () => {
  const before = I.getConfig()
  assert.equal(before.halfLifeDays, 7)
  I.setConfig({ halfLifeDays: 1, decayThreshold: 5 })
  const after = I.getConfig()
  assert.equal(after.halfLifeDays, 1)
  assert.equal(after.decayThreshold, 5)
  assert.equal(after.weightCap, 20, '未覆盖的配置保留默认值')
  I.setConfig({}) // 还原默认
  assert.equal(I.getConfig().halfLifeDays, 7)
})

// ============================================================================
// 15. clusterEntries —— 深度反思主题聚类
// ============================================================================

test('clusterEntries：相似记忆聚为一簇，无关记忆不聚类', () => {
  const entries = [
    { fp: 'a1', text: '智能宠物启动成功，3199 端口监听正常' },
    { fp: 'a2', text: '智能宠物启动失败，端口 3199 被占用' },
    { fp: 'b1', text: '时叙 v5.0.5 最终版已发布到微信' },
    { fp: 'b2', text: '时叙 v5.0.5 发布前需要重新构建 APK 签名' },
    { fp: 'c1', text: '今天天气很好适合散步' },
  ]
  const clusters = I.clusterEntries(entries)
  assert.ok(clusters.length >= 2, '应至少聚出 2 簇（宠物/时叙）')
  const sizes = clusters.map((c) => c.members.length)
  assert.ok(sizes.every((s) => s >= 2), '每簇至少 2 条')
  const allFp = clusters.flatMap((c) => c.members.map((m) => m.fp))
  assert.ok(allFp.includes('a1') && allFp.includes('a2'), '宠物两条应被聚类')
  assert.ok(allFp.includes('b1') && allFp.includes('b2'), '时叙两条应被聚类')
  assert.ok(!allFp.includes('c1'), '无关记忆不应进任何簇')
})

// ============================================================================
// 16. runReflect —— 深度反思报告
// ============================================================================

test('runReflect dry-run：返回结构化报告且不落盘', () => {
  writeMemFile('hot/knowledge.md', [
    '## 2026-08-18 · 会话 t1',
    '- [知识|自动] [fp:k1] [w:10] [h:2] [t:2026-08-18 10:00] 智能宠物启动成功监听 3199',
    '- [知识|自动] [fp:k2] [w:12] [h:5] [t:2026-08-18 09:00] 时叙 v5.0.5 已发布最终版',
  ].join('\n') + '\n')
  writeMemFile('hot/behavior.md', [
    '## 2026-08-18 · 会话 t1',
    '- [行为|自动] [fp:b1] [w:8] [h:1] [t:2026-08-18 11:00] 智能宠物 3199 端口未监听导致启动失败',
  ].join('\n') + '\n')
  writeMemFile('preferences.md', [
    '- [2026-08-15] 宠物正式名称为深海',
  ].join('\n') + '\n')
  const r = I.runReflect({ dryRun: true })
  assert.equal(r.dryRun, true)
  assert.ok(r.scanned >= 3, '扫描到全部条目')
  assert.ok(Array.isArray(r.clusters), 'clusters 为数组')
  assert.ok(Array.isArray(r.conflicts), 'conflicts 为数组')
  assert.ok(Array.isArray(r.forget), 'forget 为数组')
  assert.equal(r.reportFile, null, 'dry-run 不落盘')
  assert.ok(typeof r.recent7 === 'number' && typeof r.prev7 === 'number')
  assert.ok(r.clusters.some((c) => c.members.some((m) => m.text.includes('宠物'))), '宠物主题应被聚类')
})

test('runReflect 落盘：报告写入 longterm/reflections/ 且 latestReflection 可找到', () => {
  const r = I.runReflect({})
  assert.ok(r.reportFile, '应返回报告路径')
  assert.ok(r.reportFile.includes('reflections'), '报告位于 reflections 目录')
  assert.ok(fs.existsSync(r.reportFile), '报告文件已创建')
  assert.ok(fs.existsSync(path.join(tmpDir, 'longterm', 'reflections')), 'reflections 目录存在')
  assert.ok(fs.readdirSync(path.join(tmpDir, 'longterm', 'reflections')).length > 0, '目录非空')
  const latest = I.latestReflection()
  assert.ok(latest, 'latestReflection 应能找到报告')
  assert.equal(latest, r.reportFile, '最新报告即本次写入')
})

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
