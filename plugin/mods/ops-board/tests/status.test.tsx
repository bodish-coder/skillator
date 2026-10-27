import type { StatusDraft } from '../types'
declare const console: { log(text: string): void }
import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock, Mounted, Plugin } from 'claude-code/testing'

// F116: `c` on the Tickets tab - ticket-meta reconcile's proposals as a form inside the
// ops-board pane (B5: no second pane); accept all / pick / none, each accepted row
// written by its ticket-meta subcommand (the mod writes no file), a refusal in the
// toast, then the board re-read.

const BOARD = `# Tickets

## Open

- [~] F3 — cart drawer keeps items on reload [owner: @vidul] (@cc-4ae496)
- [!] B2 — /orders 500s past page 3 (blocked: F1)
- [ ] B1 — button focus ring missing
- [ ] B7 — pairing screen, needs an owner live look
- [~] F8 — sync worker
- [!] B9 — vendor SDK (blocked: the vendor fix)

## Closed

- [x] F1 — product grid on the home page
`
const PROPOSALS = `B2 [!] -> [ ]  blocked on F1, now done
B1 [ ] -> [~]  2 commits name it, newest abc1234
B7 [ ] -> [%]  code landed in abc1235; the owner must confirm: a live check
F8 [~] -> [!]  RUN-0001 stage 1 failed
B9 [!] -> [!]  evidence unclear: blocked on 'the vendor fix', no ticket to check
`
const META = '/s/skills/tickets-zordon/scripts/ticket-meta'
const sh = (...a: string[]) => ['/bin/sh', META + '.sh', ...a]

type World = {
  files: Record<string, string>
  runs: (readonly string[])[]
  opens: { id: string; focus?: true; closeOnEscape?: true }[]
  closes: string[]
  toasts: string[]
  writes: string[]
  boardReads: number
  answer: (argv: readonly string[]) => ProcessRunResult | null | Promise<ProcessRunResult | null>
}
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

function world(on: On, files: Record<string, string>): [World, MockClock] {
  const w: World = { files: { ...files, [META + '.sh']: '#!/bin/sh\n', '/bin/node': 'node', '/s/skills/holo-r2d2/scripts/holo.mjs': 'holo' }, runs: [], opens: [], closes: [], toasts: [], writes: [], boardReads: 0, answer: () => null }
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
    if (e.path.replace(/\\/g, '/').endsWith('/TICKETS.md')) w.boardReads++
    const f = at(e.path)
    return f !== undefined ? { value: f } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.write', ($, e) => { w.writes.push(e.path); return { deny: 'the mod must not write files' } })
  on('process.run', async ($, e) => {
    if (e.argv.join(' ') === 'git config user.email') return { value: ran('vidul@ikran.in\n') }
    if (e.argv.some(a => /(pending|relay-morpheus)\.(sh|ps1)$/.test(a))) return { value: ran('', 1, 'not in this test') }
    w.runs.push(e.argv)
    return { value: (await w.answer(e.argv)) ?? ran('', 1, 'unexpected call') }
  })
  on('ui.open', ($, e) => { w.opens.push({ id: e.id, focus: e.focus, closeOnEscape: e.closeOnEscape }); return { value: { isPlaced: true as const } } })
  on('ui.close', ($, e) => { w.closes.push(e.id); return { value: undefined } })
  on('ui.toast', ($, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.focus', () => ({}))
  return [w, clock]
}

// Another plugin closing the pane stands for Esc (the same ui.close chain); peek reads state.
const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    on('command.run', { command: 'close' }, async ($, e) => { await $.ui.close({ id: e.args }); return { text: 'closed' } })
    on('command.run', { command: 'peek' }, async ($) => ({ text: JSON.stringify((await $.state.get({ plugin: 'ops-board', key: 'status' })).value ?? null) }))
  },
}
const WITH = { plugins: [PEEK] }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
const form = async ($: Engine) => JSON.parse((await $.command.run({ command: 'peek', args: '', ...RUN })).text ?? 'null') as unknown

