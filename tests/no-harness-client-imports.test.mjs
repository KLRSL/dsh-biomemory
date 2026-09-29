/**
 * 守卫测试：客户端半边不得 require 任何 Harness Client 包。
 *
 * 官方依据：@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/references/practices.md
 * §UI 第 1 条——"Do not require('@deepseek-ai/dsh-client-ui-primitives') or load any other
 * Harness Client package as a module"。该包随版本改名（0.2.0-rc.2 起图标只导出
 * ...Regular/...Medium，裸名与 ...16 后缀名全部消失），require 到 undefined 组件会在渲染时
 * 整块清空槽位（console: slot entry crashed in '<slot>'）。
 *
 * 因此本插件的控件与图标已本地化（见 lib/client.js 顶部 vendored 块），本测试防止回归。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const read = p => readFileSync(join(root, p), 'utf8')

/** 去掉注释后再做代码判定，避免说明文字误报 */
const stripComments = src =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('客户端半边不得 require 任何 Harness Client 包', () => {
  const code = stripComments(read('lib/client.js'))
  const found = [...code.matchAll(/require\(\s*["'](@deepseek-ai\/[^"']+)["']\s*\)/g)].map(m => m[1])
  assert.deepEqual(
    found,
    [],
    `lib/client.js 不得 require Harness Client 包，实际发现：${found.join(', ')}`,
  )
})

test('客户端半边不得出现 dsh.client.external 未声明的裸外部模块加载', () => {
  // 仅允许基线的 react（平台模块表提供 React）
  const code = stripComments(read('lib/client.js'))
  const reqs = [...code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map(m => m[1])
  const unexpected = reqs.filter(n => n !== 'react')
  assert.deepEqual(unexpected, [], `出现未预期的 require：${unexpected.join(', ')}`)
})

test('本地化控件与 9 个图标齐备（替代官方 primitives）', () => {
  const src = read('lib/client.js')
  const required = [
    'const bmCx =',
    'const bmJsx =',
    'function Button(',
    'function Input(',
    'IconSearchOutline16',
    'IconTrashOutline16',
    'IconRefreshOutline14',
    'IconCheckOutline16',
    'IconWarningOutline16',
    'IconThinkOutline14',
    'IconSettingsOutline16',
    'IconLinkOutline14',
    'IconBrowseOutline16',
  ]
  for (const n of required) assert.ok(src.includes(n), `lib/client.js 缺少本地化成员：${n}`)
})

test('本地化控件样式使用 bm- 前缀与主题令牌', () => {
  const src = read('lib/client.js')
  for (const cls of ['.bm-btn{', '.bm-btn-primary{', '.bm-input-wrap{', '.bm-input{']) {
    assert.ok(src.includes(cls), `缺少样式：${cls}`)
  }
  // 颜色必须走 --dsw-alias-* 令牌（允许回退到插件自有变量）
  assert.ok(src.includes('var(--dsw-alias-button-primary-fill'), '主色未走主题令牌')
})

test('package.json 的 dsh.client 不声明不存在的官方包', () => {
  const pkg = JSON.parse(read('package.json'))
  const inject = pkg?.dsh?.client?.inject ?? []
  assert.ok(Array.isArray(inject), 'dsh.client.inject 必须是数组')
  assert.ok(
    !inject.includes('@deepseek-ai/dsh-client-runtime'),
    'dsh.client.inject 仍声明了 0.2.0-rc.2 中不存在的 @deepseek-ai/dsh-client-runtime',
  )
})
