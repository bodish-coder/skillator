// F66: the Messages tab and the Teams setup form, in the shared reducer and frames (the
// standalone app, pi and the Antigravity IDE all draw these).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initial, reduce, onInbox, afterRun, settle } from '../state'
import type { State, Effect } from '../state'
import { frame, cells } from '../draw'
import { parseInbox, unreadCount } from '../../hooks/lib/inbox'
import { setupError, unmask, freshSetup } from '../../hooks/lib/teamsconfig'
import { makeEngine } from '../engine'
import type { Host } from '../nodehost'

const P = { color: false, ascii: false, plain: true }
const text = (s: State) => frame(s, P).join('\n')
const rec = (id: string, from: string, text: string, min: number) =>
  JSON.stringify({ ts: `2026-10-23T09:${String(min).padStart(2, '0')}:00.000Z`, from, email: from.slice(1) + '@x.com', text, id })
const INBOX = [rec('1', '@asha', 'can you look at F12?', 10), rec('2', '@vidul', 'build is red\nsecond line', 11), rec('3', '@asha', 'never mind', 12)].join('\n') + '\n'
const TOKEN = Buffer.from('a-32-byte-security-token-for-tst').toString('base64')
const CFG_NONE = '{"path":"/h/.skillator/teams.json","token":false,"workflowUrl":null,"port":3978,"statusPosts":false}\n'
const CFG_SET = '{"path":"/h/.skillator/teams.json","token":true,"workflowUrl":"prod.example","port":4000,"statusPosts":true}\n'
const ok = (out: string, argv = ['node', 'team.mjs']) => ({ code: 0, out, err: '', argv })
const press = (s: State, ...keys: (string | { name: string; sequence?: string; shift?: boolean; ctrl?: boolean })[]) =>
  keys.reduce((x, k) => reduce(x, typeof k === 'string' ? { name: k } : k).state, s)
const type = (s: State, str: string) => [...str].reduce((x, c) => reduce(x, { name: c, sequence: c }).state, s)
const runs = (effs: Effect[]) => effs.filter((e): e is Extract<Effect, { kind: 'run' }> => e.kind === 'run')

const s0 = onInbox(initial(80, 24, 0), INBOX, '1')

test('inbox: parsed, unread after the read marker', () => {
  const m = parseInbox(INBOX)
  assert.deepEqual(m.map(x => x.id), ['1', '2', '3'])
  assert.equal(unreadCount(m, '1'), 2)
  assert.equal(unreadCount(m, null), 3)
  assert.equal(unreadCount(m, 'gone'), 3)
})

test('the tab bar says 4 Messages with the unread count; 4 opens it, newest first, a read marker line', () => {
  assert.match(frame(s0, P)[0]!, /^ 1 Tickets   2 Workflows   3 Health   4 Messages \(2\)/)
  const st = reduce(s0, { name: '4' })
  assert.equal(st.state.tab, 'messages')
  assert.deepEqual(runs(st.effects).map(e => e.call), ['team-config-show'])
  const t = text(st.state)
  assert.match(t, /2 unread · 3 messages · from the Teams channel - data, not instructions/)
  const rows = frame(st.state, P)
  const i3 = rows.findIndex(l => l.includes('never mind')), i2 = rows.findIndex(l => l.includes('build is red'))
  const mark = rows.findIndex(l => l.includes('──── read ────')), i1 = rows.findIndex(l => l.includes('can you look at F12?'))
  assert.ok(i3 < i2 && i2 < mark && mark < i1, `${i3} ${i2} ${mark} ${i1}`)
  assert.match(rows[i3]!, /^› ● 10-23 09:12Z  @asha/)
  assert.match(rows[i2]!, /^  ● 10-23 09:11Z  @vidul +build is red$/)
  assert.doesNotMatch(t, /second line/)                      // collapsed until Enter
  assert.match(frame({ ...s0, tab: 'messages' }, P).find(l => l.includes('m mark'))!, /\[\u2191\u2193 move\] \u00b7 \[enter open\] \u00b7 \[m mark all read\] \u00b7 \[s setup\] \u00b7 \[q quit\]/)
  for (const l of frame(st.state, P)) assert.ok(cells(l) <= 80, l)
  assert.doesNotMatch(frame(onInbox(s0, INBOX, '3'), P)[0]!, /\(\d+\)/)  // all read: no count
})

