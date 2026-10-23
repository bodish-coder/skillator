#!/usr/bin/env node
// teams-uhura (F66): a Teams channel <-> skillator. Dependency-free Node (no npm install).
//
//   node team.mjs start [--port N]          the listener, detached; prints the devtunnel line
//   node team.mjs listen [--port N]         the same in the foreground (Ctrl-C stops it)
//   node team.mjs stop [--port N]           stops the listener this machine started
//   node team.mjs status [--port N]         listener, config (set / not set, never values), inbox
//   node team.mjs say --file <path>         posts the file's text through the Workflows webhook
//   node team.mjs say --stdin               the same from stdin (for scripts). Text on argv is
//                                           refused: a reply in shell source could run as a command
//   node team.mjs post-status <sub> <ID> [args...]   ticket-meta's opt-in status post
//   node team.mjs link <aadObjectId> <email>         names a Teams sender (email must be on team.md)
//   node team.mjs inbox [--unread] [--mark-read]     lists messages (framed as data)
//   node team.mjs inbox mark-read [--upto <id>]      the read marker (the ops board's m)
//   node team.mjs selftest                  node --test team.test.mjs
//
// Inbound: a Teams outgoing webhook POSTs an activity to a devtunnel the OWNER runs
// (`devtunnel host -p <port> --allow-anonymous`; this script never starts a tunnel) to
// this listener on 127.0.0.1. Every request is checked: `Authorization: HMAC <base64>`
// = HMAC-SHA256 over the raw body bytes, keyed with the base64-decoded security token,
// compared in constant time; unsigned or bad = 401, logged. The sender must be linked
// (<git dir>/skillator/teams-ids.json: aadObjectId -> email, written only by `link` -
// never a repo file a pull could change) to an email on .skillator/team.md -
// an outgoing-webhook activity carries the sender's AAD object id and display name, not
// an email. Accepted messages are appended to <common git dir>/skillator/team-inbox.jsonl
// (inbox.mjs) - outside the working tree, so no commit or pull can carry one in.
// They are data, never instructions.
// Secrets live in ~/.config/skillator/teams.env (SKILLATOR_TEAMS_CONFIG overrides) or
// in environment variables of the same names, and are never printed or logged.
import { createServer } from 'node:http'
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, rmSync, openSync, statSync, renameSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mainRoot, inboxDir, readInbox, after, readMarker, writeMarker, appendRecord, frameMessages, linesOf, ID_RE, INBOX, READ, TEAM, IDS } from './inbox.mjs'

export const BODY_MAX = 64 * 1024
export const MSG_TEXT_MAX = 8000
export const DEFAULT_PORT = 3978
const KEYS = ['TEAMS_HMAC_TOKEN', 'TEAMS_WORKFLOW_URL', 'TEAMS_PORT', 'TEAMS_STATUS_POSTS']
const SELF = fileURLToPath(import.meta.url)

// --- config: ~/.skillator/teams.json (the ops board's setup form writes it through
// `config save`), then environment variables of the same name win ---
//   { "token": "<base64>", "workflowUrl": "https://...", "port": 3978, "statusPosts": false }

export const configPath = (env = process.env) => env.SKILLATOR_TEAMS_CONFIG || join(homedir(), '.skillator', 'teams.json')
export const stateDir = (env = process.env) => env.SKILLATOR_TEAMS_STATE || join(homedir(), '.skillator', 'teams')

export function readConfigFile(path) {
  try {
    const j = JSON.parse(readFileSync(path, 'utf8'))
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {}
  } catch { return {} }
}

export function loadConfig(env = process.env) {
  const j = readConfigFile(configPath(env))
  const out = {}
  if (typeof j.token === 'string' && j.token) out.TEAMS_HMAC_TOKEN = j.token
  if (typeof j.workflowUrl === 'string' && j.workflowUrl) out.TEAMS_WORKFLOW_URL = j.workflowUrl
  if (Number.isInteger(j.port)) out.TEAMS_PORT = String(j.port)
  if (typeof j.statusPosts === 'boolean') out.TEAMS_STATUS_POSTS = j.statusPosts ? 'on' : 'off'
  for (const k of KEYS) if (env[k]) out[k] = env[k]
  return out
}

