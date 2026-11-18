// F177: connect Teams from the Messages tab - the kv parser, the lines, the keys and the
// frames of the shared reducer (the standalone app, pi and Antigravity all draw these).
// Nothing here starts a tunnel or a listener: a run effect is answered from a fixture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initial, reduce, onInbox, afterRun } from '../state'
import type { State, Effect } from '../state'
import { frame, cells } from '../draw'
import { parseArm, armLines, armToast, expiryShown } from '../../hooks/lib/teamsarm'
import { argvFor } from '../../hooks/lib/calls'
import { keyOf } from '../app'

const P = { color: false, ascii: false, plain: true }
const text = (s: State) => frame(s, P).join('\n')
const U1 = 'https://ab12cd34-3978.euw.devtunnels.ms', U2 = 'https://zz99yy88-3978.euw.devtunnels.ms'
const NOW = Date.parse('2026-11-17T00:00:00Z')
const KV = (o: Record<string, string> = {}) => Object.entries({ result: 'status', why: '', devtunnel: 'ok', login: 'in', form: 'set', tunnel: 'ready',
  hosted: '0', listener: 'down', port: '3978', url: '', url_changed: '0', expires: '', ...o }).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
const ARMED = { result: 'armed', hosted: '1', listener: 'up', url: U1, expires: '2026-12-17T00:00:00Z' }
const ok = (out: string) => ({ code: 0, out, err: '', argv: ['/bin/sh', 'setup.sh', '--arm'] })
const runs = (effs: Effect[]) => effs.filter((e): e is Extract<Effect, { kind: 'run' }> => e.kind === 'run')
const lines = (v: ReturnType<typeof parseArm>, cols = 80) => armLines(v, NOW, cols).map(l => [l.key, l.segs.map(s => s.text).join('')])
const onTab = reduce(onInbox(initial(80, 24, NOW), '', null), { name: '4' })

test('parseArm: the twelve keys; a URL that is not a devtunnels.ms https URL is dropped; no result = null', () => {
  const v = parseArm(KV(ARMED))!
  assert.deepEqual(v, { result: 'armed', why: '', devtunnel: true, login: true, form: true, tunnel: true, hosted: true, listener: true,
    port: 3978, url: U1, urlChanged: false, expires: '2026-12-17T00:00:00Z', note: null })
  assert.equal(parseArm('listener: up on 127.0.0.1:3978\n'), null)
  assert.equal(parseArm(KV({ result: 'bogus' })), null)
  for (const bad of ['http://ab12cd34-3978.euw.devtunnels.ms', 'https://evil.example/x', 'https://ab12cd34-3978.euw.devtunnels.ms.evil.example', U1 + '/\x1b[2J'])
    assert.equal(parseArm(KV({ url: bad, url_changed: '1' }))!.url, null, bad)
  assert.equal(parseArm(KV({ url: 'https://evil.example', url_changed: '1' }))!.urlChanged, false)
  assert.equal(parseArm(KV({ port: 'x' }))!.port, 3978)
  assert.equal(parseArm(KV({ result: 'refused', why: 'the form has no token - s, paste the security token, save' }).replace(/\n/g, '\r\n'))!.why,
    'the form has no token - s, paste the security token, save')
})

test('A226 c: parseArm - a value with a control character is dropped, so a reply cannot forge result= or hosted=', () => {
  const w = parseArm(KV({ why: 'a\x1b[2Jb', expires: '2026-12-17\x07' }))!
  assert.equal(w.why, ''); assert.equal(w.expires, null)
})

test('A226 review 1: a key that appears twice makes the whole reply invalid, before url or after it', () => {
  const body = KV({ result: 'failed', why: 'x', url: U1 })
  assert.equal(parseArm(body + 'result=armed\nhosted=1\nlistener=up\n'), null)       // after url
  assert.equal(parseArm('hosted=1\n' + body), null)                                // before url
  assert.equal(parseArm(body.replace('url=', 'result=armed\nurl=')), null)          // result twice, both before url
  assert.equal(parseArm(KV({ why: 'a\x1b[2Jb' }) + 'why=later\n'), null)           // a dropped value still claims its key
})

test('expiryShown: days, hours under two days, EXPIRED, an unparsed value as printed, none', () => {
  assert.equal(expiryShown('2026-12-17T00:00:00Z', NOW), 'expires in 30d')
  assert.equal(expiryShown('2026-11-18T05:00:00Z', NOW), 'expires in 29h')
  assert.equal(expiryShown('2026-11-16T00:00:00Z', NOW), 'EXPIRED')
  assert.equal(expiryShown('30 days', NOW), 'expires 30 days')
  assert.equal(expiryShown(null, NOW), null)
})

