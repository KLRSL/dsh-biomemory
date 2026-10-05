// ============================================================================
// dsh-biomemory — 生物仿生记忆系统（DSH 插件化 · 按官方插件文档重构）
//
// v0.6 架构升级：index.mjs 为「接线层」——只保留插件装配（工具/命令/Web API/
// apply），业务逻辑已拆分至：
//   shared.mjs       配置/常量/基础工具/指纹与相似度
//   store.mjs        记忆写入/钉/删/回滚/巩固/迁移
//   retrieve.mjs     查询/召回
//   snapshot.mjs     冻结快照/会话沉淀
//   gate.mjs         审批门/自检
//   session-state.mjs 会话沉淀状态
//   db.mjs            SQLite 数据层
//
// 目标运行时：@deepseek-ai/dsh-* 0.1.x（host runtime 实测契约）。
// ============================================================================

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import os from 'node:os'
import * as db from './db.mjs'

// ---------- v0.6 架构升级：分组导入（shared/store/retrieve/meta/snapshot/gate） ----------
import {
  CFG, DEFAULTS, PATHS, getConfig, setConfig,
  loadConfig, saveConfig,
  ensureDirs, readFile, writeFile, appendFile, nowStamp, isoNow, tsToIso,
  fingerprint, isImportant, estimateTokens,
  zhBigrams, dbgLog, MEMORY_ROOT, prefsText,
} from './shared.mjs'
import {
  parseEntryLine, formatEntryLine, readEntries, scanAllFiles,
  migrateMarkdownToDb, writeEntry, setPin,
  consolidateHits, removeEntry, restoreEntry, entryStatus, updateEntryText,
} from './store.mjs'
import { queryEntries, tokenize } from './retrieve.mjs'
import { renderSnapshot, sessionSummarySectionText, handleSessionEvent } from './snapshot.mjs'
import { gateWrite, selfHeal } from './gate.mjs'
import { compact, dump } from './compact.mjs'
import { recallBySignals } from './recall.mjs'
import {
  markSummaryPending, clearSummaryPending, isSummaryPending,
  getLastTurnEnd, setLastTurnEnd,
} from './session-state.mjs'

export const inject = ['tools', 'systemPrompt']

// ---------- v2：触发式召回的会话信号（项目路径 + 最近工具调用） ----------
const SIGNAL = { cwd: '', toolCalls: [] }
function noteSignal(session, rawEvent) {
  try {
    if (session && session.cwd) SIGNAL.cwd = session.cwd
    if (rawEvent && rawEvent.type === 'tool/call') {
      SIGNAL.toolCalls.push({ name: rawEvent.name, arguments: rawEvent.arguments })
      if (SIGNAL.toolCalls.length > 12) SIGNAL.toolCalls.splice(0, SIGNAL.toolCalls.length - 12)
    }
  } catch { /* 信号采集失败不影响主流程 */ }
}
function recallSectionText() {
  try {
    const r = recallBySignals({ cwd: SIGNAL.cwd, toolCalls: SIGNAL.toolCalls })
    if (!r.text) return ''
    return `## 触发式召回（本次会话信号命中）\n${r.text}\n\n> 命中信号：${r.triggers.join(' ')}｜注入 ${r.items.length} 条（预算 ≤8 条 / ≤1200 字符）`
  } catch { return '' }
}

// v0.8.1：按需抽取持有的宿主服务上下文（在 ctx.inject(['sessions','llm']) 的回调里赋值）

