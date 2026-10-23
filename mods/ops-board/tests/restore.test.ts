import { test, expect } from 'claude-code/testing'
import type { EngineInterface, ProcessRunInit, ProcessRunResult } from 'claude-code'
import { restoreClaudeMd, RESTORE_NOTE } from '../hooks/lib/restore'
import type { RestoreApi } from '../hooks/lib/restore'

// F48: a CLAUDE.md the baseline harness hid (CLAUDE.md.skillator-hidden) is put back
// at session end, in ~/.claude and in $CLAUDE_CONFIG_DIR, only when CLAUDE.md is absent.
// The text goes back in-process first ($.fs.write, checked by reading it back); only
// then is the hidden copy removed by a host command. Fakes only: never the real ~/.claude.

// Compile-time: the plugin's own `$` is a RestoreApi.
export const asRestore = ($: EngineInterface): RestoreApi => $

type Seen = { runs: { argv: readonly string[]; init?: ProcessRunInit }[]; store: Record<string, unknown>; writes: string[]
  order: string[] }   // 'run <argv0>' / 'store' in the order they happened
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

type Opts = { removes?: boolean; throws?: string; writeFails?: boolean; garble?: boolean
  pid?: 'alive' | 'dead' | 'throws'     // how `sh -c 'kill -0 <pid>'` answers
  task?: 'alive' | 'dead' | 'throws' | 'fails'   // how `tasklist /FI "PID eq <winpid>" /NH` answers
  now?: number }                        // the clock, ms (default: an hour after OWNER_AT)
// A file system of path -> text; `rm -f` / Remove-Item deletes one unless `removes` is false.
function fake(env: Record<string, string>, paths: Record<string, string>, o: Opts = {}): [RestoreApi, Seen, Map<string, string>] {
  const files = new Map(Object.entries(paths))
  const seen: Seen = { runs: [], store: {}, writes: [], order: [] }
  const $: RestoreApi = {
    env: { get: async n => env[n] },
    clock: { now: async () => o.now ?? (OWNER_AT + 3600) * 1000 },
    fs: {
      exists: async p => files.has(p),
      read: async p => { const t = files.get(p); if (t === undefined) throw new Error('ENOENT ' + p); return t },
      write: async (p, t) => {
        seen.writes.push(p)
        if (o.writeFails) throw new Error('EACCES ' + p)
        files.set(p, o.garble ? t.slice(1) : t)
      },
    },
    process: {
      run: async (argv, init) => {
        seen.runs.push({ argv, init })
        seen.order.push('run ' + argv[0])
        if (/\/System32\/tasklist\.exe$/.test(argv[0] ?? '')) {
          if (o.task === 'throws') throw new Error('spawn tasklist ENOENT')
          if (o.task === 'fails') return ran('', 1, 'ERROR: Invalid argument/option')
          const pid = /PID eq (\d+)/.exec(argv[2] ?? '')?.[1] ?? '?'
          return o.task === 'alive' ? ran(`bash.exe                     ${pid} Console                    1      9,120 K\r\n`)
            : ran('INFO: No tasks are running which match the specified criteria.\r\n')
        }
        if (argv[0] === '/bin/sh' && argv[1] === '-c') {
          if (o.pid === 'throws') throw new Error('spawn sh ENOENT')
          return o.pid === 'alive' ? ran('') : ran('', 1, 'kill: (4242) - No such process')
        }
        if (o.throws) throw new Error(o.throws)
        if (o.removes === false) return ran('', 1, 'rm: cannot remove: Permission denied')
        const ps = argv[0] === 'rm' ? argv.slice(3) : [...(argv[3] ?? '').matchAll(/'([^']*)'/g)].map(x => x[1]!)
        for (const p of ps) files.delete(p)
        return ran('')
      },
    },
    store: { set: async (k, v) => { seen.order.push('store'); seen.store[k] = v } },
  }
  return [$, seen, files]
}

const OWNER_AT = 1760774400                 // the owner file's epoch, seconds
// A150: host commands run by absolute path, never a bare name the cwd (the repo) could
// supply on Windows: System32's tasklist and Windows PowerShell (no SystemRoot set here:
// C:/Windows), /bin/sh for the pid check.
const TASKLIST = 'C:/Windows/System32/tasklist.exe'
const PWSH = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
const HID = '/h/.claude/CLAUDE.md.skillator-hidden'
const MD = '/h/.claude/CLAUDE.md'
const TEXT = '# mine\nalways X\n'