test('armLines: not read, not armed, armed with the URL and expiry', () => {
  assert.deepEqual(lines(null), [['arm', 'Teams  not checked - c connects']])
  assert.deepEqual(lines(parseArm(KV())), [['arm', 'Teams  ○ tunnel not hosted · ○ listener down · form saved']])
  assert.deepEqual(lines(parseArm(KV({ form: 'notset' }))), [['arm', 'Teams  ○ tunnel not hosted · ○ listener down · form: no token']])
  assert.deepEqual(lines(parseArm(KV(ARMED))), [
    ['arm', 'Teams  ● tunnel hosted · ● listener up :3978 · form saved · expires in 30d'],
    ['arm:url', `  ${U1}  y copies`],
  ])
  assert.deepEqual(lines(parseArm(KV({ ...ARMED, url: '' }))).at(-1), ['arm:url', '  URL: read it in the tunnel window'])
})

test('URL guard: an unchanged URL draws no warning; a changed one says to update the webhook, the URL whole on a line', () => {
  assert.equal(lines(parseArm(KV(ARMED))).some(([k]) => k!.startsWith('arm:warn')), false)
  const warn = lines(parseArm(KV({ ...ARMED, url: U2, url_changed: '1' }))).filter(([k]) => k!.startsWith('arm:warn'))
  assert.deepEqual(warn, [
    ['arm:warn:0', '▲ tunnel URL changed - update the Teams outgoing webhook callback to'],
    ['arm:warn:1', U2],
  ])
  for (const cols of [40, 60, 80, 110, 140])
    for (const l of armLines(parseArm(KV({ ...ARMED, url: U2, url_changed: '1' })), NOW, cols))
      if (l.key.startsWith('arm:warn')) assert.ok(cells(l.segs.map(s => s.text).join('')) <= cols, `${cols}: ${l.key}`)
})

test('armToast: refusals and failures say why; the URL is never in a toast', () => {
  assert.equal(armToast(parseArm(KV({ result: 'refused', why: 'devtunnel is not installed - s, then First-time setup' }))!),
    '✗ Teams not connected: devtunnel is not installed - s, then First-time setup')
  assert.equal(armToast(parseArm(KV({ result: 'failed', why: 'the listener did not come up - the tunnel was not hosted' }))!),
    '✗ Teams: the listener did not come up - the tunnel was not hosted')
  assert.equal(armToast(parseArm(KV(ARMED))!), '✓ Teams connected - tunnel hosted, listener up on 127.0.0.1:3978')
  assert.equal(armToast(parseArm(KV({ ...ARMED, url: U2, url_changed: '1' }))!),
    '✓ Teams connected - tunnel hosted, listener up on 127.0.0.1:3978\n▲ the tunnel URL changed - see the Messages tab, y copies it')
  assert.equal(armToast(parseArm(KV({ result: 'disarmed' }))!), '✓ Teams disconnected - tunnel stopped, listener stopped')
  assert.equal(armToast(parseArm(KV())!), '')
  assert.equal(armToast(parseArm(KV({ result: 'acked' }))!), '')
  for (const o of [ARMED, { ...ARMED, url: U2, url_changed: '1' }]) assert.doesNotMatch(armToast(parseArm(KV(o))!), /devtunnels\.ms/)
})

test('the call table: the four modes of setup, both spellings', () => {
  const PS = ['C:/ps.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:/s/skills/teams-uhura/scripts/setup.ps1']
  for (const [call, mode] of [['team-arm', '--arm'], ['team-disarm', '--disarm'], ['team-arm-status', '--status'], ['team-url-ack', '--ack']] as const) {
    assert.deepEqual(argvFor(call, false, '/s/skills', [], '/bin/sh'), ['/bin/sh', '/s/skills/teams-uhura/scripts/setup.sh', mode])
    assert.deepEqual(argvFor(call, true, 'C:/s/skills/', [], 'C:/ps.exe'), [...PS, mode])
  }
  // A226 d: --ack carries the URL the board copied
  assert.deepEqual(argvFor('team-url-ack', false, '/s/skills', [U1], '/bin/sh').slice(2), ['--ack', U1])
  assert.deepEqual(argvFor('team-url-ack', true, 'C:/s/skills/', [U1], 'C:/ps.exe').slice(-2), ['--ack', U1])
})

