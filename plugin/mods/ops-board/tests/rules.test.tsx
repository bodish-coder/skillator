import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { MockClock } from 'claude-code/testing'

// F203: the Priorities tab's rules editor. Every change is a queue-priority run; the mod writes no file.
const BOARD = `# Tickets

- [~] F3 — cart drawer keeps items on reload [app: web] [owner: @vidul] [priority: P3]
- [ ] B1 — button focus ring missing [app: ui]
- [ ] B2 — orders endpoint 500 [app: api] [severity: critical]
- [x] F1 — product grid [app: old]
`
const REV = '5'.repeat(64), REV2 = '6'.repeat(64), TOKEN = 'b'.repeat(64)
const list = (rules: string[], rev = REV, invalid: string[] = []) =>
  ['Queue Jarvis | Priority rules', `${rules.length} rule(s).`, ...rules.map((rule, i) => `${i + 1}  ${rule}`), ...invalid, 'Rules revision: ' + rev].join('\n')
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })
type World = { files: Record<string, string>; runs: string[][]; toasts: string[]; writes: string[]; boardReads: number; answer: (args: string[]) => ProcessRunResult | null }

function world(on: On): [World, MockClock] {
  const w: World = { files: { '/r/TICKETS.md': BOARD, '/s/skills/tickets-zordon/scripts/ticket-meta.sh': '#!/bin/sh\n', '/bin/node': 'node' },
    runs: [], toasts: [], writes: [], boardReads: 0, answer: () => null }
  const at = (p: string) => w.files[p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')]
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, { SKILLATOR_ROOT: '/s', PATH: '/bin' })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: '/r', remote: null, internal: false, name: 'r' } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.stat', ($, e) => {
    const f = at(e.path)
    return f !== undefined ? { value: { kind: 'file' as const, size: f.length, mtimeMs: 1000, isLink: false } } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.exists', ($, e) => ({ value: at(e.path) !== undefined }))
  on('fs.read', ($, e) => {
    const f = at(e.path)
    if (/TICKETS\.md$/.test(e.path)) w.boardReads++
    return f !== undefined ? { value: f } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.write', ($, e) => { w.writes.push(e.path); return { deny: 'the mod must not write files' } })
  on('process.run', ($, e) => {
    if (e.argv.join(' ') === 'git config user.email') return { value: ran('vidul@ikran.in\n') }
    const i = e.argv.indexOf('rules')
    if (i < 1 || !e.argv.some(a => /queue\.mjs$/.test(a))) return { value: ran('', 1, 'not in this test') }
    const args = e.argv.slice(i - 1)           // ['--current-worktree', 'rules', ...]
    w.runs.push([...args])
    return { value: w.answer([...args]) ?? ran('', 1, 'unexpected call') }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', ($, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.scroll', () => ({}))
  on('ui.focus', { plugin: '*' }, () => ({ value: undefined }))
  return [w, clock]
}
const props = { title: 'ops board', isFocused: true, bodyColumns: 54, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
const last = (w: World) => w.runs.at(-1)

test('the Priorities tab lists rules under their level; empty, error and invalid states', async ($, on) => {
  const [w, clock] = world(on)
  let out = ran(list([]))
  w.answer = args => args[2] === 'list' ? out : null
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props })
  await pane.press({ key: 'tab:priorities' })
  await clock.settle()
  expect(last(w)).toEqual(['--current-worktree', 'rules', 'list'])
  expect((await pane.find({ key: 'rule:empty' }))?.text).toContain('No priority rules yet')
  expect(await pane.find({ key: 'rule:add' })).toBeDefined()
  expect(await pane.find({ key: 'rule:preview' })).toBeUndefined()
  expect(await pane.find({ key: 'priority:auto-open' })).toBeDefined()

  out = ran(list(['P2: severity=high', 'P1: type=bug app=ui,web', 'P1: severity=critical']))
  await pane.press({ key: 'rule:reload' })
  await clock.settle()
  expect((await pane.find({ key: 'rule:2' }))?.text).toContain('type=bug app=ui,web')
  expect((await pane.find({ key: 'rule:1' }))?.text).toContain('severity=high')
  const order = (await pane.findAll({ type: 'Button' })).map(b => b.key).filter(k => /^rule:\d+$/.test(k ?? ''))
  expect(order).toEqual(['rule:2', 'rule:3', 'rule:1'])          // P1 rules first, then P2
  expect(await pane.find({ key: 'rule:empty' })).toBeUndefined()
  expect(await pane.find({ key: 'rule:preview' })).toBeDefined()

  out = ran(list(['P1: severity=critical'], REV, ['Invalid line 4: Unknown field colour. | - P2: colour=red']))
  await pane.press({ key: 'rule:reload' })
  await clock.settle()
  expect((await pane.find({ key: 'rule:invalid' }))?.text).toContain('Invalid line 4')
  expect((await pane.find({ key: 'rule:invalid' }))?.text).toContain('.skillator/priority-rules.md')
  expect(await pane.find({ key: 'rule:preview' })).toBeUndefined()
  expect(await pane.find({ key: 'rule:1' })).toBeDefined()

  out = ran('', 1, 'Queue Jarvis: priority-rules.md must be a regular file.')
  await pane.press({ key: 'rule:reload' })
  await clock.settle()
  expect((await pane.find({ key: 'rule:list-error' }))?.text).toContain('must be a regular file')
  expect(await pane.find({ key: 'rule:add' })).toBeUndefined()
  expect(await pane.find({ key: 'rule:reload' })).toBeDefined()
  expect(w.writes).toEqual([])
  await pane.unmount()
})

test('a rule is added, edited and deleted through the form', async ($, on) => {
  const [w, clock] = world(on)
  let rules = ['P1: severity=critical', 'P2: app=legacy,web']
  let rev = REV
  let refuse = true
  w.answer = args => {
    if (args[2] === 'list') return ran(list(rules, rev))
    if (args[2] === 'edit' && refuse) { refuse = false; return ran('', 1, 'Queue Jarvis: The rules changed. Reload them and try again.') }
    if (args[2] === 'add') rules = [...rules, 'P3: app=api,ui type=bug']
    if (args[2] === 'edit') rules = ['P1: severity=critical', 'P4: app=legacy']
    if (args[2] === 'remove') rules = rules.slice(1)
    rev = REV2
    return ran('Queue Jarvis | Rule saved\nRules revision: ' + rev)
  }
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props })
  await pane.press({ key: 'tab:priorities' })
  await clock.settle()

  // add: level, two fields, multi-select, never a Select
  await pane.press({ key: 'rule:add' })
  expect((await pane.find({ key: 'form:title' }))?.text).toContain('New priority rule')
  expect(await pane.findAll({ type: 'Select' })).toEqual([])
  expect(await pane.find({ key: 'rule:save' })).toBeUndefined()            // no condition yet
  expect(await pane.find({ key: 'rule:delete' })).toBeUndefined()
  expect((await pane.find({ key: 'rule:level:P1' }))?.props.variant).toBe('primary')
  await pane.press({ key: 'rule:level:P3' })
  expect((await pane.find({ key: 'rule:field:app' }))?.text).toBe('App any')
  await pane.press({ key: 'rule:field:app' })
  expect((await pane.find({ key: 'rule:option:web' }))?.text).toBe('[ ] web')   // a ranked open ticket's app is offered
  expect(await pane.find({ key: 'rule:option:old' })).toBeUndefined()           // a closed ticket's app is not
  await pane.press({ key: 'rule:option:api' })
  await pane.press({ key: 'rule:option:ui' })
  await pane.press({ key: 'rule:option:web' })
  await pane.press({ key: 'rule:option:web' })                                  // toggled off again
  expect((await pane.find({ key: 'rule:option:api' }))?.text).toBe('[x] api')
  await pane.press({ key: 'rule:picker-back' })
  expect((await pane.find({ key: 'rule:field:app' }))?.text).toBe('App api, ui')
  await pane.press({ key: 'rule:field:type' })
  await pane.press({ key: 'rule:option:bug' })
  await pane.press({ key: 'rule:picker-back' })
  await pane.press({ key: 'rule:save' })
  await clock.settle()
  expect(w.runs.find(args => args[2] === 'add')).toEqual(['--current-worktree', 'rules', 'add', 'P3', 'app=api,ui', 'type=bug'])
  expect(w.toasts.at(-1)).toContain('Priority rule saved')
  expect(await pane.find({ key: 'form:title' })).toBeUndefined()
  expect((await pane.find({ key: 'rule:3' }))?.text).toContain('app=api,ui type=bug')

  // edit: values load, a value the board does not show survives, a stale revision is shown
  await pane.press({ key: 'rule:2' })
  expect((await pane.find({ key: 'form:title' }))?.text).toContain('Edit rule 2')
  expect((await pane.find({ key: 'rule:level:P2' }))?.props.variant).toBe('primary')
  expect((await pane.find({ key: 'rule:field:app' }))?.text).toBe('App legacy, web')
  await pane.press({ key: 'rule:field:app' })
  expect((await pane.find({ key: 'rule:option:legacy' }))?.text).toBe('[x] legacy')
  await pane.press({ key: 'rule:option:web' })
  await pane.press({ key: 'rule:picker-back' })
  await pane.press({ key: 'rule:level:P4' })
  await pane.press({ key: 'rule:save' })
  await clock.settle()
  expect(last(w)?.slice(0, 2)).toEqual(['--current-worktree', 'rules'])
  expect(w.runs.find(args => args[2] === 'edit')).toEqual(['--current-worktree', 'rules', 'edit', '2', 'P4', 'app=legacy', '--rev', REV2])
  expect((await pane.find({ key: 'rule:error' }))?.text).toContain('The rules changed')
  await pane.press({ key: 'rule:save' })
  await clock.settle()
  expect(await pane.find({ key: 'form:title' })).toBeUndefined()
  expect((await pane.find({ key: 'rule:2' }))?.text).toContain('app=legacy')

  // delete asks once
  await pane.press({ key: 'rule:1' })
  await pane.press({ key: 'rule:delete' })
  expect(w.runs.some(args => args[2] === 'remove')).toBe(false)
  await pane.press({ key: 'rule:delete-no' })
  await pane.press({ key: 'rule:delete' })
  await pane.press({ key: 'rule:delete-yes' })
  await clock.settle()
  expect(w.runs.find(args => args[2] === 'remove')).toEqual(['--current-worktree', 'rules', 'remove', '1', '--rev', REV2])
  expect(w.toasts.at(-1)).toContain('Priority rule deleted')
  expect(await pane.find({ key: 'rule:2' })).toBeUndefined()
  expect(w.writes).toEqual([])
  await pane.unmount()
})

