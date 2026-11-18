import { mock, test } from 'node:test'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calculateCursorUsage, discover, getBillingCycleStart, ownProfile, profileRows, recordCursorRun, render, row } from '../status'
import type { Reader } from '../status'

// F94: `ops --status` - one row per CLI profile found under a fake HOME (never the owner's
// real ones), the usage reader stubbed. Every percentage here is made up.

const home = () => mkdtempSync(join(tmpdir(), 'ops-status-')).replace(/\\/g, '/')
const dir = (h: string, d: string, ...files: string[]) => {
  mkdirSync(join(h, d), { recursive: true })
  for (const f of files) writeFileSync(join(h, d, f), '')
  return `${h}/${d}`
}
const said = (out: string): Reader => async () => ({ code: 0, out, err: '' })
const NONE = said('src=none 5h=- 7d=- ctx=- max=-\n')

test('a profile with a reading shows its 5h and 7d % used; the reader sees only that profile', async () => {
  const h = home()
  const d = dir(h, '.claude-alpha', '.credentials.json')
  writeFileSync(join(h, '.claude.json'), '')                       // a file, not a profile
  const ps = discover(h)
  assert.deepEqual(ps, [{ name: 'claude-alpha', cli: 'claude', dir: d }])
  let env: Record<string, string | undefined> = {}
  const read: Reader = async e => { env = e; return { code: 0, out: 'src=claude-code 5h=12.0 7d=34.5 ctx=- max=34.5\n', err: '' } }
  const r = await row(ps[0]!, read, { CLAUDE_USAGE_WATCH_DIR: 'x', CLAUDE_CODE_SESSION_ID: 'y' }, false)
  assert.deepEqual(r, ['claude-alpha', '12%', '35%', ''])
  assert.equal(env.CLAUDE_CONFIG_DIR, d)
  assert.equal(env.CLAUDE_CODE_SESSION_ID, undefined)
  assert.equal(env.CLAUDE_USAGE_WATCH_DIR, undefined)
  assert.ok(env.CODEX_HOME?.startsWith(d + '/'), 'codex usage never leaks into a claude row')
})

test('a profile with no credential file and no reading says not logged in', async () => {
  const h = home()
  const d = dir(h, '.codex-beta')
  let env: Record<string, string | undefined> = {}
  const read: Reader = async e => { env = e; return NONE(e, 0) }
  assert.deepEqual(await row(discover(h)[0]!, read, {}, false), ['codex-beta', '-', '-', 'not logged in'])
  assert.equal(env.CODEX_HOME, d)
  assert.ok(env.CLAUDE_USAGE_WATCH_DIR?.startsWith(d + '/'), 'claude usage never leaks into a codex row')
})

test('no quota source: cursor has none; a logged-in profile with no fresh reading says so', async () => {
  const h = home()
  dir(h, '.cursor-gamma')
  dir(h, '.agy-delta', 'antigravity-oauth-token')
  dir(h, '.codex-eps', 'auth.json')
  let calls = 0
  const read: Reader = async e => { calls++; return NONE(e, 0) }
  const rows = []
  for (const p of discover(h)) rows.push(await row(p, read, {}, false))
  assert.equal(calls, 2, 'the reader runs for live quota profiles (codex, agy, claude, muse), not cursor')
  assert.deepEqual(rows.map(r => [r[0], r[3]]), [
    ['codex-eps', 'no quota source: no reading in the last 3 h'],
    ['cursor-gamma', 'no quota source: cursor-agent has no usage command'],
    ['agy-delta', 'no quota source: no reading in the last 3 h'],
  ])
})

test('F172: ownProfile names the env-named profile via the same discovery; none says null', () => {
  const h = home()
  const d = dir(h, '.claude-alpha', '.credentials.json')
  dir(h, '.codex')
  assert.deepEqual(ownProfile({ HOME: h, SKILLATOR_PROFILE_DIR: d }), { name: 'claude-alpha', cli: 'claude', dir: d })
  assert.deepEqual(ownProfile({ HOME: h, SKILLATOR_CLI: 'codex' }), { name: 'codex', cli: 'codex', dir: `${h}/.codex` })
  assert.equal(ownProfile({ HOME: h }), null)
  assert.equal(ownProfile({ HOME: h, SKILLATOR_PROFILE_DIR: `${h}/.claude-beta` })?.name, 'claude-beta')
})

