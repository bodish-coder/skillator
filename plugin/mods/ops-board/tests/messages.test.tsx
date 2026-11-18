import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'

test('login requires confirmation and cancel preserves the form', async ($, on) => {
  const [w, clock] = world(on)
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await ui.press({ key: 'key:setup' })
  await clock.settle()
  expect((await ui.find({ key: 'setup:login' }))?.text).toBe('Sign in to Dev Tunnels')
  const before = w.runs.length
  await ui.press({ key: 'setup:login' })
  await clock.settle()
  expect((await ui.find({ key: 'setup:login-yes' }))?.text).toBe('Sign in')
  await ui.press({ key: 'setup:login-no' })
  await clock.settle()
  expect(w.runs.length).toBe(before)
  expect(await ui.find({ key: 'setup:token' })).not.toBeNull()
  await ui.unmount()
})

// F66: the Messages tab and the Teams setup form in the Claude Code pane. The inbox is
// teams-uhura's (<repo>/.git/skillator/team-inbox.jsonl); the setup form's token is
// masked as typed, never drawn back, and goes to `team.mjs config save` on stdin only.

const ROOT = '/s'
const TEAM_JS = ROOT + '/skills/teams-uhura/scripts/team.mjs'
const BOX = '/r/.git/skillator'
const NODE = '/usr/bin/node'        // found on PATH; the '.' entry (the repo) is skipped
const rec = (id: string, from: string, text: string, min: number) =>
  JSON.stringify({ ts: `2026-10-23T09:${String(min).padStart(2, '0')}:00.000Z`, from, email: from.slice(1) + '@x.com', text, id })
const INBOX = [rec('1', '@asha', 'can you look at F12?', 10), rec('2', '@vidul', 'build is red', 11), rec('3', '@asha', 'never mind', 12)].join('\n') + '\n'
const TOKEN = 'YS0zMi1ieXRlLXNlY3VyaXR5LXRva2VuLWZvci10c3Q='
const CFG_NONE = '{"path":"/h/.skillator/teams.json","token":false,"workflowUrl":null,"port":3978,"statusPosts":false}\n'
const CFG_SET = '{"path":"/h/.skillator/teams.json","token":true,"workflowUrl":"prod.example","port":4000,"statusPosts":true}\n'
const SETUP_SH = ROOT + '/skills/teams-uhura/scripts/setup.sh'
const U1 = 'https://ab12cd34-3978.euw.devtunnels.ms', U2 = 'https://zz99yy88-3978.euw.devtunnels.ms'
const KV = (o: Record<string, string> = {}) => Object.entries({ result: 'status', why: '', devtunnel: 'ok', login: 'in', form: 'set', tunnel: 'ready',
  hosted: '0', listener: 'down', port: '3978', url: '', url_changed: '0', expires: '', ...o }).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
const ARMED = { result: 'armed', hosted: '1', listener: 'up', url: U1 }

type World = { repoRoot: string; gitResult: ProcessRunResult | Error; files: Record<string, string>; runs: { argv: readonly string[]; stdin?: string; env?: Record<string, string> }[]; toasts: string[]; cfg: string; save: ProcessRunResult; auth: ProcessRunResult | Promise<ProcessRunResult>; check?: ProcessRunResult | Promise<ProcessRunResult>; focuses: string[]; arm: Record<string, ProcessRunResult | Promise<ProcessRunResult>>; cfgRun?: ProcessRunResult }
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

