import { test, expect } from 'claude-code/testing'
import { parseMachine, classify, gb, usageFrom, usageFromFlags, usageFromLevel, levelLine, pctOf, isStale, ageText, STALE_MS } from '../hooks/lib/facts'
import { parseRuns } from '../hooks/lib/runs'

const GB = 1073741824
const NOW = 1_800_000_000_000
const machine = (disk: number | null, mem: number | null, extra: Partial<{ locks: number; hold: string | null }> = {}) => ({
  at: NOW, drive: 'C:', diskFree: disk, diskTotal: 100 * GB, memFree: mem,
  locks: Array.from({ length: extra.locks ?? 0 }, (_, i) => ({ path: `/r/.skillator/l${i}.lock`, ageMin: 34, holder: 'x' })),
  hold: extra.hold ?? null,
})

// The `pending.sh --machine` contract (design §6), literal text; the ps1 port writes CRLF-safe.
const MACHINE_KV = [
  'DRIVE=C:',
  'DISK_FREE=18253611008',
  'DISK_TOTAL=1023275225088',
  'MEM_FREE=3435973836',
  'LOCK=C:/r/.skillator/run.md.lock|34|@cc-4ae496 dispatch stage 90',
  'LOCK=C:/r/TICKETS.md.lock|12|pid 4411|ticket-meta',
  'HOLD=2026-10-18T09:00Z disk 0.8 GB free (below 1 GB)',
  '',
].join('\r\n')

test('parseMachine reads the --machine keys', () => {
  const m = parseMachine(MACHINE_KV, NOW)
  expect(m).toEqual({
    at: NOW, drive: 'C:', diskFree: 18253611008, diskTotal: 1023275225088, memFree: 3435973836,
    locks: [
      { path: 'C:/r/.skillator/run.md.lock', ageMin: 34, holder: '@cc-4ae496 dispatch stage 90' },
      { path: 'C:/r/TICKETS.md.lock', ageMin: 12, holder: 'pid 4411|ticket-meta' },
    ],
    hold: '2026-10-18T09:00Z disk 0.8 GB free (below 1 GB)',
  })
})
test('parseMachine: empty figures are unknown, HOLD=- is no hold, other --kv keys ignored', () => {
  const m = parseMachine('OPEN=6\nPENDING=2\nRUN=RUN-0012|2/4|@asha|x\nDRIVE=/\nDISK_FREE=\nDISK_TOTAL=abc\nMEM_FREE=\nHOLD=-\nWATCHDOG=green\n', 5)
  expect(m).toEqual({ at: 5, drive: '/', diskFree: null, diskTotal: null, memFree: null, locks: [], hold: null })
  expect(parseMachine('', 1)).toEqual({ at: 1, drive: '', diskFree: null, diskTotal: null, memFree: null, locks: [], hold: null })
})

test('parseMachine on the whole pending --kv output (pending.sh selftest text)', () => {
  const kv = 'OPEN=6\nPENDING=2\nPROGRESS=1\nBLOCKED=1\nDECISION=1\nDEFERRED=1\nRUN=RUN-0012|2/4|@vidul|stage three title\nQUEUED=RUN-0013\n' +
    'SESSION=repo-c0|busy|C:\\w\\r|4\nUNPUSHED=-\nOWED=A1\nDRIVE=X:\nDISK_FREE=858993459\nDISK_TOTAL=1000000000000\nMEM_FREE=3435973836\n' +
    'LOCK=.skillator/run.md.lock|34|1234 sh MINGW\nHOLD=-\nWATCHDOG=red'
  const m = parseMachine(kv, 9)
  expect(m).toEqual({ at: 9, drive: 'X:', diskFree: 858993459, diskTotal: 1000000000000, memFree: 3435973836,
    locks: [{ path: '.skillator/run.md.lock', ageMin: 34, holder: '1234 sh MINGW' }], hold: null })
  expect(classify(m)).toEqual({ level: 'red', reasons: ['disk 0.8 GB free (below 1 GB)'] })
})