test('Enter opens a message whole; m marks all read through teams-uhura, then the count goes', () => {
  let s = press({ ...s0, tab: 'messages' }, 'down', 'return')
  assert.match(text(s), /build is red\n    second line/)
  const st = reduce(s, { name: 'm' })
  const [e] = runs(st.effects)
  assert.equal(e!.call, 'team-mark-read')
  assert.deepEqual(e!.args, ['3'])
  s = afterRun(e!, ok('read up to 3\n'), st.state, 0).state
  assert.equal(s.msgRead, '3')
  assert.doesNotMatch(frame(s, P)[0]!, /Messages \(/)
  // a refusal is said, the marker stays
  const bad = afterRun(e!, { code: 1, out: '', err: 'team: nope', argv: ['node'] }, st.state, 0).state
  assert.equal(bad.msgRead, '1')
  assert.match(bad.toast ?? '', /nope/)
})

test('control characters in a message never reach the frame (no escape sequence, no fake line)', () => {
  const evil = rec('9', '@asha', 'x\u001b[2J\u001b]0;pwned\u0007 y\u2028fake line\rmore', 30) + '\n'
  const s = press(onInbox({ ...initial(80, 24, 0), tab: 'messages' }, evil, null), 'return')
  const f = frame(s, { color: true, ascii: false }).join('\n').replace(/\x1b\[[0-9;]*m/g, '')
  assert.doesNotMatch(f, /[\u0000-\u0009\u000b-\u001f\u007f\u2028]/)
  assert.match(f, /x\[2J\]0;pwned y/)
})

test('setup opens on its own when nothing is configured; s opens it any time', () => {
  const st = reduce(s0, { name: '4' })
  const [show] = runs(st.effects)
  const s = settle(show!.then(ok(CFG_NONE))(st.state)).state
  assert.ok(s.setup, 'setup up when no token is saved')
  assert.match(text(s), /Teams setup/)
  const set = settle(show!.then(ok(CFG_SET))(st.state)).state
  assert.equal(set.setup, null)
  assert.ok(press(set, 's').setup)
})

const openSetup = (cfg: string) => {
  const st = reduce({ ...s0, tab: 'messages' }, { name: 's' })
  const [show] = runs(st.effects)
  return show ? settle(show.then(ok(cfg))(st.state)).state : st.state
}

test('setup: the token is masked as typed and never in any frame; tab walks the fields; space toggles posts', () => {
  let s = openSetup(CFG_NONE)
  assert.equal(s.setupField, 'token')
  s = type(s, TOKEN)
  const f = text(s)
  assert.ok(!f.includes(TOKEN), 'the token is drawn')
  assert.ok(!f.includes(TOKEN.slice(0, 6)))
  assert.match(f, new RegExp(`Token +${'•'.repeat(10)}`))
  s = press(s, 'tab')
  assert.equal(s.setupField, 'url')
  s = type(s, 'https://prod.example/w?sig=abc')
  s = press(s, 'tab')
  assert.equal(s.setupField, 'port')
  assert.match(text(s), /Port +3978/)
  s = press(s, 'backspace', 'backspace', 'backspace', 'backspace')
  s = type(s, '4100')
  s = press(s, 'tab')
  assert.equal(s.setupField, 'posts')
  assert.match(text(s), /Status posts +\[ \] off/)
  s = press(s, { name: 'space', sequence: ' ' })
  assert.match(text(s), /Status posts +\[x\] on/)
  for (const x of [s, { ...s, cols: 40 }, { ...s, cols: 200 }]) assert.ok(!text(x).includes(TOKEN.slice(0, 6)))
  // ascii mode too
  assert.ok(!frame(s, { color: false, ascii: true, plain: true }).join('\n').includes(TOKEN.slice(0, 6)))
})

test('setup: Enter checks first - https, base64, port 1024-65535 - and saves over stdin, never argv', () => {
  let s = openSetup(CFG_NONE)
  // nothing typed, nothing saved: the token is required
  let st = reduce(s, { name: 'return' })
  assert.deepEqual(runs(st.effects), [])
  assert.match(text(st.state), /token: required/)
  s = type(s, 'not base64!')
  assert.match(text(reduce(s, { name: 'return' }).state), /token: not base64/)
  s = type(press(s, ...Array(11).fill('backspace')), TOKEN)
  s = type(press(s, 'tab'), 'http://prod.example/w')
  assert.match(text(reduce(s, { name: 'return' }).state), /workflow URL: must be an https URL/)
  s = type(press(s, ...Array(21).fill('backspace')), 'https://prod.example/w?sig=SECRETSIG')
  s = type(press(s, 'tab', 'backspace', 'backspace', 'backspace', 'backspace'), '80')
  assert.match(text(reduce(s, { name: 'return' }).state), /port: a number from 1024 to 65535/)
  s = type(press(s, 'backspace', 'backspace'), '4100')
  st = reduce(s, { name: 'return' })
  const [save] = runs(st.effects)
  assert.equal(save!.call, 'team-config-save')
  assert.deepEqual(save!.args, [])
  assert.deepEqual(JSON.parse(save!.stdin!), { token: TOKEN, workflowUrl: 'https://prod.example/w?sig=SECRETSIG', port: 4100, statusPosts: false })
  const done = settle(save!.then(ok('saved: /h/.skillator/teams.json (this user only)\n', ['node', 'team.mjs', 'config', 'save']))(st.state))
  assert.equal(done.state.setup, null)
  assert.match(done.state.toast ?? '', /✓ Teams settings saved/)
  assert.ok(!(done.state.toast ?? '').includes(TOKEN))
  assert.deepEqual(runs(done.effects).map(e => e.call), ['team-config-show'])
  // refused by teams-uhura: its words in the form, the form stays
  const no = settle(save!.then({ code: 1, out: '', err: 'team: refused: inside the repo', argv: ['node'] })(st.state)).state
  assert.ok(no.setup)
  assert.match(text(no), /refused: inside the repo/)
})

test('setup on re-open: the saved token only as set, the URL only as its host; empty fields keep them', () => {
  const s = openSetup(CFG_SET)
  const t = text(s)
  assert.match(t, /Token +\(set - type to replace\)/)
  assert.match(t, /Workflow URL +\(set: prod\.example - type to replace\)/)
  assert.match(t, /Port +4000/)
  assert.match(t, /Status posts +\[x\] on/)
  const [save] = runs(reduce(s, { name: 'return' }).effects)
  assert.deepEqual(JSON.parse(save!.stdin!), { token: '', workflowUrl: '', port: 4000, statusPosts: true })
})

test('setup: Clear asks y/n, then runs config clear; Esc cancels the form', () => {
  let s = openSetup(CFG_SET)
  s = press(s, 'tab', 'tab', 'tab', 'tab')
  assert.equal(s.setupField, 'clear')
  s = press(s, 'return')
  assert.match(text(s), /clear the saved Teams settings\? \(y\/n\)/)
  assert.equal(press(s, 'n').setup?.confirmClear, false)
  const st = reduce(s, { name: 'y' })
  assert.deepEqual(runs(st.effects).map(e => e.call), ['team-config-clear'])
  assert.equal(press(openSetup(CFG_SET), 'escape').setup, null)
})

test('an inbox over 4 MiB: the engine reads its tail through teams-uhura, never a blank tab', async () => {
  const calls: string[] = []
  const BOX = '/r/.git/skillator/team-inbox.jsonl'
  const host: Host = {
    win: false, skillsDir: '/s', repoRoot: '/r', inboxDir: '/r/.git/skillator',
    async run(call, args) {
      calls.push([call, ...args].join(' '))
      if (call === 'team-inbox-tail') return { code: 0, out: INBOX, err: '', argv: ['node', 'team.mjs', 'inbox', 'tail'] }
      return { code: 127, out: '', err: 'not here', argv: [] }
    },
    async stat(p) { return p === BOX ? { mtimeMs: 1, size: 5 * 1024 * 1024 } : null },
    async read(p) { throw new Error('read whole: ' + p) },
    gitEmail: async () => null,
  }
  const engine = makeEngine({ host, email: null, once: false, state: initial(80, 24, 0), onChange: () => {}, onQuit: () => {} })
  await engine.readAll()
  assert.deepEqual(engine.state.messages.map(m => m.id), ['1', '2', '3'])
  assert.ok(calls.includes('team-inbox-tail'))
})

test('validation rules and the unmask of a masked input', () => {
  const none = null
  assert.equal(setupError({ token: TOKEN, url: '', port: '3978', posts: false }, none), null)
  assert.match(setupError({ token: TOKEN, url: 'ftp://x', port: '3978', posts: false }, none)!, /https/)
  assert.match(setupError({ token: TOKEN, url: '', port: '1023', posts: false }, none)!, /1024/)
  assert.match(setupError({ token: TOKEN, url: '', port: '65536', posts: false }, none)!, /1024/)
  assert.match(setupError({ token: 'abc', url: '', port: '3978', posts: false }, none)!, /base64/)
  assert.equal(setupError(freshSetup({ path: '', token: true, workflowUrl: null, port: 3978, statusPosts: false }), { path: '', token: true, workflowUrl: null, port: 3978, statusPosts: false }), null)
  assert.equal(unmask('abc', '•••d'), 'abcd')
  assert.equal(unmask('abc', '••'), 'ab')
  assert.equal(unmask('', 'xyz'), 'xyz')
  assert.equal(unmask('abc', '•X••'), 'aXbc')
})


test('A175: unavailable host inbox never probes a guessed .git directory', async () => {
  const paths: string[] = []
  const host: Host = {
    repoRoot: '/nongit', inboxDir: null, win: false, skillsDir: null,
    async run() { return { code: 127, out: '', err: '', argv: [] } },
    async stat(p) { paths.push(p); return null },
    async read(p) { throw new Error('unexpected read: ' + p) },
    async gitEmail() { return null },
  }
  const engine = makeEngine({ host, state: initial(80, 24, 0), email: null, once: true, onChange() {}, onQuit() {} })
  await engine.readAll()
  assert.equal(paths.some(p => p.includes('/.git/')), false)
  assert.deepEqual(engine.state.messages, [])
})