test('the picker pages a long value list', async ($, on) => {
  const [w, clock] = world(on)
  w.files['/r/TICKETS.md'] = BOARD + Array.from({ length: 70 }, (_, i) => `- [ ] B${100 + i} — bug ${i} [app: ui]`).join('\n') + '\n'
  w.answer = args => args[2] === 'list' ? ran(list([])) : null
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props })
  await pane.press({ key: 'tab:priorities' })
  await clock.settle()
  await pane.press({ key: 'rule:add' })
  await pane.press({ key: 'rule:field:id' })
  expect((await pane.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('rule:option:')).length).toBe(12)
  expect(await pane.find({ key: 'rule:picker-previous' })).toBeUndefined()
  await pane.press({ key: 'rule:picker-next' })
  await pane.press({ key: 'rule:option:B110' })
  await pane.press({ key: 'rule:picker-clear' })
  await pane.press({ key: 'rule:option:B111' })
  await pane.press({ key: 'rule:picker-back' })
  expect((await pane.find({ key: 'rule:field:id' }))?.text).toBe('Ticket ID B111')
  await pane.press({ key: 'rule:cancel' })
  expect(await pane.find({ key: 'rule:add' })).toBeDefined()
  await pane.unmount()
})

test('Apply rules previews, refuses a stale token, then saves and refreshes the board', async ($, on) => {
  const [w, clock] = world(on)
  let stale = true
  const preview = ['Queue Jarvis | Rules preview', '2 ticket(s) would change.', 'P1: 2 · P2: 0 · P3: 0 · P4: 0 · P5: 0',
    'F3       P3       -> P1   rule 1   cart drawer keeps items on reload', 'B2       Unranked -> P1   rule 2   orders endpoint 500', 'Preview token: ' + TOKEN].join('\n')
  w.answer = args => {
    if (args[2] === 'list') return ran(list(['P1: app=web', 'P1: severity=critical']))
    if (args[2] === 'preview') return ran(preview)
    if (args[2] !== 'apply') return null
    if (stale) { stale = false; return ran('', 1, 'Queue Jarvis: The board or rule changed. Run a new preview before applying.') }
    w.files['/r/TICKETS.md'] = BOARD.replace('[priority: P3]', '[priority: P1]').replace('[severity: critical]', '[priority: P1] [severity: critical]')
    return ran('Queue Jarvis | Applied\n2 ticket(s) updated by the priority rules.')
  }
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props })
  await pane.press({ key: 'tab:priorities' })
  await clock.settle()
  await pane.press({ key: 'rule:preview' })
  await clock.settle()
  expect(last(w)).toEqual(['--current-worktree', 'rules', 'preview'])
  expect((await pane.find({ key: 'form:title' }))?.text).toContain('Apply priority rules')
  expect((await pane.find({ key: 'rule:preview-summary' }))?.text).toContain('2 ticket(s) would change.')
  expect((await pane.find({ key: 'rule:preview-changes' }))?.text).toContain('F3 P3 -> P1 rule 1')
  expect((await pane.find({ key: 'rule:preview-changes' }))?.text).toContain('B2 Unranked -> P1 rule 2')
  expect(w.runs.some(args => args[2] === 'apply')).toBe(false)
  await pane.press({ key: 'rule:apply' })
  await clock.settle()
  expect(last(w)).toEqual(['--current-worktree', 'rules', 'apply', TOKEN])
  expect((await pane.find({ key: 'rule:preview-error' }))?.text).toContain('Run a new preview')
  expect(await pane.find({ key: 'rule:apply' })).toBeUndefined()
  await pane.press({ key: 'rule:preview-again' })
  await clock.settle()
  const readsBefore = w.boardReads
  await pane.press({ key: 'rule:apply' })
  await clock.settle()
  expect(w.toasts.at(-1)).toContain('2 ticket(s) updated by the priority rules.')
  expect(await pane.find({ key: 'form:title' })).toBeUndefined()
  expect(w.boardReads).toBeGreaterThan(readsBefore)            // the board was read again after the save
  expect(w.writes).toEqual([])
  await pane.unmount()
})

