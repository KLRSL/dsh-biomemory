// ============================================================================
// dsh-biomemory · 镜像同步挂载（mirror.mjs）
//
// 作用：代谢/反思等「批量改动记忆」的操作结束后，异步调用外部维护脚本
// E:\DE\tools\bm-sync-mirror.cjs，把 SQLite 重新导出成 E:\DE\memory 下的
// 两份人类可读镜像（preferences.md + longterm\条目镜像.md）。
//
// 为什么由外部脚本做、而不是插件自己写 Markdown（关键设计约束）：
//   v0.6.4 单轨制的核心决定就是「SQLite 唯一事实源，插件不再写 Markdown」。
//   若在插件写入路径里恢复 Markdown 写入，等于退回双轨（正是 8/20~9/5 那 79 条
//   记忆从未注入的根因）。因此这里只做「触发」，Markdown 的生成与备份全部留在
//   外部脚本里——插件写入路径保持单轨不变。
//
// 完全可选、非致命：脚本不存在/执行失败/超时都不影响记忆本体，只留一行调试日志。
// 可用环境变量 DSH_BIOMEMORY_MIRROR_SYNC=0 关闭，或设为脚本绝对路径覆盖。
// ============================================================================

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dbgLog } from './shared.mjs'

// 本机脚本默认位置：E:\DE\tools\bm-sync-mirror.cjs
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))

/** 惰性求值（每次调用时读环境变量）——不要提到模块顶层常量：
 *  本模块会被 index.mjs 静态 import，若在加载时就固化路径，
 *  调用方「先 import 后设 DSH_BIOMEMORY_MIRROR_SCRIPT」的覆盖会失效
 *  （测试与自定义脚本路径都踩得到；与 db.mjs::biomemoryDir() 同一教训）。 */
function resolveMirrorScript() {
  return process.env.DSH_BIOMEMORY_MIRROR_SCRIPT
    || path.resolve(PLUGIN_DIR, '..', '..', 'tools', 'bm-sync-mirror.cjs')
}

/** 异步触发镜像同步（不阻塞调用方，不抛错）。
 *  @param {string} why 触发来源，仅用于调试日志（如 'dream' / 'reflect'）
 *  @returns {Promise<{ok:boolean, skipped?:boolean, reason?:string, code?:number}>} */
export function scheduleMirrorSync(why = 'unknown') {
  return new Promise((resolve) => {
    try {
      if (process.env.DSH_BIOMEMORY_MIRROR_SYNC === '0') {
        return resolve({ ok: false, skipped: true, reason: 'disabled-by-env' })
      }
      const script = resolveMirrorScript()
      if (!fs.existsSync(script)) {
        dbgLog(`mirror sync skipped (${why}): script not found at ${script}`)
        return resolve({ ok: false, skipped: true, reason: 'script-missing' })
      }
      let settled = false
      const done = (r) => { if (!settled) { settled = true; resolve(r) } }
      // detached + unref：脚本独立于插件生命周期；windowsHide 避免闪控制台窗口
      const child = spawn(process.execPath, [script], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: process.env,   // 透传 DSH_MEMORY_ROOT / DSH_BIOMEMORY_DIR，保证两边路径一致
      })
      child.on('error', (err) => {
        dbgLog(`mirror sync failed (${why}): ${String(err && err.message || err)}`)
        done({ ok: false, reason: 'spawn-error' })
      })
      // 只认 close（exit 与 unref 组合下可能收不到——实测 detached+unref 会抑制 exit 事件，
      // 导致这里的 Promise 永不 settle、调用方 await 悬挂）；close 在 stdio 关闭后才发。
      child.on('close', (code) => {
        if (code === 0) dbgLog(`mirror sync ok (${why})`)
        else dbgLog(`mirror sync exited ${code} (${why})`)
        done({ ok: code === 0, code })
      })
      // 不调用 child.unref()：实测 unref() 会让父进程收不到 exit/close 事件
      // （父进程提前退出），Promise 便永不 settle。同步脚本耗时可忽略（约 0.2s），
      // 且调用方一律 `.catch(() => {})` 非阻塞使用，不 unref 的代价可以接受。
      // 兜底：最多等 15s 就放行，绝不让代谢流程被同步拖住
      const t = setTimeout(() => {
        dbgLog(`mirror sync timeout (${why})`)
        done({ ok: false, reason: 'timeout' })
      }, 15000)
      if (t.unref) t.unref()
    } catch (err) {
      dbgLog(`mirror sync threw (${why}): ${String(err && err.message || err)}`)
      resolve({ ok: false, reason: 'exception' })
    }
  })
}
