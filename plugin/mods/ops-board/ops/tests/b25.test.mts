import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initial, openHelp, point, reduce, startRunCommand } from '../state'
import type { PointerAction, State } from '../state'
import { actionConfirmSegs, explorerBody } from '../explorer'
import { frame, frameSegs, screen } from '../draw'
import { healthLines } from '../../hooks/lib/healthlines'
import { clean } from '../../hooks/lib/bandlines'

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
const textOf = (s: State) => frame(s, { color: false, ascii: false }).join('\n')

test('B25: Explorer action bar and confirm buttons have hitboxes', () => {
  let s: State = { ...initial(80, 24, Date.now()), tab: 'explorer' }
  const scr = screen(s, { color: false, ascii: false })
  // Action bar buttons present in hits
  const cBtn = scr.hits.find(h => h.action.kind === 'key' && h.action.key.name === 'c')
  const pBtn = scr.hits.find(h => h.action.kind === 'key' && h.action.key.name === 'p')
  const uBtn = scr.hits.find(h => h.action.kind === 'key' && h.action.key.name === 'u')
  const mBtn = scr.hits.find(h => h.action.kind === 'key' && h.action.key.name === 'm')
  const bBtn = scr.hits.find(h => h.action.kind === 'key' && h.action.key.name === 'b')
  assert.ok(cBtn, 'commit button hit present')
  assert.ok(pBtn, 'pull button hit present')
  assert.ok(uBtn, 'push button hit present')
  assert.ok(mBtn, 'merge button hit present')
  assert.ok(bBtn, 'switch button hit present')

  // When an action confirm modal is up with branch picker
  s = {
    ...s,
    explorer: {
      ...s.explorer,
      action: {
        kind: 'switch',
        args: [],
        warn: [],
        pick: ['main', 'feature-b', 'dev'],
        result: null,
        branch: 'main',
        head: '1234567',
      },
    },
  }
  const confScr = screen(s, { color: false, ascii: false })
  const nHit = confScr.hits.find(h => h.action.kind === 'key' && h.action.key.name === 'escape')
  const branchHit = confScr.hits.find(h => h.action.kind === 'explorer-branch' && h.action.branch === 'feature-b')
  assert.ok(nHit, 'cancel button hit present')
  assert.ok(branchHit, 'branch picker hit present')

  // Clicking a branch in picker selects it and populates args
  const picked = point(s, { kind: 'explorer-branch', branch: 'dev' })
  assert.equal(picked.state.explorer.action?.args.at(-1), 'dev')
  assert.equal(picked.state.explorer.action?.pick, null)

  // Once a branch is picked, run button hit is present
  const pickedScr = screen(picked.state, { color: false, ascii: false })
  const yHit = pickedScr.hits.find(h => h.action.kind === 'key' && h.action.key.name === 'y')
  assert.ok(yHit, 'run button hit present after picking branch')
})

test('B25: Explorer message deduplication against toast and action result', () => {
  const s: State = {
    ...initial(80, 24, Date.now()),
    tab: 'explorer',
    toast: 'Everything up to date',
    explorer: {
      ...initial(80, 24, Date.now()).explorer,
      x: {
        ...initial(80, 24, Date.now()).explorer.x,
        actionNotice: 'Everything up to date',
        error: 'Everything up to date',
      },
    },
  }
  const body = explorerBody(s, 16)
  const allText = body.flat().map(seg => seg.text).join(' ')
  // It shouldn't repeat 'Everything up to date' in the body
  assert.ok(!allText.includes('Everything up to date'), 'actionNotice and error suppressed when toast matches')
})

test('B25: Deduplicate AI review findings against warnings', () => {
  const segs = actionConfirmSegs({
    kind: 'commit',
    args: ['commit'],
    warn: ['Uncommitted changes will be lost'],
    pick: null,
    branch: 'main',
    head: '1234567',
    aiReview: {
      source: 'local',
      status: 'advisory',
      findings: ['Uncommitted changes will be lost', 'Large binary file detected'],
    },
    result: null,
  })
  const text = segs.map(r => r.map(s => s.text).join('')).join('\n')
  // 'Uncommitted changes will be lost' should only appear once under warn '! ', not under '• '
  const occurrences = text.split('Uncommitted changes will be lost').length - 1
  assert.equal(occurrences, 1)
  assert.ok(text.includes('Large binary file detected'))
})