const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]
const PROPS = { title: 'ops board', isFocused: true, bodyColumns: 120, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }

async function start($: Engine, clock: MockClock, surface: Surface): Promise<Mounted<Surface, 'Pane'>> {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  return $.ui.mount({ plugin: 'ops-board', surface, component: 'Pane', requestId: 'ops-board', props: PROPS })
}
const head = async (pane: Mounted<Surface, 'Pane'>, box: string) => (await pane.find({ key: 'head:' + box }))?.text


const ROW = '[>] F91 - Later [owner: @vidul] (deferred: after release) (@cc-old:vidul:run)'
const FIXTURE = '# Tickets\n\n- ' + ROW + '\n'
const focus = ($: Engine, element: string) => $.ui.focus({ component: 'Pane', requestId: 'ops-board', plugin: 'ops-board', element, origin: { kind: 'person' } })
async function typeId(pane: Mounted<Surface, 'Pane'> | Mounted<'terminal', 'Pane'> | Mounted<'desktop', 'Pane'>, id = 'f91') {
  await pane.input({ key: 'status:ticket', text: id, kind: 'change' })
}
for (const surface of SURFACES) {
  test(`${surface}: F116 typed status writes once, preserves snapshot and refreshes`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': FIXTURE })
    w.answer = argv => {
      if (argv[2] !== 'status') return null
      w.files['/r/TICKETS.md'] = FIXTURE.replace('[>]', '[ ]').replace(' (deferred: after release)', '')
      return ran('F91 pending')
    }
    const pane = await start($, clock, surface)
    expect((await pane.find({key:'key:status'}))?.props.hotkey).toBe('s')
    expect((await pane.find({key:'key:help'}))?.props.hotkey).toBe('h')
    await pane.press({key:'key:status'})
    await typeId(pane)
    expect(await pane.find({key:'key:status'})).toBeUndefined()
    await pane.press({key:'status:pending'})
    await pane.press({key:'status:apply'})
    expect(w.runs).toEqual([sh('status', 'F91', 'pending', ROW)])
    expect(await form($)).toBeNull()
    expect(await head(pane, '>')).toBeUndefined()
    expect(w.writes).toEqual([])
    await pane.unmount()
  })
  test(`${surface}: F116 reason literal argv and refusal keeps draft usable`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': FIXTURE })
    w.answer = () => ran('', 1, 'ticket-meta: owned by another person')
    const pane = await start($, clock, surface)
    await pane.press({key:'key:status'}); await typeId(pane)
    await pane.press({key:'status:blocked'})
    const reason = String.raw`waiting "quoted" C:\new\test --flag`
    await pane.input({key:'status:reason', text:reason, kind:'change'})
    await pane.press({key:'status:apply'})
    expect(w.runs).toEqual([sh('status','F91','blocked',ROW,reason)])
    expect(await form($)).toMatchObject({reason, target:'blocked', busy:false})
    expect((await pane.find({key:'status:result'}))?.text).toContain('owned by another person')
    expect(await pane.find({key:'status:apply'})).not.toBeUndefined()
    await pane.unmount()
  })
  test(`${surface}: F116 help only invokes allowlisted holo and retains path`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': FIXTURE })
    w.answer = () => ran('holo: ticket F91 -> /r/.skillator/holo/ticket-F91.html\n')
    const pane = await start($, clock, surface)
    await pane.press({key:'key:help'}); await typeId(pane)
    await pane.press({key:'status:help'})
    expect(w.runs).toEqual([['/bin/node','/s/skills/holo-r2d2/scripts/holo.mjs','--ticket','F91','--html']])
    expect((await pane.find({key:'status:path'}))?.text).toBe('/r/.skillator/holo/ticket-F91.html')
    expect(w.writes).toEqual([])
    await pane.unmount()
  })
}
for (const cols of [40,60,80,120]) test(`F116 focus and mounted status frames ${cols}`, WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': FIXTURE })
  await $.session.start({cwd:'/r',surface:'terminal',isInteractive:true}); await clock.settle()
  const pane = await $.ui.mount({plugin:'ops-board',surface:'terminal',component:'Pane',requestId:'ops-board',props:{...PROPS,bodyColumns:cols}})
  await pane.press({key:'key:status'})
  const capture = async (label: string) => console.log('F116 FRAME '+JSON.stringify({cols,label,mode:'mounted primitive tree',tree:await pane.drawn(),notChecked:'physical emulator/font/raw keys and live B15/B17'}))
  await capture('empty')
  await focus($,'status:ticket'); await typeId(pane,'pbdcsh')
  expect((await pane.findAll({type:'Button'})).filter(b=>b.props.hotkey)).toEqual([])
  expect(await form($)).toMatchObject({id:'pbdcsh'})
  await typeId(pane); await focus($,'status:blocked'); await pane.press({key:'status:blocked'})
  expect((await pane.find({key:'status:pending'}))?.props.hotkey).toBe('p')
  expect((await pane.find({key:'status:blocked'}))?.props.hotkey).toBe('b')
  expect((await pane.find({key:'status:deferred'}))?.props.hotkey).toBe('d')
  await focus($,'status:reason'); await pane.input({key:'status:reason',text:'pbdcsh',kind:'change'})
  expect((await pane.findAll({type:'Button'})).filter(b=>b.props.hotkey)).toEqual([])
  expect(w.runs).toEqual([])
  await capture('reason input')
  await focus($,'status:apply'); await capture('choices and apply')
  w.answer = () => ran('',1,'refused: '+ 'long explanation '.repeat(12))
  await pane.input({key:'status:reason',text:'long reason '.repeat(16),kind:'change'})
  await pane.press({key:'status:apply'}); await capture('long reason and refusal')
  w.answer = () => ran('holo: ticket F91 -> /very/long/'+ 'folder/'.repeat(20)+'ticket-F91.html')
  await pane.press({key:'status:help'}); await capture('long help path')
  await pane.press({key:'status:cancel'}); expect(await form($)).toBeNull()
  await capture('cancel returns to tickets'); await pane.unmount()
})