test('entering Messages only reads: config show and the status; no key but c arms, no key but d disarms', () => {
  assert.deepEqual(runs(onTab.effects).map(e => e.call), ['team-config-show', 'team-arm-status'])
  assert.equal(onTab.state.armBusy, false)
  const keys = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'return', 'space', 'tab', 'escape', 'up', 'down']
  for (const name of keys) {
    const calls = runs(reduce(onTab.state, { name, sequence: name.length === 1 ? name : undefined }).effects).map(e => e.call)
    assert.equal(calls.includes('team-arm'), name === 'c', `team-arm on ${name}`)
    assert.equal(calls.includes('team-disarm'), name === 'd', `team-disarm on ${name}`)
  }
  for (const tab of ['1', '2', '3', '5', '6'] as const) {
    const there = reduce(onTab.state, { name: tab }).state
    for (const name of ['c', 'd', 'y']) {
      const calls = runs(reduce(there, { name }).effects).map(e => e.call)
      assert.ok(!calls.includes('team-arm') && !calls.includes('team-disarm'), `tab ${tab} key ${name}`)
    }
  }
})

test('c arms once: busy until the result lands, then the status line, the URL and a toast without it', () => {
  const idle = afterRun(runs(onTab.effects)[1]!, ok(KV()), onTab.state, NOW).state
  assert.match(text(idle), /Teams  ○ tunnel not hosted · ○ listener down · form saved/)
  const c = reduce(idle, { name: 'c' })
  assert.deepEqual(runs(c.effects).map(e => [e.call, e.args]), [['team-arm', []]])
  assert.equal(c.state.armBusy, true)
  assert.deepEqual(reduce(c.state, { name: 'c' }).effects, [])          // a second press while busy runs nothing
  assert.deepEqual(reduce(c.state, { name: 'd' }).effects, [])
  // a status read that lands while the arm is in flight is the older read: ignored
  assert.equal(afterRun(runs(onTab.effects)[1]!, ok(KV()), c.state, NOW).state.teamsArm, c.state.teamsArm)
  const armed = afterRun(runs(c.effects)[0]!, ok(KV(ARMED)), c.state, NOW).state
  assert.equal(armed.armBusy, false)
  const t = text(armed)
  assert.match(t, /Teams  ● tunnel hosted · ● listener up :3978 · form saved · expires in 30d/)
  assert.ok(t.includes(`  ${U1}  y copies`))
  assert.match(armed.toast ?? '', /^✓ Teams connected - tunnel hosted, listener up on 127\.0\.0\.1:3978\nran: /)
  assert.doesNotMatch(armed.toast ?? '', /devtunnels\.ms/)
})

test('c refused: devtunnel missing, not signed in, no token - a toast each, nothing else runs', () => {
  for (const why of ['devtunnel is not installed - s, then First-time setup', 'not signed in to Dev Tunnels - s, then Sign in to Dev Tunnels', 'the form has no token - s, paste the security token, save']) {
    const c = reduce(onTab.state, { name: 'c' })
    const done = afterRun(runs(c.effects)[0]!, ok(KV({ result: 'refused', why, ...(why.startsWith('devtunnel') ? { devtunnel: 'missing' } : {}) })), c.state, NOW)
    assert.ok((done.state.toast ?? '').startsWith(`✗ Teams not connected: ${why}`), why)
    assert.deepEqual(done.effects, [])
    assert.equal(done.state.armBusy, false)
  }
  // the script could not run at all: the toast says why, the view is kept
  const c = reduce(onTab.state, { name: 'c' })
  const dead = afterRun(runs(c.effects)[0]!, { code: 127, out: '', err: 'sh not found on PATH', argv: [] }, c.state, NOW).state
  assert.match(dead.toast ?? '', /^✗ Teams: sh not found on PATH/)
  assert.equal(dead.armBusy, false)
})