test('a reader that runs out of time says so in its row', async () => {
  const h = home()
  dir(h, '.claude-zeta', '.credentials.json')
  const read: Reader = async () => ({ code: -1, out: '', err: 'timed out after 5 s' })
  assert.deepEqual(await row(discover(h)[0]!, read, {}, false), ['claude-zeta', '-', '-', 'timed out after 5 s'])
})

test('F118: agy and muse live quota sources show % used; not logged in and cursor stay truthful', async () => {
  const h = home()
  const agyDir = dir(h, '.agy-work', 'antigravity-oauth-token')
  const museDir = dir(h, '.muse-work')
  const read: Reader = async e => {
    if (e.AGY_CONFIG_DIR === agyDir) return { code: 0, out: 'src=agy 5h=15.0 7d=71.0 ctx=- max=71.0\n', err: '' }
    if (e.MUSE_CONFIG_DIR === museDir) return { code: 0, out: 'src=muse 5h=- 7d=- ctx=- max=- note=not_logged_in\n', err: '' }
    return NONE(e, 0)
  }
  const ps = discover(h)
  const agyRow = await row(ps.find(p => p.name === 'agy-work')!, read, {}, false)
  assert.deepEqual(agyRow, ['agy-work', '15%', '71%', ''])
  const museRow = await row(ps.find(p => p.name === 'muse-work')!, read, {}, false)
  assert.deepEqual(museRow, ['muse-work', '-', '-', 'not logged in'])
})

test('~/.skillator/profiles renames, adds and hides; the table is aligned', async () => {
  const h = home()
  dir(h, '.claude-one')
  dir(h, '.claude-two')
  const extra = dir(h, 'my codex')
  mkdirSync(join(h, '.skillator'))
  writeFileSync(join(h, '.skillator/profiles'), [
    '# name cli config-dir',
    `vidul claude ${h}/.claude-one`,
    `- claude ~/.claude-two`,
    `work codex ~/my codex`,
    'odd vim /nowhere',
    '',
  ].join('\r\n'))
  const ps = discover(h)
  assert.deepEqual(ps, [
    { name: 'vidul', cli: 'claude', dir: `${h}/.claude-one` },
    { name: 'work', cli: 'codex', dir: extra },
    { name: 'odd', cli: 'vim', dir: '/nowhere' },
  ])
  const rows = []
  for (const p of ps) rows.push(await row(p, said('src=codex 5h=- 7d=9.4 ctx=- max=9.4\n'), {}, false))
  assert.deepEqual(rows[2], ['odd', '-', '-', 'profiles file: unknown cli vim'])
  assert.equal(render(rows), [
    'profile  5h used  7d used',
    'vidul    -        9%',
    'work     -        9%',
    'odd      -        -        profiles file: unknown cli vim',
  ].join('\n') + '\n')
})

test('F119: cursor estimated ledger sums fixture runs and calculates budget %', async () => {
  const h = home()
  const d = dir(h, '.cursor-work')
  const ledgerPath = join(d, 'cursor-ledger.json')

  // Initialize ledger with a 10,000 token monthly budget
  writeFileSync(ledgerPath, JSON.stringify({ budget: 10000, billing_day: 1, runs: [] }, null, 2))

  // Run 1: simulated cursor-agent -p ... --output-format json result line
  const fixture1 = JSON.stringify({
    type: 'result',
    subtype: 'success',
    usage: { inputTokens: 1500, outputTokens: 500, cacheReadTokens: 200, cacheWriteTokens: 300 },
  })
  recordCursorRun(ledgerPath, fixture1)

  // Run 2: simulated run object
  recordCursorRun(ledgerPath, {
    usage: { prompt_tokens: 1000, completion_tokens: 1500 },
  })

  const ps = discover(h)
  const cursorProf = ps.find(p => p.name === 'cursor-work')!
  assert.ok(cursorProf, 'cursor-work profile discovered')

  let calls = 0
  const read: Reader = async () => { calls++; return NONE({}, 0) }
  const r = await row(cursorProf, read, { HOME: h }, false)

  assert.equal(calls, 0, 'no external reader is spawned for cursor')
  // Total tokens = (1500 + 500 + 200 + 300) + (1000 + 1500) = 2500 + 2500 = 5000 tokens
  // 5000 / 10000 = 50%
  assert.deepEqual(r, [
    'cursor-work',
    '-',
    '-',
    'cursor est 50% of budget (skillator runs only); check cursor.com/settings',
  ])
})

