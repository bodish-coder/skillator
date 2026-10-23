import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'

// F66: the Messages tab and the Teams setup form in the Claude Code pane. The inbox is
// teams-uhura's (<repo>/.git/skillator/team-inbox.jsonl); the setup form's token is
// masked as typed, never drawn back, and goes to `team.mjs config save` on stdin only.

const ROOT = '/s'
const TEAM_JS = ROOT + '/skills/teams-uhura/scripts/team.mjs'
const BOX = '/r/.git/skillator'
const rec = (id: string, from: string, text: string, min: number) =>
  JSON.stringify({ ts: `2026-10-23T09:${String(min).padStart(2, '0')}:00.000Z`, from, email: from.slice(1) + '@x.com', text, id })
const INBOX = [rec('1', '@asha', 'can you look at F12?', 10), rec('2', '@vidul', 'build is red', 11), rec('3', '@asha', 'never mind', 12)].join('\n') + '\n'
const TOKEN = 'YS0zMi1ieXRlLXNlY3VyaXR5LXRva2VuLWZvci10c3Q='
const CFG_NONE = '{"path":"/h/.skillator/teams.json","token":false,"workflowUrl":null,"port":3978,"statusPosts":false}\n'
const CFG_SET = '{"path":"/h/.skillator/teams.json","token":true,"workflowUrl":"prod.example","port":4000,"statusPosts":true}\n'

type World = { files: Record<string, string>; runs: { argv: readonly string[]; stdin?: string }[]; toasts: string[]; cfg: string; save: ProcessRunResult }
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

function world(on: On, cfg = CFG_SET): [World, MockClock] {
  const w: World = {
    files: { '/r/TICKETS.md': '# Tickets\n\n- [ ] F1 — one\n', [ROOT + '/skills/tickets-zordon/scripts/ticket-meta.sh']: '#!/bin/sh\n',
      [BOX + '/team-inbox.jsonl']: INBOX, [BOX + '/team-inbox.read']: '1\n' },
    runs: [], toasts: [], cfg, save: ran('saved: /h/.skillator/teams.json (this user only)\n'),
  }
  const at = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  const clock = mock.clock(on, { now: new Date(2026, 9, 23, 12, 0).getTime() })
  mock.env(on, { SKILLATOR_ROOT: ROOT, HOME: '/h' })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: '/r', remote: null, internal: false, name: 'r' } }))
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
    if (a.join(' ') === 'git config user.email') return { value: ran('vidul@ikran.in\n') }
    w.runs.push({ argv: a, stdin: e.init?.stdin })
    if (a[0] === 'node' && a[1] === TEAM_JS) {
      if (a[2] === 'config' && a[3] === 'show') return { value: ran(w.cfg) }
      if (a[2] === 'config' && a[3] === 'save') return { value: w.save }
      if (a[2] === 'config' && a[3] === 'clear') return { value: ran('cleared: /h/.skillator/teams.json\n') }
      if (a[2] === 'inbox' && a[3] === 'mark-read') { w.files[BOX + '/team-inbox.read'] = a[5] + '\n'; return { value: ran(`read up to ${a[5]}\n`) } }
    }
    if (a.includes('decide')) return { value: ran('UNOBSERVABLE\n') }
    return { value: ran('', 1, 'not in this test') }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', ($, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('ui.focus', () => ({}))
  return [w, clock]
}

async function start($: Engine, clock: MockClock) {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
}
const PANE = { title: 'ops board', isFocused: true, bodyColumns: 96, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
const mount = ($: Engine) => $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props: PANE })

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
  expect(w.runs.find(r => r.argv[2] === 'inbox')?.argv).toEqual(['node', TEAM_JS, 'inbox', 'mark-read', '--upto', '3'])
  await clock.advance(2100)
  expect((await ui.find({ key: 'tab:messages' }))?.text).toBe('Messages')
  await ui.unmount()
})

test('the setup form opens by itself when nothing is configured; the token is masked and never drawn', async ($, on) => {
  const [w, clock] = world(on, CFG_NONE)
  await start($, clock)
  const ui = await mount($)
  await ui.press({ key: 'tab:messages' })
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
  expect(save.argv).toEqual(['node', TEAM_JS, 'config', 'save'])
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
