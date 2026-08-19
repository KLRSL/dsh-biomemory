// ============================================================================
// test-settings-page.mjs — dsh-biomemory 记忆工作台（巨构视觉 v2）渲染冒烟
// 运行: node tests\test-settings-page.mjs
// 验证: 五 tab / 概览状态卡 / 构成图表 / 模式分段按钮 / 记忆流条目 / 知识库
// ============================================================================
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { createRoot } from 'react-dom/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_SRC = path.join(__dirname, '..', 'client.js')
let failures = 0
function check(label, cond, extra = '') {
  if (cond) { console.log('  ok   ' + label) }
  else { failures++; console.log('  FAIL ' + label + (extra ? '  -> ' + extra : '')) }
}
const tick = () => new Promise((r) => setTimeout(r, 50))

// ---- 准备 jsdom ----
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { pretendToBeVisual: true, url: 'http://127.0.0.1:3080/', runScripts: 'outside-only' })
const { window } = dom
const { document } = window
globalThis.window = window
globalThis.document = document
Object.defineProperty(globalThis, 'navigator', { value: { languages: ['zh-CN'], language: 'zh-CN' }, configurable: true })
// 组件内读 window.navigator（jsdom 的），需同步覆盖
Object.defineProperty(window.navigator, 'languages', { value: ['zh-CN'], configurable: true })
Object.defineProperty(window.navigator, 'language', { value: 'zh-CN', configurable: true })
globalThis.HTMLElement = window.HTMLElement
globalThis.Node = window.Node
globalThis.getComputedStyle = window.getComputedStyle
window.React = React
window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
window.cancelAnimationFrame = (id) => clearTimeout(id)

// ---- fetch 桩：status 带 byType/byWeight/audit7d，entries 带 mode ----
const STATUS = {
  ok: true,
  stats: {
    total: 151, pinned: 15, layers: { 'hot/behavior': 16, 'hot/knowledge': 40, longterm: 15, archive: 25 },
    memoryRoot: '~/.dsh/memory', auditCount: 26, dbPath: '~/.dsh/biomemory/biomemory.db', vectors: 151,
    model: { id: 'bge-small-zh-v1.5', dim: 512, ready: true, offline: true },
    migration: { migrated: true, migratedAt: '2026-08-19T14:20:39.602Z', version: '1' },
    byType: [{ key: 'fact', count: 128 }, { key: 'preference', count: 15 }, { key: 'note', count: 8 }],
    byWeight: [{ key: '10+', count: 135 }, { key: '5-9', count: 11 }, { key: '<3', count: 5 }],
    audit7d: [{ key: 'RECOVER', count: 20 }, { key: 'MIGRATE', count: 2 }, { key: 'RECALL', count: 2 }],
  },
  config: { halfLifeDays: 7, decayThreshold: 3, consolidateThreshold: 3, weightCap: 20, hotTokenLimit: 5000, maxQueryResults: 20, approvalFallback: 'auto', autoDreamDays: 7, autoReflectDays: 3, petEndpoint: null },
  petEndpoint: null,
}
const ENTRIES = {
  ok: true, mode: 'hybrid',
  entries: [
    { fp: 'e1', layer: 'longterm', kind: '知识', fragment_type: 'preference', weight: 12, hits: 3, pinned: true, text: '网络下载一律用国内镜像源' },
    { fp: 'e2', layer: 'longterm', kind: '知识', fragment_type: 'fact', weight: 10, hits: 1, pinned: false, text: '删除数据前先查安装目录（QQ 误删教训）', semantic: true },
  ],
}
window.fetch = async (url) => {
  if (typeof url === 'string' && url.includes('/biomemory/api/status')) {
    return { ok: true, json: async () => STATUS }
  }
  if (typeof url === 'string' && url.includes('/biomemory/api/entries')) {
    const mode = url.includes('mode=') ? decodeURIComponent(url.split('mode=')[1].split('&')[0]) : 'hybrid'
    return { ok: true, json: async () => ({ ...ENTRIES, mode }) }
  }
  if (typeof url === 'string' && url.includes('/biomemory/api/audit')) {
    return { ok: true, json: async () => ({ ok: true, entries: [{ t: '2026-08-19T14:21:03Z', action: 'RECOVER', entry_id: 'x', detail: '{"fp":"a"}' }] }) }
  }
  return { ok: false, json: async () => ({}) }
}