test('a stale save or delete closes the form when another rule now sits at its number', async ($, on) => {
  const [w, clock] = world(on)
  let rules = ['P1: severity=critical', 'P2: app=legacy,web']
  let rev = REV
  w.answer = args => {
    if (args[2] === 'list') return ran(list(rules, rev))
    // someone else removed rule 1 meanwhile: the old rule 2 is now rule 1, a new rule sits at 2
    rules = ['P2: app=legacy,web', 'P5: app=api']
    rev = REV2
    return ran('', 1, 'Queue Jarvis: The rules changed. Reload them and try again.')
  }
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props })
  await pane.press({ key: 'tab:priorities' })
  await clock.settle()

  await pane.press({ key: 'rule:2' })
  await pane.press({ key: 'rule:level:P3' })
  await pane.press({ key: 'rule:save' })
  await clock.settle()
  expect(w.runs.filter(args => args[2] === 'edit').length).toBe(1)
  expect(await pane.find({ key: 'form:title' })).toBeUndefined()           // rule 2 is now another rule
  expect(w.toasts.at(-1)).toContain('The rules changed')
  expect((await pane.find({ key: 'rule:2' }))?.text).toContain('app=api')

  rules = ['P1: severity=critical', 'P2: app=legacy,web']
  rev = REV
  await pane.press({ key: 'rule:reload' })
  await clock.settle()
  await pane.press({ key: 'rule:1' })
  await pane.press({ key: 'rule:delete' })
  await pane.press({ key: 'rule:delete-yes' })
  await clock.settle()
  expect(w.runs.filter(args => args[2] === 'remove').length).toBe(1)
  expect(await pane.find({ key: 'form:title' })).toBeUndefined()
  expect(await pane.find({ key: 'rule:delete-yes' })).toBeUndefined()
  await pane.unmount()
})