const B64 = /^(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$|^(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$/

// The setup form's checks (the board runs the same ones in hooks/lib/teamsconfig.ts).
// An empty token or URL keeps what is saved; a token is required when none is.
export function validateConfig(c, saved) {
  const token = String(c?.token ?? '').trim()
  if (!token && !saved?.token) return 'token: required - paste the outgoing webhook security token'
  if (token && !B64.test(token)) return 'token: not base64 - paste the security token Teams showed, whole'
  const url = String(c?.workflowUrl ?? '').trim()
  if (url) {
    let u = null
    try { u = new URL(url) } catch { /* below */ }
    if (!u || u.protocol !== 'https:') return 'workflow URL: must be an https URL'
  }
  const p = typeof c?.port === 'number' ? c.port : /^\d+$/.test(String(c?.port ?? '')) ? Number(c.port) : NaN
  if (!Number.isInteger(p) || p < 1024 || p > 65535) return 'port: a number from 1024 to 65535'
  if (typeof c?.statusPosts !== 'boolean') return 'status posts: on or off'
  return null
}

const inside = (child, parent) => {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

// Restricts a file to this user: chmod 600, or on Windows an ACL of this user alone
// (inheritance removed). Throws when it cannot - the caller then keeps nothing.
function userOnly(p) {
  if (process.platform !== 'win32') { chmodSync(p, 0o600); return }
  const who = process.env.USERDOMAIN && process.env.USERNAME ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}` : process.env.USERNAME
  if (!who) throw new Error('cannot restrict the config: no USERNAME')
  // by absolute path: a bare name is looked up in the cwd (the repo) first on Windows
  const exe = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'icacls.exe')
  const icacls = args => spawnSync(exe, [p, ...args], { encoding: 'utf8', windowsHide: true, cwd: dirname(p) })
  const r = icacls(['/inheritance:r', '/grant:r', `${who}:F`])
  if (r.status !== 0) throw new Error(`cannot restrict the config to ${who} (icacls exit ${r.status})`)
  // explicit entries other than this user (a sandbox group, a policy default) go too
  const others = () => icacls([]).stdout.split(/\r?\n/).map(l => l.replace(p, '').trim())
    .map(l => /^(.+?):\(/.exec(l)?.[1]).filter(x => x && x.toLowerCase() !== who.toLowerCase())
  for (const o of others()) icacls(['/remove:g', o, '/remove:d', o])
  const left = others()
  if (left.length) throw new Error(`cannot restrict the config to ${who}: ${left.join(', ')} still listed`)
}

// Saves the config whole: checked, merged over what is saved (empty token / URL keep
// it), written to a temp file that is made user-only first and then renamed into place,
// so no reader ever sees it unrestricted. Never inside the repo `repoRoot`.
export function saveConfig(path, c, repoRoot) {
  if (repoRoot && inside(path, repoRoot)) throw new Error(`refused: ${path} is inside the repo - the config lives outside every repo`)
  const saved = readConfigFile(path)
  const bad = validateConfig(c, saved)
  if (bad) throw new Error(bad)
  const token = String(c.token ?? '').trim() || saved.token
  const workflowUrl = String(c.workflowUrl ?? '').trim() || (typeof saved.workflowUrl === 'string' ? saved.workflowUrl : '')
  const next = { token, workflowUrl, port: Number(c.port), statusPosts: c.statusPosts }
  mkdirSync(dirname(path), { recursive: true })
  const tmp = path + '.' + process.pid + '.tmp'
  try {
    writeFileSync(tmp, '', { mode: 0o600 })
    userOnly(tmp)
    writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n')
    renameSync(tmp, path)
  } catch (e) { rmSync(tmp, { force: true }); throw e }
  return next
}

export function clearConfig(path) {
  if (!existsSync(path)) return false
  rmSync(path, { force: true })
  return true
}

// What the board may show: set / not set, the URL's host, the port, posts on/off.
export function configView(env = process.env) {
  const j = readConfigFile(configPath(env))
  let host = null
  try { host = j.workflowUrl ? new URL(j.workflowUrl).hostname : null } catch { host = null }
  return { path: configPath(env), token: typeof j.token === 'string' && !!j.token, workflowUrl: host,
    port: Number.isInteger(j.port) ? j.port : DEFAULT_PORT, statusPosts: j.statusPosts === true }
}

// --- verification ---

// `Authorization: HMAC <base64>` against HMAC-SHA256(raw body, base64-decoded token),
// in constant time. No token, no header, a malformed header: false.
export function verifyHmac(raw, header, tokenB64) {
  if (!tokenB64 || typeof header !== 'string') return false
  const m = /^HMAC ([A-Za-z0-9+/]+={0,2})$/.exec(header.trim())
  if (!m) return false
  const key = Buffer.from(tokenB64, 'base64')
  if (!key.length) return false
  const want = createHmac('sha256', key).update(raw).digest()
  const got = Buffer.from(m[1], 'base64')
  if (got.length !== want.length) { timingSafeEqual(want, want); return false }
  return timingSafeEqual(got, want)
}

// --- who sent it ---

// team.md as ticket-meta reads it: `- @handle: a@x, b@y`; emails lower-cased.
export function parseTeam(text) {
  const out = []
  for (const raw of String(text).split(/\r?\n/)) {
    const m = /^[ \t]*[-*][ \t]*(@[A-Za-z0-9_.-]+)[ \t]*:(.*)$/.exec(raw)
    if (m) out.push({ handle: m[1], emails: m[2].split(',').map(s => s.trim().toLowerCase()).filter(Boolean) })
  }
  return out
}

// The sender links: <git dir>/skillator/teams-ids.json, { "<aadObjectId>": "email" },
// written only by `link` (the owner's act). Map of lower-cased id -> lower-cased email.
// A repo file (the old .skillator/teams-ids.md) is never read: a pulled commit could add one.
export function readIds(box) {
  const out = new Map()
  let j = null
  try { j = JSON.parse(readFileSync(join(box, IDS), 'utf8')) } catch { return out }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return out
  for (const [k, v] of Object.entries(j)) {
    if (/^[0-9A-Za-z][0-9A-Za-z-]{7,}$/.test(k) && typeof v === 'string' && /^[^\s@]+@[^\s@]+$/.test(v)) out.set(k.toLowerCase(), v.toLowerCase())
  }
  return out
}

export function senderOf(activity, team, ids) {
  const aad = activity?.from?.aadObjectId
  if (typeof aad !== 'string' || !aad) return { ok: false, reason: 'sender-no-aad' }
  const email = ids.get(aad.toLowerCase())
  if (!email) return { ok: false, reason: 'sender-unlinked' }
  const member = team.find(m => m.emails.includes(email))
  if (!member) return { ok: false, reason: 'sender-not-on-team' }
  return { ok: true, handle: member.handle, email }
}

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all
  }
  return ENT[e.toLowerCase()] ?? all
})

// The message as the person typed it: the bot's @mention out (the mention entities
// whose id is a bot's, 28:...; none known = the first <at>), other people kept as
// @Name, markup out, entities decoded, spaces collapsed, lines kept.
export function cleanText(text, entities = []) {
  let s = String(text ?? '')
  const bots = (Array.isArray(entities) ? entities : [])
    .filter(e => e?.type === 'mention' && typeof e?.mentioned?.id === 'string' && e.mentioned.id.startsWith('28:') && typeof e.text === 'string')
    .map(e => e.text)
  if (bots.length) for (const b of bots) s = s.split(b).join(' ')
  else s = s.replace(/<at>[^<]*<\/at>/i, ' ')
  s = s.replace(/<at>([^<]*)<\/at>/gi, '@$1')
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ')
  // every line break a reader might draw becomes \n; any other control character goes
  s = decode(s).replace(/\t/g, ' ')
  return linesOf(s).map(l =>l.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// --- the listener ---

const iso = () => new Date().toISOString()
const reply = (res, status, text) => {
  if (res.headersSent) return
  if (text === undefined) { res.writeHead(status, { connection: 'close' }); res.end(); return }
  const body = JSON.stringify({ type: 'message', text })
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

// Starts the listener on 127.0.0.1 (never another address); resolves with the server
// once it listens. log(line) gets one metadata line per request: never the body, the
// text, the token or the signature.
export function startListener({ root, port, token, log = () => {}, nonce = null }) {
  if (!token || !Buffer.from(token, 'base64').length) return Promise.reject(new Error('no security token (TEAMS_HMAC_TOKEN) - the listener does not run unverified'))
  const box = inboxDir(root)
  if (!box) return Promise.reject(new Error(`${root} is not a git repo - the inbox lives in its git dir`))
  const seen = new Set(readInbox(box).map(r => r.id))
  const repoName = basename(root)
  const read = rel => { try { return readFileSync(join(root, rel), 'utf8') } catch { return '' } }

  const handle = (req, res, raw) => {
    const n = raw.length
    if (!verifyHmac(raw, req.headers.authorization, token)) {
      log(`${iso()} rejected:${req.headers.authorization ? 'bad-hmac' : 'unsigned'} bytes=${n}`)
      return reply(res, 401)
    }
    let a
    try { a = JSON.parse(raw.toString('utf8')) } catch {
      log(`${iso()} rejected:bad-json bytes=${n}`)
      return reply(res, 400)
    }
    if (a?.type !== 'message') { log(`${iso()} dropped:not-a-message bytes=${n}`); return reply(res, 200, 'Not delivered: not a message.') }
    const who = senderOf(a, parseTeam(read(TEAM)), readIds(box))
    const aad = typeof a?.from?.aadObjectId === 'string' ? a.from.aadObjectId.replace(/[^0-9A-Za-z-]/g, '') : '-'
    const name = typeof a?.from?.name === 'string' ? JSON.stringify(a.from.name.slice(0, 80)) : '-'
    if (!who.ok) {
      log(`${iso()} dropped:${who.reason} aad=${aad} name=${name} bytes=${n} - link it: team.mjs link ${aad} <email on team.md>`)
      return reply(res, 200, `Not delivered: this sender is not on ${repoName}'s team list.`)
    }
    const id = typeof a.id === 'string' || typeof a.id === 'number' ? String(a.id) : ''
    if (!id) { log(`${iso()} dropped:no-id from=${who.handle} bytes=${n}`); return reply(res, 200, 'Not delivered: no message id.') }
    if (!ID_RE.test(id)) { log(`${iso()} dropped:bad-id from=${who.handle} bytes=${n}`); return reply(res, 200, 'Not delivered: the message id is not a plain token.') }
    if (seen.has(id)) { log(`${iso()} dropped:duplicate id=${id} from=${who.handle}`); return reply(res, 200, 'Already delivered.') }
    const full = cleanText(a.text, a.entities)
    // one message is at most MSG_TEXT_MAX characters in the inbox, cut with '…'
    const text = full.length > MSG_TEXT_MAX ? full.slice(0, MSG_TEXT_MAX - 1) + '…' : full
    if (!text) { log(`${iso()} dropped:empty id=${id} from=${who.handle}`); return reply(res, 200, 'Not delivered: the message was empty.') }
    appendRecord(box, { ts: iso(), from: who.handle, email: who.email, text, id })
    seen.add(id)
    log(`${iso()} accepted id=${id} from=${who.handle} bytes=${n}`)
    return reply(res, 200, `Delivered to ${repoName}'s skillator inbox - read as data; acted on only on the owner's word.`)
  }

  const server = createServer((req, res) => {
    if (req.method === 'GET' && nonce && req.url === '/__uhura' && req.headers['x-uhura-nonce'] === nonce) {
      const b = JSON.stringify({ pid: process.pid })
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(b); return
    }
    if (req.method !== 'POST') { req.resume(); return reply(res, 405) }
    const declared = Number(req.headers['content-length'])
    const tooBig = () => { log(`${iso()} rejected:too-big bytes>${BODY_MAX}`); reply(res, 413) }
    if (Number.isFinite(declared) && declared > BODY_MAX) {
      tooBig()
      let drained = 0
      req.on('data', d => { drained += d.length; if (drained > 4 * BODY_MAX) req.destroy() })
      return
    }
    const chunks = []
    let size = 0, over = false
    req.on('data', d => {
      size += d.length
      if (over) { if (size > 4 * BODY_MAX) req.destroy(); return }
      if (size > BODY_MAX) { over = true; chunks.length = 0; tooBig(); return }
      chunks.push(d)
    })
    req.on('end', () => {
      if (over) return
      try { handle(req, res, Buffer.concat(chunks)) } catch (e) {
        log(`${iso()} error:${String(e?.code ?? e?.name ?? 'unknown')}`)
        reply(res, 500)
      }
    })
    req.on('error', () => {})
  })
  server.requestTimeout = 10_000
  server.headersTimeout = 5_000
  return new Promise((res, rej) => {
    server.once('error', rej)
    server.listen(port, '127.0.0.1', () => { server.off('error', rej); res(server) })
  })
}

