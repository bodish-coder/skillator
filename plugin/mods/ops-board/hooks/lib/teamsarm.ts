import type { ArmView } from '../../types'
import type { Line } from './healthlines'
import { plainText } from './inbox'

// F177: connect Teams from the Messages tab. Pure: the mod (hooks/messagestab.tsx) and the
// ops app (ops/state.ts, ops/draw.ts) both parse and draw with this. The facts come from
// teams-uhura's setup script (--status | --arm | --disarm | --ack) as key=value lines; they
// are data: every control character out, the URL kept only when it is a devtunnels.ms
// https URL. Arming itself is the script's, run only on the owner's key press.

const RESULTS = ['status', 'armed', 'refused', 'failed', 'disarmed', 'acked'] as const
const URL_RE = /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.devtunnels\.ms$/

export function parseArm(out: string): ArmView | null {
  const kv: Record<string, string> = {}
  for (const l of out.split(/\r?\n/)) {
    // A226 c: the first key wins and a value with a control character is dropped (it still
    // claims its key), so text a reply smuggles into a value cannot forge result= or hosted=
    const m = /^([a-z_]+)=(.*)$/.exec(l)
    if (m && !(m[1]! in kv)) kv[m[1]!] = plainText(m[2]!) === m[2] ? m[2]!.trim() : ''
  }
  const result = RESULTS.find(r => r === kv.result)
  if (!result) return null
  const port = Number(kv.port)
  const url = URL_RE.test(kv.url ?? '') ? kv.url! : null
  return {
    result, why: (kv.why ?? '').slice(0, 160),
    devtunnel: kv.devtunnel === 'ok', login: kv.login === 'in', form: kv.form === 'set', tunnel: kv.tunnel === 'ready',
    hosted: kv.hosted === '1', listener: kv.listener === 'up',
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 3978,
    url, urlChanged: url !== null && kv.url_changed === '1',
    expires: kv.expires ? kv.expires.slice(0, 40) : null,
  }
}

// The tunnel's expiry as the tab says it: a date devtunnel printed becomes what is left;
// anything else is shown as printed.
export function expiryShown(raw: string | null, now: number): string | null {
  if (!raw) return null
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return 'expires ' + raw
  const hours = Math.floor((t - now) / 3600000)
  return hours < 0 ? 'EXPIRED' : hours < 48 ? `expires in ${hours}h` : `expires in ${Math.floor(hours / 24)}d`
}

const cut = (s: string, room: number) => (s.length <= room ? s : s.slice(0, Math.max(1, room - 1)) + '…')
// Whole words per line; a word wider than the room is cut (the copy key still has it whole).
function wrapWords(s: string, room: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const w of s.split(' ')) {
    if (cur && cur.length + 1 + w.length > room) { out.push(cur); cur = w } else cur = cur ? cur + ' ' + w : w
  }
  if (cur) out.push(cur)
  return out.map(l => cut(l, room))
}

// The Teams lines above the message list. Keys: 'arm', 'arm:url', 'arm:warn:<n>'.
export function armLines(v: ArmView | null, now: number, cols: number): Line[] {
  if (!v) return [{ key: 'arm', segs: [{ text: 'Teams  ', dim: true }, { text: 'not checked - c connects', dim: true }] }]
  const half = v.hosted !== v.listener            // one up without the other: say so in colour
  const sep = { text: ' · ', dim: true }
  const exp = expiryShown(v.expires, now)
  const soon = exp === 'EXPIRED' || /^expires in \d+h$/.test(exp ?? '')
  const out: Line[] = [{
    key: 'arm',
    segs: [
      { text: 'Teams  ', dim: true },
      v.hosted ? { text: '● tunnel hosted', color: 'success' } : { text: '○ tunnel not hosted', color: half ? 'warning' : undefined, dim: !half },
      sep,
      v.listener ? { text: `● listener up :${v.port}`, color: 'success' } : { text: '○ listener down', color: half ? 'warning' : undefined, dim: !half },
      sep,
      v.form ? { text: 'form saved', dim: true } : { text: 'form: no token', color: 'warning' },
      ...(exp ? [sep, { text: exp, color: soon ? 'warning' as const : undefined, dim: !soon }] : []),
    ],
  }]
  if (v.url) out.push({ key: 'arm:url', segs: [{ text: '  ' }, { text: v.url, color: 'suggestion' }, { text: '  y copies', dim: true }] })
  else if (v.hosted) out.push({ key: 'arm:url', segs: [{ text: '  URL: read it in the tunnel window', dim: true }] })
  if (v.url && v.urlChanged) {
    wrapWords(`▲ tunnel URL changed - update the Teams outgoing webhook callback to ${v.url}`, Math.max(10, cols))
      .forEach((text, n) => out.push({ key: `arm:warn:${n}`, segs: [{ text, color: 'warning', bold: n === 0 }] }))
  }
  return out
}

// What a key press says. Never the URL: the pane's Log tab keeps every toast.
export function armToast(v: ArmView): string {
  if (v.result === 'refused') return `✗ Teams not connected: ${v.why}`
  if (v.result === 'failed') return `✗ Teams: ${v.why}`
  if (v.result === 'disarmed') return '✓ Teams disconnected - tunnel stopped, listener stopped'
  if (v.result === 'armed') return `✓ Teams connected - tunnel hosted, listener up on 127.0.0.1:${v.port}`
    + (v.urlChanged ? '\n▲ the tunnel URL changed - see the Messages tab, y copies it' : '')
  return ''
}