// ---------- 读取请求体（Web API 用） ----------
// v0.8.0：加大小上限（默认 1 MiB，可用 DSH_BIOMEMORY_BODY_LIMIT 覆盖）——旧实现无限缓冲，
// 本机任何进程都能用超大 body 把插件内存打满。
const BODY_LIMIT = Number(process.env.DSH_BIOMEMORY_BODY_LIMIT) > 0 ? Number(process.env.DSH_BIOMEMORY_BODY_LIMIT) : 1024 * 1024
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > BODY_LIMIT) {
        reject(new Error(`请求体超过上限 ${BODY_LIMIT} 字节`))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

// ---------- 工具定义（官方 ToolDefinition：parameters + output + execute） ----------

function makeMemoryTool(ctx) {
  return {
    name: 'memory',
    description: [
      '跨会话记忆系统：保存/查询值得记住的事实、偏好、教训。',
      '三层概念：Memory=存储层（所有条目）；Retrieved=查询候选（query/list 返回的子集）；',
      'Applied=实际注入 prompt 的内容（会话启动时冻结的快照，见记忆快照段）。查询≠注入，检索到不代表已采用。',
      '用法: memory action=add text="..." [track=user|agent] [source="来源说明"] —— 保存（重要项自动请求审批，审批不可用时按配置自动保存）',
      '      ⚠️ 写入去重（v0.8.0）：若与已有同类条目高度相似（默认 bigram 相似度 ≥0.7），不会新增，而是返回相似条目的 fp 与提示——此时应改用 update 合并，不要换措辞硬写第二条',
      '      memory action=query text="关键词" [projectId=项目] [topK=10] [minWeight=0.1] [fragmentTypes=decision,preference] [includeArchived=false] —— 查询',
      '      memory action=update fp="指纹" text="新内容" —— 编辑一条（保留锁定/权重，自动审计可追溯）',
      '      memory action=remove fp="指纹" —— 删除一条（自动备份，可回滚）',
      '      memory action=restore fp="指纹" —— 从最近备份回滚被删除的一条',
      '      memory action=list —— 列出全部条目',
      '      memory action=pin fp="指纹" —— 锁定（不参与衰减；注意：锁定=不遗忘，不自动参与执行）',
      '      memory action=unpin fp="指纹" —— 解锁',
      '      memory action=compact [dryRun=true] —— 按五条规则清理（墓碑 + 降权，写 compact.log）',
      '      memory action=dump —— 把活跃记忆按类型导出成 Markdown（人类可读）',
      '保存原则：用户偏好/纠正/项目决策/踩坑教训要保存；琐事、一次性路径、可从代码重新推导的事实不保存。',
      '记忆类别（自动推断，写入时记录）：user_decision=用户明确决定 / user_preference=用户偏好 / fact=普通事实',
      '/ model_suggestion=模型建议 / model_inference=模型推测（建议≠决定，模型推测永远不能当作用户已拍板）。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'query', 'update', 'remove', 'restore', 'list', 'pin', 'unpin', 'compact', 'dump'], description: '操作' },
        text: { type: 'string', description: 'add 的内容、query 的关键词、update 的新内容' },
        track: { type: 'string', enum: ['user', 'agent'], description: 'user=用户偏好/知识；agent=行为/教训（默认 agent）' },
        source: { type: 'string', description: 'add 时信息来源说明（如「用户原话」「文档 x 第 3 节」）；不填则记录会话 ID（source_ref 字段）' },
        fp: { type: 'string', description: 'update/remove/restore/pin/unpin 时按指纹' },
        projectId: { type: 'string', description: 'query 限定项目范围' },
        topK: { type: 'number', description: 'query 返回结果数量上限' },
        minWeight: { type: 'number', description: 'query 最低权重阈值' },
        fragmentTypes: { type: 'string', description: 'query 限定片段类型（逗号分隔：decision,preference,fact,event,note）' },
        includeArchived: { type: 'boolean', description: 'query 是否包含冷归档记忆' },
        dryRun: { type: 'boolean', description: 'compact 预览：不落库、不写日志' },
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
        if (!value.ok) return [{ type: 'text', text: value.error || 'memory 操作失败' }]
        if (Array.isArray(value.entries)) {
          if (!value.entries.length) return [{ type: 'text', text: '（无匹配记忆）' }]
          return [{ type: 'text', text: value.entries.map((e) => `- [${e.layer}]${e.memory_class ? `[${e.memory_class}]` : ''} ${e.text}`).join('\n') }]
        }
        if (value.skipped) return [{ type: 'text', text: '重复记忆，已跳过' }]
        if (value.note) return [{ type: 'text', text: value.note }]
        return [{ type: 'text', text: `已保存 [fp:${value.fp}]（${value.mode || 'auto'}）` }]
      },
    },
    presentCall(args) {
      return { card: 'generic', title: `记忆：${args?.action || ''}`, kind: 'other', rawInput: args }
    },
    async execute(args, exec) {
      const { action, text = '', track = 'agent', fp, type, sinceDays, projectId, topK, minWeight, fragmentTypes, includeArchived, aggregate, groupBy, source } = args || {}
      const sessionId = exec.agent?.id
      if (action === 'add') {
        if (!text.trim()) return { ok: false, error: 'text 必填' }
        const g = await gateWrite(ctx, { track, text: text.trim(), agent: exec.agent, callId: exec.callId, signal: exec.signal })
        if (!g.approved) return { ok: false, error: `写入未获批准（${g.outcome || 'denied'}）——重要记忆需人工审批（可设置 approvalFallback=auto 自动保存）` }
        const r = writeEntry({ track, text: text.trim(), sessionId, approved: g.mode === 'ask', mode: g.mode, source })
        // v0.8.0：近似重复（写入去重）——已自动合并进已有条目，或（skip 模式）只提示不写
        if (r.merged) {
          return {
            ok: true,
            ...r,
            mode: g.mode,
            note: `已合并进已有条目 [fp:${r.fp}]（相似度 ${r.similar.score}，追加「补充·日期」并提权）——未新增碎片条目。`,
          }
        }
        if (r.skipped && r.reason === 'near-duplicate') {
          return {
            ok: true,
            ...r,
            mode: g.mode,
            note: `未新增：与已有条目 [fp:${r.similar.fp}] 高度相似（${r.similar.score}）。请改用 memory action=update fp="${r.similar.fp}" text="合并后的完整内容"，避免同一件事留下多条碎片记忆。`,
          }
        }
        return { ok: true, ...r, mode: g.mode }
      }
      if (action === 'query') {
        const fts = typeof fragmentTypes === 'string' && fragmentTypes.trim()
          ? fragmentTypes.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined
        return { ok: true, entries: await queryEntries(text, topK || CFG.maxQueryResults, { projectId, topK: topK || CFG.maxQueryResults, minWeight, fragmentTypes: fts, includeArchived }) }
      }
      if (action === 'list') return { ok: true, entries: await queryEntries('', topK || 200) }
      if (action === 'update') {
        if (!fp || !String(text ?? '').trim()) return { ok: false, error: 'fp 与 text 必填（先 list/query 找到指纹）' }
        const r = updateEntryText(fp, String(text).trim())
        return r.ok ? { ok: true, note: r.note || `已更新 [fp:${fp}]`, fp } : r
      }
      if (action === 'remove') {
        if (!fp) return { ok: false, error: 'fp 必填（先 query 找到指纹）' }
        const r = removeEntry(fp)
        return r.ok ? { ok: true, note: `已删除 [fp:${fp}]（备份：${r.backup}，可回滚）` } : r
      }
      if (action === 'restore') {
        if (!fp) return { ok: false, error: 'fp 必填' }
        const r = restoreEntry(fp)
        return r.ok ? { ok: true, note: `已回滚 [fp:${fp}]（来源备份：${r.backup}）` } : r
      }
      if (action === 'pin' || action === 'unpin') {
        if (!fp) return { ok: false, error: 'fp 必填（先 query 找到指纹）' }
        const r = setPin(fp, action === 'pin')
        return r.ok ? { ok: true, note: `已${action === 'pin' ? '锁定' : '解锁'} [fp:${fp}]` } : r
      }
      if (action === 'compact') {
        const r = compact({ dryRun: dryRun === true })
        const head = `${dryRun === true ? '【预览】' : ''}扫描 ${r.scanned} 条：墓碑 ${r.tombstoned} · 降权 ${r.decayed}`
        return { ok: true, note: r.log.length ? `${head}\n${r.log.slice(0, 15).join('\n')}` : head }
      }
      if (action === 'dump') {
        const r = dump()
        return { ok: true, note: `已导出 ${r.total} 条到 ${r.file}（工作流链 ${r.chains} 条）` }
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
        return [{ type: 'text', text: value.entries.map((e) => `- [${e.layer}]${e.memory_class ? `[${e.memory_class}]` : ''} ${e.text}`).join('\n') }]
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
      description: '记忆管理：list / query <词> / add <内容> / edit <fp> <新内容> / remove <fp> / undo <fp> / pin <fp> / unpin <fp> / entries [词] / compact [--dry-run] / dump',
      handler(invocation) {
        const { rawInput, agent } = invocation
        const tokens = (rawInput || '').trim().split(/\s+/)
        const verb = tokens[0]
        const rest = tokens.slice(1)
        const sessionId = agent?.id
        if (verb === 'list') {
          const es = queryEntries('')
          return { kind: 'success', text: es.length ? es.map((e) => `- [${e.layer}]${e.memory_class ? `[${e.memory_class}]` : ''} ${e.text}`).join('\n') : '（记忆为空）' }
        }
        if (verb === 'query') {
          const q = rest.join(' ')
          const es = queryEntries(q)
          return { kind: 'success', text: es.length ? es.map((e) => `- [${e.layer}]${e.memory_class ? `[${e.memory_class}]` : ''} ${e.text}`).join('\n') : `（无匹配：${q}）` }
        }
        if (verb === 'add') {
          if (!rest.length) return { kind: 'success', text: '用法: /memory add <内容>' }
          const q = rest.join(' ')
          const r = writeEntry({ track: 'agent', text: q, sessionId, approved: true })
          return { kind: 'success', text: r.skipped ? '重复，已跳过' : `已保存 [fp:${r.fp}]（人类发起）` }
        }
        if (verb === 'edit') {
          const fp = rest[0]
          const content = rest.slice(1).join(' ')
          if (!fp || !content) return { kind: 'success', text: '用法: /memory edit <fp> <新内容>' }
          const r = updateEntryText(fp, content)
          return { kind: 'success', text: r.ok ? (r.note || `已更新 [fp:${fp}]`) : r.error }
        }
        if (verb === 'remove') {
          const fp = rest[0]
          if (!fp) return { kind: 'success', text: '用法: /memory remove <fp>' }
          const r = removeEntry(fp)
          return { kind: 'success', text: r.ok ? `已删除 [fp:${fp}]（备份：${r.backup}，/memory undo ${fp} 可回滚）` : r.error }
        }
        if (verb === 'undo') {
          const fp = rest[0]
          if (!fp) return { kind: 'success', text: '用法: /memory undo <fp>' }
          const r = restoreEntry(fp)
          return { kind: 'success', text: r.ok ? `已回滚 [fp:${fp}]（来源备份：${r.backup}）` : r.error }
        }
        if (verb === 'entries') {
          const q = rest.join(' ')
          const es = queryEntries(q, 50).map((e) => {
            const meta = []
            if (e.weight !== undefined) meta.push(`w${e.weight}`)
            if (e.hits !== undefined) meta.push(`h${e.hits}`)
            if (e.ts) meta.push(e.ts)
            if (e.pinned) meta.push('PIN')
            return `- [${e.layer}] [${meta.join(' ')}] ${e.text}`
          })
          return { kind: 'success', text: es.length ? es.join('\n') : (q ? `（无匹配：${q}）` : '（记忆为空）') }
        }
        if (verb === 'pin' || verb === 'unpin') {
          const fp = rest[0]
          if (!fp) return { kind: 'success', text: `用法: /memory ${verb} <fp>` }
          const r = setPin(fp, verb === 'pin')
          return { kind: 'success', text: r.ok ? `已${verb === 'pin' ? '锁定' : '解锁'} [fp:${fp}]` : r.error }
        }
        if (verb === 'compact') {
          const r = compact({ dryRun: rest.includes('--dry-run') })
          const head = `${rest.includes('--dry-run') ? '【预览】' : ''}扫描 ${r.scanned} 条：墓碑 ${r.tombstoned} · 降权 ${r.decayed}`
          return { kind: 'success', text: r.log.length ? `${head}\n${r.log.slice(0, 15).join('\n')}` : head }
        }
        if (verb === 'dump') {
          const r = dump()
          return { kind: 'success', text: `已导出 ${r.total} 条到 ${r.file}（工作流链 ${r.chains} 条）` }
        }
        return { kind: 'success', text: '用法: /memory list | query <词> | add <内容> | edit <fp> <新内容> | remove <fp> | undo <fp> | pin <fp> | unpin <fp> | entries [词] | compact | dump' }
      },
    })
  })
}