// --- posting back: the Workflows "post to a channel when a webhook request is received"
// template takes a message whose attachments are Adaptive Cards ---

export function cardPayload(text) {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard', version: '1.4',
        body: [{ type: 'TextBlock', text, wrap: true }],
      },
    }],
  }
}

const TEXT_MAX = 8000
const loopback = h => h === '127.0.0.1' || h === 'localhost' || h === '[::1]'

// { ok } or { ok: false, error } - the error never carries the URL (its sig= is the secret).
export async function say(text, cfg, { timeoutMs = 10_000 } = {}) {
  const raw = cfg?.TEAMS_WORKFLOW_URL
  if (!raw) return { ok: false, error: `TEAMS_WORKFLOW_URL is not set (${configPath()} or the environment) - see teams-uhura references/setup.md` }
  let u
  try { u = new URL(raw) } catch { return { ok: false, error: 'TEAMS_WORKFLOW_URL is not a URL' } }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback(u.hostname))) return { ok: false, error: 'refused: the Workflows URL must be https' }
  const t = String(text).length > TEXT_MAX ? String(text).slice(0, TEXT_MAX - 1) + '…' : String(text)
  try {
    const res = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cardPayload(t)), signal: AbortSignal.timeout(timeoutMs) })
    await res.arrayBuffer().catch(() => {})
    return res.ok ? { ok: true, status: res.status } : { ok: false, error: `the Workflows webhook answered HTTP ${res.status}` }
  } catch (e) {
    const why = e?.name === 'TimeoutError' ? `no answer in ${timeoutMs / 1000} s` : String(e?.cause?.code ?? e?.name ?? 'error')
    return { ok: false, error: `post failed: ${why}` }
  }
}