test('classify: disk boundaries', () => {
  expect(classify(machine(GB - 1, 8 * GB)).level).toBe('red')
  expect(classify(machine(GB, 8 * GB)).level).toBe('amber')
  expect(classify(machine(5 * GB - 1, 8 * GB)).level).toBe('amber')
  expect(classify(machine(5 * GB, 8 * GB)).level).toBe('green')
})
test('classify: memory boundaries', () => {
  expect(classify(machine(50 * GB, GB - 1)).level).toBe('red')
  expect(classify(machine(50 * GB, GB)).level).toBe('amber')
  expect(classify(machine(50 * GB, 2 * GB - 1)).level).toBe('amber')
  expect(classify(machine(50 * GB, 2 * GB)).level).toBe('green')
})
test('classify: reasons in the band words', () => {
  expect(classify(machine(Math.round(0.8 * GB), 8 * GB))).toEqual({ level: 'red', reasons: ['disk 0.8 GB free (below 1 GB)'] })
  expect(classify(machine(Math.round(4.1 * GB), Math.round(1.5 * GB)))).toEqual({ level: 'amber', reasons: ['disk 4.1 GB low', 'mem 1.5 GB low'] })
  expect(classify(machine(50 * GB, 8 * GB, { locks: 2 }))).toEqual({ level: 'amber', reasons: ['locks 2 stale'] })
  expect(classify(machine(50 * GB, 8 * GB, { hold: '2026-10-18T09:00Z disk' }))).toEqual({ level: 'amber', reasons: ['held - /ops resume to release'] })
  expect(classify(machine(50 * GB, 8 * GB))).toEqual({ level: 'green', reasons: [] })
})
// A figure below its threshold is floored, so its words agree with its colour:
// never "1.0 GB free (below 1 GB)" or "2.0 GB low" (below 2 GB).
test('classify: a figure below its threshold never reads as the threshold', () => {
  expect(classify(machine(GB - 1, 8 * GB)).reasons).toEqual(['disk 0.9 GB free (below 1 GB)'])
  expect(classify(machine(Math.round(0.97 * GB), 8 * GB)).reasons).toEqual(['disk 0.9 GB free (below 1 GB)'])
  expect(classify(machine(50 * GB, GB - 1)).reasons).toEqual(['mem 0.9 GB free (below 1 GB)'])
  expect(classify(machine(50 * GB, 2 * GB - 1)).reasons).toEqual(['mem 1.9 GB low'])
  expect(classify(machine(5 * GB - 1, 8 * GB)).reasons).toEqual(['disk 4.9 GB low'])
  expect(gb(GB - 1, GB)).toBe('0.9 GB')
  expect(gb(Math.round(1.96 * GB), 2 * GB)).toBe('1.9 GB')
  expect(gb(Math.round(1.96 * GB))).toBe('2.0 GB')            // no threshold: rounded as ever
  expect(gb(8 * GB, 2 * GB)).toBe('8.0 GB')                   // above it: rounded as ever
  expect(gb(null, GB)).toBe('?')
})
test('classify: unknown figures are never red', () => {
  expect(classify(machine(null, null)).level).toBe('green')
})

test('gb: one decimal below 10, whole from 10, ? when unknown', () => {
  expect(gb(18253611008)).toBe('17 GB')
  expect(gb(3435973836)).toBe('3.2 GB')
  expect(gb(Math.round(0.8 * GB))).toBe('0.8 GB')
  expect(gb(10 * GB)).toBe('10 GB')
  expect(gb(null)).toBe('?')
  expect(gb(-1)).toBe('?')
})

test('usageFrom picks five_hour, seven_day, spend_limit', () => {
  const u = usageFrom([
    { kind: 'five_hour', percentUsed: 41, resetsAt: '2026-10-18T14:20:00Z' },
    { kind: 'seven_day', percentUsed: 55 },
    { kind: 'spend_limit', percentUsed: 34, resetsAt: '2026-11-01T00:00:00Z' },
    { kind: 'something_new', percentUsed: 99 },
  ], 1.23, NOW)
  expect(u).toEqual({
    five: { pct: 41, resetsAt: '2026-10-18T14:20:00Z', source: 'host', at: NOW },
    seven: { pct: 55, resetsAt: null, source: 'host', at: NOW },
    spendLimitPct: 34, costUsd: 1.23, decision: null,
  })
  expect(usageFrom([], null, NOW)).toEqual({ five: null, seven: null, spendLimitPct: null, costUsd: null, decision: null })
})

test('usageFromFlags: watch-cortana files, mtime is the reading time', () => {
  const u = usageFromFlags({ text: '\uFEFF41.5\r\n', mtimeMs: NOW - 60_000 }, { text: '55', mtimeMs: NOW - 3 * 3600_000 }, null)
  expect(u.five).toEqual({ pct: 41.5, resetsAt: null, source: 'watch-cortana', at: NOW - 60_000 })
  expect(u.seven).toEqual({ pct: 55, resetsAt: null, source: 'watch-cortana', at: NOW - 3 * 3600_000 })
  expect(usageFromFlags(null, { text: 'garbage', mtimeMs: 1 }, 2).seven).toBe(null)
  expect(pctOf('x 12.0 y')).toBe(12)
})

test('staleness: 15 minutes; age text', () => {
  const w = { pct: 55, resetsAt: null, source: 'host' as const, at: NOW }
  expect(isStale(w, NOW + STALE_MS)).toBe(false)
  expect(isStale(w, NOW + STALE_MS + 1)).toBe(true)
  expect(ageText(w, NOW + 7 * 60_000)).toBe('7m old')
  expect(ageText(w, NOW + 2 * 3600_000 + 59 * 60_000)).toBe('2h old')
  expect(ageText(w, NOW + 3 * 86400_000)).toBe('3d old')
})