test('d disarms; y copies the URL and, when it changed, acknowledges it', () => {
  const armed: State = { ...onTab.state, teamsArm: parseArm(KV(ARMED)) }
  const d = reduce(armed, { name: 'd' })
  assert.deepEqual(runs(d.effects).map(e => e.call), ['team-disarm'])
  const off = afterRun(runs(d.effects)[0]!, ok(KV({ result: 'disarmed' })), d.state, NOW).state
  assert.match(text(off), /Teams  ○ tunnel not hosted · ○ listener down · form saved/)
  assert.match(off.toast ?? '', /^✓ Teams disconnected - tunnel stopped, listener stopped/)
  // y with no URL: a toast, no effect
  assert.deepEqual(reduce(onTab.state, { name: 'y' }).effects, [])
  assert.match(reduce(onTab.state, { name: 'y' }).state.toast ?? '', /no tunnel URL yet - c connects/)
  // y, URL unchanged: copied, no ack
  const y = reduce(armed, { name: 'y' })
  const copy = y.effects.find((e): e is Extract<Effect, { kind: 'copy' }> => e.kind === 'copy')!
  assert.equal(copy.text, U1)
  const copied = afterRun({ then: copy.then! }, { code: 0, out: '', err: '', argv: [] }, y.state, NOW)
  assert.match(copied.state.toast ?? '', /^✓ tunnel URL copied/)
  assert.deepEqual(copied.effects, [])
  // y, URL changed: copied, then --ack, and the warning goes
  const changed: State = { ...onTab.state, teamsArm: parseArm(KV({ ...ARMED, url: U2, url_changed: '1' })) }
  assert.match(text(changed), /▲ tunnel URL changed - update the Teams outgoing webhook callback to/)
  const y2 = reduce(changed, { name: 'y' })
  const copy2 = y2.effects.find((e): e is Extract<Effect, { kind: 'copy' }> => e.kind === 'copy')!
  assert.equal(copy2.text, U2)
  const copied2 = afterRun({ then: copy2.then! }, { code: 0, out: '', err: '', argv: [] }, y2.state, NOW)
  assert.deepEqual(runs(copied2.effects).map(e => e.call), ['team-url-ack'])
  const acked = afterRun(runs(copied2.effects)[0]!, ok(KV({ ...ARMED, result: 'acked', url: U2 })), copied2.state, NOW).state
  assert.doesNotMatch(text(acked), /tunnel URL changed/)
  // the clipboard failed: no ack, the warning stays
  const failed = afterRun({ then: copy2.then! }, { code: 127, out: '', err: 'no clipboard utility available', argv: [] }, y2.state, NOW)
  assert.deepEqual(failed.effects, [])
  assert.match(failed.state.toast ?? '', /^✗ not copied: no clipboard utility available/)
})

test('c, d and y act only with no modifier: ctrl+d, alt+c, alt+y run nothing', () => {
  const armed: State = { ...onTab.state, teamsArm: parseArm(KV(ARMED)) }
  assert.deepEqual(keyOf('\x1bc', { name: 'c', meta: true })?.meta, true)   // readline: alt+c is c + meta
  for (const k of [{ name: 'd', ctrl: true }, { name: 'c', meta: true }, { name: 'd', meta: true }, { name: 'y', ctrl: true }, { name: 'y', meta: true }]) {
    const r = reduce(armed, k)
    assert.deepEqual(r.effects, [], JSON.stringify(k))
    assert.equal(r.state.armBusy, armed.armBusy, JSON.stringify(k))
  }
})

test('width matrix 80 / 110 / 140: the Messages tab with Teams armed and a changed URL fits and shows everything', () => {
  for (const cols of [80, 110, 140]) {
    const s: State = { ...onTab.state, cols, rows: 24, teamsArm: parseArm(KV({ ...ARMED, url: U2, url_changed: '1' })) }
    const f = frame(s, P)
    assert.equal(f.length, 24, `${cols}: rows`)
    for (const [i, l] of f.entries()) assert.ok(cells(l) <= cols, `${cols}: line ${i + 1} is ${cells(l)} wide: ${l}`)
    const t = f.join('\n')
    assert.match(t, /Teams  ● tunnel hosted · ● listener up :3978 · form saved · expires in 30d/, `${cols}: status`)
    assert.ok(f.some(l => l.startsWith(`  ${U2}  y copies`)), `${cols}: the URL line`)
    assert.ok(f.some(l => l.startsWith('▲ tunnel URL changed - update the Teams outgoing webhook callback to')), `${cols}: the warning`)
    assert.ok(f.some(l => l.trimEnd() === U2 || l.trimEnd().endsWith('callback to ' + U2)), `${cols}: the new URL whole`)
    for (const k of ['c connect', 'd disconnect', 'y copy URL', 'm mark all read', 's setup']) assert.ok(t.includes(k), `${cols}: ${k}`)
    assert.doesNotMatch(t, /[\uFFFD]|Γö/, `${cols}: mojibake`)
  }
  // 40 columns: nothing overflows (the status line is cut, the keys wrap)
  const narrow = frame({ ...onTab.state, cols: 40, rows: 24, teamsArm: parseArm(KV({ ...ARMED, url: U2, url_changed: '1' })) }, P)
  for (const l of narrow) assert.ok(cells(l) <= 40, `40: ${l}`)
})

