// ============================================================================
// test-settings-page.mjs — dsh-biomemory 记忆工作台（现代极简）渲染冒烟
// 运行: node tests\test-settings-page.mjs
// 验证: 五 tab / 概览状态卡 / 构成图表 / 无模式分段按钮（v0.9.0 起） / 记忆流条目 / 知识库
// ============================================================================
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { createRoot } from 'react-dom/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_SRC = path.join(__dirname, '..', 'lib', 'client.js')
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

console.log('\n[1] 页面骨架（精简后：3 tab）')
{
  const h3 = document.querySelector('.bm-page h3')
  check('标题「记忆工作台」', !!h3 && h3.textContent.includes('记忆工作台'), h3 && h3.textContent)
  const sub = document.querySelector('.bm-sub')
  check('副标题（数字海马体）', !!sub && sub.textContent.includes('数字海马体'))
  const tabs = [...document.querySelectorAll('.bm-tab')]
  check('三个 tab：记忆/维护/设置', tabs.length === 3
    && tabs[0].textContent.includes('记忆')
    && tabs[1].textContent.includes('维护')
    && tabs[2].textContent.includes('设置'), tabs.map((x) => x.textContent).join(','))
  check('默认 tab=记忆 激活', tabs[0].classList.contains('active'))
  check('概览已下线（无状态卡）', document.querySelectorAll('.bm-card').length === 0)
}

console.log('\n[2] 记忆 tab：搜索与条目')
{
  const input = document.querySelector('.bm-toolbar input')
  check('搜索框存在且带占位', !!input && input.placeholder.includes('搜记忆'), input && input.placeholder)
  const sel = document.querySelector('.bm-toolbar select')
  check('层筛选下拉', !!sel, sel && sel.tagName)
  // 条目是按需加载（挂载时不自动拉）→ 先点一次「搜索」
  const searchBtn = [...document.querySelectorAll('.bm-toolbar button')].find((b) => b.textContent.includes('搜索'))
  check('搜索按钮存在', !!searchBtn, '')
  if (searchBtn) { searchBtn.click(); await tick() }
  const entries = [...document.querySelectorAll('.bm-entry')]
  check('条目列表渲染（≥1）', entries.length >= 1, String(entries.length))
  if (entries.length) {
    const first = entries[0]
    check('条目原文显示', !!first.querySelector('.bm-entry-text'), '')
    const meta = first.querySelector('.bm-entry-meta')
    check('元数据（权重/命中）', !!meta && meta.textContent.includes('权重'), meta && meta.textContent.slice(0, 60))
    const ops = [...first.querySelectorAll('.bm-entry-ops button')].map((b) => b.textContent)
    check('条目操作（钉选/编辑/删除）', ops.length >= 3, ops.join(','))
    check('裁决按钮已下线', !ops.some((x) => x.includes('作废') || x.includes('取代')), ops.join(','))
  }
}

console.log('\n[3] 模式选择器已彻底移除')
{
  check('DOM 中不存在 .bm-mode-btn', document.querySelectorAll('.bm-mode-btn').length === 0)
  check('DOM 中不存在 .bm-mode-row', document.querySelectorAll('.bm-mode-row').length === 0)
}

console.log('\n[4] 维护 tab（代谢 + 审计）')
{
  const tabs = [...document.querySelectorAll('.bm-tab')]
  tabs[1].click()
  await tick()
  const h4s = [...document.querySelectorAll('.bm-block h4')].map((h) => h.textContent)
  check('代谢/审计分区', h4s.some((h) => h.includes('记忆代谢')) && h4s.some((h) => h.includes('审计')), h4s.join(','))
  const btns = [...document.querySelectorAll('.bm-block button')].map((b) => b.textContent)
  check('dream 执行/预览按钮', btns.some((b) => b.includes('dream')), btns.join(','))
  check('反思入口已下线', !h4s.some((h) => h.includes('反思')) && !h4s.some((h) => h.includes('记忆构成')), h4s.join(','))
}

console.log('\n[5] 设置 tab（配置项保留）')
{
  const tabs = [...document.querySelectorAll('.bm-tab')]
  tabs[2].click()
  await tick()
  const h4 = document.querySelector('.bm-block h4')
  check('设置标题', !!h4 && h4.textContent.includes('系统配置'), h4 && h4.textContent)
  const labels = [...document.querySelectorAll('.bm-field label')].map((l) => l.textContent)
  check('配置字段（半衰期/归档阈值）', labels.some((l) => l.includes('半衰期')) && labels.some((l) => l.includes('归档阈值')), labels.join(','))
  check('桌宠推送字段已下线', !labels.some((l) => l.includes('通知服务')), labels.join(','))
  const roots = [...document.querySelectorAll('.bm-root')].map((r) => r.textContent)
  const notes = [...document.querySelectorAll('.bm-note')].map((r) => r.textContent)
  check('SQLite/迁移信息', roots.some((r) => r.includes('SQLite')) && (roots.some((r) => r.includes('Markdown')) || notes.some((r) => r.includes('Markdown'))), roots.join(' | '))
}

console.log('\n[6] 清理')
{
  appRoot.unmount()
  check('React 卸载', !document.querySelector('.bm-page'))
}

console.log(failures === 0 ? '\n✅ 设置页测试全部通过' : `\n❌ ${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
