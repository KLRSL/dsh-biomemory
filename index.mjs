// ============================================================================
// dsh-biomemory — 生物仿生记忆系统（DSH 插件化 · 按官方插件文档重构）
//
// v0.6 架构升级：index.mjs 为「接线层」——只保留插件装配（工具/命令/Web API/
// apply），业务逻辑已拆分至：
//   shared.mjs       配置/常量/基础工具/审计/冲突检测
//   store.mjs        记忆写入/钉/删/回滚/巩固/迁移
//   retrieve.mjs     查询/语义检索
//   meta.mjs         记忆代谢/深度反思
//   snapshot.mjs     冻结快照/会话沉淀
//   gate.mjs         审批门/自检
//   notify.mjs       桌宠气泡通知
//   session-state.mjs 会话沉淀状态
//   db.mjs / embed.mjs  SQLite 数据层 / 嵌入与语义
//
// 目标运行时：@deepseek-ai/dsh-* 0.1.x（host runtime 实测契约）。
// ============================================================================

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import os from 'node:os'
import * as db from './db.mjs'
import * as embed from './embed.mjs'

// ---------- v0.6 架构升级：分组导入（shared/store/retrieve/meta/snapshot/gate/notify） ----------
import {
  CFG, DEFAULTS, PATHS, getConfig, setConfig, setConflictThreshold,
  loadConfig, saveConfig,
  ensureDirs, readFile, writeFile, appendFile, nowStamp, isoNow, tsToIso,
  fingerprint, isImportant, estimateTokens, audit, queryAudit, auditAggregate,
  detectConflict, zhBigrams, dbgLog, MEMORY_ROOT, prefsText,
} from './shared.mjs'
import {
  parseEntryLine, formatEntryLine, readEntries, scanAllFiles, rewriteFile,
  migrateMarkdownToDb, ensureVectors, writeEntry, setPin, findByText, backupNow, latestBackup,
  consolidateHits, removeEntry, restoreEntry, entryStatus, updateEntryText,
} from './store.mjs'
import { tokenize, tfidfVectors, cosine, semanticSearch, queryEntries } from './retrieve.mjs'
import { runDream, clusterEntries, latestReflection, runReflect } from './meta.mjs'
import { renderSnapshot, sessionSummarySectionText, handleSessionEvent } from './snapshot.mjs'
import { gateWrite, selfHeal } from './gate.mjs'
import { setPetEndpoint, getPetEndpoint, petNotify } from './notify.mjs'
import { scheduleMirrorSync } from './mirror.mjs'
import {
  markSummaryPending, clearSummaryPending, isSummaryPending, getSummarySid,
  getLastTurnEnd, setLastTurnEnd,
} from './session-state.mjs'

export const inject = ['tools', 'systemPrompt']

