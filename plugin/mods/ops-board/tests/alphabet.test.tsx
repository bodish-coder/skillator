declare const console: { log(text: string): void }
import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunInit, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock, Mounted, Plugin } from 'claude-code/testing'

// F47: the assign / decide form, the Decided button and the team (add, remove),
// every write through ticket-meta, never a file write of the mod's own.
// B5: the forms are drawn INSIDE the ops-board pane - no second pane is opened
// (a pane opened while the board holds the keys is refused the focus and stays an
// unshown tab). Every flow here runs in the one mounted ops-board pane.

const BOARD = `# Tickets

## Open

- [~] F3 — cart drawer keeps items on reload [app: web] [owner: @vidul] (@cc-4ae496)
- [?] F2 — /orders endpoint returns the last 20 orders [app: api] [decide: @asha]
- [ ] B1 — button focus ring missing [app: ui]
- [>] A4 — dark-mode tokens for packages/ui

## Closed

- [x] F1 — product grid on the home page [app: web, ui] [by: @vidul, @asha]
`
const TEAM = '# Team\n\n- @vidul: Vidul@ikran.in\n  name: Vidul\n- @asha: asha@example.com\n  name: Asha\n'
const META = '/s/skills/tickets-zordon/scripts/ticket-meta'

type Run = { argv: readonly string[]; init: ProcessRunInit | undefined }
type Open = { id: string; title?: string; focus?: true; closeOnEscape?: true; holdToasts?: true; rows?: number }
type World = {
  files: Record<string, string>
  runs: Run[]
  opens: Open[]
  closes: string[]
  scrolls: number[]
  toasts: string[]
  writes: string[]
  answer: (argv: readonly string[]) => ProcessRunResult | null
}
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