function world(on: On, cfg = CFG_SET, repoRoot = '/r', commonGitDir: string | null = '/r/.git', windows = false): [World, MockClock] {
  const w: World = {
    repoRoot, gitResult: commonGitDir ? ran(commonGitDir + '\r\n') : ran('', 128, 'not a git repository'),
    files: { [repoRoot + '/TICKETS.md']: '# Tickets\n\n- [ ] F1 — one\n', [ROOT + '/skills/tickets-zordon/scripts/ticket-meta.sh']: '#!/bin/sh\n',
      [BOX + '/team-inbox.jsonl']: INBOX, [BOX + '/team-inbox.read']: '1\n',
      // a node planted in the repo (the cwd, and the '.' PATH entry) - never what runs
      [NODE]: 'ELF', './node': 'PLANTED', '/r/node': 'PLANTED' },
    runs: [], toasts: [], cfg, save: ran('saved: /h/.skillator/teams.json (this user only)\n'), auth: ran(''), focuses: [], arm: {},
  }
  const at = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  const clock = mock.clock(on, { now: new Date(2026, 9, 23, 12, 0).getTime() })
  mock.env(on, { SKILLATOR_ROOT: ROOT, HOME: '/h', ...(windows ? { OS: 'Windows_NT', PATH: 'C:/tools' } : { PATH: '.:/usr/bin' }) })
  if (windows) for (const p of ['/tools/node.exe', '/tools/git.exe', '/tools/devtunnel.exe', '/Windows/System32/WindowsPowerShell/v1.0/powershell.exe']) w.files[p] = 'fixture'
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: w.repoRoot, remote: null, internal: false, name: 'r' } }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.stat', ($, e) => {
    const f = w.files[at(e.path)]
    return f !== undefined ? { value: { kind: 'file' as const, size: f.length, mtimeMs: 1000 + f.length, isLink: false } } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.exists', ($, e) => ({ value: w.files[at(e.path)] !== undefined }))
  on('fs.read', ($, e) => {
    const f = w.files[at(e.path)]
    return f !== undefined ? { value: f } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.list', ($, e) => ({ deny: 'ENOENT ' + e.path }))
  on('fs.write', ($, e) => ({ deny: 'the mod must not write files: ' + e.path }))
  on('process.run', async ($, e) => {
    const a = e.argv
    if (windows && a[0] === 'C:/tools/git.exe') return { value: ran(a[1] === 'config' ? 'vidul@ikran.in' : '/r/.git') }
    if (a[0] === 'C:/tools/devtunnel.exe' || (a[0]?.endsWith('/powershell.exe') && a.includes('-Command'))) {
      w.runs.push({ argv: a, stdin: e.init?.stdin })
      return { value: await w.auth }
    }
    if (a.join(' ') === 'git rev-parse --path-format=absolute --git-common-dir') {
      if (w.gitResult instanceof Error) throw w.gitResult
      return { value: w.gitResult }
    }
    if (a.join(' ') === 'git config user.email') return { value: ran('vidul@ikran.in\n') }
    w.runs.push({ argv: a, stdin: e.init?.stdin, env: e.init?.env })
    // F177: the setup script's board modes, answered from the fixture - nothing is started
    if (a[0] === '/bin/sh' && a[1] === SETUP_SH && w.arm[a[2] ?? '']) return { value: await w.arm[a[2]!]! }
    if (a[0] === '/usr/bin/pbcopy') return { value: ran('') }
    if ((a[0] === NODE || a[0] === 'C:/tools/node.exe') && a[1] === TEAM_JS) {
      if (a[2] === 'config' && a[3] === 'show') return { value: w.cfgRun ?? ran(w.cfg) }
      if (a[2] === 'config' && a[3] === 'save') return { value: w.save }
      if (a[2] === 'config' && a[3] === 'clear') return { value: ran('cleared: /h/.skillator/teams.json\n') }
      if (a[2] === 'inbox' && a[3] === 'tail') return { value: ran(INBOX) }
      if (a[2] === 'inbox' && a[3] === 'mark-read') { w.files[commonGitDir + '/skillator/team-inbox.read'] = a[5] + '\n'; return { value: ran(`read up to ${a[5]}\n`) } }
    }
    // F98: the setup script's --check pass (sh here: no OS=Windows_NT in this world)
    if (w.check && a.includes('--check') && a.some(p => /\/teams-uhura\/scripts\/setup\.(ps1|sh)$/.test(p))) return { value: await w.check }
    if (a[0] === '/bin/sh' && a[1] === ROOT + '/skills/teams-uhura/scripts/setup.sh' && a[2] === '--check') return { value: ran('node: v22.11.0\ndevtunnel: missing - the walk installs it\n\n  node        v22.11.0\n  devtunnel   missing\n', 1) }
    if (a.includes('decide')) return { value: ran('UNOBSERVABLE\n') }
    return { value: ran('', 1, 'not in this test') }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', ($, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('ui.focus', ($, e) => { if (e.element) w.focuses.push(e.element); return {} })
  return [w, clock]
}

async function start($: Engine, clock: MockClock) {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
}
const PANE = { title: 'ops board', isFocused: true, bodyColumns: 96, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
const mount = ($: Engine) => $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props: PANE })

test('login and refresh discard the older signed-out setup-check table and walk', async ($, on) => {
  const [w, clock] = world(on, CFG_SET, '/r', '/r/.git', true)
  w.check = ran('login: not signed in', 1)
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await ui.press({ key: 'key:setup' })
  await ui.input({ key: 'setup:port', text: '4321', kind: 'change' })
  await ui.press({ key: 'setup:run' })
  await ui.press({ key: 'setup:run-yes' })
  await clock.settle()
  expect((await ui.find({ key: 'setup:checked' }))?.text).toContain('login: not signed in')
  await ui.press({ key: 'setup:login' })
  await ui.press({ key: 'setup:login-no' })
  await clock.settle()
  expect((await ui.find({ key: 'setup:checked' }))?.text).toContain('login: not signed in')
  await ui.press({ key: 'setup:login' })
  await ui.press({ key: 'setup:login-yes' })
  await clock.settle()
  expect(await ui.find({ key: 'setup:checked' })).toBeUndefined()
  expect(await ui.find({ key: 'setup:walk' })).toBeUndefined()
  w.auth = ran('Logged in as synthetic-test-identity')
  await ui.press({ key: 'setup:login-status' })
  await clock.settle()
  expect((await ui.find({ key: 'setup:login-message' }))?.text).toBe('Signed in to Dev Tunnels.')
  expect((await ui.find({ key: 'setup:port' }))?.text).toBe('4321')
  expect(JSON.stringify(await ui.drawn())).not.toContain('login: not signed in')
  expect(w.runs.filter(r => r.argv[3] === 'save')).toHaveLength(0)
  await ui.unmount()
})

for (const action of ['login', 'refresh', 'reopen'] as const) test(`late setup check cannot restore stale output after ${action}`, async ($, on) => {
  const [w, clock] = world(on, CFG_SET, '/r', '/r/.git', true)
  let finish!: (r: ProcessRunResult) => void
  w.check = new Promise(resolve => { finish = resolve })
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await ui.press({ key: 'key:setup' })
  await ui.press({ key: 'setup:run' })
  await ui.press({ key: 'setup:run-yes' })
  await clock.settle()
  if (action === 'login') {
    await ui.press({ key: 'setup:login' })
    await ui.press({ key: 'setup:login-yes' })
  } else if (action === 'refresh') {
    w.auth = ran('Logged in as synthetic-test-identity')
    await ui.press({ key: 'setup:login-status' })
  } else {
    await ui.press({ key: 'setup:cancel' })
    await ui.press({ key: 'key:setup' })
  }
  await clock.settle()
  finish(ran('login: not signed in', 1))
  await clock.settle()
  expect(await ui.find({ key: 'setup:checked' })).toBeUndefined()
  expect(await ui.find({ key: 'setup:walk' })).toBeUndefined()
  expect((await ui.find({ key: 'setup:login-message' }))?.text).toBe(action === 'refresh' ? 'Signed in to Dev Tunnels.' : action === 'login' ? 'Sign-in terminal opened. Finish there, then choose Refresh status.' : 'Sign-in status has not been checked.')
  await ui.unmount()
})

test('login native frames: confirmed launch, pending, refresh, missing tool and preserved draft', async ($, on) => {
  const [w, clock] = world(on, CFG_SET, '/r', '/r/.git', true)
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await ui.press({ key: 'key:setup' })
  await clock.settle()
  await ui.input({ key: 'setup:port', text: '4321', kind: 'change' })
  await ui.input({ key: 'setup:token', text: 'ylr', kind: 'change' })
  await ui.press({ key: 'setup:login' })
  await clock.settle()
  await $.ui.focus({ component: 'Pane', requestId: 'ops-board', plugin: 'ops-board', element: 'setup:login-no', origin: { kind: 'person' } })
  expect((await ui.find({ key: 'setup:login-no' }))?.props.hotkey).toBe('n')
  expect((await ui.find({ key: 'setup:login-confirm' }))?.text).toContain('A terminal and browser may open.')
  expect(await ui.find({ key: 'setup:save' })).toBeUndefined()
  let finish!: (r: ProcessRunResult) => void
  w.auth = new Promise(resolve => { finish = resolve })
  await ui.press({ key: 'setup:login-yes' })
  await clock.settle()
  expect((await ui.find({ key: 'setup:login-message' }))?.text).toBe('Opening sign-in terminal...')
  await ui.press({ key: 'setup:login' })
  await ui.press({ key: 'setup:login-status' })
  expect(w.runs.filter(r => r.argv.includes('-Command'))).toHaveLength(1)
  finish(ran('private login output'))
  await clock.settle()
  expect((await ui.find({ key: 'setup:login-message' }))?.text).toBe('Sign-in terminal opened. Finish there, then choose Refresh status.')
  await $.ui.focus({ component: 'Pane', requestId: 'ops-board', plugin: 'ops-board', element: 'setup:login-status', origin: { kind: 'person' } })
  expect((await ui.find({ key: 'setup:save' }))?.props.hotkey).toBe('s')
  expect((await ui.find({ key: 'setup:port' }))?.text).toBe('4321')
  for (const [out, code, expected] of [['Logged in as synthetic-test-identity', 0, 'Signed in to Dev Tunnels.'], ['Not logged in', 1, 'Not signed in to Dev Tunnels.'], ['unknown', 0, 'Could not determine Dev Tunnels sign-in status.']] as const) {
    w.auth = ran(out, code)
    await ui.press({ key: 'setup:login-status' })
    await clock.settle()
    expect((await ui.find({ key: 'setup:login-message' }))?.text).toBe(expected)
    expect(JSON.stringify(await ui.drawn())).not.toContain('synthetic-test-identity')
  }
  delete w.files['/tools/devtunnel.exe']
  await ui.press({ key: 'setup:login-status' })
  await clock.settle()
  expect((await ui.find({ key: 'setup:login-message' }))?.text).toContain('Dev Tunnels was not found')
  expect(w.runs.filter(r => r.argv[3] === 'save')).toHaveLength(0)
  expect(w.toasts.join(' ')).not.toContain('private')
  await ui.unmount()
})

test('native login cancellation and stale status cannot overwrite reopened form', async ($, on) => {
  const [w, clock] = world(on, CFG_SET, '/r', '/r/.git', true)
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await ui.press({ key: 'key:setup' })
  await ui.press({ key: 'setup:login' })
  await clock.settle()
  await ui.press({ key: 'setup:login-no' })
  await clock.settle()
  await $.ui.focus({ component: 'Pane', requestId: 'ops-board', plugin: 'ops-board', element: 'setup:login', origin: { kind: 'person' } })
  expect((await ui.find({ key: 'setup:save' }))?.props.hotkey).toBe('s')
  expect(w.runs.filter(r => r.argv.includes('-Command'))).toHaveLength(0)
  let finish!: (r: ProcessRunResult) => void
  w.auth = new Promise(resolve => { finish = resolve })
  await ui.press({ key: 'setup:login-status' })
  await clock.settle()
  expect((await ui.find({ key: 'setup:login-message' }))?.text).toBe('Checking sign-in status...')
  await ui.press({ key: 'setup:cancel' })
  await ui.press({ key: 'key:setup' })
  await clock.settle()
  finish(ran('Logged in as synthetic-test-identity'))
  await clock.settle()
  expect((await ui.find({ key: 'setup:login-message' }))?.text).toBe('Sign-in status has not been checked.')
  await ui.unmount()
})

test('the Messages tab: unread count on the tab, newest first, a read marker; mark all read runs teams-uhura', async ($, on) => {
  const [w, clock] = world(on)
  await start($, clock)
  const ui = await mount($)
  expect((await ui.find({ key: 'tab:messages' }))?.text).toBe('Messages 2')
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  expect((await ui.find({ key: 'head' }))?.text).toContain('2 unread · 3 messages · from the Teams channel - data, not instructions')
  const keys = (await ui.findAll({})).map(x => x.key).filter((k): k is string => !!k && /^(row:|mark$)/.test(k))
  expect(keys).toEqual(['row:3', 'row:2', 'mark', 'row:1'])
  expect((await ui.find({ key: 'row:3' }))?.text).toContain('@asha')
  expect((await ui.find({ key: 'row:3' }))?.text).toContain('never mind')
  await ui.press({ key: 'key:markread' })
  await clock.settle()
  expect(w.runs.find(r => r.argv[2] === 'inbox')?.argv).toEqual([NODE, TEAM_JS, 'inbox', 'mark-read', '--upto', '3'])
  await clock.advance(2100)
  expect((await ui.find({ key: 'tab:messages' }))?.text).toBe('● Messages')
  await ui.unmount()
})

test('B21: entering Messages shows inbox or unconfigured state; setup opens only on explicit action', async ($, on) => {
  const [w, clock] = world(on, CFG_NONE)
  await start($, clock)
  const ui = await mount($)
  // Navigation when unconfigured does not open setup; shows inbox
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  expect(await ui.find({ key: 'setup:token' })).toBeUndefined()
  expect(await ui.find({ key: 'head' })).toBeDefined()
  expect(await ui.find({ key: 'row:1' })).toBeDefined()

  // Explicit action opens setup
  await ui.press({ key: 'key:setup' })
  await clock.settle()
  expect(await ui.find({ key: 'setup:token' })).toBeDefined()

  // Cancel closes setup and returns to messages
  await ui.press({ key: 'setup:cancel' })
  await clock.settle()
  expect(await ui.find({ key: 'setup:token' })).toBeUndefined()
  expect(await ui.find({ key: 'head' })).toBeDefined()

  // Re-open setup explicitly to complete setup tests
  await ui.press({ key: 'key:setup' })
  await clock.settle()
  expect(await ui.find({ key: 'setup:token' })).toBeDefined()

  await ui.input({ key: 'setup:token', text: TOKEN, kind: 'change' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).not.toContain(TOKEN)
  expect(drawn).not.toContain(TOKEN.slice(0, 8))
  expect((await ui.find({ key: 'setup:token' }))?.text).toBe('•'.repeat(TOKEN.length))
  // one more character typed after the bullets: the token grows, still masked
  await ui.input({ key: 'setup:token', text: '•'.repeat(TOKEN.length) + 'A', kind: 'change' })
  expect((await ui.find({ key: 'setup:token' }))?.text).toBe('•'.repeat(TOKEN.length + 1))
  await ui.input({ key: 'setup:token', text: '•'.repeat(TOKEN.length), kind: 'change' })
  await ui.input({ key: 'setup:url', text: 'http://prod.example/w', kind: 'change' })
  await ui.press({ key: 'setup:save' })
  expect((await ui.find({ key: 'setup:result' }))?.text).toContain('workflow URL: must be an https URL')
  expect(w.runs.filter(r => r.argv[3] === 'save')).toHaveLength(0)
  await ui.input({ key: 'setup:url', text: 'https://prod.example/w?sig=SECRETSIG', kind: 'change' })
  await ui.input({ key: 'setup:port', text: '80', kind: 'change' })
  await ui.press({ key: 'setup:save' })
  expect((await ui.find({ key: 'setup:result' }))?.text).toContain('port: a number from 1024 to 65535')
  await ui.input({ key: 'setup:port', text: '4100', kind: 'change' })
  await ui.press({ key: 'setup:posts' })
  await ui.press({ key: 'setup:save' })
  await clock.settle()
  const save = w.runs.find(r => r.argv[3] === 'save')!
  expect(save.argv).toEqual([NODE, TEAM_JS, 'config', 'save'])
  expect(JSON.parse(save.stdin!)).toEqual({ token: TOKEN, workflowUrl: 'https://prod.example/w?sig=SECRETSIG', port: 4100, statusPosts: true })
  expect(await ui.find({ key: 'setup:token' })).toBeUndefined()
  expect(w.toasts.at(-1)).toContain('✓ Teams settings saved')
  for (const t of w.toasts) expect(t).not.toContain(TOKEN)
  await ui.unmount()
})

test('setup on re-open: the saved token only as set, the URL only as its host; Clear asks, then runs config clear', async ($, on) => {
  const [w, clock] = world(on, CFG_SET)
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  expect(await ui.find({ key: 'setup:token' })).toBeUndefined()      // a token is saved: no auto form
  await ui.press({ key: 'key:setup' })
  await clock.settle()
  expect((await ui.find({ key: 'setup:token' }))?.props.placeholder).toBe('(set - type to replace)')
  expect((await ui.find({ key: 'setup:token' }))?.text).toBe('')
  expect((await ui.find({ key: 'setup:url' }))?.props.placeholder).toBe('(set: prod.example - type to replace)')
  expect((await ui.find({ key: 'setup:port' }))?.text).toBe('4000')
  expect((await ui.find({ key: 'setup:posts' }))?.text).toContain('[x] on')
  await ui.press({ key: 'setup:clear' })
  expect((await ui.find({ key: 'setup:confirm' }))?.text).toContain('clear the saved Teams settings?')
  await ui.press({ key: 'setup:clear-yes' })
  await clock.settle()
  expect(w.runs.some(r => r.argv[2] === 'config' && r.argv[3] === 'clear')).toBe(true)
  expect(w.toasts.at(-1)).toContain('✓ Teams settings cleared')
  await ui.unmount()
})

// B29: a config read that fails is said in the form, never a silent fallback path
test('B29: the setup form says when the saved settings cannot be read, and why', async ($, on) => {
  const [w, clock] = world(on, CFG_SET)
  w.cfgRun = ran('', 1, 'team: EPERM reading the config')
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  await ui.press({ key: 'key:setup' })
  await clock.settle()
  const res = (await ui.find({ key: 'setup:result' }))?.text ?? ''
  expect(res).toContain('saved settings not read')
  expect(res).toContain('EPERM reading the config')
  await ui.unmount()
})

// B29: team.mjs started through a linked plugin path exited 0 having saved nothing, and the
// board said saved. The toast names the file team.mjs wrote; no 'saved: <path>' line, or a
// refusal, is a ✗ toast as well as the form's line. The pane sets no env of its own: the child
// keeps the host's home (verified the same as the board's), so it writes the file the listener reads.
const DUMMY = 'ZHVtbXktdG9rZW4tYjI5'   // base64 of dummy-token-b29: the form asks base64
test('B29: a save toasts the file written; no saved line or a refusal is a ✗ toast', { timeoutMs: 60_000 }, async ($, on) => {
  const [w, clock] = world(on, CFG_SET)
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  const save = async () => {
    await ui.press({ key: 'key:setup' })
    await clock.settle()
    await ui.input({ key: 'setup:token', text: DUMMY, kind: 'change' })
    await ui.press({ key: 'setup:save' })
    await clock.settle()
  }
  await save()
  const run = w.runs.find(r => r.argv[3] === 'save')!
  expect(run.argv).toEqual([NODE, TEAM_JS, 'config', 'save'])
  expect(run.env).toBeUndefined()
  expect(w.toasts.at(-1)).toContain('✓ Teams settings saved - saved: /h/.skillator/teams.json')

  w.save = ran('')                                   // exit 0, nothing said: nothing saved
  await save()
  expect(w.toasts.at(-1)).toContain('✗ Teams settings not saved')
  expect(w.toasts.at(-1)).not.toContain('✓')
  expect((await ui.find({ key: 'setup:result' }))?.text).toContain('teams-uhura did not say it saved')

  w.save = ran('', 1, 'team: token: required')       // refused: a toast, not only the form's line
  await ui.press({ key: 'setup:save' })
  await clock.settle()
  expect(w.toasts.at(-1)).toContain('✗ Teams settings not saved: token: required')
  expect((await ui.find({ key: 'setup:result' }))?.text).toContain('token: required')
  for (const t of w.toasts) expect(t).not.toContain(DUMMY)
  await ui.unmount()
})

// F98: the form offers the first-time setup script, after a confirm; only its --check pass runs
// here (the walk asks questions and opens a sign-in), and the walk's command is shown for the
// owner's terminal. Cancel runs nothing.
test('F98 Run first-time setup: asks once, No runs nothing, Yes runs setup --check and shows its table and the walk command', async ($, on) => {
  const [w, clock] = world(on, CFG_SET)
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  await ui.press({ key: 'key:setup' })
  await clock.settle()
  const setupRuns = () => w.runs.filter(r => r.argv[2] === '--check')
  await ui.press({ key: 'setup:run' })
  expect((await ui.find({ key: 'setup:run-confirm' }))?.text).toContain("run teams-uhura's first-time setup check now?")
  expect(setupRuns()).toHaveLength(0)                       // the confirm first
  await ui.press({ key: 'setup:run-no' })
  await clock.settle()
  expect(await ui.find({ key: 'setup:run-confirm' })).toBeUndefined()
  expect(setupRuns()).toHaveLength(0)                       // No ran nothing
  await ui.press({ key: 'setup:run' })
  await ui.press({ key: 'setup:run-yes' })
  await clock.settle()
  expect(setupRuns().map(r => r.argv)).toEqual([['/bin/sh', ROOT + '/skills/teams-uhura/scripts/setup.sh', '--check']])
  expect(await ui.find({ key: 'setup:run-confirm' })).toBeUndefined()
  expect((await ui.find({ key: 'setup:checked' }))?.text).toContain('devtunnel   missing')
  expect((await ui.find({ key: 'setup:walk' }))?.text).toContain('runs in your terminal: /bin/sh ' + ROOT + '/skills/teams-uhura/scripts/setup.sh')
  expect((await ui.find({ key: 'setup:walk' }))?.text).not.toContain('--check')
  expect(await ui.find({ key: 'setup:result' })).toBeUndefined()   // exit 1 under --check is a table, not an error
  // the form still saves and cancels as before; Cancel drops the check text
  await ui.press({ key: 'setup:cancel' })
  await clock.settle()
  expect(await ui.find({ key: 'setup:checked' })).toBeUndefined()
  await ui.unmount()
})

test('an inbox over 4 MiB: the tab shows its newest messages through teams-uhura, never blank', async ($, on) => {
  const [w, clock] = world(on)
  w.files[BOX + '/team-inbox.jsonl'] = 'x'.repeat(4 * 1024 * 1024 + 10)
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  expect((await ui.find({ key: 'row:3' }))?.text).toContain('never mind')
  expect(w.runs.some(r => r.argv[2] === 'inbox' && r.argv[3] === 'tail')).toBe(true)
  await ui.unmount()
})

test('a message with control characters draws as plain text', async ($, on) => {
  const [w, clock] = world(on)
  w.files[BOX + '/team-inbox.jsonl'] = rec('9', '@asha', 'x\u001b[2J y', 30) + '\n'
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  expect((await ui.find({ key: 'row:9' }))?.text).toContain('x[2J y')
  expect(JSON.stringify(await ui.drawn())).not.toContain('\\u001b')
  await ui.unmount()
})


test('A175: linked board reads common Git inbox and marker, including spaces', async ($, on) => {
  const common = '/main checkout/.git'
  const [w, clock] = world(on, CFG_SET, '/linked checkout', common)
  w.files[common + '/skillator/team-inbox.jsonl'] = INBOX
  w.files[common + '/skillator/team-inbox.read'] = '1\r\n'
  delete w.files[BOX + '/team-inbox.jsonl']
  delete w.files[BOX + '/team-inbox.read']
  await start($, clock)
  const ui = await mount($)
  expect((await ui.find({ key: 'tab:messages' }))?.text).toBe('Messages 2')
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  expect((await ui.find({ key: 'head' }))?.text).toContain('2 unread \u00b7 3 messages')
  await ui.press({ key: 'key:markread' })
  await clock.settle()
  expect(w.files[common + '/skillator/team-inbox.read']).toBe('3\n')
  await clock.advance(2100)
  expect((await ui.find({ key: 'head' }))?.text).toContain('0 unread \u00b7 3 messages')
  await ui.unmount()
})

test('A175: failed Git resolution never reads a guessed inbox', async ($, on) => {
  const [, clock] = world(on, CFG_SET, '/r', null)
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  expect((await ui.find({ key: 'head' }))?.text).toContain('no team messages yet')
  await ui.unmount()
})


for (const failure of ['nonzero', 'empty', 'throws', 'changed-root'] as const) {
  test('A175: loaded inbox becomes unavailable and recovers with unchanged stats: ' + failure, async ($, on) => {
    const [w, clock] = world(on)
    await start($, clock)
    const ui = await mount($)
    await ui.press({ key: 'tab:messages' })
    await clock.settle()
    expect((await ui.find({ key: 'head' }))?.text).toContain('2 unread \u00b7 3 messages')
    w.gitResult = failure === 'throws' ? new Error('resolution failed') : failure === 'empty' ? ran('') : ran('', 128)
    if (failure === 'changed-root') w.repoRoot = '/other checkout'
    await clock.advance(2100)
    expect((await ui.find({ key: 'head' }))?.text).toContain('no team messages yet')
    w.gitResult = ran('/r/.git\r\n')
    await clock.advance(2100)
    expect((await ui.find({ key: 'head' }))?.text).toContain('2 unread \u00b7 3 messages')
    await ui.unmount()
  })
}

test('F177 frames: nothing arms before the key; c connects in one press - status, URL, copy; d disconnects', async ($, on) => {
  const [w, clock] = world(on)
  const modes = () => w.runs.filter(r => r.argv[1] === SETUP_SH).map(r => r.argv[2])
  w.arm = { '--status': ran(KV()), '--arm': ran(KV(ARMED)), '--disarm': ran(KV({ result: 'disarmed' })) }
  w.files['/usr/bin/pbcopy'] = 'ELF'
  await start($, clock)
  const ui = await mount($)
  await clock.advance(4100)                                  // board start and two polls
  expect(modes()).toEqual([])                                // ran no setup mode at all
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  expect(modes()).toEqual(['--status'])                      // entering the tab only reads
  expect((await ui.find({ key: 'arm' }))?.text).toContain('Teams  ○ tunnel not hosted · ○ listener down · form saved')
  expect(await ui.find({ key: 'arm:url' })).toBeUndefined()
  expect((await ui.find({ key: 'key:connect' }))?.props.hotkey).toBe('c')
  expect((await ui.find({ key: 'key:disconnect' }))?.props.hotkey).toBe('d')
  expect((await ui.find({ key: 'key:copyurl' }))?.props.hotkey).toBe('y')
  await ui.press({ key: 'key:connect' })
  await clock.settle()
  expect(modes()).toEqual(['--status', '--arm'])             // one press, one run
  expect((await ui.find({ key: 'arm' }))?.text).toContain('Teams  ● tunnel hosted · ● listener up :3978 · form saved')
  expect((await ui.find({ key: 'arm:url' }))?.text).toContain(U1)
  expect(w.toasts.at(-1)).toContain('✓ Teams connected - tunnel hosted, listener up on 127.0.0.1:3978')
  expect(w.toasts.at(-1)).toContain('ran: /bin/sh ' + SETUP_SH + ' --arm')
  expect(w.toasts.join('\n')).not.toContain('devtunnels.ms')  // the URL is on the tab, never in a toast
  await ui.press({ key: 'key:copyurl' })
  await clock.settle()
  expect(w.runs.find(r => r.argv[0] === '/usr/bin/pbcopy')?.stdin).toBe(U1)
  expect(w.toasts.at(-1)).toContain('✓ tunnel URL copied')
  expect(modes()).toEqual(['--status', '--arm'])             // unchanged URL: no --ack
  await ui.press({ key: 'key:disconnect' })
  await clock.settle()
  expect(modes()).toEqual(['--status', '--arm', '--disarm'])
  expect((await ui.find({ key: 'arm' }))?.text).toContain('Teams  ○ tunnel not hosted · ○ listener down · form saved')
  expect(await ui.find({ key: 'arm:url' })).toBeUndefined()
  expect(w.toasts.at(-1)).toContain('✓ Teams disconnected - tunnel stopped, listener stopped')
  await ui.unmount()
})

test('F177 refusals: devtunnel missing, not signed in, no token - a toast each, the status line says what is missing', async ($, on) => {
  const [w, clock] = world(on)
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  for (const [why, facts] of [
    ['devtunnel is not installed - s, then First-time setup', { devtunnel: 'missing', login: '-', tunnel: '-' }],
    ['not signed in to Dev Tunnels - s, then Sign in to Dev Tunnels', { login: 'out', tunnel: '-' }],
    ['the form has no token - s, paste the security token, save', { form: 'notset' }],
  ] as const) {
    w.arm = { '--arm': ran(KV({ result: 'refused', why, ...facts })) }
    const setupRuns = () => w.runs.filter(r => r.argv[1] === SETUP_SH).length
    const before = setupRuns()
    await ui.press({ key: 'key:connect' })
    await clock.settle()
    expect(w.toasts.at(-1)).toContain('✗ Teams not connected: ' + why)
    expect(setupRuns()).toBe(before + 1)                     // the one --arm; nothing after a refusal
    expect((await ui.find({ key: 'arm' }))?.text).toContain('○ tunnel not hosted · ○ listener down')
  }
  expect((await ui.find({ key: 'arm' }))?.text).toContain('form: no token')
  // A226 review 1: a key twice - the reply is not read, and the toast says so without echoing it
  w.arm = { '--arm': ran(KV({ result: 'refused', why: 'x' }) + 'result=armed\nhosted=1\n') }
  await ui.press({ key: 'key:connect' })
  await clock.settle()
  expect(w.toasts.at(-1)).toContain('✗ Teams: unexpected output from teams-uhura')
  expect(w.toasts.at(-1)).not.toContain('hosted=1')
  // the script could not run: a toast, no crash
  w.arm = {}
  await ui.press({ key: 'key:connect' })
  await clock.settle()
  expect(w.toasts.at(-1)).toContain('✗ Teams: not in this test')
  await ui.unmount()
})

test('F177 URL guard frames: unchanged URL - no warning; changed - the warning with the new URL, cleared when y copies it', async ($, on) => {
  const [w, clock] = world(on)
  const modes = () => w.runs.filter(r => r.argv[1] === SETUP_SH).map(r => r.argv[2])
  const warns = async () => (await ui.findAll({})).filter(x => !!x.key && x.key.startsWith('arm:warn')).map(x => x.text)
  w.files['/usr/bin/pbcopy'] = 'ELF'
  w.arm = { '--status': ran(KV({ ...ARMED, result: 'status' })) }
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  expect(await warns()).toEqual([])                          // the URL last shown: no warning
  // the tunnel was recreated: a new id
  w.arm = { '--status': ran(KV({ ...ARMED, result: 'status', url: U2, url_changed: '1' })), '--ack': ran(KV({ ...ARMED, result: 'acked', url: U2 })) }
  await ui.press({ key: 'tab:tickets' })
  await clock.settle()
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  const shown = await warns()
  expect(shown[0]).toContain('▲ tunnel URL changed - update the Teams outgoing webhook callback to')
  expect(shown.join('\n')).toContain(U2)
  expect((await ui.find({ key: 'arm:url' }))?.text).toContain(U2)
  // A226 review 1: y while c is in flight - copied, and acked once the arm is done, with no second press
  let finish!: (r: ProcessRunResult) => void
  w.arm['--arm'] = new Promise(resolve => { finish = resolve })
  await ui.press({ key: 'key:connect' })
  await clock.settle()
  await ui.press({ key: 'key:copyurl' })
  await clock.settle()
  expect(w.runs.filter(r => r.argv[0] === '/usr/bin/pbcopy').at(-1)?.stdin).toBe(U2)
  expect(modes()).not.toContain('--ack')                     // not under the arm
  finish(ran(KV({ ...ARMED, url: U2, url_changed: '1' })))
  await clock.settle()
  expect(modes().at(-1)).toBe('--ack')                       // the owner took the new URL
  expect(modes().filter(m => m === '--ack')).toHaveLength(1)
  expect(w.runs.filter(r => r.argv[1] === SETUP_SH).at(-1)?.argv[3]).toBe(U2)  // A226 d: the URL copied, not the one read at ack time
  expect(w.toasts.join('\n')).not.toContain('devtunnels.ms')
  expect(await warns()).toEqual([])
  // A226 review 1: a failed ack's toast names the URL by <url>, redacted by value
  w.arm = { '--status': ran(KV({ ...ARMED, result: 'status', url: U2, url_changed: '1' })), '--ack': ran(KV({ ...ARMED, result: 'failed', why: 'no tunnel URL to remember', url: '' })) }
  await ui.press({ key: 'tab:tickets' })
  await clock.settle()
  await ui.press({ key: 'tab:messages' })
  await clock.settle()
  await ui.press({ key: 'key:copyurl' })
  await clock.settle()
  expect(w.toasts.at(-1)).toContain('✗ Teams: no tunnel URL to remember')
  expect(w.toasts.at(-1)).toContain(' --ack <url>')
  expect(w.toasts.join('\n')).not.toContain('devtunnels.ms')
  await ui.unmount()
})