test('the action row hotkeys match the TUI: p applies the rules, r reloads them', async ($, on) => {
  const [w, clock] = world(on)
  w.answer = args => args[2] === 'list' ? ran(list(['P1: app=web'])) : null
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props })
  await pane.press({ key: 'tab:priorities' })
  await clock.settle()
  expect((await pane.find({ key: 'rule:preview' }))?.props.hotkey).toBe('p')
  expect((await pane.find({ key: 'rule:reload' }))?.props.hotkey).toBe('r')
  await pane.unmount()
})

test('the picker page is clamped when a toggle or Clear shrinks the options', async ($, on) => {
  const [w, clock] = world(on)
  const ids = Array.from({ length: 10 }, (_, i) => 'x' + (i + 1))
  w.answer = args => args[2] === 'list' ? ran(list(['P1: id=' + ids.join(',')])) : null
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props })
  await pane.press({ key: 'tab:priorities' })
  await clock.settle()
  const shown = async () => (await pane.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('rule:option:')).length
  await pane.press({ key: 'rule:1' })
  await pane.press({ key: 'rule:field:id' })
  await pane.press({ key: 'rule:picker-next' })                  // 3 board ids + 10 chosen: page 2 holds x10 only
  expect(await shown()).toBe(1)
  await pane.press({ key: 'rule:option:x10' })                    // unchecked and gone: 12 options, one page
  expect(await shown()).toBe(12)
  expect(await pane.find({ key: 'rule:picker-previous' })).toBeUndefined()
  await pane.press({ key: 'rule:picker-back' })
  await pane.press({ key: 'rule:cancel' })
  await pane.press({ key: 'rule:1' })                             // the rule's 10 ids again
  await pane.press({ key: 'rule:field:id' })
  await pane.press({ key: 'rule:picker-next' })
  await pane.press({ key: 'rule:picker-clear' })                  // only the 3 board ids are left
  expect(await shown()).toBe(3)
  await pane.unmount()
})

