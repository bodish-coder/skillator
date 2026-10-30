import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calculateCursorUsage, discover, getBillingCycleStart, recordCursorRun, render, row } from '../status'
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