// ---------- 按需抽取（v0.8.1，用户拍板：按钮触发、不做后台自动抽取以省 token） ----------
// 数据来源走官方契约：ctx.sessions.get(id).deriveMessages()（模型可见历史，不碰会话日志文件）；
// 模型调用走官方 LLM 服务 ctx.llm.stream({provider, model, messages})（复用 DSH 现有提供方）。
// 提取到的候选交给 store.writeEntry —— 与手工写入共用同一套指纹去重、近重复合并与审计。

// ---------- 插件挂载 ----------

export function apply(ctx, config = {}) {
  ensureDirs()
  // v0.5：SQLite 初始化 + Markdown 一次性迁移（meta 幂等）
  let migrateResult = null
  try {
    migrateResult = migrateMarkdownToDb()
    if (migrateResult.migrated) dbgLog(`migrate: imported=${migrateResult.imported}`)
  } catch (err) {
    dbgLog(`migrate failed: ${String(err && err.message || err)}`)
  }
  // 配置优先级：bundle 传入 config > 持久化 biomemory.config.json > 默认值
  const persisted = loadConfig()
  setConfig({ ...DEFAULTS, ...persisted, ...(typeof config === 'object' && config ? config : {}) })
  selfHeal()
  dbgLog('=== apply 执行 ===')

  // v0.8.1：按需抽取要用到的宿主服务——懒注入，服务缺失时接口返回明确错误而不是崩

  // 1. 动态记忆上下文（每次对话/新会话组装提示词时自动重新求值 → 最新记忆同步）
  ctx.systemPrompt.context({
    name: 'memory:snapshot',
    order: -50,
    text: () => renderSnapshot(),
  })

  // 1.2 v2 触发式召回：本次会话的信号命中了才注入，没命中不占 token
  ctx.systemPrompt.context({
    name: 'memory:triggered',
    order: -40,
    text: () => recallSectionText(),
  })

  // 1.5 会话结束自动沉淀（v0.6）：turn/end(completed) 后注入总结指令
  try {
    ctx.on('session/event', (session, rawEvent) => {
      handleSessionEvent(session, rawEvent)
      noteSignal(session, rawEvent)
    }, { global: true })
    ctx.systemPrompt.section({
      name: 'memory:session-summary',
      order: 200,
      text: () => sessionSummarySectionText(),
    })
  } catch {
    // 会话事件/提示词注入不可用则静默降级（不影响记忆读写）
  }

  // 2. memory 工具 + memory_recall 工具
  ctx.tools.register(makeMemoryTool(ctx))
  ctx.tools.register(makeRecallTool())

  // 3. /memory 命令（可选服务，commands 缺失自动跳过）
  registerMemoryCommand(ctx)

  // 4. 设置页 Web API（官方契约：ctx.webServer.register，kind=prefix；webServer 缺失时自动跳过）
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(() => httpCtx.webServer.register({
      kind: 'prefix',
      path: '/biomemory/api',
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/', 'https://dsh.invalid')
        const p = url.pathname.replace(/^\/biomemory\/api/, '') || '/'
        res.setHeader('content-type', 'application/json; charset=utf-8')
        const send = (code, body) => {
          res.statusCode = code
          res.end(JSON.stringify(body))
        }
        try {
          if (req.method === 'GET' && p === '/status') {
            const s = db.stats()
            const conn = db.openDb()
            const byType = conn.prepare('SELECT fragment_type AS k, COUNT(*) AS c FROM entries GROUP BY fragment_type ORDER BY c DESC').all().map((r) => ({ key: r.k, count: r.c }))
            const byWeight = conn.prepare("SELECT CASE WHEN weight >= 10 THEN '10+' WHEN weight >= 5 THEN '5-9' WHEN weight >= 3 THEN '3-4' ELSE '<3' END AS k, COUNT(*) AS c FROM entries GROUP BY k ORDER BY c DESC").all().map((r) => ({ key: r.k, count: r.c }))
            return send(200, { ok: true, stats: { total: s.total, pinned: s.pinned, layers: s.layers, memoryRoot: MEMORY_ROOT, dbPath: s.dbPath, migration: db.migrationStatus(), byType, byWeight }, config: CFG })
          }
          if (req.method === 'GET' && p === '/config') {
            return send(200, { ok: true, config: CFG })
          }
          if (req.method === 'POST' && p === '/config') {
            let body = {}
            try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
            const allowed = ['halfLifeDays', 'decayThreshold', 'consolidateThreshold', 'weightCap', 'hotTokenLimit', 'maxQueryResults', 'approvalFallback', 'nearDuplicateThreshold', 'nearDuplicateAction', 'sinkWindowMinutes']
            if (body.reset === true) {
              try { fs.unlinkSync(PATHS.config) } catch { /* ignore */ }
              setConfig({ ...DEFAULTS })
                          return send(200, { ok: true, config: CFG, reset: true })
            }
            const next = { ...CFG }
            for (const k of allowed) {
              if (body[k] !== undefined) {
                // v0.8.2（真机实测踩坑）：新增的**字符串/布尔**配置必须按类型落库。
                // 旧代码除 approvalFallback 外一律 Number()，于是：
                if (k === 'approvalFallback') next[k] = body[k] === 'auto' ? 'auto' : 'deny'
                else if (k === 'nearDuplicateAction') next[k] = body[k] === 'skip' ? 'skip' : 'merge'
                else {
                  const v = Number(body[k])
                  if (Number.isFinite(v) && v >= 0) next[k] = v
                }
              }
            }
            setConfig(next)
                      saveConfig(CFG)
            return send(200, { ok: true, config: CFG })
          }
          if (req.method === 'GET' && p === '/entries') {
            const q = url.searchParams.get('q') || ''
            const layer = url.searchParams.get('layer') || ''
            const limit = Math.min(500, Number(url.searchParams.get('limit')) || 200)
            const prefsTextStr = prefsText()
            if (q) {
              // v0.6.5：带 q 时也应用 layer 筛选；queryEntries 已补齐 hits/pinned/mode/ts/kind
              const res = await queryEntries(q, limit, { minWeight: 0, layer: layer || undefined })
              const seen = new Set()
              const merged = []
              for (const r of res) {
                if (seen.has(r.fp)) continue
                seen.add(r.fp)
                merged.push({ layer: r.layer, fp: r.fp, kind: r.kind, mode: r.mode, weight: r.weight, hits: r.hits, ts: r.ts, pinned: r.pinned, text: r.text, fragment_type: r.fragment_type, status: entryStatus(r, prefsTextStr) })
              }
              return send(200, { ok: true, entries: merged.slice(0, limit) })
            }
            const all = db.listEntries({ layer: layer || undefined, limit: 1000 })
              .map((e) => ({ layer: e.layer, fp: e.fp, kind: e.kind, mode: e.mode, weight: e.weight, hits: e.hits, ts: e.created_at, pinned: e.pinned, text: e.text, fragment_type: e.fragment_type, status: entryStatus(e, prefsTextStr) }))
            all.sort((a, b) => (b.pinned - a.pinned) || (b.weight - a.weight) || String(b.ts || '').localeCompare(String(a.ts || '')))
            return send(200, { ok: true, entries: all.slice(0, limit) })
          }
          if (req.method === 'POST' && p === '/entries/pin') {
            let body = {}
            try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
            if (!body.fp) return send(400, { ok: false, error: 'fp 必填' })
            const r = setPin(body.fp, true)
            return r.ok ? send(200, { ok: true, fp: r.fp, pinned: true }) : send(404, r)
          }
          if (req.method === 'POST' && p === '/entries/unpin') {
            let body = {}
            try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
            if (!body.fp) return send(400, { ok: false, error: 'fp 必填' })
            const r = setPin(body.fp, false)
            return r.ok ? send(200, { ok: true, fp: r.fp, pinned: false }) : send(404, r)
          }
          if (req.method === 'POST' && p === '/entries/remove') {
            let body = {}
            try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
            if (!body.fp) return send(400, { ok: false, error: 'fp 必填' })
            const r = removeEntry(body.fp)
            return r.ok ? send(200, { ok: true, fp: r.fp, backup: r.backup }) : send(404, r)
          }
          if (req.method === 'POST' && p === '/entries/restore') {
            let body = {}
            try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
            if (!body.fp) return send(400, { ok: false, error: 'fp 必填' })
            const r = restoreEntry(body.fp)
            return r.ok ? send(200, { ok: true, fp: r.fp, text: r.text, backup: r.backup }) : send(404, r)
          }
          if (req.method === 'POST' && p === '/entries/update') {
            let body = {}
            try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
            if (!body.fp || !String(body.text ?? '').trim()) return send(400, { ok: false, error: 'fp 与 text 必填' })
            const r = updateEntryText(body.fp, body.text)
            return r.ok ? send(200, { ok: true, fp: r.fp, text: r.text, note: r.note }) : send(404, r)
          }
          return send(404, { ok: false, error: 'not found' })
        } catch (err) {
          return send(500, { ok: false, error: String(err && err.message || err) })
        }
      },
    }), 'dsh-biomemory: settings web API')
  })
}

async function readBodyJson(req) {
  try { return JSON.parse(await readBody(req)) } catch { return {} }
}

// ---------- 测试用内部接口（不参与 DSH 装配） ----------

export const __internals = {
  MEMORY_ROOT,
  parseEntryLine,
  formatEntryLine,
  fingerprint,
  isImportant,
  estimateTokens,
  zhBigrams,
  consolidateHits,
  removeEntry,
  restoreEntry,
  updateEntryText,
  entryStatus,
  tokenize,
  queryEntries,
  compact,
  dump,
  recallBySignals,
  setPin,
  scanAllFiles,
  migrateMarkdownToDb,
  sessionSummarySectionText,
  handleSessionEvent,
  markSummaryPending,
  clearSummaryPending,
  setConfig: (c) => { setConfig(c) },
  getConfig: () => ({ ...CFG }),
  paths: PATHS,
}
