// ============================================================================
// dsh-biomemory — 生物仿生记忆系统（DSH 插件化 · 按官方插件文档重构）
//
// 目标运行时：@deepseek-ai/dsh-* 0.1.0-rc.5（host runtime 实测契约，2026-08-15）
//
// 数据层：纯文件 Markdown（默认 ~/.dsh/memory，DSH_MEMORY_ROOT 可覆盖，透明可读改），三层双通道：
//   hot\behavior.md / hot\knowledge.md     L1 运行时热记忆
//   projects\<项目>\...                     L2 项目档案
//   longterm\...                            L3 长期记忆体
//   preferences.md                          用户/项目偏好（最高优先级）
//
// 能力（全部按官方文档实现）：
//   1. memory 工具：add / query / remove / list（ToolDefinition.execute 契约）
//   2. 冻结快照注入：systemPrompt.section({ name, order, text })，会话启动冻结
//   3. 分级审批门：重要记忆走 approval.request（ask），普通事实 auto；
//      approval 按官方建议用 ctx.get('approval') 可选消费，缺失时 fail closed
//   4. 审计日志：每次写入落 audit 文件，可追溯
//   5. /memory 命令：经 ctx.inject(['commands']) 可选挂载（官方可选服务模式）
//   6. memory_recall：跨会话召回（读记忆文件全文）
//
// 官方契约要点（rc.5，逐条核对过 lib 源码）：
//   - 工具体签名是 execute(args, exec)，不是 call()；exec.agent.id 即会话 id
//   - output.render(args, value) 必须返回 ContentBlock[]（[{type:'text',text}]）
//   - 工具参数 schema 字段名是 parameters（JSON Schema 对象）
//   - PromptSection = { name, order, text }；缺 name/text 会破坏提示词装配
//   - approval.request(req) → 'allowed-once'|'rejected'|'cancelled'|'unavailable'
//   - 命令 handler(invocation) -> { kind: 'success'|'error', text }
//   - 可选服务用 ctx.inject([name], child => ...)，不用反射 hack
// ============================================================================

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import os from 'node:os'

export const inject = ['tools', 'systemPrompt']

// 记忆根目录：默认 ~/.dsh/memory（可用环境变量 DSH_MEMORY_ROOT 覆盖）
const MEMORY_ROOT = process.env.DSH_MEMORY_ROOT || path.join(os.homedir(), '.dsh', 'memory')
const TOOL_NAME = 'memory'
const REQUEST_MARKER = '[dsh-biomemory]'

// ---------- 数据层：Markdown 文件读写（透明、可读改） ----------

const PATHS = {
  hotBehavior: path.join(MEMORY_ROOT, 'hot', 'behavior.md'),
  hotKnowledge: path.join(MEMORY_ROOT, 'hot', 'knowledge.md'),
  preferences: path.join(MEMORY_ROOT, 'preferences.md'),
  audit: path.join(MEMORY_ROOT, 'audit.log'),
}

function ensureDirs() {
  for (const dir of [path.join(MEMORY_ROOT, 'hot'), path.join(MEMORY_ROOT, 'projects'), path.join(MEMORY_ROOT, 'longterm')]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function readFile(p) {
  try { return fs.readFileSync(p, 'utf-8') } catch { return '' }
}

function appendFile(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.appendFileSync(p, text, 'utf-8')
}

function nowStamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 桌宠联动：完全可选（默认关闭）。通过配置 petEndpoint（本地通知服务 URL）启用。
// 开源版本不含任何硬编码地址/端口，启用与否、指向哪里完全由部署者配置决定。
let PET_ENDPOINT = null

function petRequest(pathname, payload, timeoutMs = 1200) {
  if (!PET_ENDPOINT) return
  try {
    const u = new URL(PET_ENDPOINT)
    const req = http.request({
      host: u.hostname,
      port: u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80),
      path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) },
      timeout: timeoutMs,
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => { /* 桌宠不在线则静默 */ })
    req.end(payload)
  } catch { /* ignore */ }
}

