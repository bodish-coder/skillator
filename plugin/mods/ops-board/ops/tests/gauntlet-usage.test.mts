import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { test } from 'node:test'
import { runDetails, nextPhase, stageStatus } from '../../hooks/lib/runlines'
import { parseRuns } from '../../hooks/lib/runs'
import { frame } from '../draw'
import { initial } from '../state'

const relay = new URL('../../../../skills/relay-morpheus/', import.meta.url)
const hook = fileURLToPath(new URL('hooks/gauntlet-usage.mjs', relay))
const template = readFileSync(new URL('templates/marathon-workflow.js', relay), 'utf8')

test('F189: finished Gauntlet records individual Workflow agents and resumed builder calls', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'gauntlet usage '))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const ledger = join(dir, 'run-0001-gauntlet.md')
  const resultPath = join(dir, 'result.json')
  const stage = (n, ticket) => ({ stage: n, ticket, files: ['x.ts'], code: 'ABCD', done: 'fixture', prompt: 'fixture' })
  const plan = { mode: 'parallel', phases: [[stage(1, 'F1'), stage(2, 'F2')]] }
  const scripts = { 'RUN-0001': 'const PLAN = ' + JSON.stringify(plan, null, 2) }
  writeFileSync(ledger, [
    '# RUN-0001 - Gauntlet', '', '## Stages', '| 1 | F1 | x | | | abcd |', '| 2 | F2 | - | | | - |',
    '', '## Chain', '### ABCD - stage 1 - F1', 'tickets: F1', 'triage: ACCEPT low',
    'prompt: |', '  preserve prompt', '### EFGH - stage 2 - F2', 'tickets: F2', 'triage: REJECT low',
    'triage-why: Already covered', 'prompt: |', '  preserve prompt', '',
  ].join('\r\n'))
  const run = (...args: string[]) => execFileSync(process.execPath, [hook, args[0]!, ledger, ...args.slice(1)], { encoding: 'utf8' }).trim()
  let clock = 1000
  const response = (ticket: string, verdict: string) => ({ ticket, verdict, risk: 'low', scope: 'Fixture', why: 'Evidence' })
  const execute = new Function('args', 'agent', 'pipeline', 'phase', 'log', 'Date',
    `return (async () => {
      const meta = { phases: [{ title: 'Phase 1' }] };
      const PLAN = ${JSON.stringify(plan)};
      ${template.split('// ---- nothing below is edited per run ----')[1]}
    })()`)
  const workflow = (args: object, answer: (label: string) => object) => execute(
    { phase: 1, ...args },
    async (_prompt: string, options: { label: string }) => {
      clock += 30_000
      return answer(options.label)
    },
    (items: object[], fn: (item: object) => object) => Promise.all(items.map(fn)),
    () => {}, () => {}, { now: () => clock },
  )
  const record = (rows: unknown) => {
    writeFileSync(resultPath, JSON.stringify(rows))
    run('record', resultPath)
    const saved = readFileSync(ledger, 'utf8')
    run('record', resultPath)
    assert.equal(readFileSync(ledger, 'utf8'), saved)
  }
  const triaged = await workflow({ triage: true, stages: [1, 2], usageId: 'triage' }, label =>
    label.endsWith('F1') ? response('F1', 'ACCEPT') : response('F2', 'REJECT'))
  record(triaged)
  const build = run('start', '1', 'build')
  run('finish', '1', build, 'tokens', '120')
  const fix = run('start', '1', 'build-fix')
  run('finish', '1', fix, 'usd', '0.0025')

  const reviewed = await workflow({ usageId: 'review', accepted: { 1: response('F1', 'ACCEPT') }, checked: { 1: {
    gate: { status: 'skip', reason: 'Fixture' }, route: { stage: 1, risk: 'low', files: ['x.ts'], reviewers: [{ seat: 'code-review', tier: 'build' }] },
  } } }, () => ({ ticket: 'F1', decision: 'APPROVE', evidence: 'Pass' }))
  record(reviewed)
  run('finish', '2', triaged[1].seatUsage[0].id, 'tokens', '40')
  const commit = run('start', '1', 'build-commit')
  run('finish', '1', commit)
  const text = readFileSync(ledger, 'utf8')
  assert.equal(text.match(/^seat: /gm)?.length, 6)
  assert.equal(text.match(/^  preserve prompt\r$/gm)?.length, 2)
  assert.ok(triaged.every((row: {seatUsage: { elapsedMs: number }[]}) => row.seatUsage[0]!.elapsedMs >= 30_000))
  const script = (name: string) => fileURLToPath(new URL('hooks/relay-morpheus.' + name, relay))
  const list = process.platform === 'win32'
    ? execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script('ps1'), '-Mode', 'list', '-Dir', dir], { encoding: 'utf8' })
    : execFileSync('sh', [script('sh'), 'list'], { encoding: 'utf8', env: { ...process.env, RELAY_DIR: dir } })
  const runs = parseRuns(list, { 'RUN-0001': text }, scripts)
  assert.equal(runs[0]!.done, 2)
  assert.equal(runs[0]!.metered, true)
  assert.equal(nextPhase(runs[0]!), -1)
  assert.equal(stageStatus(runs[0]!.stages[1]!, false), 'rejected')
  const details = runDetails(runs[0]!).map(l => l.segs.map(seg => seg.text).join('')).join('\n')
  assert.match(details, /Run total .* min seat time .*\$0\.0025 \+ 160 tokens \(partial usage\)/)
  assert.match(details, /F1 .* min seat time .*\$0\.0025 \+ 120 tokens \(partial usage\)/)
  assert.match(details, /F2 .*0\.50 min seat time .*40 tokens\s*$/)
  const standalone = frame({ ...initial(140, 28, 0), tab: 'runs', runs }, { color: false, ascii: false, plain: true }).join('\n')
  assert.match(standalone, /Run total .*160 tokens/)
  assert.match(standalone, /F2 .*REJECT low .*Already covered/)
})