test('B25: Health tab action buttons in healthlines are removed from plain text', () => {
  const lines = healthLines({
    level: 'yellow',
    reasons: ['disk 88%'],
    fiveHour: { pct: 40, resetIn: '2h' },
    sevenDay: { pct: 60, resetIn: '3d' },
    held: false,
    machineMuted: false,
  })
  const joined = lines.join('\n')
  // Should NOT contain the old plain text button line [r refresh] · [u resume]
  assert.ok(!joined.includes('[r refresh]'), 'plain text action buttons removed from healthlines')
  assert.ok(!joined.includes('[u resume]'), 'plain text action buttons removed from healthlines')
})

test('B25: Engage and Reconcile modals have clickable button hitboxes', () => {
  // Reconcile modal
  let s: State = {
    ...initial(80, 24, Date.now()),
    reconcile: {
      proposals: [],
      rows: ['[x] F12 Done', '[ ] F13 In progress'],
      index: 0,
    },
  }
  let scr = screen(s, { color: false, ascii: false })
  const recEnter = scr.hits.find(h => h.action.kind === 'key' && h.action.key.name === 'return')
  const recA = scr.hits.find(h => h.action.kind === 'key' && h.action.key.name === 'a')
  const recEsc = scr.hits.find(h => h.action.kind === 'key' && h.action.key.name === 'escape')
  assert.ok(recEnter, 'reconcile enter button hit present')
  assert.ok(recA, 'reconcile accept all hit present')
  assert.ok(recEsc, 'reconcile escape hit present')

  // Engage modal
  s = {
    ...initial(80, 24, Date.now()),
    engage: {
      id: 'RUN-1',
      text: 'continue RUN-1',
      queue: true,
    },
  }
  scr = screen(s, { color: false, ascii: false })
  const engEnter = scr.hits.find(h => h.action.kind === 'key' && h.action.key.name === 'return')
  const engEsc = scr.hits.find(h => h.action.kind === 'key' && h.action.key.name === 'escape')
  assert.ok(engEnter, 'engage enter button hit present')
  assert.ok(engEsc, 'engage escape button hit present')

  // Engage keys: 'y' also confirms, 'n' cancels
  const engConfirmY = reduce(s, { name: 'y' })
  assert.equal(engConfirmY.state.engage, null)
  assert.equal(engConfirmY.effects[0]?.kind, 'run')

  const engCancelN = reduce(s, { name: 'n' })
  assert.equal(engCancelN.state.engage, null)
  assert.equal(engCancelN.effects.length, 0)
})

test('B25: Start Run modal clicking on focused runner or mode cycles value', () => {
  let s: State = {
    ...initial(80, 24, Date.now()),
    startRun: {
      runner: 'pending-sentinel',
      mode: 'parallel',
      count: null,
      tickets: '',
      field: 'mode',
    },
  }
  // Clicking 'mode' again when already focused cycles it (parallel -> parallel count 2)
  const cycled = point(s, { kind: 'start-run-field', field: 'mode' })
  assert.equal(cycled.state.startRun?.count, 2)

  // Clicking 'runner' focuses runner
  s = { ...s, startRun: { ...s.startRun!, field: 'tickets' } }
  const focusedRunner = point(s, { kind: 'start-run-field', field: 'runner' })
  assert.equal(focusedRunner.state.startRun?.field, 'runner')

  // Clicking 'runner' again cycles runner
  const cycledRunner = point(focusedRunner.state, { kind: 'start-run-field', field: 'runner' })
  assert.equal(cycledRunner.state.startRun?.runner, 'gauntlet-run')
})

test('B25: Team confirm separate question and button actions', () => {
  const s: State = {
    ...initial(80, 24, Date.now()),
    tab: 'tickets',
    showTeam: true,
    teamConfirm: '@asha',
  }
  // 'n' cancels teamConfirm
  const canceled = reduce(s, { name: 'n' })
  assert.equal(canceled.state.teamConfirm, null)
  assert.equal(canceled.effects.length, 0)

  // 'y' triggers remove
  const confirmed = reduce(s, { name: 'y' })
  assert.equal(confirmed.state.teamConfirm, null)
  assert.equal(confirmed.effects[0]?.kind, 'run')
})

test('B25: Modal boxes taller than available room preserve bottom action buttons', () => {
  const s: State = {
    ...initial(80, 10, Date.now()),
    reconcile: {
      proposals: [],
      rows: Array.from({ length: 20 }, (_, i) => `[ ] row ${i}`),
      index: 0,
    },
  }
  const rendered = textOf(s)
  // Must contain the action buttons even with tight 10 rows height
  assert.match(rendered, /apply picked|accept all/)
})
