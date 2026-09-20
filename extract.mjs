// ============================================================================
// dsh-biomemory · 按需抽取（extract.mjs，v0.9.0）
//
// 设计（用户 2026-09-20 拍板，取代"每 N 轮自动抽取"）：
//   **不改用后台自动抽取**——那会持续烧 token。改为面板上一个按钮：
//   点一下 → 取「当前会话的最新对话」→ 交给 LLM 抽成候选记忆 → 经去重/合并后入库。
//   好处：只在用户想要时花钱；且不需要另配模型（复用 DSH 现有 LLM 服务与提供方）。
//
// 数据来源用官方契约，不碰会话日志文件：
//   ctx.sessions.get(sessionId).deriveMessages()   // 模型可见的 Message[]（增量缓存）
// 抽取调用用官方 LLM 服务：
//   ctx.llm.stream({ provider, model, messages: [...] })   // 流式分片，终止 finish
//
// 本模块只放**纯函数**（可单测）+ 一个把依赖注入进来的编排函数；宿主/服务接线在 index.mjs。
// ============================================================================

// ---------- 1. 会话 → 有界 transcript ----------

/** 把 Message[] 渲染成有界文本。只保留文本内容块；从**尾部**开始取，保证"最新对话"优先。
 *  message 形态来自官方 dsh-session：{ role, content: [{ type:'text', text }] }（兼容字符串 content）。 */
export function buildTranscript(messages, { maxChars = 12000 } = {}) {
  const lines = []
  for (const m of Array.isArray(messages) ? messages : []) {
    const role = m && typeof m.role === 'string' ? m.role : 'unknown'
    if (role === 'system') continue // 系统提示词不是"对话内容"
    const text = messageText(m)
    if (!text) continue
    lines.push(`[${role}] ${text}`)
  }
  let out = ''
  for (let i = lines.length - 1; i >= 0; i--) {
    const next = lines[i].length + 1 + out.length
    if (next > maxChars) {
      // 单条就超限：截断这一条并停止（保最新）
      const room = maxChars - out.length - 1
      if (room > 80 && out === '') out = lines[i].slice(0, room)
      break
    }
    out = out === '' ? lines[i] : `${lines[i]}\n${out}`
  }
  return out.trim()
}

function messageText(m) {
  const content = m && m.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const b of content) {
    if (!b) continue
    if (typeof b === 'string') { parts.push(b); continue }
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text)
    // 工具结果/图片等不进 transcript：抽取记忆只需要自然语言上下文
  }
  return parts.join('\n').trim()
}

// ---------- 2. 抽取提示词与结果解析 ----------

export const EXTRACT_SYSTEM = [
  '你是一个记忆抽取器。输入是一段助手与用户的对话记录。',
  '任务：只抽取**值得长期记住**的内容，输出严格的 JSON 数组，不要任何解释文字。',
  '每个元素形如：{"type":"preference|decision|lesson|fact","text":"<一句完整、自包含的中文陈述>","confidence":0.0~1.0,"source":"user|assistant"}',
  '判定标准：',
  '- preference：用户表达的稳定偏好、口味、规矩（"我喜欢/我要求/以后都…"）',
  '- decision：用户拍板或确认过的项目决策、方案取舍（"就这么办/改成…"）',
  '- lesson：踩坑、事故、纠正、以后要避免的做法（含助手发现的真缺陷）',
  '- fact：其它环境/项目事实（路径、版本、约定）。能被代码或文件直接读出来的不要抽。',
  '硬性要求：宁可少抽也不要凑数；纯寒暄、一次性问答、当前任务的过程细节一律不抽；',
  'text 必须自包含（不依赖上下文代词），包含必要的时间/路径/命令；同一条内容不要拆成多条。',
  '没有值得记住的内容时输出空数组 []。',
].join('\n')

/** 从模型输出里稳健地取出 JSON 数组（容忍 ```json 围栏与前后废话）。 */
export function parseCandidates(raw) {
  const s = String(raw ?? '')
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let arr
  try { arr = JSON.parse(s.slice(start, end + 1)) } catch { return [] }
  if (!Array.isArray(arr)) return []
  const TYPES = new Set(['preference', 'decision', 'lesson', 'fact'])
  const out = []
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue
    const text = String(it.text ?? '').trim()
    if (text.length < 8) continue
    const type = TYPES.has(String(it.type)) ? String(it.type) : 'fact'
    const conf = Number(it.confidence)
    out.push({
      type,
      text,
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
      source: String(it.source) === 'user' ? 'user' : 'assistant',
    })
  }
  return out
}