test('F119: billing day reset excludes runs from prior billing cycle', () => {
  // Billing day 15
  const cycleStartMidOct = getBillingCycleStart(15, new Date('2026-10-25T12:00:00Z'))
  assert.equal(cycleStartMidOct.toISOString().slice(0, 10), '2026-10-15')

  const cycleStartEarlyOct = getBillingCycleStart(15, new Date('2026-10-10T12:00:00Z'))
  assert.equal(cycleStartEarlyOct.toISOString().slice(0, 10), '2026-09-15')

  const ledger = {
    budget: 1000,
    billing_day: 15,
    runs: [
      { timestamp: '2026-10-05T10:00:00Z', tokens: 400 }, // prior cycle
      { timestamp: '2026-10-18T10:00:00Z', tokens: 250 }, // current cycle
      { timestamp: '2026-10-22T10:00:00Z', tokens: 150 }, // current cycle
    ],
  }

  // At 2026-10-25, the cycle began 2026-10-15. Run on 10-05 is reset/ignored.
  const usage = calculateCursorUsage(ledger, new Date('2026-10-25T12:00:00Z'))
  assert.ok(usage)
  assert.equal(usage.totalUsage, 400) // 250 + 150
  assert.equal(usage.pct, 40) // 400 / 1000 = 40%
})

test('F119: cursor cost-based budget and status row alignment', async () => {
  const h = home()
  const d = dir(h, '.cursor-cost')
  writeFileSync(join(d, 'cursor-ledger.json'), JSON.stringify({
    budget_cost: 50,
    billing_day: 1,
    runs: [
      { timestamp: '2026-10-02T10:00:00Z', cost: 12.50 },
      { timestamp: '2026-10-05T10:00:00Z', cost_usd: 17.50 },
    ],
  }))

  const ps = discover(h)
  const cursorProf = ps.find(p => p.name === 'cursor-cost')!
  const r = await row(cursorProf, NONE, { HOME: h, SKILLATOR_NOW: '2026-10-20T12:00:00Z' }, false)
  // Total cost = 12.50 + 17.50 = 30.00 / 50 = 60%
  assert.deepEqual(r, [
    'cursor-cost',
    '-',
    '-',
    'cursor est 60% of budget (skillator runs only); check cursor.com/settings',
  ])

  const rendered = render([r])
  assert.ok(rendered.includes('cursor-cost'))
  assert.ok(rendered.includes('cursor est 60% of budget (skillator runs only); check cursor.com/settings'))
  assert.ok(rendered.includes('check cursor.com/settings'))
})

test('F119: watch-cortana check mode outputs estimated cursor budget and never fires 90% gate', () => {
  if (process.platform !== 'win32') return
  const h = home()
  const d = dir(h, '.cursor')
  const ledgerPath = join(d, 'cursor-ledger.json')
  // 95% usage - higher than 90% and 92% gates!
  writeFileSync(ledgerPath, JSON.stringify({
    budget: 1000,
    runs: [{ tokens: 950 }],
  }))
  const hookPath = fileURLToPath(new URL('../../../../skills/watch-cortana/hooks/usage-watch.ps1', import.meta.url))
  const out = execFileSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    hookPath,
    '-Mode',
    'check',
  ], {
    env: {
      ...process.env,
      HOME: h,
      USERPROFILE: h,
      SKILLATOR_CLI: 'cursor',
      SKILLATOR_PROFILE_DIR: d,
      CODEX_THREAD_ID: undefined,
      CODEX_SESSION_ID: undefined,
      CLAUDE_CODE_SESSION_ID: undefined,
      CURSOR_LEDGER_PATH: ledgerPath,
    },
    encoding: 'utf8',
  }).trim()

  assert.equal(out, 'watch-cortana: cursor est 95% of budget (skillator runs only) - check cursor.com/settings')
  assert.ok(!out.includes('HANDOFF NOW'), 'never fires 90% gate as authoritative')
})