// Another plugin closing the pane stands for Esc: the same ui.close chain.
const CLOSER = { plugins: [{ name: 'closer', register(on: On) {
  on('command.run', { command: 'close' }, async ($, e) => { await $.ui.close({ id: e.args }); return { text: 'closed' } })
} }] }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }

test('Esc in the value picker closes only the picker; Esc again closes the form', CLOSER, async ($, on) => {
  const [w, clock] = world(on)
  w.answer = args => args[2] === 'list' ? ran(list([])) : null
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props })
  await pane.press({ key: 'tab:priorities' })
  await clock.settle()
  await pane.press({ key: 'rule:add' })
  await pane.press({ key: 'rule:field:app' })
  await pane.press({ key: 'rule:option:api' })
  await $.command.run({ command: 'close', args: 'ops-board', ...RUN })
  expect(await pane.find({ key: 'rule:option:api' })).toBeUndefined()
  expect((await pane.find({ key: 'form:title' }))?.text).toContain('New priority rule')
  expect((await pane.find({ key: 'rule:field:app' }))?.text).toBe('App api')
  await $.command.run({ command: 'close', args: 'ops-board', ...RUN })
  expect(await pane.find({ key: 'form:title' })).toBeUndefined()
  expect(await pane.find({ key: 'rule:add' })).toBeDefined()
  await pane.unmount()
})