test('levelLine: the line relay chain decide --level reads', () => {
  const u = usageFrom([{ kind: 'five_hour', percentUsed: 41 }, { kind: 'seven_day', percentUsed: 55 }], null, NOW)
  expect(levelLine(u)).toBe('src=host 5h=41 7d=55 ctx=- max=-')
  expect(levelLine(usageFrom([{ kind: 'seven_day', percentUsed: 91.5 }], null, NOW))).toBe('src=host 5h=- 7d=91.5 ctx=- max=-')
  expect(levelLine(usageFrom([], null, NOW))).toBe('src=none 5h=- 7d=- ctx=- max=-')
  const flags = usageFromFlags(null, { text: '55', mtimeMs: NOW }, null)
  expect(levelLine(flags)).toBe('src=watch-cortana 5h=- 7d=55 ctx=- max=-')
  // a figure past 15 minutes never decides a hold
  expect(levelLine(u, NOW + STALE_MS + 1)).toBe('src=none 5h=- 7d=- ctx=- max=-')
  expect(levelLine(u, NOW + 60_000)).toBe('src=host 5h=41 7d=55 ctx=- max=-')
})

// `relay-morpheus list` (relay-morpheus.sh cmd_list: printf 'RUN-%s  %-42s  %s/%s done') and
// `relay-morpheus <id> chain status` (the ## Chain and ## Decisions sections verbatim).
const row = (id: string, title: string, d: number, t: number, open = '') =>
  `RUN-${id}  ${title.padEnd(42)}  ${d}/${t} done${open ? `  (stage ${open} open)` : ''}`
const LIST = [
  row('0012', 'drain the board 4', 2, 4, '90'),
  '          plan: TICKETS.md',
  '          owner: @asha',
  '          resume: continue RUN-0012',
  row('0014', 'plan from /plan-runs', 0, 4),
  '          plan: TICKETS.md',
  '          owner: @vidul',
  '          resume: continue RUN-0014',
  row('0011', 'parallel runs, marathon, one build, holo and a title past forty-two', 16, 16),
  '          plan: docs/plans/PLAN-parallel-runs.md',
  '          resume: continue RUN-0011',
  '',
].join('\n')
const SEP = '     '
const CHAIN_14 = [
  '## Chain',
  `driver: -${SEP}hold: -${SEP}mode: workflow`,
  '### AB12 - stage 101 - F46 tickets pane',
  'tickets: F46 build/sonnet',
  'files: mods/ops-board/hooks/tickets.tsx',
  'prompt: |',
  '  do F46',
  '  tickets: not a real line',
  '',
  '### AB13 - stage 102 - F47 assign from the pane',
  'tickets: F47 build/sonnet',
  'files: mods/ops-board/hooks/tickets.tsx',
  'after: 101',
  'prompt: |',
  '  do F47',
  '### AB14 - stage 103 - F48 watchdog band',
  'tickets: F48 deep/build . F48b deep/build',
  'files: mods/ops-board/hooks/band.tsx',
  'prompt: |',
  '  ### AB99 - stage 9 - inside a prompt',
  '## Decisions',
  '### Q1 - F49 credit source',
  '',
].join('\n')
const CHAIN_12 = [
  '## Chain',
  `driver: @cc-4ae496 2026-10-18T08:00Z${SEP}hold: -${SEP}mode: workflow`,
  '### AA01 - stage 89 - AA01 B2 cart',
  'tickets: B2 build/sonnet',
  'prompt: |',
  '  x',
  '### AA02 - stage 90 - F3 drawer',
  'tickets: F3 build/sonnet',
  'files: web/drawer.tsx',
  'prompt: |',
  '  y',
].join('\r\n')

