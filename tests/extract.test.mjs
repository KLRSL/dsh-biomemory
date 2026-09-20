// ============================================================================
// v0.9.0 按需抽取（extract.mjs）单元测试——纯函数 + 依赖注入编排，不触网、不碰模型
// ============================================================================
import { test } from 'node:test'
import assert from 'node:assert/strict'

const E = await import('../extract.mjs')

const msg = (role, text) => ({ role, content: [{ type: 'text', text }] })

test('buildTranscript：跳过 system、保留角色前缀、只取尾部', () => {
  const messages = [
    msg('system', '你是助手'.repeat(50)),
    msg('user', '第一轮问题'),
    msg('assistant', '第一轮回答'),
    msg('user', '第二轮问题'),
  ]
  const t = E.buildTranscript(messages, { maxChars: 1000 })
  assert.ok(!t.includes('你是助手'), 'system 消息不进 transcript')
  assert.ok(t.startsWith('[user] 第一轮问题'))
  assert.ok(t.endsWith('[user] 第二轮问题'))

  const tail = E.buildTranscript(messages, { maxChars: 20 })
  assert.ok(tail.includes('第二轮问题'), '超限时保最新一条')
  assert.ok(!tail.includes('第一轮问题'))
})

test('buildTranscript：兼容字符串 content，忽略工具块', () => {
  const messages = [
    { role: 'user', content: '纯字符串内容' },
    { role: 'assistant', content: [{ type: 'tool_use', name: 'x' }, { type: 'text', text: '可见文本' }] },
  ]
  const t = E.buildTranscript(messages)
  assert.ok(t.includes('[user] 纯字符串内容'))
  assert.ok(t.includes('[assistant] 可见文本'))
})

test('parseCandidates：容忍围栏与废话，校验类型，钳制 confidence，过滤过短', () => {
  const raw = '好的，结果如下：\n```json\n[{"type":"preference","text":"用户偏好简短汇报","confidence":1.4,"source":"user"},{"type":"nope","text":"类型非法归为 fact 处理","confidence":-1},{"type":"lesson","text":"太短"}]\n```\n以上。'
  const c = E.parseCandidates(raw)
  assert.equal(c.length, 2)
  assert.equal(c[0].type, 'preference')
  assert.equal(c[0].confidence, 1, 'confidence 上限钳到 1')
  assert.equal(c[1].type, 'fact')
  assert.equal(c[1].confidence, 0)
  assert.deepEqual(E.parseCandidates('不是 JSON'), [])
  assert.deepEqual(E.parseCandidates(''), [])
})

test('gateCandidates：置信度门 + 同批去重', () => {
  const cands = [
    { type: 'fact', text: '这条置信度够高会被保留', confidence: 0.9 },
    { type: 'fact', text: '这条置信度太低会被丢掉', confidence: 0.3 },
    { type: 'fact', text: '这条置信度够高会被保留', confidence: 0.8 },
  ]
  const r = E.gateCandidates(cands, { minConfidence: 0.6 })
  assert.equal(r.kept.length, 1)
  assert.equal(r.droppedLow, 1)
  assert.equal(r.droppedDup, 1)
})

test('toWriteArgs：教训走 agent，其余走 user', () => {
  assert.equal(E.toWriteArgs({ type: 'lesson', text: 'x', confidence: 0.9 }).track, 'agent')
  assert.equal(E.toWriteArgs({ type: 'preference', text: 'x', confidence: 0.9 }).track, 'user')
  assert.equal(E.toWriteArgs({ type: 'decision', text: 'x', confidence: 0.9 }).track, 'user')
})

test('runExtract：编排——空会话直接返回、干跑不写库、写入/合并/跳过分别计数', async () => {
  // 空会话
  const empty = await E.runExtract({ getMessages: async () => [] })
  assert.equal(empty.written, 0)
  assert.ok(empty.note)

  const deps = {
    getMessages: async () => [msg('user', '以后都用中文，并且只发文字汇报。')],
    callModel: async () => JSON.stringify([
      { type: 'preference', text: '用户要求：以后都用中文沟通，且只发文字汇报', confidence: 0.95, source: 'user' },
      { type: 'fact', text: '置信度不足的候选', confidence: 0.2 },
    ]),
    write: async (args) => (args.text.includes('中文') ? { ok: true } : { ok: true, merged: true }),
    audit: () => {},
  }
  const dry = await E.runExtract(deps, { dryRun: true })
  assert.equal(dry.kept, 1)
  assert.equal(dry.droppedLow, 1)
  assert.equal(dry.written, 0, 'dry-run 不写库')
  assert.equal(dry.dryRun, true)

  const real = await E.runExtract(deps, {})
  assert.equal(real.written, 1)
  assert.equal(real.failed, 0)
  assert.equal(real.transcriptChars > 0, true)
})

test('runExtract：写库抛错不中断整批（failed 计数并记在条目上）', async () => {
  const deps = {
    getMessages: async () => [msg('user', '随便一段对话内容用于抽取')],
    callModel: async () => JSON.stringify([
      { type: 'fact', text: '第一条候选内容足够长可以保留下来', confidence: 0.9 },
      { type: 'fact', text: '第二条候选内容也足够长但写库会失败', confidence: 0.9 },
    ]),
    write: async (args) => { if (args.text.startsWith('第二条')) throw new Error('boom'); return { ok: true } },
  }
  const r = await E.runExtract(deps, {})
  assert.equal(r.written, 1)
  assert.equal(r.failed, 1)
  assert.equal(r.items[1].error, 'boom')
})