/** 置信度门 + 去重（同批内文本指纹去重）。 */
export function gateCandidates(cands, { minConfidence = 0.6 } = {}) {
  const kept = []
  const seen = new Set()
  let droppedLow = 0
  let droppedDup = 0
  for (const c of Array.isArray(cands) ? cands : []) {
    if (c.confidence < minConfidence) { droppedLow++; continue }
    const key = c.text.replace(/\s+/g, '')
    if (seen.has(key)) { droppedDup++; continue }
    seen.add(key)
    kept.push(c)
  }
  return { kept, droppedLow, droppedDup }
}

/** 抽取结果 → memory 写入参数（track 由类型决定：偏好/决策/事实=user，教训=agent）。 */
export function toWriteArgs(cand) {
  const track = cand.type === 'lesson' ? 'agent' : 'user'
  return { track, text: cand.text, source: `extract:${cand.type}:${cand.confidence}` }
}

// ---------- 3. 拼接 LLM 请求文本 ----------

export function buildExtractUserText(transcript) {
  return ['以下是要抽取的对话记录（从旧到新）：', '', transcript, '', '请输出 JSON 数组：'].join('\n')
}

// ---------- 4. 编排（依赖注入，便于测试与宿主接线） ----------

/**
 * @param {object} deps
 *   deps.getMessages  () => Message[]           取当前会话消息（宿主用 ctx.sessions.get(id).deriveMessages()）
 *   deps.callModel    (system, user) => string  调用 LLM 返回文本（宿主用 ctx.llm.stream 组装）
 *   deps.write        (args) => object          写库（宿主用 store.writeEntry，走同一套去重/合并/审计）
 *   deps.audit        (action, payload) => void
 * @param {object} opts  { maxChars, minConfidence, dryRun }
 */
export async function runExtract(deps, opts = {}) {
  const maxChars = Number(opts.maxChars) > 500 ? Number(opts.maxChars) : 12000
  const minConfidence = Number.isFinite(Number(opts.minConfidence)) ? Number(opts.minConfidence) : 0.6
  const report = { transcriptChars: 0, candidates: 0, kept: 0, droppedLow: 0, droppedDup: 0, written: 0, merged: 0, skipped: 0, failed: 0, items: [], dryRun: opts.dryRun === true, transcript: '' }

  const messages = await deps.getMessages()
  const transcript = buildTranscript(messages, { maxChars })
  report.transcriptChars = transcript.length
  report.transcript = transcript
  if (!transcript) { report.note = '没有可抽取的对话内容（会话为空或全为系统消息）'; return report }
  // v0.8.1：「只预览」模式——把将要发送的 transcript 回给 UI，**不调用模型、零 token**
  if (opts.transcriptOnly === true) { report.previewOnly = true; return report }

  const raw = await deps.callModel(EXTRACT_SYSTEM, buildExtractUserText(transcript))
  const cands = parseCandidates(raw)
  report.candidates = cands.length
  const { kept, droppedLow, droppedDup } = gateCandidates(cands, { minConfidence })
  report.kept = kept.length
  report.droppedLow = droppedLow
  report.droppedDup = droppedDup

  for (const c of kept) {
    report.items.push({ type: c.type, confidence: c.confidence, text: c.text.slice(0, 120) })
    if (report.dryRun) continue
    try {
      const r = await deps.write(toWriteArgs(c))
      if (r && r.merged) report.merged++
      else if (r && r.skipped) report.skipped++
      else report.written++
    } catch (err) {
      report.failed++
      report.items[report.items.length - 1].error = err instanceof Error ? err.message : String(err)
    }
  }
  if (!report.dryRun && typeof deps.audit === 'function') {
    deps.audit('EXTRACT', { detail: { transcriptChars: report.transcriptChars, candidates: report.candidates, kept: report.kept, written: report.written, merged: report.merged, skipped: report.skipped, failed: report.failed, minConfidence } })
  }
  return report
}
