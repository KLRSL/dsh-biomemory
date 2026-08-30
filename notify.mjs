// ============================================================================
// dsh-biomemory · 桌宠气泡通知（notify.mjs，v0.6 架构升级）
//
// 完全可选：配置 petEndpoint 后，记忆保存/重要事件时给桌宠气泡（HTTP POST）。
// 桌宠不在线则静默失败，不影响记忆本体。
// ============================================================================

import http from 'node:http'

let PET_ENDPOINT = null

export function setPetEndpoint(url) {
  PET_ENDPOINT = typeof url === 'string' ? url : null
}

export function getPetEndpoint() {
  return PET_ENDPOINT
}

export function petRequest(pathname, payload, timeoutMs = 1200) {
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

export function petNotify(title, text) {
  petRequest('/notify', JSON.stringify({ title, text: String(text).slice(0, 60), seconds: 5, kind: '记忆' }))
}