// The ticket line's title: after the dash, before the first tag, note or session.
const titleOf = line => {
  if (!line) return ''
  const m = /^\s*[-*]\s*\[.\]\s*\S+\s*(?:—|–|-)\s*(.*)$/.exec(line)
  return m ? m[1].split(/\s+(?:\[|\(|\*\*)/)[0].trim() : ''
}

export function statusText(sub, args, line, repo) {
  const [id = '?', ...rest] = args
  const detail = rest.join(' ').trim()
  const title = titleOf(line)
  const verbs = { done: 'done', testing: 'in testing', tested: `tested: ${detail}`, block: 'blocked', defer: 'deferred', assign: `assigned to ${detail}` }
  const verb = verbs[sub] ?? sub
  const withDetail = !['tested', 'assign'].includes(sub) && detail
  const head = `${repo}: ${id} ${verb}`
  if (title) return head + ` - ${title}` + (withDetail ? ` (${detail})` : '')
  return head + (withDetail ? ` - ${detail}` : '')
}

// --- the command line ---

const out = s => process.stdout.write(s + '\n')
const err = s => process.stderr.write('team: ' + s + '\n')
const flag = (argv, name) => { const i = argv.indexOf(name); return i >= 0 ? argv.splice(i, 2)[1] ?? null : null }
const has = (argv, name) => { const i = argv.indexOf(name); if (i < 0) return false; argv.splice(i, 1); return true }
const portOf = (v, cfg) => {
  const n = Number(v ?? cfg.TEAMS_PORT ?? DEFAULT_PORT)
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`not a port: ${v ?? cfg.TEAMS_PORT}`)
  return n
}
const tunnelLine = port => `devtunnel host -p ${port} --allow-anonymous`
const stateFile = port => join(stateDir(), `listener-${port}.json`)
const logFile = port => join(stateDir(), `listener-${port}.log`)

function rootOrDie(cwd = process.cwd()) {
  const m = mainRoot(cwd)
  if (!m) throw new Error('not inside a git repo - run it from the repo the messages are for')
  return m.root
}

function readState(port) { try { return JSON.parse(readFileSync(stateFile(port), 'utf8')) } catch { return null } }

async function alive(st) {
  if (!st?.nonce) return null
  try {
    const r = await fetch(`http://127.0.0.1:${st.port}/__uhura`, { headers: { 'x-uhura-nonce': st.nonce }, signal: AbortSignal.timeout(1500) })
    if (!r.ok) return null
    const j = await r.json()
    return typeof j?.pid === 'number' ? j.pid : null
  } catch { return null }
}

async function cmdListen(argv, cfg) {
  const port = portOf(flag(argv, '--port'), cfg)
  const root = rootOrDie()

  const srv = await startListener({ root, port, token: cfg.TEAMS_HMAC_TOKEN, log: l => out(l), nonce: process.env.UHURA_NONCE || null })
  out(`${iso()} listening on 127.0.0.1:${srv.address().port} for ${root}`)
  const stop = () => srv.close(() => process.exit(0))
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
  return new Promise(() => {})
}

async function cmdStart(argv, cfg) {
  const port = portOf(flag(argv, '--port'), cfg)
  const root = rootOrDie()
  if (!cfg.TEAMS_HMAC_TOKEN) { err(`no TEAMS_HMAC_TOKEN in ${configPath()} or the environment - see references/setup.md`); return 2 }
  const st = readState(port)
  if (st && await alive(st)) { out(`already listening on 127.0.0.1:${port} for ${st.root}`); out(`expose it yourself: ${tunnelLine(port)}`); return 0 }

  mkdirSync(stateDir(), { recursive: true })
  const nonce = randomBytes(16).toString('hex')
  const fd = openSync(logFile(port), 'a')
  const child = spawn(process.execPath, [SELF, 'listen', '--port', String(port)], {
    cwd: root, detached: true, stdio: ['ignore', fd, fd], windowsHide: true, env: { ...process.env, UHURA_NONCE: nonce },
  })
  child.unref()
  const next = { pid: child.pid, port, root, nonce, startedAt: iso() }
  writeFileSync(stateFile(port), JSON.stringify(next) + '\n', { mode: 0o600 })
  for (let i = 0; i < 30; i++) {
    if (await alive(next) === child.pid) {
      out(`listening on 127.0.0.1:${port} for ${root} (pid ${child.pid}, log ${logFile(port)})`)
      out('Exposing it is your own act - in your own terminal:')
      out(`  ${tunnelLine(port)}`)
      out('then give the https URL it prints to the Teams outgoing webhook as its callback URL.')
      return 0
    }
    await new Promise(r => setTimeout(r, 100))
  }
  err(`the listener did not come up - see ${logFile(port)}`)
  return 1
}

async function cmdStop(argv, cfg) {
  const port = portOf(flag(argv, '--port'), cfg)
  const st = readState(port)
  if (!st) { out(`not running on port ${port}`); return 0 }
  const pid = await alive(st)
  if (pid && pid === st.pid) {
    try { process.kill(pid) } catch (e) { err(`could not stop pid ${pid}: ${e.code ?? e}`); return 1 }
    rmSync(stateFile(port), { force: true })
    out(`stopped (pid ${pid}). Stop the devtunnel yourself (Ctrl-C in its terminal).`)
    return 0
  }
  rmSync(stateFile(port), { force: true })
  out(`not running on port ${port} (a stale state file was removed; nothing killed)`)
  return 0
}

async function cmdStatus(argv, cfg) {
  const port = portOf(flag(argv, '--port'), cfg)
  const st = readState(port)
  const pid = st ? await alive(st) : null
  out(pid ? `listener: up on 127.0.0.1:${port} (pid ${pid}) for ${st.root}` : `listener: not running on port ${port}`)
  out(`config: ${configPath()}${existsSync(configPath()) ? '' : ' (missing)'}`)
  out(`  TEAMS_HMAC_TOKEN ${cfg.TEAMS_HMAC_TOKEN ? 'set' : 'not set'} · TEAMS_WORKFLOW_URL ${cfg.TEAMS_WORKFLOW_URL ? 'set' : 'not set'} · status posts ${cfg.TEAMS_STATUS_POSTS === 'on' ? 'on' : 'off'}`)
  if (process.platform !== 'win32' && existsSync(configPath()) && (statSync(configPath()).mode & 0o077)) out(`  warning: ${configPath()} is readable by others - chmod 600 it`)
  const box = inboxDir(process.cwd())
  if (box) {
    const recs = readInbox(box)
    out(`inbox: ${recs.length} message${recs.length === 1 ? '' : 's'}, ${after(recs, readMarker(box, READ)).length} unread (${join(box, INBOX)})`)
  }
  out(`expose (your act): ${tunnelLine(port)}`)
  return 0
}

async function cmdLink(argv) {
  const [aad, email] = argv
  if (!aad || !email || !/^[0-9A-Za-z][0-9A-Za-z-]{7,}$/.test(aad) || !/@/.test(email)) { err('usage: link <aadObjectId> <email on team.md>'); return 2 }
  const root = rootOrDie()
  let team = ''
  try { team = readFileSync(join(root, TEAM), 'utf8') } catch { /* none */ }
  const e = email.trim().toLowerCase()
  const member = parseTeam(team).find(m => m.emails.includes(e))
  if (!member) { err(`${e} is not on .skillator/team.md - add the person there first (ticket-meta team add)`); return 1 }
  const box = inboxDir(root)
  if (!box) throw new Error('no git dir - the links live in it')
  const ids = readIds(box)
  if (ids.get(aad.toLowerCase()) === e) { out(`already linked: ${aad} -> ${e} (${member.handle})`); return 0 }
  ids.set(aad.toLowerCase(), e)
  const p = join(box, IDS)
  mkdirSync(box, { recursive: true })
  const tmp = p + '.' + process.pid + '.tmp'
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(ids), null, 2) + '\n')
  renameSync(tmp, p)
  out(`linked: ${aad} -> ${e} (${member.handle}) in ${p}`)
  return 0
}