test('restore: hidden and absent in ~/.claude - written back in-process, then the hidden copy removed', async () => {
  const [$, seen, files] = fake({ HOME: '/h', CLAUDE_CONFIG_DIR: '/c' }, { [HID]: TEXT })
  const lines = await restoreClaudeMd($, 'restore')
  expect(seen.writes).toEqual([MD])
  expect(files.get(MD)).toBe(TEXT)
  expect(seen.runs.map(r => r.argv)).toEqual([['rm', '-f', '--', HID]])
  expect(files.has(HID)).toBe(false)
  expect(lines).toEqual([`✓ Restored ~/.claude/CLAUDE.md from CLAUDE.md.skillator-hidden (an interrupted baseline run left it hidden). ran: rm -f -- ${HID}`])
  expect(seen.store[RESTORE_NOTE]).toEqual(lines)
})

test('report: says it is hidden and how to restore it; writes nothing, runs nothing, stores nothing', async () => {
  const [$, seen] = fake({ HOME: '/h', CLAUDE_CONFIG_DIR: '/c' }, { [HID]: TEXT })
  const lines = await restoreClaudeMd($, 'report')
  expect(seen.runs).toEqual([])
  expect(seen.writes).toEqual([])
  expect(seen.store).toEqual({})
  expect(lines).toEqual([`▲ ~/.claude/CLAUDE.md is hidden as CLAUDE.md.skillator-hidden - left as is now (a baseline GREEN may be running); it is put back at session end. By hand: mv -n ${HID} ${MD}`])
})

test('both files present, or nothing hidden: nothing to do - CLAUDE.md is never written over', async () => {
  for (const paths of [{ [HID]: 'old', [MD]: TEXT }, { [MD]: TEXT }, {}] as Record<string, string>[]) {
    const [$, seen, files] = fake({ HOME: '/h', CLAUDE_CONFIG_DIR: '/c' }, paths)
    expect(await restoreClaudeMd($, 'restore')).toEqual([])
    expect(seen.runs).toEqual([])
    expect(seen.writes).toEqual([])
    expect(seen.store).toEqual({})
    if (MD in paths) expect(files.get(MD)).toBe(TEXT)
  }
})

test('CLAUDE_CONFIG_DIR is checked too, and restored there', async () => {
  const [$, seen, files] = fake({ HOME: '/h', CLAUDE_CONFIG_DIR: '/c/' }, { '/c/CLAUDE.md.skillator-hidden': TEXT, [MD]: 'other' })
  const lines = await restoreClaudeMd($, 'restore')
  expect(seen.writes).toEqual(['/c/CLAUDE.md'])
  expect(seen.runs.map(r => r.argv)).toEqual([['rm', '-f', '--', '/c/CLAUDE.md.skillator-hidden']])
  expect(files.get('/c/CLAUDE.md')).toBe(TEXT)
  expect(files.get(MD)).toBe('other')
  expect(lines[0]).toStartWith('✓ Restored /c/CLAUDE.md from CLAUDE.md.skillator-hidden')
})

test('CLAUDE_CONFIG_DIR naming ~/.claude itself is one folder, checked once', async () => {
  const [$, seen] = fake({ HOME: '/h', CLAUDE_CONFIG_DIR: '/h/.claude' }, { [HID]: TEXT })
  expect(await restoreClaudeMd($, 'restore')).toHaveLength(1)
  expect(seen.writes).toHaveLength(1)
  expect(seen.runs).toHaveLength(1)
})