// ---- 加载 client.js，捕获设置页组件 ----
let captured = null
let moduleExports = null
window.__ModuleLoader__ = {
  load: ({ id, factory }) => {
    // primitives mock：Button/Input 渲染为原生 button/input，图标渲染为 span
    const Mock = (tag) => ({ variant, size, icon, children, ...rest }) =>
      React.createElement(tag, rest, children)
    const primMock = {
      Button: Mock('button'),
      Input: Mock('input'),
      StateDot: () => React.createElement('span'),
      IconSearchOutline16: () => React.createElement('span', null, '🔍'),
      IconTrashOutline16: () => React.createElement('span', null, '🗑'),
      IconRefreshOutline14: () => React.createElement('span', null, '🔄'),
      IconCheckOutline16: () => React.createElement('span', null, '✓'),
      IconWarningOutline16: () => React.createElement('span', null, '⚠'),
      IconThinkOutline14: () => React.createElement('span', null, '🧠'),
      IconSettingsOutline16: () => React.createElement('span', null, '⚙'),
      IconLinkOutline14: () => React.createElement('span', null, '🔗'),
      IconBrowseOutline16: () => React.createElement('span', null, '📚'),
    }
    const capturedRequire = (name) => {
      if (name === 'react') return React
      if (name === '@deepseek-ai/dsh-client-ui-primitives') return primMock
      return {}
    }
    const fakeCtx = {
      slots: {
        inject: (slotName, registerFn) => {
          captured = { slotName }
          const result = registerFn()
          if (result && result.component) captured.component = result.component
          return () => {}
        },
        register: (def, comp) => {
          if (captured) captured.component = comp
          return { component: comp, def }
        },
      },
      effect: (fn) => fn(),
    }
    const ex = factory(capturedRequire)
    moduleExports = ex
    ex.apply(fakeCtx)
  },
}
vm.runInContext(readFileSync(CLIENT_SRC, 'utf8'), dom.getInternalVMContext())
await tick()
check('apply 注册 settings.section', !!captured && captured.slotName === 'settings.section')
check('exports.inject = slots', Array.isArray(moduleExports?.inject) && moduleExports.inject.includes('slots'))

const Component = captured?.component
check('设置页组件已捕获', !!Component)
if (!Component) { console.log('❌ 无法继续'); process.exit(failures === 0 ? 0 : 1) }

const appRoot = createRoot(document.getElementById('app'))
appRoot.render(React.createElement(Component))
await tick()

console.log('\n[1] 页面骨架（巨构视觉）')
{
  const h3 = document.querySelector('.bm-page h3')
  check('标题「记忆工作台」', !!h3 && h3.textContent.includes('记忆工作台'), h3 && h3.textContent)
  const sub = document.querySelector('.bm-sub')
  check('副标题（数字海马体）', !!sub && sub.textContent.includes('数字海马体'))
  const tabs = [...document.querySelectorAll('.bm-tab')]
  check('五 tab：概览/知识库/代谢/反思/设置', tabs.length === 5 && tabs[0].textContent.includes('概览') && tabs[2].textContent.includes('代谢'), tabs.map((t) => t.textContent).join(','))
  check('默认 tab=概览 激活', tabs[0].classList.contains('active'))
}

console.log('\n[2] 概览：状态卡')
{
  const cards = [...document.querySelectorAll('.bm-card .v')]
  const values = cards.map((c) => c.textContent)
  check('状态卡数值（151/15/512维/26）', values.some((v) => v === '151') && values.some((v) => v === '15') && values.some((v) => v === '512维') && values.some((v) => v === '26'), values.join(','))
  const labels = [...document.querySelectorAll('.bm-card .l')].map((l) => l.textContent)
  check('状态卡标签（全部记忆/锁定/嵌入模型）', labels.some((l) => l.includes('全部记忆')) && labels.some((l) => l.includes('锁定')) && labels.some((l) => l.includes('嵌入模型')), labels.join(','))
}

console.log('\n[3] 概览：记忆构成（行内紧凑条）')
{
  const h4s = [...document.querySelectorAll('.bm-block h4')].map((h) => h.textContent)
  check('构成/记忆流分区标题', h4s.some((h) => h.includes('记忆构成')) && h4s.some((h) => h.includes('记忆流')), h4s.join(','))
  const rows = [...document.querySelectorAll('.bm-chart-row')]
  check('紧凑条行渲染（类型+权重 ≥5 行）', rows.length >= 5, String(rows.length))
  const fills = [...document.querySelectorAll('.bm-chart-row .fill')]
  check('每条有填充条', fills.length === rows.length, `${fills.length}/${rows.length}`)
  const rowText = rows.map((r) => r.textContent).join('|')
  check('行含标签+数值+百分比', rowText.includes('fact') && rowText.includes('preference') && rowText.includes('≥10') && rowText.includes('%'), rowText.slice(0, 120))
}

console.log('\n[4] 记忆流：模式分段按钮 + 搜索')
{
  const modeBtns = [...document.querySelectorAll('.bm-mode-btn')]
  check('三个分段按钮（hybrid/exact/semantic）', modeBtns.length === 3 && modeBtns[0].textContent.includes('hybrid'), modeBtns.map((b) => b.textContent).join(','))
  check('hybrid 默认激活', modeBtns[0].classList.contains('active'))
  const input = document.querySelector('.bm-search-row input')
  check('搜索框存在且带占位', !!input && input.placeholder.includes('搜记忆'), input && input.placeholder)
  const searchBtn = [...document.querySelectorAll('.bm-search-row button')]
  check('搜索按钮', searchBtn.length >= 1)
}

