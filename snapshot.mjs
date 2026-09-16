// ============================================================================
// dsh-biomemory · 快照与会话沉淀层（snapshot.mjs，v0.6 架构升级）
//
//   - renderSnapshot：会话启动注入 system prompt 的冻结快照（偏好/锁定/知识/行为）
//   - 会话结束自动沉淀：turn/end(completed) 后注入"请沉淀"指令，模型据此 memory add
// 从 index.mjs 拆出；依赖 shared / db / session-state。
// ============================================================================

import * as db from './db.mjs'
import {
  PATHS, estimateTokens, detectConflict, CFG, prefsText,
} from './shared.mjs'
import {
  isSummaryPending, getSummarySid, getLastTurnEnd, setLastTurnEnd, markSummaryPending, clearSummaryPending,
} from './session-state.mjs'

// ---------- 冻结快照（会话启动注入 system prompt；注册即冻结） ----------

// 截断标记（保留偏好/锁定的可见性：被裁掉的内容以一行细说明代替）
const CUT_MARK = '（…预算已满，其余条目本条快照内省略）'

// 逐条（按行）截断文本到 token 上限：保留标题与尽可能多的完整行；
// 剩余空间不足以容纳首行时按字符瘦身（保证不超预算）。空结果 = 该段完全放不下。
function trimTextToTokens(text, maxTokens, title = null) {
  const limit = Math.max(0, Number(maxTokens) || 0)
  if (!text) return ''
  const lines = String(text).split('\n').filter((l) => l.trim() !== '')
  if (!lines.length) return ''
  const head = title !== null ? title : (lines[0].startsWith('## ') ? lines[0] : null)
  const body = head !== null ? lines.slice(1) : lines
  const reserve = estimateTokens(CUT_MARK)
  const kept = []
  let used = estimateTokens(head ? head + '\n' : '')
  let cut = false
  for (const line of body) {
    const t = estimateTokens(line + '\n')
    if (used + t + reserve > limit) { cut = true; break }
    kept.push(line)
    used += t
  }
  if (!kept.length && body.length) {
    const room = limit - used - reserve
    if (room <= 4) return ''
    const first = body[0]
    let take = Math.floor(first.length * room / Math.max(1, estimateTokens(first)) * 0.9)
    while (take > 8 && estimateTokens(first.slice(0, take)) > room) take = Math.floor(take * 0.8)
    if (take <= 8) return ''
    kept.push(first.slice(0, take).trimEnd() + ' …')
    cut = true
  } else if (kept.length < body.length) {
    cut = true
  }
  const out = []
  if (head) out.push(head)
  out.push(...kept)
  if (cut) out.push(CUT_MARK)
  return out.join('\n')
}