function petNotify(title, text) {
  petRequest('/notify', JSON.stringify({ title, text: text.slice(0, 60), seconds: 5, kind: '记忆' }))
}

function fingerprint(text) {
  // 内容前 20 字的简单指纹（去重用）
  const t = text.replace(/\s+/g, '').slice(0, 20)
  let h = 0
  for (let i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

function isImportant(text, track) {
  // 分级：用户偏好/项目决策/禁忌教训 = 重要（需审批）；普通事实 = 自动
  // 只用语义强关键词（避免"审批""警告"等元词误判描述性文本）
  const importantHints = /偏好|喜欢|不要|禁止|必须|以后都|正式名|规则|决策|教训|踩坑|千万|千万别|禁忌|红线|不得/
  return track === 'user' || importantHints.test(text)
}

// 写入记忆（带审计；approval 在调用方 gate）
function writeEntry({ track, text, sessionId, approved }) {
  ensureDirs()
  const fp = fingerprint(text)
  // 去重：检查同文件近期是否有相同指纹
  const file = track === 'user' ? PATHS.hotKnowledge : PATHS.hotBehavior
  const existing = readFile(file)
  if (existing.includes(`[fp:${fp}]`)) {
    return { ok: true, skipped: true, reason: 'duplicate' }
  }
  const stamp = nowStamp()
  const line = `- [${track === 'user' ? '知识' : '行为'}|${approved ? '审批' : '自动'}] [fp:${fp}] ${text}\n`
  appendFile(file, `## ${stamp} · 会话 ${sessionId || '?'}\n${line}`)
  // 审计
  appendFile(PATHS.audit, `[${stamp}] ${approved ? 'APPROVED' : 'AUTO'} ${track} ${fp} :: ${text.slice(0, 80)}\n`)
  // 偏好同步
  if (track === 'user') {
    appendFile(PATHS.preferences, `- [${stamp}] ${text}\n`)
  }
  // 桌宠气泡通知（可选本地联动，默认关闭）
  petNotify('记忆已保存', `${track === 'user' ? '偏好' : '经验'}：${text}`)
  return { ok: true, fp }
}

function queryEntries(query, limit = 20) {
  const out = []
  for (const [label, p] of [
    ['hot/behavior', PATHS.hotBehavior],
    ['hot/knowledge', PATHS.hotKnowledge],
    ['preferences', PATHS.preferences],
  ]) {
    const text = readFile(p)
    for (const line of text.split('\n')) {
      if (!line.startsWith('- [')) continue
      if (!query || line.toLowerCase().includes(query.toLowerCase())) {
        out.push({ layer: label, text: line.replace(/^-\s*\[[^\]]*\]\s*/, '') })
      }
    }
  }
  // 项目档案 + 长期记忆体也扫
  for (const dir of [path.join(MEMORY_ROOT, 'projects'), path.join(MEMORY_ROOT, 'longterm')]) {
    if (!fs.existsSync(dir)) continue
    const walk = (d) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, f.name)
        if (f.isDirectory()) walk(full)
        else if (f.name.endsWith('.md')) {
          for (const line of readFile(full).split('\n')) {
            if ((line.startsWith('- ') || line.startsWith('-[')) && (!query || line.toLowerCase().includes(query.toLowerCase()))) {
              out.push({ layer: path.relative(MEMORY_ROOT, full), text: line.replace(/^-\s*\[[^\]]*\]\s*/, '') })
            }
          }
        }
      }
    }
    walk(dir)
  }
  return out.slice(0, limit)
}

// ---------- 冻结快照（会话启动注入 system prompt；注册即冻结） ----------

