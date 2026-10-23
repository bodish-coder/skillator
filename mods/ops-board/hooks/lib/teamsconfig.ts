import type { TeamsCfgView } from '../../types'

// F66: the Teams setup form's rules, shared by the mod (hooks/messagestab.tsx) and the
// ops app (ops/state.ts). Pure. The values go to teams-uhura's `config save` on stdin;
// it checks them again and writes ~/.skillator/teams.json, this user only. Nothing here
// keeps, draws or logs the token: it is masked as typed, and a saved one is only ever
// "set" or "not set".

export type SetupField = 'token' | 'url' | 'port' | 'posts' | 'clear'
export const SETUP_FIELDS: SetupField[] = ['token', 'url', 'port', 'posts', 'clear']
export const DEFAULT_PORT = 3978
// What the form holds while it is up. The token and URL as typed ('' = keep the saved one).
export type SetupValues = { token: string; url: string; port: string; posts: boolean }

export const freshSetup = (cfg: TeamsCfgView | null): SetupValues =>
  ({ token: '', url: '', port: String(cfg?.port ?? DEFAULT_PORT), posts: cfg?.statusPosts ?? false })

const B64 = /^(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$|^(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$/

// The same checks as team.mjs validateConfig; null = good.
export function setupError(v: SetupValues, cfg: TeamsCfgView | null): string | null {
  const token = v.token.trim()
  if (!token && !cfg?.token) return 'token: required - paste the outgoing webhook security token'
  if (token && !B64.test(token)) return 'token: not base64 - paste the security token Teams showed, whole'
  const url = v.url.trim()
  if (url) {
    let ok = false
    try { ok = new URL(url).protocol === 'https:' } catch { ok = false }
    if (!ok) return 'workflow URL: must be an https URL'
  }
  const p = /^\d+$/.test(v.port.trim()) ? Number(v.port.trim()) : NaN
  if (!Number.isInteger(p) || p < 1024 || p > 65535) return 'port: a number from 1024 to 65535'
  return null
}

// The JSON `config save` reads on stdin.
export const setupJson = (v: SetupValues): string =>
  JSON.stringify({ token: v.token.trim(), workflowUrl: v.url.trim(), port: Number(v.port.trim()), statusPosts: v.posts })

// The token as drawn: one bullet per character typed; empty, what is saved.
export const tokenShown = (v: SetupValues, cfg: TeamsCfgView | null): string =>
  v.token ? '•'.repeat([...v.token].length) : cfg?.token ? '(set - type to replace)' : '(not set)'
export const urlShown = (v: SetupValues, cfg: TeamsCfgView | null): string =>
  v.url ? v.url : cfg?.workflowUrl ? `(set: ${cfg.workflowUrl} - type to replace)` : '(not set - replies off)'

// A masked field's next value from what an input element hands back: its bullets stand
// for the token's characters in order, anything else was typed. Appends, deletes at the
// end and pastes all come back right; an edit inside the bullets keeps the order.
export function unmask(prev: string, shown: string): string {
  const chars = [...prev]
  let i = 0
  let out = ''
  for (const c of shown) {
    if (c === '•') { if (i < chars.length) out += chars[i++] } else out += c
  }
  return out
}

export const parseCfgView = (out: string): TeamsCfgView | null => {
  try {
    const j = JSON.parse(out.trim().split(/\r?\n/).pop() ?? '') as Record<string, unknown>
    return {
      path: typeof j.path === 'string' ? j.path : '',
      token: j.token === true,
      workflowUrl: typeof j.workflowUrl === 'string' ? j.workflowUrl : null,
      port: typeof j.port === 'number' ? j.port : DEFAULT_PORT,
      statusPosts: j.statusPosts === true,
    }
  } catch { return null }
}