// F176: per-model rows under each profile, and the forced read (`ops --status --refresh`).
// The codex lines are real rollout lines (no account fields); the cache models are the
// shape usage-watch's refresh writes from claude get_usage / agy /usage.
const FIXTURE = (n: string) => readFileSync(fileURLToPath(new URL(`./f176/${n}`, import.meta.url)), 'utf8')

test('F176: model rows come from the profile cache (claude, agy) and the newest fresh codex rollout', async () => {
  const h = home()
  const c = dir(h, '.claude-m', '.credentials.json')
  writeFileSync(join(c, 'quota-cache.json'), JSON.stringify({ src: 'claude-code', '5h': 12.5, '7d': 61, models: [{ name: 'Opus', '7d': 40 }, { name: 'Fable', '7d': 43 }] }))
  const x = dir(h, '.codex-m', 'auth.json')
  mkdirSync(join(x, 'sessions/2026/09/02'), { recursive: true })
  // the real lines' resets_at moved to the future: a window already reset shows '-'
  const later = (Math.floor(Date.now() / 1000) + 3600)
  writeFileSync(join(x, 'sessions/2026/09/02/rollout-a.jsonl'), FIXTURE('codex-rollout.jsonl').replace(/"resets_at":1789\d+/g, `"resets_at":${later}`))
  const ps = discover(h)
  const read = said('src=claude-code 5h=12.5 7d=61.0 ctx=- max=61.0\n')
  assert.deepEqual(await profileRows(ps.find(p => p.cli === 'claude')!, read, {}, false, false), [
    ['claude-m', '13%', '61%', ''],
    ['  Opus', '-', '40%', ''],
    ['  Fable', '-', '43%', ''],
  ])
  const codexRows = await profileRows(ps.find(p => p.cli === 'codex')!, said('src=codex 5h=- 7d=30.0 ctx=- max=30.0\n'), {}, false, false)
  assert.deepEqual(codexRows, [['codex-m', '-', '30%', ''], ['  GPT-5.3-Codex-Spark', '-', '0%', '']])
})

test('F176: --refresh reads blank logged-in rows once, in the foreground, and skips the rest', async () => {
  const h = home()
  dir(h, '.claude-blank', '.credentials.json')
  const hot = dir(h, '.claude-hot', '.credentials.json')
  writeFileSync(join(hot, 'quota-cache.json'), JSON.stringify({ src: 'claude-code', '5h': 1, '7d': 95 }))
  dir(h, '.claude-out')
  dir(h, '.codex-cx', 'auth.json')
  const calls: { dir: string | undefined; wait: string | undefined; ms: number }[] = []
  const filled = new Set<string>(), locked = new Set<string>()
  // as usage-watch level: a cold plain read starts a background refresh and holds the lock,
  // and a held lock turns the foreground read away
  const read: Reader = async (e, ms) => {
    const d = e.SKILLATOR_PROFILE_DIR!
    calls.push({ dir: d, wait: e.SKILLATOR_QUOTA_REFRESH_WAIT, ms })
    if (filled.has(d)) return { code: 0, out: 'src=claude-code 5h=4.0 7d=20.0 ctx=- max=20.0\n', err: '' }
    if (e.SKILLATOR_QUOTA_REFRESH_WAIT === '1' && !locked.has(d)) filled.add(d)
    else locked.add(d)
    return NONE(e, 0)
  }
  const out: string[][] = []
  for (const p of discover(h)) out.push(...await profileRows(p, read, {}, false, true))
  assert.deepEqual(out.map(r => [r[0], r[1], r[2]]), [
    ['claude-blank', '4%', '20%'], ['claude-hot', '-', '-'], ['claude-out', '-', '-'], ['codex-cx', '-', '-'],
  ])
  const waits = calls.filter(c => c.wait === '1')
  assert.deepEqual(waits.map(c => c.dir), [`${h}/.claude-blank`], 'one forced read: not >= 90% 7d, not logged out, not codex')
  assert.ok(waits[0]!.ms >= 50000 && waits[0]!.ms < 90000, 'over the capped CLI calls, inside the 90 s refresh lock')
  assert.match(out.find(r => r[0] === 'claude-hot')![3], /7d 95% >= 90%/)
})

