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

// ---------- 隔离环境：临时记忆根 ----------

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biomem-'))
process.env.DSH_MEMORY_ROOT = tmpDir

// 必须在设置 DSH_MEMORY_ROOT 之后再加载被测模块（MEMORY_ROOT 在 import 时读取）
const mod = await import('../index.mjs')
const I = mod.__internals

after(() => {
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
// 7. setPin / unpin
// ============================================================================

test('setPin：pin 后条目 pinned=true，unpin 恢复', () => {
  writeMemFile(
    'hot/behavior.md',
    [
      '## 2026-08-16 13:00 · 会话 test',
      '- [行为|自动] [fp:e5e5e5] 需要钉住的记忆条目',
      '',
    ].join('\n')
  )

  const r1 = I.setPin('e5e5e5', true)
  assert.equal(r1.ok, true)
  assert.equal(r1.pinned, true)

  let content = readMemFile('hot/behavior.md')
  assert.ok(content.includes('[pin]'), 'pin 后文件应含 [pin] 标记')
  assert.equal(firstEntry('hot/behavior.md').pinned, true)

  const r2 = I.setPin('e5e5e5', false)
  assert.equal(r2.ok, true)
  assert.equal(r2.pinned, false)

  content = readMemFile('hot/behavior.md')
  assert.ok(!content.includes('[pin]'), 'unpin 后文件不应含 [pin] 标记')
  assert.equal(firstEntry('hot/behavior.md').pinned, false)

  const r3 = I.setPin('zzzzzz', true)
  assert.equal(r3.ok, false)
  assert.ok(r3.error.includes('未找到'))
})

// ============================================================================
// 8. detectConflict
// ============================================================================

test('detectConflict：≥4 个相同中文双字 → true，无关文本 → false', () => {
  const prefs = '用户偏好：必须早睡早起，坚持规律作息，不要熬夜，饮食清淡健康'

  const conflictEntry = { text: '用户不要熬夜，喜欢规律作息，必须早睡早起' }
  const unrelatedEntry = { text: '今天天气晴朗，适合出门散步' }

  assert.equal(I.detectConflict(conflictEntry, prefs), true)
  assert.equal(I.detectConflict(unrelatedEntry, prefs), false)
  // 偏好为空 → 无冲突
  assert.equal(I.detectConflict(conflictEntry, ''), false)
})

// ============================================================================
// 9. runDream dry-run
// ============================================================================

test('runDream dry-run：不修改文件，报告字段齐全', () => {
  writeMemFile(
    'hot/behavior.md',
    [
      '## 2026-08-16 13:00 · 会话 test',
      '- [行为|自动] [fp:aaa111] [w:1] 低权重待归档条目',
      '- [行为|自动] [fp:bbb222] [w:8] 高权重保留条目',
      '- [行为|自动] [fp:eee666] [w:10] [t:2020-01-01 00:00] 过期记忆会衰减',
      '',
    ].join('\n')
  )

  const before = readMemFile('hot/behavior.md')
  const rep = I.runDream({ dryRun: true })

  // 记忆文件必须原样未动
  assert.equal(readMemFile('hot/behavior.md'), before)

  // 报告字段齐全
  for (const k of ['scanned', 'decayed', 'consolidated', 'conflicted', 'archived', 'backup']) {
    assert.ok(k in rep, `报告应包含字段 ${k}`)
  }
  assert.equal(rep.backup, '（dry-run 不执行备份）')
  assert.ok(rep.scanned >= 3, '应扫描到全部条目')
  assert.ok(rep.decayed >= 1, '过期条目应预览衰减')
  assert.ok(rep.archived >= 1, '低权重条目应预览归档')

  // dry-run 不落盘：archive 目录下不应生成归档文件
  const arcDir = path.join(tmpDir, 'archive')
  if (fs.existsSync(arcDir)) {
    assert.equal(fs.readdirSync(arcDir).length, 0, 'dry-run 不应生成归档文件')
  }

  // 但 dry-run 会写 PREVIEW 审计记录（审计在 tmpDir 内），可被 queryAudit 读到
  assert.ok(I.queryAudit({ type: 'PREVIEW' }).length >= 1, 'dry-run 应写 PREVIEW 审计')
})

// ============================================================================
// 10. runDream 执行（归档低权重、保留高权重）
// ============================================================================

test('runDream 执行：低权重归档、高权重保留', () => {
  writeMemFile(
    'hot/behavior.md',
    [
      '## 2026-08-16 13:00 · 会话 test',
      '- [行为|自动] [fp:ccc333] [w:1] 低权重应归档',
      '- [行为|自动] [fp:ddd444] [w:8] 高权重应保留',
      '',
    ].join('\n')
  )

  const rep = I.runDream()

  assert.equal(rep.scanned, 2)
  assert.ok(rep.archived >= 1, '低权重条目应归档')
  assert.ok(rep.items.some((it) => it.op === 'ARCHIVE' && it.fp === 'ccc333'))
  assert.ok(rep.backup && fs.existsSync(rep.backup), '执行时应创建备份目录')

  // 归档文件出现在 archive/
  const arcDir = path.join(tmpDir, 'archive')
  assert.ok(fs.existsSync(arcDir), 'archive 目录应存在')
  const arcContent = fs.readdirSync(arcDir).map((f) => readMemFile(path.join('archive', f))).join('')
  assert.ok(arcContent.includes('ccc333'), '归档文件应包含低权重条目')

  // 原文件：低权重条目被移除，高权重条目保留
  const after = readMemFile('hot/behavior.md')
  assert.ok(!after.includes('ccc333'), '低权重条目应从原文件移除')
  assert.ok(after.includes('ddd444'), '高权重条目应保留在原文件')

  // 审计记录了 ARCHIVE
  assert.ok(I.queryAudit({ type: 'ARCHIVE' }).some((r) => r.fp === 'ccc333'))

  // latestBackup 能定位到刚才的备份
  const lb = I.latestBackup()
  assert.ok(lb, 'latestBackup 应返回备份目录')
  assert.equal(fs.existsSync(path.join(lb, 'behavior.md')), true)
})

// ============================================================================
// 11. queryAudit
// ============================================================================

test('queryAudit：按 type 与 sinceDays 过滤', () => {
  const now = new Date().toISOString()
  const old = new Date(Date.now() - 30 * 86400000).toISOString()
  fs.writeFileSync(
    path.join(tmpDir, 'audit.jsonl'),
    [
      JSON.stringify({ t: now, event: 'WRITE', fp: 'aa11', text: '最近写入' }),
      JSON.stringify({ t: now, event: 'DECAY', fp: 'bb22' }),
      JSON.stringify({ t: old, event: 'WRITE', fp: 'cc33', text: '旧写入' }),
      'not json line', // 坏行应被跳过
      '',
    ].join('\n'),
    'utf-8'
  )

  assert.equal(I.queryAudit().length, 3, '不过滤应返回全部合法记录')
  assert.equal(I.queryAudit({ type: 'WRITE' }).length, 2, '按 type 过滤')
  assert.equal(I.queryAudit({ sinceDays: 7 }).length, 2, '按 sinceDays 过滤掉旧记录')
  assert.equal(I.queryAudit({ type: 'WRITE', sinceDays: 7 }).length, 1, 'type + sinceDays 组合')
  assert.deepEqual(I.queryAudit({ type: 'WRITE', sinceDays: 7 }).map((r) => r.fp), ['aa11'])
  assert.equal(I.queryAudit({ type: 'NOPE' }).length, 0, '无匹配类型返回空')
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