// ---------- 读取请求体（Web API 用） ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
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
      '      memory action=query text="关键词" [mode=hybrid|exact|semantic] [projectId=项目] [topK=10] [minWeight=0.1] [fragmentTypes=decision,preference] [includeArchived=false] —— 查询',
      '           （hybrid=精确+语义混合（默认）；exact=关键词精确；semantic=向量语义；命中自动巩固）',
      '      memory action=update fp="指纹" text="新内容" —— 编辑一条（保留锁定/权重，自动审计可追溯）',
      '      memory action=remove fp="指纹" —— 删除一条（自动备份，可回滚）',
      '      memory action=restore fp="指纹" —— 从最近备份回滚被删除的一条',
      '      memory action=list —— 列出全部条目（与偏好冲突的行为记忆置顶并标注）',
      '      memory action=pin fp="指纹" —— 锁定（不参与衰减；注意：锁定=不遗忘，不自动参与执行）',
      '      memory action=unpin fp="指纹" —— 解锁',
      '      memory action=dream [dryRun=true] [resume=true] —— 记忆代谢（衰减/巩固/归档，支持断点续跑）',
      '      memory action=reflect [dryRun=true] —— 深度反思（主题聚类/趋势/冲突/遗忘建议）',
      '      memory action=audit [type="DECAY"] [sinceDays=7] [aggregate=true] [groupBy=action|day|entry] —— 结构化审计查询/聚合',
      '保存原则：用户偏好/纠正/项目决策/踩坑教训要保存；琐事、一次性路径、可从代码重新推导的事实不保存。',
      '记忆类别（自动推断，写入时记录）：user_decision=用户明确决定 / user_preference=用户偏好 / fact=普通事实',
      '/ model_suggestion=模型建议 / model_inference=模型推测（建议≠决定，模型推测永远不能当作用户已拍板）。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'query', 'update', 'remove', 'restore', 'list', 'pin', 'unpin', 'dream', 'reflect', 'audit'], description: '操作' },
        text: { type: 'string', description: 'add 的内容、query 的关键词、update 的新内容' },
        track: { type: 'string', enum: ['user', 'agent'], description: 'user=用户偏好/知识；agent=行为/教训（默认 agent）' },
        source: { type: 'string', description: 'add 时信息来源说明（如「用户原话」「文档 x 第 3 节」）；不填则记录会话 ID（source_ref 字段）' },
        fp: { type: 'string', description: 'update/remove/restore/pin/unpin 时按指纹' },
        dryRun: { type: 'boolean', description: 'dream/reflect 时预览不执行' },
        type: { type: 'string', description: 'audit 过滤事件类型' },
        sinceDays: { type: 'number', description: 'audit 只看最近 N 天' },
        mode: { type: 'string', enum: ['hybrid', 'exact', 'semantic'], description: 'query 检索模式（默认 hybrid）' },
        projectId: { type: 'string', description: 'query 限定项目范围' },
        topK: { type: 'number', description: 'query 返回结果数量上限' },
        minWeight: { type: 'number', description: 'query 最低权重阈值' },
        fragmentTypes: { type: 'string', description: 'query 限定片段类型（逗号分隔：decision,preference,fact,event,note）' },
        includeArchived: { type: 'boolean', description: 'query 是否包含冷归档记忆' },
        aggregate: { type: 'boolean', description: 'audit 聚合统计模式' },
        groupBy: { type: 'string', enum: ['action', 'day', 'entry'], description: 'audit 聚合维度（默认 action）' },
        resume: { type: 'boolean', description: 'dream 断点续跑（默认 true）' },
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
          report: { type: 'object', additionalProperties: true },
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
          return [{ type: 'text', text: value.entries.map((e) => `- [${e.layer}]${e.memory_class ? `[${e.memory_class}]` : ''}${e.semantic ? '（语义）' : ''}${e.status === 'conflict' ? ' [冲突]' : ''} ${e.text}`).join('\n') }]
        }
        if (value.report) {
          const r = value.report
          if (Array.isArray(r.clusters)) {
            const head = `【深度反思${r.dryRun ? '预览' : ''}】条目 ${r.scanned}：主题聚类 ${r.clusters.length} · 潜在冲突 ${r.conflicts.length} · 遗忘候选 ${r.forget.length}\n近 7 天写入 ${r.recent7} 条（上一周 ${r.prev7} 条）`
            const detail = r.clusters.slice(0, 5).map((c) => `- 主题（${c.size} 条）：${c.members.slice(0, 2).map((m) => m.text).join(' / ')}`).join('\n')
            const conflictLines = (r.conflicts || []).slice(0, 3).map((c) => `- ⚠ [${c.layer}] [fp:${c.fp}] ${c.text}`).join('\n')
            const resolveNote = (r.conflicts || []).length
              ? `\n\n冲突 ${r.conflicts.length} 条（浮出待裁决，不自动降权）：\n${conflictLines}\n裁决：memory action=update fp="<指纹>" text="新内容"，或 /memory edit <fp> <新内容>`
              : ''
            const fileNote = r.reportFile ? `\n报告：${r.reportFile}` : '（预览不落盘）'
            return [{ type: 'text', text: detail ? `${head}${resolveNote}\n${detail}${fileNote}` : `${head}${resolveNote}${fileNote}` }]
          }
          const head = `${r.dryRun ? '【预览】' : ''}扫描 ${r.scanned} 条：衰减 ${r.decayed} · 巩固 ${r.consolidated} · 冲突 ${r.conflicted} · 归档 ${r.archived}\n备份：${r.backup}`
          const detail = r.items.slice(0, 15).map((it) => `- ${it.op} [${it.layer}] [fp:${it.fp}] ${it.to !== undefined ? `→ ${it.to}` : ''}`).join('\n')
          return [{ type: 'text', text: detail ? `${head}\n${detail}` : head }]
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
      const { action, text = '', track = 'agent', fp, dryRun, type, sinceDays, mode, projectId, topK, minWeight, fragmentTypes, includeArchived, aggregate, groupBy, resume, source } = args || {}
      const sessionId = exec.agent?.id
      if (action === 'add') {
        if (!text.trim()) return { ok: false, error: 'text 必填' }
        const g = await gateWrite(ctx, { track, text: text.trim(), agent: exec.agent, callId: exec.callId, signal: exec.signal })
        if (!g.approved) return { ok: false, error: `写入未获批准（${g.outcome || 'denied'}）——重要记忆需人工审批（可设置 approvalFallback=auto 自动保存）` }
        const r = writeEntry({ track, text: text.trim(), sessionId, approved: g.mode === 'ask', mode: g.mode, source })
        return { ok: true, ...r, mode: g.mode }
      }
      if (action === 'query') {
        const fts = typeof fragmentTypes === 'string' && fragmentTypes.trim()
          ? fragmentTypes.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined
        return { ok: true, entries: await queryEntries(text, topK || CFG.maxQueryResults, { mode, projectId, topK: topK || CFG.maxQueryResults, minWeight, fragmentTypes: fts, includeArchived }) }
      }
      if (action === 'list') return { ok: true, entries: await queryEntries('', topK || 200, { mode: 'exact' }) }
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
      if (action === 'dream') {
        const r = runDream({ dryRun: dryRun === true, resume })
        // 落库后异步同步人类可读镜像（dry-run 无副作用 → 不同步）
        if (dryRun !== true) scheduleMirrorSync('tool-dream').catch(() => {})
        return { ok: true, report: { ...r, dryRun: dryRun === true } }
      }
      if (action === 'reflect') {
        const r = runReflect({ dryRun: dryRun === true })
        if (dryRun !== true) scheduleMirrorSync('tool-reflect').catch(() => {})
        return { ok: true, report: { ...r, dryRun: dryRun === true } }
      }
      if (action === 'audit') {
        if (aggregate === true) {
          const agg = auditAggregate({ sinceDays, groupBy: groupBy || 'action' })
          if (!agg.length) return { ok: true, note: '（无匹配审计记录）' }
          return { ok: true, note: '审计聚合统计：\n' + agg.map((a) => `- ${a.key}: ${a.count}`).join('\n') }
        }
        const recs = queryAudit({ sinceDays, type })
        if (!recs.length) return { ok: true, note: '（无匹配审计记录）' }
        return { ok: true, note: recs.slice(-20).map((r) => `${r.t.slice(0, 16)} ${r.action} ${r.entry_id || ''} ${r.detail || ''}`).join('\n') }
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
      description: '记忆管理：list / query <词> / add <内容> / edit <fp> <新内容> / remove <fp> / undo <fp> / pin <fp> / unpin <fp> / dream [--dry-run] / reflect [--dry-run] / entries [词] / audit [--since 7d] [--type DECAY]',
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
            if (e.semantic) meta.push('语义')
            return `- [${e.layer}] [${meta.join(' ')}] ${e.text}`
          })
          return { kind: 'success', text: es.length ? es.join('\n') : (q ? `（无匹配：${q}）` : '（记忆为空）') }
        }
        if (verb === 'reflect') {
          const dryRun = rest.includes('--dry-run')
          const r = runReflect({ dryRun })
          const head = `${dryRun ? '【预览】' : ''}条目 ${r.scanned}：主题聚类 ${r.clusters.length} · 冲突 ${r.conflicts.length} · 遗忘候选 ${r.forget.length} · 近7天写入 ${r.recent7}（上周 ${r.prev7}）`
          const detail = r.clusters.slice(0, 5).map((c) => `- 主题（${c.size} 条）：${c.members.slice(0, 2).map((m) => m.text).join(' / ')}`).join('\n')
          const conflictLines = (r.conflicts || []).slice(0, 3).map((c) => `- ⚠ [${c.layer}] [fp:${c.fp}] ${c.text}`).join('\n')
          const resolveNote = (r.conflicts || []).length
            ? `\n冲突 ${r.conflicts.length} 条（浮出待裁决，不自动降权）：\n${conflictLines}\n裁决：/memory edit <fp> <新内容>`
            : ''
          return { kind: 'success', text: detail ? `${head}${resolveNote}\n${detail}` : `${head}${resolveNote}` }
        }
        if (verb === 'pin' || verb === 'unpin') {
          const fp = rest[0]
          if (!fp) return { kind: 'success', text: `用法: /memory ${verb} <fp>` }
          const r = setPin(fp, verb === 'pin')
          return { kind: 'success', text: r.ok ? `已${verb === 'pin' ? '锁定' : '解锁'} [fp:${fp}]` : r.error }
        }
        if (verb === 'dream') {
          const dryRun = rest.includes('--dry-run')
          const r = runDream({ dryRun })
          if (!dryRun) scheduleMirrorSync('cmd-dream').catch(() => {})
          const head = `${dryRun ? '【预览】' : ''}扫描 ${r.scanned} 条：衰减 ${r.decayed} · 巩固 ${r.consolidated} · 冲突 ${r.conflicted} · 归档 ${r.archived}`
          const detail = r.items.slice(0, 20).map((it) => `- ${it.op} [${it.layer}] [fp:${it.fp}]${it.to !== undefined ? ` → ${it.to}` : ''}`).join('\n')
          return { kind: 'success', text: detail ? `${head}\n备份：${r.backup}\n${detail}` : `${head}\n备份：${r.backup}` }
        }
        if (verb === 'audit') {
          let sinceDays
          let type
          for (let i = 0; i < rest.length; i++) {
            if (rest[i] === '--since' && rest[i + 1]) {
              const m = rest[i + 1].match(/^(\d+)d?$/)
              if (m) sinceDays = Number(m[1])
              i++
            }
            if (rest[i] === '--type' && rest[i + 1]) { type = rest[i + 1].toUpperCase(); i++ }
          }
          const recs = queryAudit({ sinceDays, type })
          // v0.6.5：queryAudit 实际返回 { t, actor, action, entry_id, detail }（db.mjs），
          // 旧实现读 r.event/r.fp/r.approved/r.text 全是 undefined → 输出原始 JSON。
          // 现按真实字段渲染人类可读行：时间 · 事件 · 条目 · 详情摘要
          const fmtAudit = (r) => {
            const d = (() => {
              if (!r.detail) return {}
              if (typeof r.detail === 'object') return r.detail
              try { return JSON.parse(r.detail) } catch { return { raw: String(r.detail) } }
            })()
            const bits = []
            if (d.fp) bits.push(`fp:${d.fp}`)
            if (d.track) bits.push(`track:${d.track}`)
            if (d.approved) bits.push(`mode:${d.approved}`)
            if (d.op) bits.push(`op:${d.op}`)
            if (d.memory_class) bits.push(`class:${d.memory_class}`)
            if (d.count !== undefined) bits.push(`count:${d.count}`)
            if (d.fallback) bits.push('fallback')
            if (d.changed) bits.push(`config:${d.changed}`)
            const text = d.text ? String(d.text).slice(0, 60) : (d.raw ? String(d.raw).slice(0, 60) : '')
            return `${String(r.t || '').slice(0, 16)} ${r.action || ''}${r.entry_id ? ` ${String(r.entry_id).slice(0, 8)}` : ''}${bits.length ? ` [${bits.join(' ')}]` : ''}${text ? ` ${text}` : ''}`.trim()
          }
          // 查询为 id DESC（最新在前），取头部即最新 20 条（旧实现 slice(-20) 取到的是最旧记录）
          return { kind: 'success', text: recs.length ? recs.slice(0, 20).map(fmtAudit).join('\n') : '（无匹配审计记录）' }
        }
        return { kind: 'success', text: '用法: /memory list | query <词> | add <内容> | edit <fp> <新内容> | remove <fp> | undo <fp> | pin <fp> | unpin <fp> | entries [词] | dream [--dry-run] | reflect [--dry-run] | audit [--since 7d] [--type DECAY]' }
      },
    })
  })
}

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
  setConflictThreshold(Number(CFG.conflictOverlap) || 3)
  setPetEndpoint(typeof CFG.petEndpoint === 'string' ? CFG.petEndpoint : null)
  selfHeal()
  dbgLog('=== apply 执行 ===')

  // v0.5：后台预建向量索引（模型可用时，不阻塞启动）
  setTimeout(() => { ensureVectors().then((r) => dbgLog(`vectors: ${JSON.stringify(r)}`)) }, 100)

  // 0. 启动自动代谢/反思（距上次执行 ≥ 配置天数时自动执行，0=关闭）
  try {
    if (CFG.autoDreamDays > 0) {
      const lb = latestBackup()
      if (!lb || Date.now() - fs.statSync(lb).mtimeMs >= CFG.autoDreamDays * 86400000) {
        const r = runDream()
        audit('AUTO-DREAM', { scanned: r.scanned, decayed: r.decayed, archived: r.archived })
        scheduleMirrorSync('auto-dream').catch(() => {})
        dbgLog(`auto dream: scanned=${r.scanned}`)
      }
    }
    if (CFG.autoReflectDays > 0) {
      const lr = latestReflection()
      if (!lr || Date.now() - fs.statSync(lr).mtimeMs >= CFG.autoReflectDays * 86400000) {
        const r = runReflect()
        audit('AUTO-REFLECT', { reportFile: r.reportFile })
        dbgLog(`auto reflect: ${r.reportFile}`)
      }
    }
  } catch (err) {
    dbgLog(`auto run failed: ${String(err && err.message || err)}`)
  }

  // 1. 动态记忆上下文（每次对话/新会话组装提示词时自动重新求值 → 最新记忆同步）
  ctx.systemPrompt.context({
    name: 'memory:snapshot',
    order: -50,
    text: () => renderSnapshot(),
  })

  // 1.5 会话结束自动沉淀（v0.6）：turn/end(completed) 后注入总结指令
  try {
    ctx.on('session/event', (session, rawEvent) => {
      handleSessionEvent(session, rawEvent)
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
            const auditRecs = queryAudit({})
            const conn = db.openDb()
            const byType = conn.prepare('SELECT fragment_type AS k, COUNT(*) AS c FROM entries GROUP BY fragment_type ORDER BY c DESC').all().map((r) => ({ key: r.k, count: r.c }))
            const byWeight = conn.prepare("SELECT CASE WHEN weight >= 10 THEN '10+' WHEN weight >= 5 THEN '5-9' WHEN weight >= 3 THEN '3-4' ELSE '<3' END AS k, COUNT(*) AS c FROM entries GROUP BY k ORDER BY c DESC").all().map((r) => ({ key: r.k, count: r.c }))
            const audit7d = auditAggregate({ sinceDays: 7 })
            return send(200, { ok: true, stats: { total: s.total, pinned: s.pinned, layers: s.layers, memoryRoot: MEMORY_ROOT, auditCount: auditRecs.length, dbPath: s.dbPath, vectors: db.vectorCount(), model: embed.modelInfo(), migration: db.migrationStatus(), byType, byWeight, audit7d }, config: CFG, petEndpoint: getPetEndpoint() })
          }
          if (req.method === 'GET' && p === '/config') {
            return send(200, { ok: true, config: CFG, petEndpoint: getPetEndpoint() })
          }
          if (req.method === 'POST' && p === '/config') {
            let body = {}
            try { body = JSON.parse(await readBody(req)) } catch { /* ignore */ }
            const allowed = ['halfLifeDays', 'decayThreshold', 'consolidateThreshold', 'weightCap', 'hotTokenLimit', 'maxQueryResults', 'approvalFallback', 'autoDreamDays', 'autoReflectDays', 'petEndpoint']
            if (body.reset === true) {
              try { fs.unlinkSync(PATHS.config) } catch { /* ignore */ }
              setConfig({ ...DEFAULTS })
              setConflictThreshold(Number(CFG.conflictOverlap) || 3)
              setPetEndpoint(typeof CFG.petEndpoint === 'string' ? CFG.petEndpoint : null)
              audit('CONFIG', { changed: 'reset' })
              return send(200, { ok: true, config: CFG, petEndpoint: getPetEndpoint(), reset: true })
            }
            const next = { ...CFG }
            for (const k of allowed) {
              if (body[k] !== undefined) {
                if (k === 'petEndpoint') next[k] = typeof body[k] === 'string' && body[k] ? body[k] : null
                else if (k === 'approvalFallback') next[k] = body[k] === 'auto' ? 'auto' : 'deny'
                else {
                  const v = Number(body[k])
                  if (Number.isFinite(v) && v >= 0) next[k] = v
                }
              }
            }
            setConfig(next)
            setConflictThreshold(Number(CFG.conflictOverlap) || 3)
            setPetEndpoint(typeof CFG.petEndpoint === 'string' ? CFG.petEndpoint : null)
            saveConfig(CFG)
            audit('CONFIG', { changed: Object.keys(body).filter((k) => allowed.includes(k)).join(',') })
            return send(200, { ok: true, config: CFG, petEndpoint: getPetEndpoint() })
          }
          if (req.method === 'POST' && p === '/dream') {
            const dry = (await readBodyJson(req)).dryRun === true
            const r = runDream({ dryRun: dry })
            if (!dry) scheduleMirrorSync('web-dream').catch(() => {})
            return send(200, { ok: true, report: { ...r, dryRun: dry } })
          }
          if (req.method === 'POST' && p === '/reflect') {
            const dry = (await readBodyJson(req)).dryRun === true
            const r = runReflect({ dryRun: dry })
            if (!dry) scheduleMirrorSync('web-reflect').catch(() => {})
            return send(200, { ok: true, report: { ...r, dryRun: dry } })
          }
          if (req.method === 'GET' && p === '/entries') {
            const q = url.searchParams.get('q') || ''
            const layer = url.searchParams.get('layer') || ''
            const mode = url.searchParams.get('mode') || 'hybrid'
            const limit = Math.min(500, Number(url.searchParams.get('limit')) || 200)
            const prefsTextStr = prefsText()
            if (q) {
              // v0.6.5：带 q 时也应用 layer 筛选；queryEntries 已补齐 hits/pinned/mode/ts/kind
              const res = await queryEntries(q, limit, { mode, minWeight: 0, layer: layer || undefined })
              const seen = new Set()
              const merged = []
              for (const r of res) {
                if (seen.has(r.fp)) continue
                seen.add(r.fp)
                merged.push({ layer: r.layer, fp: r.fp, kind: r.kind, mode: r.mode, weight: r.weight, hits: r.hits, ts: r.ts, pinned: r.pinned, text: r.text, fragment_type: r.fragment_type, semantic: r.semantic, status: entryStatus(r, prefsTextStr) })
              }
              return send(200, { ok: true, entries: merged.slice(0, limit), mode })
            }
            const all = db.listEntries({ layer: layer || undefined, limit: 1000 })
              .map((e) => ({ layer: e.layer, fp: e.fp, kind: e.kind, mode: e.mode, weight: e.weight, hits: e.hits, ts: e.created_at, pinned: e.pinned, text: e.text, fragment_type: e.fragment_type, status: entryStatus(e, prefsTextStr) }))
            all.sort((a, b) => (b.status === 'conflict') - (a.status === 'conflict') || (b.pinned - a.pinned) || (b.weight - a.weight) || String(b.ts || '').localeCompare(String(a.ts || '')))
            return send(200, { ok: true, entries: all.slice(0, limit) })
          }
          if (req.method === 'GET' && p === '/vectors') {
            const r = await ensureVectors()
            return send(200, { ok: true, ...r })
          }
          if (req.method === 'POST' && p === '/vectors') {
            const r = await ensureVectors()
            return send(200, { ok: true, ...r })
          }
          if (req.method === 'GET' && p === '/audit/aggregate') {
            const sinceDays = Number(url.searchParams.get('sinceDays')) || undefined
            const groupBy = url.searchParams.get('groupBy') || 'action'
            const agg = auditAggregate({ sinceDays, groupBy })
            return send(200, { ok: true, entries: agg })
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
          if (req.method === 'GET' && p === '/audit') {
            const sinceDays = Number(url.searchParams.get('sinceDays')) || undefined
            const type = url.searchParams.get('type') || undefined
            const recs = queryAudit({ sinceDays, type })
            return send(200, { ok: true, entries: recs.slice(-50) })
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
  detectConflict,
  zhBigrams,
  runDream,
  runReflect,
  clusterEntries,
  latestReflection,
  consolidateHits,
  removeEntry,
  restoreEntry,
  updateEntryText,
  entryStatus,
  semanticSearch,
  tokenize,
  queryAudit,
  auditAggregate,
  queryEntries,
  setPin,
  scanAllFiles,
  backupNow,
  latestBackup,
  migrateMarkdownToDb,
  ensureVectors,
  sessionSummarySectionText,
  handleSessionEvent,
  markSummaryPending,
  clearSummaryPending,
  setConfig: (c) => { setConfig(c) },
  getConfig: () => ({ ...CFG }),
  paths: PATHS,
}