test('F176 verify: a carried last 7d or a legacy weekly holds the forced read; past the deadline every row is still read', async () => {
  const h = home()
  const carried = dir(h, '.claude-carried', '.credentials.json')
  writeFileSync(join(carried, 'quota-cache.json'), JSON.stringify({ src: 'claude-code', note: 'x', failures: 1, backoff_secs: 60, last: { '5h': 10, '7d': 95, at: Math.floor(Date.now() / 1000) - 86400 } }))
  const weekly = dir(h, '.claude-weekly', '.credentials.json')
  writeFileSync(join(weekly, 'quota-cache.json'), JSON.stringify({ src: 'claude-code', weekly: 92 }))
  dir(h, '.claude-late', '.credentials.json')
  const waits: string[] = []
  const read: Reader = async (e, ms) => { if (e.SKILLATOR_QUOTA_REFRESH_WAIT === '1') waits.push(e.SKILLATOR_PROFILE_DIR!); return NONE(e, ms) }
  const out: string[][] = []
  for (const p of discover(h)) out.push(...await profileRows(p, read, {}, false, true, Date.now() + 1000))
  assert.deepEqual(waits, [], 'no forced read')
  assert.deepEqual(out.map(r => r[3]), ['not refreshed: last 7d 95% >= 90%', 'not refreshed: out of time - press p again', 'not refreshed: last 7d 92% >= 90%'])
})

test('F176 money: a carried 7d over 7 days old no longer holds the forced read (usage-watch then reads, no turn)', async () => {
  const h = home()
  const old = dir(h, '.claude-old', '.credentials.json')
  writeFileSync(join(old, 'quota-cache.json'), JSON.stringify({ src: 'claude-code', note: 'x', failures: 1, backoff_secs: 60, last: { '7d': 95, at: Math.floor(Date.now() / 1000) - 8 * 86400 } }))
  const noAt = dir(h, '.claude-noat', '.credentials.json')
  writeFileSync(join(noAt, 'quota-cache.json'), JSON.stringify({ src: 'claude-code', note: 'x', failures: 1, backoff_secs: 60, last: { '7d': 95 } }))
  const waits: string[] = []
  const read: Reader = async (e, ms) => { if (e.SKILLATOR_QUOTA_REFRESH_WAIT === '1') waits.push(e.SKILLATOR_PROFILE_DIR!); return NONE(e, ms) }
  for (const p of discover(h)) await profileRows(p, read, {}, false, true)
  assert.deepEqual(waits, [`${h}/.claude-noat`, `${h}/.claude-old`])
})

test('F176 last round: a top-level 7d over 7 days old (its at, else the file mtime) is aged - the forced read goes ahead', async () => {
  const h = home(), now = Math.floor(Date.now() / 1000)
  const atOld = dir(h, '.claude-atold', '.credentials.json')
  writeFileSync(join(atOld, 'quota-cache.json'), JSON.stringify({ src: 'claude-code', '7d': 95, at: now - 8 * 86400 }))
  const mOld = dir(h, '.claude-mold', '.credentials.json')
  writeFileSync(join(mOld, 'quota-cache.json'), JSON.stringify({ src: 'claude-code', weekly: 95 }))
  const t = new Date(Date.now() - 8 * 86400 * 1000); utimesSync(join(mOld, 'quota-cache.json'), t, t)
  const fresh = dir(h, '.claude-new', '.credentials.json')
  writeFileSync(join(fresh, 'quota-cache.json'), JSON.stringify({ src: 'claude-code', '7d': 95 }))
  const waits: string[] = []
  const read: Reader = async (e, ms) => { if (e.SKILLATOR_QUOTA_REFRESH_WAIT === '1') waits.push(e.SKILLATOR_PROFILE_DIR!); return NONE(e, ms) }
  for (const p of discover(h)) await profileRows(p, read, {}, false, true)
  assert.deepEqual(waits, [`${h}/.claude-atold`, `${h}/.claude-mold`])
})