test('A235 1: y sends --ack with the URL copied; under c in flight it waits, then runs once the arm lands', () => {
  const changed: State = { ...onTab.state, teamsArm: parseArm(KV({ ...ARMED, url: U2, url_changed: '1' })) }
  const copied = (s: State) => {
    const y = reduce(s, { name: 'y' })
    const copy = y.effects.find((e): e is Extract<Effect, { kind: 'copy' }> => e.kind === 'copy')!
    return afterRun({ then: copy.then! }, { code: 0, out: '', err: '', argv: [] }, y.state, NOW)
  }
  assert.deepEqual(runs(copied(changed).effects).map(e => [e.call, e.args]), [['team-url-ack', [U2]]])
  const c = reduce(changed, { name: 'c' })
  const during = copied(c.state)
  assert.deepEqual(runs(during.effects), [])                       // not under the arm
  const armed = afterRun(runs(c.effects)[0]!, ok(KV({ ...ARMED, url: U2, url_changed: '1' })), during.state, NOW)
  assert.deepEqual(runs(armed.effects).map(e => [e.call, e.args]), [['team-url-ack', [U2]]])
  // a failed ack's toast never carries the URL
  const failed = afterRun(runs(armed.effects)[0]!, { ...ok(KV({ ...ARMED, result: 'failed', why: 'no tunnel URL to remember', url: '' })), argv: ['/bin/sh', 'setup.sh', '--ack', U2] }, armed.state, NOW).state
  assert.match(failed.toast ?? '', /^✗ Teams: no tunnel URL to remember\nran: .* --ack <url>$/)
})

test('A235 1: a reply parseArm cannot read toasts unexpected output from teams-uhura', () => {
  const c = reduce(onTab.state, { name: 'c' })
  const done = afterRun(runs(c.effects)[0]!, ok('result=armed\nresult=armed\n'), c.state, NOW).state
  assert.match(done.toast ?? '', /^✗ Teams: unexpected output from teams-uhura/)
  assert.doesNotMatch(done.toast ?? '', /result=armed/)
})

test('A235 5: a devtunnel the board cannot inspect - a dim note on the arm line, never a failure', () => {
  const NOTE = 'a devtunnel this board cannot inspect is running'
  const v = parseArm(KV({ ...ARMED, note: NOTE }))!
  assert.equal(v.note, NOTE)
  assert.equal(v.result, 'armed')
  const arm = armLines(v, NOW, 140)[0]!
  assert.deepEqual(arm.segs.at(-1), { text: NOTE, dim: true })
  assert.equal(lines(v, 140)[0]![1], 'Teams  ● tunnel hosted · ● listener up :3978 · form saved · expires in 30d · ' + NOTE)
  assert.equal(parseArm(KV({ note: 'x\x1b[2J' }))!.note, null)
  assert.equal(armToast(v), '✓ Teams connected - tunnel hosted, listener up on 127.0.0.1:3978')
})

test('A235 3: no deferred ack after a disarm; an ack in flight keeps its view when c is pressed after', () => {
  const changed: State = { ...onTab.state, teamsArm: parseArm(KV({ ...ARMED, url: U2, url_changed: '1' })) }
  const copied = (s: State) => {
    const y = reduce(s, { name: 'y' })
    const copy = y.effects.find((e): e is Extract<Effect, { kind: 'copy' }> => e.kind === 'copy')!
    return afterRun({ then: copy.then! }, { code: 0, out: '', err: '', argv: [] }, y.state, NOW)
  }
  const d = reduce(changed, { name: 'd' })
  const off = afterRun(runs(d.effects)[0]!, ok(KV({ result: 'disarmed' })), copied(d.state).state, NOW)
  assert.deepEqual(runs(off.effects), [])
  assert.equal(off.state.ackAfter, null)
  const ack = runs(copied(changed).effects)[0]!
  const c = reduce(changed, { name: 'c' })
  const acked = afterRun(ack, ok(KV({ ...ARMED, result: 'acked', url: U2 })), c.state, NOW).state
  assert.equal(acked.teamsArm?.urlChanged, false)
  assert.equal(acked.armBusy, true)
})