export function renderSnapshot() {
  const prefs = db.listEntries({ fragmentType: 'preference', status: 'active', limit: 200 })
    .map((e) => `- [${e.created_at ? String(e.created_at).slice(0, 10) : ''}]${e.memory_class ? `[${e.memory_class}]` : ''} ${e.text}`)
    .join('\n')
  const all = db.allEntries()
  const pinned = []
  const kb = []
  const bb = []
  for (const e of all) {
    if (e.pinned) pinned.push(`- [锁定|${e.layer}]${e.memory_class ? `[${e.memory_class}]` : ''} ${e.text}`)
    else if (e.fragment_type === 'preference' || e.kind === '知识') kb.push(e)
    else bb.push(e)
  }
  // 自动召回排序：权重高、新近的优先（预算内只注入最有价值的）
  const rank = (a, b) => (b.weight - a.weight) || (String(b.created_at || '').localeCompare(String(a.created_at || '')))
  const fmt = (e) => `- [${e.layer}]${e.memory_class ? `[${e.memory_class}]` : ''} ${e.text}`
  const prefsTextStr = prefsText()
  const HEADER = `# 记忆快照（dsh-biomemory，会话冻结）\n\n> 本快照 = Applied Context（已注入 prompt 供参考）。Memory（存储层）与 Retrieved（查询候选）不在此列；检索到 ≠ 已采用，执行与否以模型结合上下文的判断为准。\n\n`
  // v0.6.5 预算修正（旧实现只扣 header+prefs+pinned 且两段自身不截断）：
  //   ① 偏好/锁定按各自内容占比分配预算并「逐条」截断（去掉整行，必要时单行瘦身）；
  //   ② 先给 kb/bb 预留保底下限（KB_FLOOR），避免 budget 变负导致知识/行为整段丢失；
  //   ③ 末尾兜底按 尾巴优先 继续裁剪，保证 estimateTokens(text) ≤ hotTokenLimit。
  // 预算分配（按内容自身 token 估算，避免位置索引错位）
  const KB_FLOOR = Math.max(300, Math.floor(CFG.hotTokenLimit * 0.25))
  const headerTokens = estimateTokens(HEADER)
  const budget = Math.max(0, CFG.hotTokenLimit - headerTokens)
  const softBudget = Math.max(0, budget - KB_FLOOR)
  const prefsNeed = prefs !== '' ? estimateTokens(prefs) : 0
  const pinnedNeed = pinned.length ? estimateTokens(pinned.join('\n')) : 0
  const headTokens = Math.min(softBudget, prefsNeed + pinnedNeed)
  // 补算：偏好/锁定 + 空标题占用之后还剩多少 → 作为 kb/bb 的实际预算（下限 KB_MIN，保证有内容）
  const KB_MIN = 220
  const kbBudget = Math.max(KB_MIN, budget - headTokens - 60)
  const totalHead = prefsNeed + pinnedNeed
  // 偏好至多占软预算的 90%，其余留给 kb/bb（避免偏好独吞导致知识/行为段只剩标题）
  const prefsCap = Math.floor(softBudget * 0.9)
  const prefsSoft = totalHead > 0
    ? Math.min(prefsCap, Math.max(pinnedNeed > 0 ? softBudget - pinnedNeed : softBudget, Math.floor(softBudget * prefsNeed / totalHead)))
    : 0
  const pinnedSoft = Math.max(0, softBudget - prefsSoft)
  const head = []
  if (prefs !== '') head.push(trimTextToTokens('## 用户偏好（最高优先级，写入须尊重）\n' + prefs, prefsSoft, '## 用户偏好（最高优先级，写入须尊重）'))
  if (pinned.length) {
    head.push(trimTextToTokens(
      '## 锁定记忆（最高优先级，不参与衰减）\n' +
      '> 说明：锁定 = 不遗忘（防衰减/归档），不代表每轮必须执行。与当前任务无关时按 relevance admission 忽略；' +
      '与用户明确偏好冲突时以用户最新明确决定为准。\n' + pinned.join('\n'),
      pinnedSoft,
      // title 只能是第一行（正文含 '> 说明' 行，若整体当标题会让正文为空 → 该段被整段丢弃）
      '## 锁定记忆（最高优先级，不参与衰减）',
    ))
  }
  // kb/bb 各自按剩余预算（下限 KB_MIN）截断——保证「偏好写爆也不吞掉知识/行为段」
  const rest = []
  if (kb.length) {
    // 排序：真·知识条目优先于「偏好类」条目（偏好已有专门段落，避免重复占用知识段预算
    // 把知识点挤掉），同类内按 weight/新近排序；再按剩余预算逐条截断（保底下限 KB_MIN）
    const kbSorted = [...kb].sort((a, b) => {
      const ka = a.kind === '知识' ? 0 : 1
      const kbb = b.kind === '知识' ? 0 : 1
      return (ka - kbb) || rank(a, b)
    })
    rest.push(trimTextToTokens('## 近期知识记忆\n' + kbSorted.map(fmt).join('\n'), kbBudget, '## 近期知识记忆'))
  }
  if (bb.length) {
    // 与偏好冲突的行为记忆置顶并标注（冲突浮出，会话内即可发现）
    const bbSorted = [...bb].sort((a, b) => {
      const ca = a.kind === '行为' && detectConflict(a, prefsTextStr) ? 1 : 0
      const cb = b.kind === '行为' && detectConflict(b, prefsTextStr) ? 1 : 0
      return (cb - ca) || rank(a, b)
    })
    rest.push(trimTextToTokens('## 近期行为记忆\n' + bbSorted.map((e) => `- [${e.layer}]${e.memory_class ? `[${e.memory_class}]` : ''}${e.kind === '行为' && detectConflict(e, prefsTextStr) ? ' [冲突]' : ''} ${e.text}`).join('\n'), kbBudget, '## 近期行为记忆'))
  }
  const keep = [...head, ...rest].filter((p) => p !== '')
  if (!keep.length) return ''
  let text = HEADER + keep.join('\n\n')
  // 兜底：仍超限则从尾部（行为记忆 → 知识记忆 → 锁定 → 偏好）继续裁剪，保证硬上限
  let guard = 0
  while (estimateTokens(text) > CFG.hotTokenLimit && keep.filter(Boolean).length && guard++ < 12) {
    let idx = -1
    for (let i = keep.length - 1; i >= 0; i--) {
      if (keep[i]) { idx = i; break }
    }
    if (idx < 0) break
    const overflow = estimateTokens(text) - CFG.hotTokenLimit
    if (keep[idx].includes(CUT_MARK)) {
      // 已裁到极限仍超限：整段丢弃（先丢尾部的 kb/bb，再丢锁定，最后才丢偏好）
      keep.splice(idx, 1)
    } else {
      const target = Math.max(0, estimateTokens(keep[idx]) - overflow - 40)
      keep[idx] = trimTextToTokens(keep[idx], target)
      if (!keep[idx]) keep.splice(idx, 1)
    }
    text = HEADER + keep.filter(Boolean).join('\n\n')
  }
  return estimateTokens(text) > CFG.hotTokenLimit ? HEADER : text
}