// A236 (7): turned_at holds only the paid turn - usage-watch's own gate keeps it 24 h - so the
// free get_usage read still runs and the row can fill inside the 24 h.
test('A236: a turn that gave no limits does not hold the free forced read', async () => {
  const h = home(), now = Math.floor(Date.now() / 1000)
  const rec = (turned_at: number) => JSON.stringify({ src: 'claude-code', note: 'one turn gave no limits', failures: 1, backoff_secs: 60, last: null, turned_at })
  writeFileSync(join(dir(h, '.claude-held', '.credentials.json'), 'quota-cache.json'), rec(now - 3600))
  writeFileSync(join(dir(h, '.claude-past', '.credentials.json'), 'quota-cache.json'), rec(now - 86400 - 60))
  const waits: string[] = []
  const read: Reader = async (e, ms) => {
    if (e.SKILLATOR_QUOTA_REFRESH_WAIT === '1') { waits.push(e.SKILLATOR_PROFILE_DIR!); return NONE(e, ms) }
    return said('src=claude-code 5h=7.0 7d=30.0 ctx=- max=30.0\n')(e, ms)
  }
  const out: string[][] = []
  for (const p of discover(h)) out.push(...await profileRows(p, read, {}, false, true))
  assert.deepEqual(waits, [`${h}/.claude-held`, `${h}/.claude-past`])
  assert.deepEqual(out.find(r => r[0] === 'claude-held'), ['claude-held', '7%', '30%', ''])
})

// A236 (6, part): a 7d or an at that is there but not a number is unknown - it holds the forced
// read, never lets it through.
test('A236: a non-number 7d or at holds the forced read as unknown', async () => {
  const h = home(), now = Math.floor(Date.now() / 1000)
  const put = (name: string, c: unknown) => writeFileSync(join(dir(h, `.claude-${name}`, '.credentials.json'), 'quota-cache.json'), JSON.stringify(c))
  put('s7d', { src: 'claude-code', '7d': '95' })
  put('sweekly', { src: 'claude-code', weekly: '95' })
  put('sat', { src: 'claude-code', '7d': 95, at: String(now) })
  put('slast', { src: 'claude-code', note: 'x', failures: 1, backoff_secs: 60, last: { '7d': '95', at: now } })
  put('slastat', { src: 'claude-code', note: 'x', failures: 1, backoff_secs: 60, last: { '7d': 95, at: String(now) } })
  const waits: string[] = []
  const read: Reader = async (e, ms) => { if (e.SKILLATOR_QUOTA_REFRESH_WAIT === '1') waits.push(e.SKILLATOR_PROFILE_DIR!); return NONE(e, ms) }
  const out: string[][] = []
  for (const p of discover(h)) out.push(...await profileRows(p, read, {}, false, true))
  assert.deepEqual(waits, [], 'no forced read on an unknown 7d')
  for (const r of out) assert.equal(r[3], 'not refreshed: last 7d unknown', r[0])
})