async function cmdInbox(argv) {
  const box = inboxDir(process.cwd())
  if (!box) throw new Error('not inside a git repo - run it from the repo the messages are for')
  // tail: the newest 200 records, as JSONL - the ops board's read of an inbox too big to
  // read whole (readInbox reads only its last 4 MiB)
  if (argv[0] === 'tail') {
    for (const r of readInbox(box).slice(-200)) process.stdout.write(JSON.stringify(r) + '\n')
    return 0
  }
  if (argv[0] === 'mark-read') {
    const recs = readInbox(box)
    const upto = flag(argv, '--upto') ?? recs.at(-1)?.id ?? null
    if (!upto) { out('inbox empty - nothing to mark'); return 0 }
    if (!ID_RE.test(upto)) { err('--upto takes a message id'); return 2 }
    writeMarker(box, READ, upto)
    out(`read up to ${upto}`)
    return 0
  }
  const unread = has(argv, '--unread'), mark = has(argv, '--mark-read')
  const recs = readInbox(box)
  const list = unread ? after(recs, readMarker(box, READ)) : recs
  if (!list.length) { out(unread ? 'no unread team messages' : 'no team messages'); return 0 }
  out(frameMessages(list, { max: 200 }))
  if (mark) { writeMarker(box, READ, list.at(-1).id); out(`(marked ${list.length} read)`) }
  return 0
}