function world(on: On, files: Record<string, string>, env: Record<string, string> = {}): [World, MockClock] {
  const w: World = { files: { ...files, [META + '.sh']: '#!/bin/sh\n' }, runs: [], opens: [], closes: [], scrolls: [], toasts: [], writes: [], answer: () => null }
  const at = (p: string) => w.files[p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')]
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, { SKILLATOR_ROOT: '/s', ...env })
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
    return f !== undefined ? { value: f } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.write', ($, e) => { w.writes.push(e.path); return { deny: 'the mod must not write files' } })
  on('process.run', ($, e) => {
    if (e.argv.join(' ') === 'git config user.email') return { value: ran('vidul@ikran.in\n') }
    // The band's background polls (pending --machine, relay list: F48) are not the form's calls.
    if (e.argv.some(a => /(pending|relay-morpheus)\.(sh|ps1)$/.test(a))) return { value: ran('', 1, 'not in this test') }
    w.runs.push({ argv: e.argv, init: e.init })
    return { value: w.answer(e.argv) ?? ran('', 1, 'unexpected call') }
  })
  on('ui.open', ($, e) => {
    w.opens.push({ id: e.id, title: e.title, focus: e.focus, closeOnEscape: e.closeOnEscape, holdToasts: e.holdToasts, rows: e.rows })
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', ($, e) => { w.closes.push(e.id); return { value: undefined } })
  on('ui.toast', ($, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.scroll', ($, e) => { w.scrolls.push(e.offset); return {} })
  // The person's ring moves (select). The mod's own $.ui.focus onto a form's first
  // element is not answered by the mock engine (no ring beneath it): it is caught,
  // and the ring's landing is the owner's live check.
  on('ui.focus', () => ({}))
  return [w, clock]
}


// F115: mounted primitive evidence, not native keyboard delivery. Focus events are
// the real ui.focus hook; the fixture may seed page data but never actionFocus.
const SEED: Plugin = { name: 'alphabet-fixture', register(on) {
  let seeded: Record<string, unknown> = {}
  on('command.run', { command: 'alphabet-seed' }, ($, e) => {
    const values = JSON.parse(e.args)
    if ('actionFocus' in values) throw new Error('focus must use ui.focus')
    seeded = { ...seeded, ...values }
    return { text: 'seeded' }
  })
  on('state.get', async ($, e, next) => {
    const result = await next(e)
    return e.plugin === 'ops-board' && e.key in seeded && result.value ? { value: { ...result.value, value: seeded[e.key] } } : result
  })
  on('state.set', ($, e, next) => {
    if (e.plugin === 'ops-board') delete seeded[e.key]
    return next(e)
  })
} }
const WITH = { plugins: [SEED] }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
const seed = async ($: Engine, ui: Ui, values: object) => {
  await $.command.run({ command: 'alphabet-seed', args: JSON.stringify(values), ...RUN }); await ui.redraw()
}
const focus = ($: Engine, element: string | undefined) => $.ui.focus({ component: 'Pane', requestId: 'ops-board', plugin: 'ops-board', element, origin: { kind: 'person' } })
type Ui = Mounted<'terminal', 'Pane'>
async function bindings(ui: Ui, expected: Record<string, string>, cols: number, label: string) {
  const buttons = await ui.findAll({ type: 'Button' })
  const active = buttons.filter(b => b.props.hotkey)
  expect(new Set(active.map(b => b.props.hotkey)).size, label).toBe(active.length)
  for (const [key, letter] of Object.entries(expected)) {
    const b = await ui.find({ key })
    expect(b?.props.hotkey, `${label} ${key}`).toBe(letter)
    expect(b?.props.plain, `${label} visible native prefix`).toBe(true)
    expect(/^[a-z]$/.test(letter)).toBe(true)
  }
  for (const box of await ui.findAll({ type: 'Box' })) {
    const controls = box.children.filter(c => typeof c === 'object' && c !== null && (c as { type?: string }).type === 'Button')
    if (controls.length > 1 && box.props.flexDirection === 'row') expect(box.props.flexWrap, box.key ?? label).toBe('wrap')
  }
  for (const b of active) {
    // The native prefix is part of the physical row budget. Other long labels
    // must retain wrapping Text / wrapping action boxes rather than truncate hints.
    if (/^(head|row):/.test(b.key ?? '') && label === 'Tickets') expect(b.text.length + 3).toBeLessThanOrEqual(cols)
    expect((`${b.props.hotkey}: ` + b.text).split(/\s+/).every(token => token.length <= cols), b.key ?? '').toBe(true)
  }
  // Preserve the actual mounted tree (keys, props, children), not idealized lines.
  console.log('F115 FRAME ' + JSON.stringify({ mode: 'mounted primitive tree', cols, label,
    tree: await ui.drawn(), buttons,
    notChecked: 'native terminal keyboard, mouse, physical emulator layout' }))
}
const inactive = async (ui: Ui) => expect((await ui.findAll({ type: 'Button' })).filter(b => b.props.hotkey)).toEqual([])
const run = (id: string, finished = false) => ({ id, title: 'long workflow name', flights: [], parked: [], total: 2, done: finished ? 2 : 0,
  stages: [], planned: false, mode: 'single', state: finished ? 'done' : 'pending', driver: null })
for (const cols of [40, 60, 80, 120]) test(`F115 alphabet contexts and mounted frame ${cols}`, WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true }); await clock.settle()
  const ui = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board',
    props: { title: 'ops board', isFocused: true, bodyColumns: cols, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} } })
  await bindings(ui, { 'key:assign':'a','key:decide':'d','key:filter':'f','key:done':'x','key:team':'t','key:reconcile':'c','key:refresh':'r' }, cols, 'Tickets')
  await ui.press({ key: 'key:filter' }); await bindings(ui, {'key:mine':'m'}, cols, 'Filters')
  await ui.select({ key: 'sel:app', value: 'web' })
  await ui.press({ key:'key:filter' })
  await ui.press({ key:'key:team' }); await bindings(ui, {'member:@vidul':'o','team:add':'a','team:remove':'r','team:lead':'l','team:back':'t'}, cols, 'Team')
  await ui.press({key:'team:remove'}); await bindings(ui, {'team:remove-yes':'y','team:remove-no':'n'}, cols, 'Team remove')
  expect((await ui.find({key:'team:add'}))?.props.hotkey).toBeUndefined()
  await ui.press({key:'team:remove-no'}); await ui.press({key:'team:add'})
  await inactive(ui)
  for (const key of ['handle','name','emails']) {
    await focus($,key); await ui.input({key, text:'adscrpyn', kind:'change'}); await inactive(ui)
  }
  expect(w.runs.filter(r=>r.argv.includes('add'))).toEqual([])
  await focus($,'add'); await bindings(ui, {add:'a',cancel:'c'}, cols, 'Add person')
  await focus($,'unknown'); await inactive(ui)
  await ui.press({key:'cancel'}); await ui.press({key:'team:back'})
  await ui.press({key:'key:assign'}); await focus($,'ticket'); await ui.input({key:'ticket', text:'aD12', kind:'change'}); await inactive(ui)
  expect((await ui.find({key:'ticket'}))?.props.value).toBe('aD12')
  await ui.input({key:'ticket', text:'B1', kind:'change'}); await focus($,'who:@asha')
  await bindings(ui, {'kind:implementation':'a','kind:decision':'d','who:@asha':'o','who:+add':'n',go:'s',cancel:'c'}, cols, 'Assignment')
  await focus($,undefined); await inactive(ui)
  await focus($,'setup:save'); await inactive(ui)
  await ui.press({key:'cancel'}); await ui.press({key:'key:assign'}); await inactive(ui); await ui.press({key:'cancel'})
  await seed($,ui,{reconcile:{rows:[{id:'B1',from:' ',to:'~',why:'commits name it'},{id:'F3',from:'~',to:'!',why:'stage failed'}],picked:[]}})
  await bindings(ui, {'rec:B1':'o','reconcile:all':'a','reconcile:none':'n'}, cols, 'Reconcile')
  expect(await ui.find({key:'reconcile:picked'})).toBeUndefined()
  await focus($,'rec:F3'); await ui.press({key:'rec:F3'}); await bindings(ui, {'rec:F3':'o','reconcile:picked':'p'}, cols,'Reconcile picked')
  await ui.press({key:'reconcile:none'})
  await seed($,ui,{tab:'runs',runs:[run('RUN-1'),run('RUN-2'),run('RUN-3',true)]})
  await bindings(ui, {'sect:runs':'r','sect:workflows':'w','sect:agents':'g','engage:RUN-1':'e','diagnose:RUN-1':'d'}, cols,'Workflows')
  await focus($,'diagnose:RUN-2'); await bindings(ui, {'engage:RUN-2':'e','diagnose:RUN-2':'d'},cols,'Workflows second')
  await focus($,'diagnose:RUN-3'); await bindings(ui, {'diagnose:RUN-3':'d'},cols,'Finished run')
  expect((await ui.findAll({type:'Button'})).some(b=>b.props.hotkey==='e')).toBe(false)
  await seed($,ui,{engage:{id:'RUN-1',queue:false,text:'/skillator:marathon-run demo'}})
  await bindings(ui, {'engage:go':'e','engage:cancel':'c'},cols,'Engage'); await ui.press({key:'engage:cancel'})
  await seed($,ui,{diagnose:{id:'RUN-1',verdict:'unfinished',lines:[],byHand:[],confirm:null,close:[1,2].map(n=>({n,sha:'123456789',why:'on HEAD',runs:'relay stage'}))}})
  await bindings(ui, {'diag:close:1':'o','diag:back':'b'},cols,'Diagnose')
  await focus($,'diag:close:2'); await bindings(ui, {'diag:close:2':'o'},cols,'Diagnose second'); await ui.press({key:'diag:close:2'})
  await bindings(ui, {'diag:close:go':'y','diag:close:cancel':'n','diag:back':'b'},cols,'Close stage')
  await ui.press({key:'diag:back'}); await seed($,ui,{tab:'health'})
  await bindings(ui, {'key:force':'f'},cols,'Health')
  await seed($,ui,{tab:'messages',messages:[{id:'m1',ts:'2026-10-27',from:'@a',email:'a@x',text:'first message'},{id:'m2',ts:'2026-10-27',from:'@b',email:'b@x',text:'second message'}]})
  await bindings(ui, {'row:m2':'o','key:markread':'m','key:setup':'s'},cols,'Messages')
  await focus($,'row:m1'); await bindings(ui, {'row:m1':'o'},cols,'Messages first'); await ui.press({key:'row:m1'})
  await ui.press({key:'key:setup'}); await inactive(ui)
  for(const key of ['setup:token','setup:url','setup:port']) { await focus($,key); await ui.input({key, text:'adscrpyn', kind:'change'}); await inactive(ui) }
  await focus($,undefined); await inactive(ui)
  await focus($,'setup:save'); await bindings(ui, {'setup:posts':'p','setup:save':'s','setup:clear':'d','setup:run':'r','setup:cancel':'c'},cols,'Setup')
  await ui.press({key:'setup:clear'}); await focus($,'setup:clear-no'); await bindings(ui, {'setup:clear-yes':'y','setup:clear-no':'n'},cols,'Setup clear'); await ui.press({key:'setup:clear-no'})
  await ui.press({key:'setup:run'}); await focus($,'setup:run-no'); await bindings(ui, {'setup:run-yes':'y','setup:run-no':'n'},cols,'Setup check'); await ui.press({key:'setup:run-no'})
  await ui.press({key:'setup:cancel'}); await seed($,ui,{tab:'explorer'})
  await bindings(ui, {'key:fetch':'f','key:pull':'p','key:push':'u','key:revert':'v','key:merge':'m','key:reload':'r'},cols,'Explorer')
  await seed($,ui,{'explorer-action':{kind:'merge',args:[],warn:[],pick:['branch-one','branch-two'],result:null,branch:'main',head:'1234'}})
  await bindings(ui, {'xb:branch-one':'o','xa:cancel':'n'},cols,'Branch picker')
  expect(await ui.find({key:'xa:go'})).toBeUndefined()
  await focus($,'xb:branch-two'); await bindings(ui, {'xb:branch-two':'o'},cols,'Branch second')
  await seed($,ui,{'explorer-action':{kind:'fetch',args:['fetch'],warn:[],pick:null,result:null,branch:'main',head:'1234'}})
  await bindings(ui, {'xa:go':'y','xa:cancel':'n'},cols,'Git confirm'); await ui.press({key:'xa:cancel'})
  await seed($,ui,{tab:'run',runFile:{path:'/r/.skillator/run.json',error:null,entries:['one','two'].map(id=>({id,name:id,kind:'npm',target:'dev',args:[],command:'npm run dev',cwd:'/r',source:'package.json',missing:false}))}})
  await bindings(ui, {'entry:one':'o','key:rescan':'r'},cols,'Build')
  await focus($,'entry:two'); await bindings(ui, {'entry:two':'o'},cols,'Build second'); await ui.press({key:'entry:two'})
  await bindings(ui, {'run:rename':'n','run:cancel':'c'},cols,'Build confirm')
  await ui.press({key:'run:rename'}); await inactive(ui); await focus($,'run:name'); await ui.input({key:'run:name', text:'adscrpyn', kind:'change'}); await inactive(ui)
  expect((await ui.find({key:'run:name'}))?.props.value).toBe('adscrpyn')
  await focus($,'run:save'); await bindings(ui, {'run:save':'s','run:cancel':'c'},cols,'Build rename')
  await focus($,'ticket'); await inactive(ui); await ui.press({key:'run:cancel'})
  await ui.unmount()
})