test('parseRuns: list rows, owners, chain stages', () => {
  const runs = parseRuns(LIST, { 'RUN-0014': CHAIN_14, 'RUN-0012': CHAIN_12 })
  expect(runs.map(r => [r.id, r.title, r.done, r.total, r.owner, r.planned])).toEqual([
    ['RUN-0012', 'drain the board 4', 2, 4, '@asha', false],
    ['RUN-0014', 'plan from /plan-runs', 0, 4, '@vidul', true],
    ['RUN-0011', 'parallel runs, marathon, one build, holo and a title past forty-two', 16, 16, null, false],
  ])
  expect(runs[1]!.stages).toEqual([
    { n: 101, code: 'AB12', ticket: 'F46', title: 'F46 tickets pane', after: '-', files: 'mods/ops-board/hooks/tickets.tsx', state: 'pending' },
    { n: 102, code: 'AB13', ticket: 'F47', title: 'F47 assign from the pane', after: '101', files: 'mods/ops-board/hooks/tickets.tsx', state: 'pending' },
    { n: 103, code: 'AB14', ticket: 'F48 F48b', title: 'F48 watchdog band', after: '-', files: 'mods/ops-board/hooks/band.tsx', state: 'pending' },
  ])
  // a dispatched run: the open stage is known from the list row, the code prefix is not part of the title
  expect(runs[0]!.stages.map(s => [s.n, s.title, s.files, s.state])).toEqual([
    [89, 'B2 cart', '-', '-'],
    [90, 'F3 drawer', 'web/drawer.tsx', 'open'],
  ])
  expect(runs[2]!.stages).toEqual([])
})
test('parseRuns: a stage table in the text gives exact states', () => {
  const text = '## Stages\n| # | stage | state | owner | heartbeat | landed |\n|---|---|---|---|---|---|\n| 89 | AA01 B2 cart | x | build | - | abc |\n| 90 | AA02 F3 drawer | ~ | build | - | |\n\n' + CHAIN_12
  const r = parseRuns(LIST, { 'RUN-0012': text })[0]!
  expect(r.stages.map(s => s.state)).toEqual(['x', '~'])
})
test('parseRuns: no runs', () => {
  expect(parseRuns('no runs in /r/.skillator\n', {})).toEqual([])
})
// F50: parked decisions - the `## Decisions` blocks still waiting on an answer
// (relay-morpheus.sh park: `### Q<k> open <time>`, parked:, ticket:, question:, answer:).
test('parseRuns: parked decisions from ## Decisions, unanswered ones only', () => {
  const text = CHAIN_14.replace('### Q1 - F49 credit source\n', [
    'asks: end',
    '### Q1 open 2026-10-18T09:00Z',
    'parked: planning',
    'ticket: F49',
    'reason: no credit source on this host',
    'question: Which credit source does the Health tab show?',
    'header: credit',
    'options:',
    '  - a: none',
    'answer: -',
    '### Q2 answered 2026-10-18T09:05Z',
    'parked: stage 102 (AB13)',
    'ticket: F47',
    'question: Who owns assign?',
    'answer: @vidul',
    '### Q3 asked 2026-10-18T09:06Z',
    'parked: stage 103 (AB14)',
    'ticket: F48 deep/build',
    'reason: disk threshold',
    'answer: -',
    '',
  ].join('\n'))
  const r = parseRuns(LIST, { 'RUN-0014': text })
  expect(r.find(x => x.id === 'RUN-0014')!.decisions).toEqual([
    'Q1 F49 Which credit source does the Health tab show? - planning waits on it',
    'Q3 F48 disk threshold - stage 103 (AB14) waits on it',
  ])
  // the stages still parse; runs with no chain text have none
  expect(r.find(x => x.id === 'RUN-0014')!.stages).toHaveLength(3)
  expect(r.find(x => x.id === 'RUN-0012')!.decisions).toEqual([])
})

// Review round 2, R6: a hold file that exists is held whatever it holds; only HOLD=- is no hold.
test('parseMachine: every HOLD value but exactly - is held; an empty one reads as ? -', () => {
  expect(parseMachine('HOLD=? -\n', 1).hold).toBe('? -')
  expect(parseMachine('HOLD=\n', 1).hold).toBe('? -')
  expect(parseMachine('HOLD=  \r\n', 1).hold).toBe('? -')
  expect(parseMachine('HOLD=-\r\n', 1).hold).toBeNull()
  expect(classify(parseMachine('DISK_FREE=' + 50 * GB + '\nMEM_FREE=' + 8 * GB + '\nHOLD=\n', 1)))
    .toEqual({ level: 'amber', reasons: ['held - /ops resume to release'] })
})

test('usageFromLevel: codex line, dashes, none', () => {
  const u = usageFromLevel('src=codex 5h=41 7d=55.5 ctx=7 max=-', 1000)
  expect(u.five).toEqual({ pct: 41, resetsAt: null, source: 'watch-cortana', at: 1000 })
  expect(u.seven?.pct).toBe(55.5)
  expect(usageFromLevel('src=claude-code 5h=- 7d=12 ctx=- max=-', 0).five).toBeNull()
  expect(usageFromLevel('src=none 5h=- 7d=- ctx=- max=-', 0)).toEqual({ five: null, seven: null, spendLimitPct: null, costUsd: null, decision: null })
  expect(usageFromLevel('garbage\r\n', 0).seven).toBeNull()
  expect(levelLine(usageFromLevel('src=codex 5h=41 7d=55 ctx=- max=-', 0), 0)).toBe('src=watch-cortana 5h=41 7d=55 ctx=- max=-')
})