// A236 fix round (7): a non-number 7d or at older than the 7-day age (its at, else the file
// mtime) is aged out like a numeric one - the forced read runs.
test('A236: a non-number 7d or at older than 7 days is aged out and the forced read runs', async () => {
  const h = home(), old = Math.floor(Date.now() / 1000) - 8 * 86400
  const put = (name: string, c: unknown) => {
    const f = join(dir(h, `.claude-${name}`, '.credentials.json'), 'quota-cache.json')
    writeFileSync(f, JSON.stringify(c)); utimesSync(f, old, old)
  }
  put('s7d', { src: 'claude-code', '7d': '95' })
  put('sat', { src: 'claude-code', '7d': 95, at: 'x' })
  put('slast', { src: 'claude-code', note: 'x', failures: 1, backoff_secs: 60, last: { '7d': '95', at: old } })
  put('slastat', { src: 'claude-code', note: 'x', failures: 1, backoff_secs: 60, last: { '7d': 95, at: 'x' } })
  const waits: string[] = []
  const read: Reader = async (e, ms) => { if (e.SKILLATOR_QUOTA_REFRESH_WAIT === '1') waits.push(e.SKILLATOR_PROFILE_DIR!); return NONE(e, ms) }
  for (const p of discover(h)) await profileRows(p, read, {}, false, true)
  assert.deepEqual(waits.sort(), ['s7d', 'sat', 'slast', 'slastat'].map(n => `${h}/.claude-${n}`).sort())
})

// A236 fix round (7): with the forced read held, the cache is re-read after row() - a level read
// that rewrote it shows its via and model rows, not the ones from before.
test('A236: a held row re-reads the cache after its level read', async () => {
  const h = home()
  const f = join(dir(h, '.claude-heldfresh', '.credentials.json'), 'quota-cache.json')
  writeFileSync(f, JSON.stringify({ src: 'claude-code', '7d': 95, models: [{ name: 'Opus', '7d': 3 }] }))
  const p = discover(h)[0]!
  const read: Reader = async (e, ms) => {
    assert.notEqual(e.SKILLATOR_QUOTA_REFRESH_WAIT, '1', 'held: no forced read')
    writeFileSync(f, JSON.stringify({ src: 'claude-code', '5h': 23, '7d': 95, via: 'turn', models: [{ name: 'Sonnet', '7d': 4 }] }))
    return said('src=claude-code 5h=23.0 7d=95.0 ctx=- max=95.0\n')(e, ms)
  }
  const rows = await profileRows(p, read, {}, false, true)
  assert.deepEqual(rows, [['claude-heldfresh', '23%', '95%', 'via one turn'], ['  Sonnet', '-', '4%', '']])
})

// A236 (9): one stat and one read of quota-cache.json per row (the main row's via note and
// its model rows share them).
test('A236: a row reads quota-cache.json once', async () => {
  const h = home()
  const c = dir(h, '.claude-once', '.credentials.json')
  writeFileSync(join(c, 'quota-cache.json'), JSON.stringify({ src: 'claude-code', '5h': 23, '7d': 5, via: 'turn', models: [{ name: 'Opus', '7d': 3 }] }))
  const p = discover(h)[0]!
  const hits = { read: 0, stat: 0 }
  const realRead = fs.readFileSync, realStat = fs.statSync
  mock.method(fs, 'readFileSync', (f: any, ...a: any[]) => { if (String(f).endsWith('quota-cache.json')) hits.read++; return (realRead as any)(f, ...a) })
  mock.method(fs, 'statSync', (f: any, ...a: any[]) => { if (String(f).endsWith('quota-cache.json')) hits.stat++; return (realStat as any)(f, ...a) })
  syncBuiltinESMExports()
  try {
    const rows = await profileRows(p, said('src=claude-code 5h=23.0 7d=5.0 ctx=- max=23.0\n'), {}, false, false)
    assert.deepEqual(rows, [['claude-once', '23%', '5%', 'via one turn'], ['  Opus', '-', '3%', '']])
  } finally { mock.restoreAll(); syncBuiltinESMExports() }
  assert.deepEqual(hits, { read: 1, stat: 1 })
})

test('F176: a reading a forced read got from one tiny turn says so on its row', async () => {
  const h = home()
  const c = dir(h, '.claude-t', '.credentials.json')
  writeFileSync(join(c, 'quota-cache.json'), JSON.stringify({ src: 'claude-code', '5h': 23, '7d': 5, via: 'turn' }))
  const rows = await profileRows(discover(h)[0]!, said('src=claude-code 5h=23.0 7d=5.0 ctx=- max=23.0\n'), {}, false, false)
  assert.deepEqual(rows, [['claude-t', '23%', '5%', 'via one turn']])
})