test('F116 two rapid Apply presses before completion issue one writer; error unlocks form', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': FIXTURE })
  let complete!: (r: ProcessRunResult) => void, entered!: () => void
  const started = new Promise<void>(r => { entered = r })
  const result = new Promise<ProcessRunResult>(r => { complete = r })
  w.answer = () => { entered(); return result }
  const pane = await start($,clock,'terminal')
  await pane.press({key:'key:status'}); await typeId(pane); await pane.press({key:'status:pending'})
  const first = pane.press({key:'status:apply'}), second = pane.press({key:'status:apply'})
  await started
  expect(w.runs).toHaveLength(1)
  complete(ran('',1,'timeout: check the board before retrying'))
  await Promise.all([first,second])
  expect(w.runs).toHaveLength(1)
  expect(await form($)).toMatchObject({busy:false,target:'pending',id:'f91'})
  expect(await pane.find({key:'status:apply'})).not.toBeUndefined()
  await pane.unmount()
})


test('F116 selected row resolves while collapsed header never targets hidden child; state exclusions do not execute', WITH, async ($, on) => {
  const [w,clock] = world(on,{'/r/TICKETS.md':FIXTURE+'- [~] F92 - Active\n'})
  const pane=await start($,clock,'terminal')
  await focus($,'row:F91')
  await pane.press({key:'key:status'})
  expect(await form($)).toMatchObject({id:''})
  await pane.press({key:'status:cancel'}); await pane.press({key:'head:>'}); await focus($,'row:F91')
  await pane.press({key:'key:status'}); expect(await form($)).toMatchObject({id:'F91',expectedRow:ROW,target:null})
  await typeId(pane,'F92'); expect(await pane.find({key:'status:pending'})).toBeUndefined()
  await typeId(pane,'unknown'); expect(await pane.find({key:'status:apply'})).toBeUndefined()
  expect(w.runs).toEqual([]); await pane.unmount()
})