async function cmdPostStatus(argv, cfg) {
  if (cfg.TEAMS_STATUS_POSTS !== 'on') return 0
  const [sub, ...args] = argv
  if (!sub || !args[0]) { err('usage: post-status <sub> <ID> [args...]'); return 2 }
  const root = rootOrDie()
  let line = null
  try {
    const id = args[0].replace(/[^A-Za-z0-9_.-]/g, '')
    line = readFileSync(join(root, 'TICKETS.md'), 'utf8').split(/\r?\n/).find(l => new RegExp(`^\\s*[-*]\\s*\\[.\\]\\s*${id}(\\s|$)`).test(l)) ?? null
  } catch { /* no board: no title */ }
  const r = await say(statusText(sub, args, line, basename(root)), cfg, { timeoutMs: 5000 })
  if (!r.ok) { err(r.error); return 1 }
  return 0
}

async function stdinText() {
  if (process.stdin.isTTY) return ''
  let s = ''
  process.stdin.setEncoding('utf8')
  for await (const d of process.stdin) s += d
  return s
}

// config show: JSON the board reads (never a secret). config save: the form's JSON on
// stdin - never argv, where any process could read it. config clear: the file goes.
async function cmdConfig(argv) {
  const sub = argv[0] ?? 'show'
  const path = configPath()
  if (sub === 'show') { out(JSON.stringify(configView())); return 0 }
  if (sub === 'clear') { out(clearConfig(path) ? `cleared: ${path}` : `nothing saved at ${path}`); return 0 }
  if (sub === 'save') {
    let c
    try { c = JSON.parse(await stdinText()) } catch { err('config save reads the settings as JSON on stdin'); return 2 }
    const m = mainRoot(process.cwd())
    saveConfig(path, c, m?.root ?? null)
    out(`saved: ${path} (this user only)`)
    return 0
  }
  err('usage: config show|save|clear')
  return 2
}