test('Windows: Remove-Item through powershell, USERPROFILE as home', async () => {
  const hid = 'C:/Users/v/.claude/CLAUDE.md.skillator-hidden', md = 'C:/Users/v/.claude/CLAUDE.md'
  const [$, seen, files] = fake({ OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\v' }, { [hid]: TEXT })
  const lines = await restoreClaudeMd($, 'restore')
  expect(files.get(md)).toBe(TEXT)
  expect(seen.runs.map(r => r.argv)).toEqual([
    [PWSH, '-NoProfile', '-Command', `Remove-Item -LiteralPath '${hid}'`]])
  expect(files.has(hid)).toBe(false)
  expect(lines[0]).toStartWith('✓ Restored ~/.claude/CLAUDE.md')
})

test('A150 Windows: tasklist and powershell from SystemRoot by absolute path, never a bare name', async () => {
  const hid = 'C:/Users/v/.claude/CLAUDE.md.skillator-hidden'
  const [$, seen] = fake({ OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\v', SystemRoot: 'D:\\Win' },
    { [hid]: TEXT, [hid + '.owner']: `77 ${OWNER_AT} 5150\n` }, { task: 'dead' })
  await restoreClaudeMd($, 'restore')
  expect(seen.runs.map(r => r.argv[0])).toEqual(['D:/Win/System32/tasklist.exe', 'D:/Win/System32/WindowsPowerShell/v1.0/powershell.exe'])
})

test('the removal failing: CLAUDE.md is back all the same; the note says the hidden copy is left, and where', async () => {
  const [$, seen, files] = fake({ HOME: '/h' }, { [HID]: TEXT }, { removes: false })
  const lines = await restoreClaudeMd($, 'restore')
  expect(files.get(MD)).toBe(TEXT)
  expect(files.has(HID)).toBe(true)
  expect(lines).toEqual([`✓ Restored ~/.claude/CLAUDE.md from CLAUDE.md.skillator-hidden (an interrupted baseline run left it hidden). ▲ The hidden copy is left behind at ${HID}: rm: cannot remove: Permission denied - remove it by hand. ran: rm -f -- ${HID}`])
  expect(seen.store[RESTORE_NOTE]).toEqual(lines)
})

test('the removal timing out: CLAUDE.md is back; the hidden copy is said left behind', async () => {
  const [$, seen, files] = fake({ HOME: '/h' }, { [HID]: TEXT }, { throws: 'timed out after 1500 ms' })
  const lines = await restoreClaudeMd($, 'restore', 1500)
  expect(seen.runs[0]!.init?.timeoutMs).toBe(1500)   // one folder, no owner file: the whole budget
  expect(files.get(MD)).toBe(TEXT)
  expect(lines[0]).toContain(`▲ The hidden copy is left behind at ${HID}: timed out after 1500 ms`)
})

test('the write failing: nothing removed, the failure said with the hidden copy kept', async () => {
  const [$, seen, files] = fake({ HOME: '/h' }, { [HID]: TEXT }, { writeFails: true })
  const lines = await restoreClaudeMd($, 'restore')
  expect(seen.runs).toEqual([])
  expect(files.has(HID)).toBe(true)
  expect(lines).toEqual([`■ Could not restore ~/.claude/CLAUDE.md from CLAUDE.md.skillator-hidden: EACCES ${MD}. The hidden copy is kept at ${HID}.`])
  expect(seen.store[RESTORE_NOTE]).toEqual(lines)
})

test('the written text not reading back the same: the hidden copy is kept, never removed', async () => {
  const [$, seen, files] = fake({ HOME: '/h' }, { [HID]: TEXT }, { garble: true })
  const lines = await restoreClaudeMd($, 'restore')
  expect(seen.runs).toEqual([])
  expect(files.has(HID)).toBe(true)
  expect(lines[0]).toStartWith('■ Could not restore ~/.claude/CLAUDE.md from CLAUDE.md.skillator-hidden: ~/.claude/CLAUDE.md does not read back as written')
  expect(lines[0]).toContain(`The hidden copy is kept at ${HID}.`)
})

test('no HOME and no CLAUDE_CONFIG_DIR: nothing checked', async () => {
  const [$, seen] = fake({}, { [HID]: TEXT })
  expect(await restoreClaudeMd($, 'restore')).toEqual([])
  expect(seen.runs).toEqual([])
  expect(seen.writes).toEqual([])
})

// Review fix, contract R1: the harness writes <hidden>.owner = "<pid> <epoch>" while its
// GREEN run has CLAUDE.md hidden. Session end restores only when no owner file is there
// or its pid is not alive (`sh -c 'kill -0 <pid>'`); a check that cannot run restores nothing.
const OWN = HID + '.owner'

test('restore: a live run holding it (owner pid alive) - left alone, nothing written or removed', async () => {
  const [$, seen, files] = fake({ HOME: '/h' }, { [HID]: TEXT, [OWN]: '4242 1760774400\n' }, { pid: 'alive' })
  const lines = await restoreClaudeMd($, 'restore')
  expect(seen.runs.map(r => r.argv)).toEqual([['/bin/sh', '-c', 'kill -0 4242']])
  expect(seen.writes).toEqual([])
  expect(files.has(HID)).toBe(true)
  expect(files.has(OWN)).toBe(true)
  expect(files.has(MD)).toBe(false)
  expect(lines).toEqual(['▲ ~/.claude/CLAUDE.md is hidden by a running GREEN run (pid 4242) - left alone'])
})

test('restore: the owner pid dead - restored, the hidden copy and the owner file removed together', async () => {
  const [$, seen, files] = fake({ HOME: '/h' }, { [HID]: TEXT, [OWN]: '4242 1760774400\n' }, { pid: 'dead' })
  const lines = await restoreClaudeMd($, 'restore')
  expect(seen.runs.map(r => r.argv)).toEqual([['/bin/sh', '-c', 'kill -0 4242'], ['rm', '-f', '--', HID, OWN]])
  expect(files.get(MD)).toBe(TEXT)
  expect(files.has(HID)).toBe(false)
  expect(files.has(OWN)).toBe(false)
  expect(lines[0]).toStartWith('✓ Restored ~/.claude/CLAUDE.md from CLAUDE.md.skillator-hidden')
  expect(lines[0]).not.toContain('left behind')
})

test('restore, Windows: the owner winpid not running (tasklist) - both removed by one Remove-Item', async () => {
  const hid = 'C:/Users/v/.claude/CLAUDE.md.skillator-hidden'
  const [$, seen, files] = fake({ OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\v' }, { [hid]: TEXT, [hid + '.owner']: `77 ${OWNER_AT} 5150\n` }, { task: 'dead' })
  await restoreClaudeMd($, 'restore')
  expect(seen.runs.map(r => r.argv)).toEqual([[TASKLIST, '/FI', 'PID eq 5150', '/NH'],
    [PWSH, '-NoProfile', '-Command', `Remove-Item -LiteralPath '${hid}', '${hid}.owner'`]])
  expect(files.has(hid)).toBe(false)
  expect(files.has(hid + '.owner')).toBe(false)
})

test('restore: the pid check failing, or an unreadable owner file - no restore, says it could not check', async () => {
  for (const [owner, o] of [['4242 1\n', { pid: 'throws' }], ['garbage\n', { pid: 'dead' }]] as [string, Opts][]) {
    const [$, seen, files] = fake({ HOME: '/h' }, { [HID]: TEXT, [OWN]: owner }, o)
    const lines = await restoreClaudeMd($, 'restore')
    expect(seen.writes).toEqual([])
    expect(seen.runs.filter(r => r.argv[0] !== '/bin/sh')).toEqual([])
    expect(files.has(HID)).toBe(true)
    expect(files.has(OWN)).toBe(true)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('could not check the run holding it')
    expect(lines[0]).toContain('~/.claude/CLAUDE.md')
  }
})

test('report at session start runs no pid check', async () => {
  const [$, seen] = fake({ HOME: '/h' }, { [HID]: TEXT, [OWN]: '4242 1\n' }, { pid: 'alive' })
  expect(await restoreClaudeMd($, 'report')).toHaveLength(1)
  expect(seen.runs).toEqual([])
})

// Review round 2, R1b: the owner line is "<pid> <epoch> <winpid>" (the old "<pid> <epoch>"
// reads as winpid -). On Windows a numeric winpid is checked with tasklist; elsewhere
// `kill -0 <pid>`. A check that fails, or Windows with winpid -, is unknown: no restore.
// An owner file over 6 hours old with a dead or unknown check is never restored by itself.
const WHID = 'C:/Users/v/.claude/CLAUDE.md.skillator-hidden', WMD = 'C:/Users/v/.claude/CLAUDE.md'
const WIN = { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\v' }

test('R1b Windows: tasklist naming the winpid - alive, left alone', async () => {
  const [$, seen, files] = fake(WIN, { [WHID]: TEXT, [WHID + '.owner']: `4242 ${OWNER_AT} 9876\n` }, { task: 'alive' })
  const lines = await restoreClaudeMd($, 'restore')
  expect(seen.runs.map(r => r.argv)).toEqual([[TASKLIST, '/FI', 'PID eq 9876', '/NH']])
  expect(files.has(WMD)).toBe(false)
  expect(lines).toEqual(['▲ ~/.claude/CLAUDE.md is hidden by a running GREEN run (pid 9876) - left alone'])
})

test('R1b Windows: winpid - (or the old two-field line), or tasklist failing - unknown, nothing restored', async () => {
  for (const [owner, o] of [[`4242 ${OWNER_AT} -\n`, {}], [`4242 ${OWNER_AT}\n`, {}],
    [`4242 ${OWNER_AT} 9876\n`, { task: 'throws' }], [`4242 ${OWNER_AT} 9876\n`, { task: 'fails' }]] as [string, Opts][]) {
    const [$, seen, files] = fake(WIN, { [WHID]: TEXT, [WHID + '.owner']: owner }, o)
    const lines = await restoreClaudeMd($, 'restore')
    expect(seen.runs.filter(r => r.argv[0] !== TASKLIST)).toEqual([])
    expect(seen.writes).toEqual([])
    expect(files.has(WMD)).toBe(false)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('could not check the run holding it')
  }
})

test('R1b POSIX: a three-field line with winpid - checks kill -0 <pid>', async () => {
  const [$, seen, files] = fake({ HOME: '/h' }, { [HID]: TEXT, [OWN]: `4242 ${OWNER_AT} -\n` }, { pid: 'dead' })
  await restoreClaudeMd($, 'restore')
  expect(seen.runs.map(r => r.argv)).toEqual([['/bin/sh', '-c', 'kill -0 4242'], ['rm', '-f', '--', HID, OWN]])
  expect(files.get(MD)).toBe(TEXT)
})

test('R1b: an owner file over 6 hours old, its run dead or unknown - not restored by itself, the manual command said', async () => {
  const late = (OWNER_AT + 6 * 3600 + 60) * 1000
  for (const o of [{ pid: 'dead', now: late }, { pid: 'throws', now: late }] as Opts[]) {
    const [$, seen, files] = fake({ HOME: '/h' }, { [HID]: TEXT, [OWN]: `4242 ${OWNER_AT} -\n` }, o)
    const lines = await restoreClaudeMd($, 'restore')
    expect(seen.runs.filter(r => r.argv[0] !== '/bin/sh')).toEqual([])
    expect(seen.writes).toEqual([])
    expect(files.has(HID)).toBe(true)
    expect(files.has(MD)).toBe(false)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('~/.claude/CLAUDE.md')
    expect(lines[0]).toContain(`mv -n ${HID} ${MD}`)
    expect(seen.store[RESTORE_NOTE]).toEqual(lines)
  }
})

// Review round 2: the session-end budget. A remaining time that is not a number, or under
// a second, is a second; it is split over the folders; no step is given NaN; the note is
// stored before the removal runs, so a cut-short end still leaves it.
test('budget: NaN, negative or tiny remainingMs is treated as 1000 ms, split across the folders', async () => {
  for (const bad of [NaN, -500, 3, Infinity]) {
    const [$, seen] = fake({ HOME: '/h', CLAUDE_CONFIG_DIR: '/c' },
      { [HID]: TEXT, [OWN]: `4242 ${OWNER_AT} -\n`, '/c/CLAUDE.md.skillator-hidden': TEXT }, { pid: 'dead' })
    await restoreClaudeMd($, 'restore', bad)
    const ts = seen.runs.map(r => r.init?.timeoutMs)
    expect(ts).toHaveLength(3)
    for (const t of ts) {
      expect(Number.isFinite(t)).toBe(true)
      expect(t!).toBeGreaterThan(0)
    }
    expect(ts.reduce((a, b) => a! + b!, 0)!).toBeLessThanOrEqual(1000)
  }
})

test('budget: the note is stored before the removal runs', async () => {
  const [$, seen] = fake({ HOME: '/h' }, { [HID]: TEXT })
  await restoreClaudeMd($, 'restore')
  expect(seen.order.indexOf('store')).toBeGreaterThanOrEqual(0)
  expect(seen.order.indexOf('store')).toBeLessThan(seen.order.indexOf('run rm'))
})