// ---------- 会话结束自动沉淀（v0.6） ----------

// 供 systemPrompt.section 调用的总结指令文本（无待沉淀标记时返回空串，不污染提示词）
export function sessionSummarySectionText() {
  // 无待沉淀标记 → 不注入
  if (!isSummaryPending()) return ''
  // 距上次 turn/end 超过 5 分钟（用户在另一处、或已沉淀）→ 不再催促
  const last = getLastTurnEnd()
  if (last > 0 && Date.now() - last > 5 * 60 * 1000) {
    clearSummaryPending()
    return ''
  }
  // 注入一次总结指令：引导模型判断本轮有无值得沉淀的偏好/决策/教训并写入
  return [
    '## 本轮对话已结束 · 请沉淀值得长期记住的内容',
    '请回顾刚刚结束的这轮对话，判断是否有值得写入长期记忆的：用户偏好/纠正/项目决策/踩坑教训。',
    '若有，请用 `memory` 工具写入（track=user 存偏好/知识，track=agent 存行为/教训），做到严格去重——',
    '与已有记忆重复或可用代码/文件重新推导的不要写。若本轮无可沉淀内容，忽略即可。',
  ].join('\n')
}

// 监听 DSH 会话事件：turn/end(completed/success) 时标记本会话"待沉淀"
export function handleSessionEvent(session, rawEvent) {
  try {
    const ev = rawEvent ?? {}
    const evType = typeof ev.type === 'string' ? ev.type : ''
    if (evType === 'turn/end') {
      const reason = ev.data?.reason?.kind ?? ev.data?.reason
      const done = typeof reason === 'string' && (reason === 'completed' || reason === 'success')
      if (done) {
        setLastTurnEnd(Date.now(), session?.id ?? '')
        markSummaryPending(session?.id ?? '')
      }
    }
  } catch { /* 静默，不影响会话 */ }
}