function renderSnapshot() {
  const prefs = readFile(PATHS.preferences).trim()
  const kb = readFile(PATHS.hotKnowledge).trim()
  const bb = readFile(PATHS.hotBehavior).trim()
  const parts = []
  if (prefs) parts.push('## 用户偏好（最高优先级）\n' + prefs)
  if (kb) parts.push('## 近期知识记忆\n' + kb)
  if (bb) parts.push('## 近期行为记忆\n' + bb)
  if (!parts.length) return ''
  return `# 记忆快照（dsh-biomemory，会话冻结）\n\n${parts.join('\n\n')}`
}

// ---------- 审批门（分级：重要 ask / 普通 auto；approval 可选消费） ----------

async function gateWrite(ctx, { track, text }) {
  const important = isImportant(text, track)
  if (!important) {
    // 普通事实：auto 放行（记录来源）
    return { approved: true, mode: 'auto' }
  }
  // 重要记忆：走审批瀑布（官方：ctx.approval 可选，缺失即 fail closed）
  const approval = ctx.get('approval')
  if (!approval) {
    return { approved: false, mode: 'ask', outcome: 'unavailable' }
  }
  try {
    const outcome = await approval.request({
      toolName: TOOL_NAME,
      reason: `${REQUEST_MARKER} add ${track}\n${text}`,
    })
    return { approved: outcome === 'allowed-once', mode: 'ask', outcome }
  } catch {
    // 无 answerer / 失败封闭：拒绝写入（fail closed）
    return { approved: false, mode: 'ask', outcome: 'unavailable' }
  }
}

// ---------- 工具定义（官方 ToolDefinition：parameters + output + execute） ----------

function makeMemoryTool(ctx) {
  return {
    name: TOOL_NAME,
    description: [
      '跨会话记忆系统：保存/查询值得记住的事实、偏好、教训。',
      '用法: memory action=add text="..." [track=user|agent] —— 保存（重要项会自动请求审批）',
      '      memory action=query text="关键词" —— 查询（不传 text 列出全部）',
      '      memory action=remove fp="指纹" —— 删除一条（按指纹）',
      '      memory action=list —— 列出全部条目',
      '保存原则：用户偏好/纠正/项目决策/踩坑教训要保存；琐事、一次性路径、可从代码重新推导的事实不保存。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'query', 'remove', 'list'], description: '操作' },
        text: { type: 'string', description: 'add 的内容 或 query 的关键词' },
        track: { type: 'string', enum: ['user', 'agent'], description: 'user=用户偏好/知识；agent=行为/教训（默认 agent）' },
        fp: { type: 'string', description: 'remove 时按指纹删除' },
      },
      required: ['action'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          error: { type: 'string' },
          skipped: { type: 'boolean' },
          reason: { type: 'string' },
          fp: { type: 'string' },
          mode: { type: 'string' },
          note: { type: 'string' },
          entries: {
            type: 'array',
            items: { type: 'object', properties: { layer: { type: 'string' }, text: { type: 'string' } }, additionalProperties: true },
          },
        },
        required: ['ok'],
      },
      render(args, value) {
        // 官方契约：render 必须返回 ContentBlock[]（[{type:'text',text}]）
        if (!value.ok) return [{ type: 'text', text: value.error || 'memory 操作失败' }]
        if (Array.isArray(value.entries)) {
          if (!value.entries.length) return [{ type: 'text', text: '（无匹配记忆）' }]
          return [{ type: 'text', text: value.entries.map((e) => `- [${e.layer}] ${e.text}`).join('\n') }]
        }
        if (value.skipped) return [{ type: 'text', text: '重复记忆，已跳过' }]
        if (value.note) return [{ type: 'text', text: value.note }]
        return [{ type: 'text', text: `已保存 [fp:${value.fp}]（${value.mode || 'auto'}）` }]
      },
    },
    // 官方可选 UI 呈现：调用中卡片
    presentCall(args) {
      return { card: 'generic', title: `记忆：${args?.action || ''}`, kind: 'other', rawInput: args }
    },
    async execute(args, exec) {
      const { action, text = '', track = 'agent', fp } = args || {}
      const sessionId = exec.agent?.id
      if (action === 'add') {
        if (!text.trim()) return { ok: false, error: 'text 必填' }
        const g = await gateWrite(ctx, { track, text: text.trim() })
        if (!g.approved) return { ok: false, error: `写入未获批准（${g.outcome || 'denied'}）——重要记忆需人工审批` }
        const r = writeEntry({ track, text: text.trim(), sessionId, approved: g.mode === 'ask' })
        return { ok: true, ...r, mode: g.mode }
      }
      if (action === 'query') return { ok: true, entries: queryEntries(text) }
      if (action === 'list') return { ok: true, entries: queryEntries('') }
      if (action === 'remove') {
        if (!fp) return { ok: false, error: 'fp 必填（先 query 找到指纹）' }
        return { ok: true, note: `删除请在 ${MEMORY_ROOT} 中按指纹手动编辑（保持文件透明可改）` }
      }
      return { ok: false, error: '未知 action' }
    },
  }
}