export async function main(argv) {
  const [cmd, ...rest] = argv
  const cfg = loadConfig()
  try {
    switch (cmd) {
      case 'config': return await cmdConfig(rest)
      case 'listen': return await cmdListen(rest, cfg)
      case 'start': return await cmdStart(rest, cfg)
      case 'stop': return await cmdStop(rest, cfg)
      case 'status': return await cmdStatus(rest, cfg)
      case 'link': return await cmdLink(rest)
      case 'inbox': return await cmdInbox(rest)
      case 'post-status': return await cmdPostStatus(rest, cfg)
      case 'say': {
        // The text comes on stdin only, never argv: a reply often quotes a teammate,
        // and on a shell line $(...), backticks or a quote in it would run.
        // --file <path>: the reply written by the agent's own file tool, so it never
        // enters shell source (a heredoc or here-string can be closed from inside it).
        // Ruling: the file is the caller's; say never deletes it.
        let text
        if (rest.length === 1 && rest[0] === '--stdin') text = await stdinText()
        else if (rest[0] === '--file' && rest.length === 2) {
          let st
          try { st = statSync(rest[1]) } catch { err(`say: no file at ${rest[1]}`); return 1 }
          if (!st.isFile()) { err(`say: not a file: ${rest[1]}`); return 1 }
          if (st.size > BODY_MAX) { err(`say: file too big (over ${BODY_MAX} bytes)`); return 2 }
          text = readFileSync(rest[1], 'utf8').replace(/^\uFEFF/, '')
        } else {
          err('say takes the text from a file or stdin only: node team.mjs say --file <path> (text on the command line is refused)')
          return 2
        }
        text = text.replace(/\r?\n$/, '')
        if (!text.trim()) { err('say: no text on stdin'); return 2 }
        const r = await say(text, cfg)
        if (!r.ok) { err(r.error); return 1 }
        out('posted to the Teams channel')
        return 0
      }
      case 'selftest': {
        const r = spawnSync(process.execPath, ['--test', join(dirname(SELF), 'team.test.mjs')], { stdio: 'inherit' })
        return r.status ?? 1
      }
      default:
        err('usage: team.mjs start|listen|stop|status|say|post-status|link|inbox|selftest')
        return 2
    }
  } catch (e) {
    err(String(e?.message ?? e))
    return 1
  }
}

const entry = p => (process.platform === 'win32' ? p.toLowerCase() : p)
if (process.argv[1] && entry(process.argv[1]) === entry(SELF)) {
  main(process.argv.slice(2)).then(code => { if (code !== undefined) process.exitCode = code })
}
