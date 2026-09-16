#!/usr/bin/env node
/**
 * release-check.mjs — 发布一致性自检（零依赖，本地与 CI 共用）
 *
 * 检查项：
 *   1. package.json 版本号合法（semver），且 description 内嵌版本与之一致
 *   2. README.md / README.en.md 首页横幅出现 v<version>，版本历史小节也列出该版本
 *   3. package-lock.json（若存在）根版本与 package.json 一致，且未被 .gitignore 忽略
 *   4. peerDependenciesMeta 的键必须是 peerDependencies 的真子集，取值须为 boolean
 *   5. files 白名单覆盖 main / exports / dsh.bundle.patch 及其相对 import 闭包
 *   6. files 白名单里不得有已不存在的路径
 *   7. git 工作区干净（CI 环境自动跳过；本地默认 warn，--strict-git 时视为失败）
 *
 * 用法：
 *   node scripts/release-check.mjs             # 本地自检
 *   node scripts/release-check.mjs --strict-git # 把「工作区不干净」也当失败
 *
 * 退出码：0 = 全部通过（允许 warn），1 = 存在 FAIL
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const strictGit = process.argv.includes('--strict-git')
const fails = []
const warns = []
const passes = []

const fail = (m) => fails.push(m)
const warn = (m) => warns.push(m)
const pass = (m) => passes.push(m)
const rel = (p) => path.relative(root, p).split(path.sep).join('/')
const abs = (p) => path.resolve(root, p)
const exists = (p) => fs.existsSync(abs(p))

const pkgPath = abs('package.json')
if (!fs.existsSync(pkgPath)) {
  console.error('FAIL: 未找到 package.json（请在插件仓库根目录运行）')
  process.exit(1)
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const version = String(pkg.version ?? '')
const name = String(pkg.name ?? '(unnamed)')

// ── 1. 版本号 / description ────────────────────────────────────────────────
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`package.json version 不是合法 semver: "${version}"`)
} else {
  pass(`版本号 ${version}`)
}
const desc = String(pkg.description ?? '')
const descVer = /v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(desc)?.[1]
if (!descVer) {
  warn('description 未内嵌版本号（建议写入，便于 npm 页面展示）')
} else if (descVer !== version) {
  fail(`description 内嵌版本 ${descVer} ≠ package.json ${version}`)
} else {
  pass(`description 版本一致（${descVer}）`)
}

// ── 2. README 版本露出 ────────────────────────────────────────────────────
const HISTORY_RE = /^#{2,4}\s*(版本历史|更新历史|Version History|Changelog)\s*$/im
const vTag = `v${version}`
for (const readme of ['README.md', 'README.en.md']) {
  if (!exists(readme)) {
    if (readme === 'README.md') fail('缺少 README.md')
    else warn(`缺少 ${readme}（双语仓库建议补齐）`)
    continue
  }
  const text = fs.readFileSync(abs(readme), 'utf-8')
  const lines = text.split(/\r?\n/)
  const inBanner = lines.slice(0, 12).some((l) => l.includes(vTag))
  if (!inBanner) fail(`${readme} 首页前 12 行未出现 ${vTag}`)
  const count = text.split(vTag).length - 1
  if (count < 2) fail(`${readme} 中 ${vTag} 仅出现 ${count} 次（首页 + 版本历史各需一次）`)
  const m = HISTORY_RE.exec(text)
  if (!m) {
    warn(`${readme} 未找到版本历史小节标题`)
  } else if (!text.slice(m.index).includes(vTag)) {
    fail(`${readme} 版本历史小节未列出 ${vTag}`)
  }
  if (inBanner && count >= 2 && m && text.slice(m.index).includes(vTag)) {
    pass(`${readme} 版本露出完整（横幅 + 历史）`)
  }
}

// ── 3. lock 文件 ──────────────────────────────────────────────────────────
const lockPath = abs('package-lock.json')
if (fs.existsSync(lockPath)) {
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'))
    const rootLock = lock.packages?.['']?.version ?? lock.version
    if (rootLock !== version) fail(`package-lock.json 根版本 ${rootLock} ≠ ${version}`)
    else pass(`package-lock.json 根版本一致（${rootLock}）`)
    if (lock.name && lock.name !== name) fail(`package-lock.json name ${lock.name} ≠ ${name}`)
  } catch (e) {
    fail(`package-lock.json 解析失败: ${e.message}`)
  }
  const gi = abs('.gitignore')
  if (fs.existsSync(gi)) {
    const ignored = fs
      .readFileSync(gi, 'utf-8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .some((l) => l === 'package-lock.json' || l === '*.json' || l === '/package-lock.json')
    if (ignored) fail('.gitignore 忽略了 package-lock.json（发布不可复现）')
    else pass('package-lock.json 未被忽略')
  }
} else {
  const depCount =
    Object.keys(pkg.dependencies ?? {}).length +
    Object.keys(pkg.devDependencies ?? {}).length +
    Object.keys(pkg.optionalDependencies ?? {}).length
  if (depCount === 0) pass('无 package-lock.json（零依赖包，无需 lock）')
  else warn('无 package-lock.json（CI 将退回 npm install，发布不可复现）')
}

// ── 4. peerDependencies ───────────────────────────────────────────────────
const peers = Object.keys(pkg.peerDependencies ?? {})
const peerMeta = pkg.peerDependenciesMeta ?? {}
for (const [k, v] of Object.entries(peerMeta)) {
  if (!peers.includes(k)) fail(`peerDependenciesMeta 含多余键 ${k}（不在 peerDependencies 中）`)
  if (!v || typeof v.optional !== 'boolean') fail(`peerDependenciesMeta["${k}"].optional 必须是 boolean`)
}
if (Object.keys(peerMeta).length && !fails.some((f) => f.includes('peerDependenciesMeta'))) {
  pass(`peerDependenciesMeta 合法（${Object.keys(peerMeta).length} 项，peer 共 ${peers.length} 项）`)
}

// ── 5/6. files 白名单覆盖 ─────────────────────────────────────────────────
const AUTO = /^(package\.json|README(\.[a-z]+)?\.md|LICENSE(\.[a-z]+)?|CHANGELOG(\.[a-z]+)?)$/i
const filesField = pkg.files
if (!Array.isArray(filesField) || filesField.length === 0) {
  warn('package.json 无 files 白名单（npm 将发布整个目录，易混入测试与备份）')
} else {
  for (const f of filesField) {
    if (!fs.existsSync(abs(f))) fail(`files 白名单中的路径不存在: ${f}`)
  }
  const covered = (fileRel) => {
    if (AUTO.test(fileRel)) return true
    return filesField.some((entry) => {
      const e = String(entry).replace(/^\.\//, '').replace(/\/+$/, '')
      if (fileRel === e) return true
      if (fileRel.startsWith(e + '/')) return true
      if (!/[*?]/.test(e)) return false
      const re = new RegExp(
        '^' + e.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$'
      )
      return re.test(fileRel)
    })
  }

  // 入口集合
  const entries = new Set()
  if (typeof pkg.main === 'string') entries.add(pkg.main)
  const addExports = (v) => {
    if (typeof v === 'string') entries.add(v)
    else if (v && typeof v === 'object') for (const x of Object.values(v)) addExports(x)
  }
  addExports(pkg.exports)
  const patch = pkg.dsh?.bundle?.patch
  if (typeof patch === 'string') entries.add(patch)

  const seen = new Set()
  const missing = []
  const walk = (fileRel) => {
    const key = fileRel.replace(/^\.\//, '')
    if (seen.has(key)) return
    seen.add(key)
    if (!covered(key)) missing.push(key)
    const p = abs(key)
    if (!fs.existsSync(p) || !/\.(mjs|cjs|js|ts)$/.test(key)) return
    const src = fs.readFileSync(p, 'utf-8')
    const dir = path.dirname(key)
    const specs = new Set()
    for (const re of [
      /\bfrom\s*['"](\.[^'"]+)['"]/g,
      /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
      /\bimport\s*['"](\.[^'"]+)['"]/g,
      /\brequire\(\s*['"](\.[^'"]+)['"]\s*\)/g,
    ]) {
      let mm
      while ((mm = re.exec(src))) specs.add(mm[1])
    }
    for (const s of specs) {
      if (s.startsWith('node:')) continue
      const target = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, s))
      const candidates = [target, `${target}.mjs`, `${target}.cjs`, `${target}.js`, `${target}/index.mjs`]
      const hit = candidates.find((c) => fs.existsSync(abs(c)))
      if (!hit) {
        warn(`${key} 引用的 ${s} 不存在（可能是运行时可选加载）`)
        continue
      }
      walk(hit)
    }
  }
  for (const e of entries) walk(e)

  if (missing.length) fail(`files 白名单未覆盖: ${[...new Set(missing)].join(', ')}`)
  else pass(`files 白名单覆盖入口与相对 import 闭包（${seen.size} 个文件）`)
}

// ── 7. git 工作区 ─────────────────────────────────────────────────────────
if (process.env.CI) {
  pass('CI 环境，跳过工作区检查')
} else {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf-8' })
    const dirty = out.split(/\r?\n/).filter(Boolean)
    if (dirty.length) {
      const msg = `工作区有 ${dirty.length} 处未提交改动（发布前应提交并推送）`
      if (strictGit) fail(msg)
      else warn(msg)
    } else {
      pass('git 工作区干净')
    }
  } catch {
    warn('git 不可用或不在版本库中，跳过工作区检查')
  }
}

// ── 汇总 ─────────────────────────────────────────────────────────────────
const tag = `${name}@${version}`
for (const p of passes) console.log(`  ok   ${p}`)
for (const w of warns) console.log(`  warn ${w}`)
for (const f of fails) console.log(`  FAIL ${f}`)
console.log(
  fails.length
    ? `\n✖ ${tag}: ${fails.length} 项失败 / ${warns.length} 项警告`
    : `\n✔ ${tag}: 全部通过（${passes.length} 项，${warns.length} 项警告）`
)
process.exit(fails.length ? 1 : 0)