function makeRecallTool() {
  return {
    name: 'memory_recall',
    description: '跨会话记忆召回：查询长期记忆体与项目档案（与 memory query 相同，语义上用于"你还记得…吗"场景）',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: '查询关键词' } },
      required: ['text'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          entries: {
            type: 'array',
            items: { type: 'object', properties: { layer: { type: 'string' }, text: { type: 'string' } }, additionalProperties: true },
          },
        },
        required: ['ok'],
      },
      render(args, value) {
        if (!Array.isArray(value.entries) || !value.entries.length) return [{ type: 'text', text: '（无匹配记忆）' }]
        return [{ type: 'text', text: value.entries.map((e) => `- [${e.layer}] ${e.text}`).join('\n') }]
      },
    },
    presentCall(args) {
      return { card: 'generic', title: '记忆召回', kind: 'other', rawInput: args }
    },
    async execute(args) {
      return { ok: true, entries: queryEntries((args || {}).text || '') }
    },
  }
}

// ---------- 命令（官方可选服务模式：ctx.inject(['commands'], child => ...)） ----------

function registerMemoryCommand(ctx) {
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'memory',
      description: '记忆管理：list / query <词> / add <内容> / remove <fp> / audit',
      handler(invocation) {
        const { rawInput, agent } = invocation
        const [verb, ...rest] = (rawInput || '').trim().split(/\s+/)
        const q = rest.join(' ')
        const sessionId = agent?.id
        if (verb === 'list') {
          const es = queryEntries('')
          return { kind: 'success', text: es.length ? es.map((e) => `- [${e.layer}] ${e.text}`).join('\n') : '（记忆为空）' }
        }
        if (verb === 'query') {
          const es = queryEntries(q)
          return { kind: 'success', text: es.length ? es.map((e) => `- [${e.layer}] ${e.text}`).join('\n') : `（无匹配：${q}）` }
        }
        if (verb === 'add') {
          if (!q) return { kind: 'success', text: '用法: /memory add <内容>' }
          // 命令由人类直接发起：本人即审批者，且命令不在模型 turn 内（approval.request 要求 open turn）
          const r = writeEntry({ track: 'agent', text: q, sessionId, approved: true })
          return { kind: 'success', text: r.skipped ? '重复，已跳过' : `已保存 [fp:${r.fp}]（人类发起）` }
        }
        if (verb === 'remove') {
          return { kind: 'success', text: `删除请直接编辑 ${MEMORY_ROOT} 对应文件（保持透明可改）` }
        }
        if (verb === 'audit') {
          return { kind: 'success', text: readFile(PATHS.audit).slice(-2000) || '（无审计记录）' }
        }
        return { kind: 'success', text: '用法: /memory list | query <词> | add <内容> | remove <fp> | audit' }
      },
    })
  })
}