test('F116 rapid successful Apply refreshes once; detached completion cannot overwrite a reopened draft', WITH, async ($, on) => {
  const [w,clock]=world(on,{'/r/TICKETS.md':FIXTURE})
  let complete!: (r: ProcessRunResult) => void, entered!: () => void
  const started=new Promise<void>(r=>{entered=r}), result=new Promise<ProcessRunResult>(r=>{complete=r})
  w.answer=()=>{entered();return result}
  const pane=await start($,clock,'terminal')
  await pane.press({key:'key:status'});await typeId(pane);await pane.press({key:'status:pending'})
  const reads=w.boardReads
  const first=pane.press({key:'status:apply'}),second=pane.press({key:'status:apply'})
  await started
  console.log('F116 FRAME '+JSON.stringify({cols:120,label:'busy applying',mode:'mounted primitive tree',tree:await pane.drawn()}))
  await $.command.run({command:'close',args:'ops-board',...RUN})
  await pane.press({key:'key:status'});await typeId(pane)
  w.files['/r/TICKETS.md']=FIXTURE.replace('[>]','[ ]').replace(' (deferred: after release)','')
  complete(ran('updated'))
  await Promise.all([first,second])
  expect(w.runs).toHaveLength(1);expect(w.boardReads-reads).toBe(1)
  expect(await form($)).toMatchObject({id:'f91',target:null,busy:false,expectedRow:ROW,result:null})
  await pane.unmount()
})

test('F116 rapid help claims once and errors preserve an editable form', WITH, async ($, on) => {
  const [w,clock]=world(on,{'/r/TICKETS.md':FIXTURE})
  let complete!: (r: ProcessRunResult) => void, entered!: () => void
  const started=new Promise<void>(r=>{entered=r}), result=new Promise<ProcessRunResult>(r=>{complete=r})
  w.answer=()=>{entered();return result}
  const pane=await start($,clock,'terminal')
  await pane.press({key:'key:help'});await typeId(pane)
  const first=pane.press({key:'status:help'}),second=pane.press({key:'status:help'})
  await started;complete(ran('',127,'Node unavailable'));await Promise.all([first,second])
  expect(w.runs).toHaveLength(1);expect(await form($)).toMatchObject({busy:false,helpPath:null,result:'Node unavailable'})
  expect(await pane.find({key:'status:ticket'})).not.toBeUndefined();await pane.unmount()
})


test('F116 successful completion clear retries against a new generation without erasing it or reopening the pane', WITH, async ($, on) => {
  const [w,clock]=world(on,{'/r/TICKETS.md':FIXTURE})
  w.answer=()=>ran('updated')
  let replacement: StatusDraft | null=null, injected=false
  on('state.set', async ($,e,next)=>{
    if (!injected && replacement && e.plugin==='ops-board' && e.key==='status' && e.value===null && e.previous?.busy) {
      injected=true
      // A concurrent new draft wins the version before the old clear reaches storage.
      await next({...e,value:replacement})
      // The SDK returns isSet:false here and re-executes production's update callback.
    }
    return next(e)
  })
  const pane=await start($,clock,'terminal')
  await pane.press({key:'key:status'});await typeId(pane);await pane.press({key:'status:pending'})
  const original=await form($) as StatusDraft
  replacement={...original,generation:original.generation+100,target:'blocked',reason:'new unsent reason',busy:false}
  const opens=w.opens.length
  await pane.press({key:'status:apply'})
  expect(injected).toBe(true);expect(await form($)).toEqual(replacement)
  expect(w.runs).toHaveLength(1);expect(w.opens.length).toBe(opens)
  await pane.unmount()
})