console.log('\n[5] 记忆流：条目列表（无前缀标记）')
{
  // 输入关键词触发搜索
  const input = document.querySelector('.bm-search-row input')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, '镜像')
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  await tick()
  const searchBtn = [...document.querySelectorAll('.bm-search-row button')].find((b) => b.textContent.includes('搜索'))
  if (searchBtn) { searchBtn.click(); await tick() }
  const entries = [...document.querySelectorAll('.bm-flow-entry')]
  check('记忆流条目渲染（≥1）', entries.length >= 1, String(entries.length))
  if (entries.length) {
    const first = entries[0]
    const mark = first.querySelector('.bm-flow-mark')
    check('锁定条目金点', !!mark && mark.classList.contains('gold'))
    const text = first.querySelector('.t')
    check('条目原文显示（无金·/墨·前缀）', !!text && !text.textContent.includes('金·') && !text.textContent.includes('墨·'), text && text.textContent.slice(0, 20))
    const meta = first.querySelector('.d')
    check('元数据（preference · 权重 12 · 锁定）', !!meta && meta.textContent.includes('权重 12') && meta.textContent.includes('锁定'), meta && meta.textContent)
    const opBtn = first.querySelector('.bm-flow-op button')
    check('操作按钮（解锁）', !!opBtn && opBtn.textContent.includes('解锁'))
  }
}

console.log('\n[6] 切换模式按钮（exact）')
{
  const modeBtns = [...document.querySelectorAll('.bm-mode-btn')]
  modeBtns[1].click()
  await tick()
  check('exact 激活', modeBtns[1].classList.contains('active'))
  check('hybrid 取消激活', !modeBtns[0].classList.contains('active'))
}

console.log('\n[7] 知识库 tab')
{
  const tabs = [...document.querySelectorAll('.bm-tab')]
  tabs[1].click()
  await tick()
  const h4 = document.querySelector('.bm-block h4')
  check('知识库标题', !!h4 && h4.textContent.includes('知识库'))
  const kbModeBtns = [...document.querySelectorAll('.bm-mode-btn')]
  check('知识库也有模式分段按钮', kbModeBtns.length === 3)
  const kbInput = document.querySelector('.bm-toolbar input')
  check('知识库搜索框', !!kbInput)
}

console.log('\n[8] 代谢 tab（dream + audit）')
{
  const tabs = [...document.querySelectorAll('.bm-tab')]
  tabs[2].click()
  await tick()
  const h4s = [...document.querySelectorAll('.bm-block h4')].map((h) => h.textContent)
  check('代谢/审计分区', h4s.some((h) => h.includes('记忆代谢')) && h4s.some((h) => h.includes('审计')), h4s.join(','))
  const btns = [...document.querySelectorAll('.bm-block button')].map((b) => b.textContent)
  check('dream 执行/预览按钮', btns.some((b) => b.includes('dream')), btns.join(','))
}

console.log('\n[9] 反思 tab')
{
  const tabs = [...document.querySelectorAll('.bm-tab')]
  tabs[3].click()
  await tick()
  const h4s = [...document.querySelectorAll('.bm-block h4')].map((h) => h.textContent)
  check('反思标题', h4s.some((h) => h.includes('反思')), h4s.join(','))
}

console.log('\n[10] 设置 tab（配置项保留）')
{
  const tabs = [...document.querySelectorAll('.bm-tab')]
  tabs[4].click()
  await tick()
  const h4 = document.querySelector('.bm-block h4')
  check('设置标题', !!h4 && h4.textContent.includes('系统配置'))
  const labels = [...document.querySelectorAll('.bm-field label')].map((l) => l.textContent)
  check('配置字段（半衰期/归档阈值）', labels.some((l) => l.includes('半衰期')) && labels.some((l) => l.includes('归档阈值')), labels.join(','))
  const roots = [...document.querySelectorAll('.bm-root')].map((r) => r.textContent)
  const notes = [...document.querySelectorAll('.bm-note')].map((r) => r.textContent)
  check('SQLite/迁移信息', roots.some((r) => r.includes('SQLite')) && (roots.some((r) => r.includes('Markdown')) || notes.some((r) => r.includes('Markdown'))), roots.join(' | ') + ' / ' + notes.join(' | '))
}

console.log('\n[11] 清理')
{
  appRoot.unmount()
  check('React 卸载', !document.querySelector('.bm-page'))
}

console.log(failures === 0 ? '\n✅ 设置页测试全部通过' : `\n❌ ${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