// ---------- 插件挂载 ----------

// 调试日志（2026-08-16 排查 DSH→桌宠事件链路用）：默认关闭，设 DSH_MEMORY_DEBUG=1 开启
const DBG = process.env.DSH_MEMORY_DEBUG === '1'
function dbgLog(msg) {
  if (!DBG) return
  try {
    fs.appendFileSync(path.join(MEMORY_ROOT, 'pet-events.log'),
      new Date().toISOString().slice(11, 19) + ' ' + msg + '\n', 'utf-8')
  } catch { /* ignore */ }
}

// 事件节流：assistant/chunk 每 2 秒最多转发一次（chunk 高频刷屏会让桌宠一直 THINKING；
// 桌宠只需知道「在思考」，无需逐 token 同步）。其他事件不受限。
const CHUNK_THROTTLE_MS = 2000
let _lastChunkAt = 0

// DSH 会话事件 → 本地桌宠 /event 转发（桌宠状态机驱动；默认关闭，桌宠不在线静默跳过）
function petEvent(type, meta) {
  if (!PET_ENDPOINT) return
  try {
    if (type === 'assistant/chunk') {
      const now = Date.now()
      if (now - _lastChunkAt < CHUNK_THROTTLE_MS) return
      _lastChunkAt = now
    }
    dbgLog(`→ petEvent(${type})`)
    petRequest('/event', JSON.stringify({ type, ...meta }), 800)
  } catch { /* ignore */ }
}

export function apply(ctx, config = {}) {
  ensureDirs()
  PET_ENDPOINT = typeof config.petEndpoint === 'string' ? config.petEndpoint : null // 桌宠联动：可选，默认关闭
  dbgLog('=== apply 执行 ===')

  // 1. 冻结快照注入（会话启动 → system prompt；官方 PromptSection = {name, order, text}）
  ctx.systemPrompt.section({
    name: 'memory:snapshot',
    order: -50,
    text: renderSnapshot(),
  })

  // 2. memory 工具 + memory_recall 工具（官方 ToolDefinition；工具闭包捕获 ctx）
  ctx.tools.register(makeMemoryTool(ctx))
  ctx.tools.register(makeRecallTool())

  // 3. /memory 命令（可选服务，官方 ctx.inject 模式；commands 缺失自动跳过）
  registerMemoryCommand(ctx)

  // 4. DSH 事件 → 桌宠状态机（移植 dsh-desktop-pet 的事件映射）
  //    监听稳定事件面 session/event（核心 Harness 表面，global 收全部会话），
  //    套用 event-mapping 的归一化逻辑：step/start→思考、tool/call→工作、
  //    turn/end(completed)→完成庆祝、approval/asked→等待你确认。
  ctx.on('session/event', (session, rawEvent) => {
    const ev = rawEvent ?? {}
    const evType = typeof ev.type === 'string' ? ev.type : ''
    const sessionId = session?.id ?? session?.sessionId
    const data = ev.data ?? {}
    const reason = data?.reason?.kind ?? data?.reason
    dbgLog(`session/event → ${evType} (session=${sessionId ?? '?'})`)
    switch (evType) {
      case 'step/start':
        petEvent('step/start', { sessionId })
        break
      case 'assistant/chunk': {
        const ct = data?.chunk?.type
        if (ct === 'text-delta' || ct === 'reasoning-delta' || ct === 'tool-call-delta') {
          petEvent('assistant/chunk', { sessionId })
        }
        break
      }
      case 'tool/call':
        petEvent('tool/call', { toolName: data?.name, sessionId })
        break
      case 'turn/end':
        if (typeof reason === 'string') petEvent('turn/end', { reason, sessionId })
        break
      case 'approval/asked':
        petEvent('approval/asked', { sessionId })
        break
      case 'approval/decided':
        petEvent('approval/decided', { sessionId })
        break
      default:
        break
    }
  }, { global: true })
}
