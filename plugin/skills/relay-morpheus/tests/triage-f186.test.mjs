import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const template = readFileSync(join(root, 'templates/marathon-workflow.js'), 'utf8')
const scope = 'Keep export within the existing schema'
const results = [
  { ticket: 'F1', verdict: 'REJECT', scope: 'Export link', risk: 'low', why: 'Already available' },
  { ticket: 'F2', verdict: 'ACCEPT', scope, risk: 'high', why: 'The file format is a public contract' },
  { ticket: 'F3', verdict: 'NEEDS-INFO', scope: 'Report layout', risk: 'medium', why: 'The owner must choose a layout' },
]

const stages = results.map((result, i) => ({
  stage: i + 1, code: 'AAA' + (i + 1), ticket: result.ticket,
  files: [`file-${i}.md`], done: 'Check the published result', prompt: 'Implement ' + result.ticket,
}))

const driver = template.split('// ---- nothing below is edited per run ----')[1]
const workflow = new Function('args', 'agent', 'phase', 'log', 'pipeline',
  'return (async () => { const PLAN = ' + JSON.stringify({
    run: 'RUN-0001', runWorktree: 'run-root', mode: 'parallel', phases: [stages],
  }) + ';\n' + driver + '\n})()')

test('Workflow triages every selected pending stage and only builds ACCEPT with the recorded risk', async () => {
  const calls = []
  const agent = (prompt, { label }) => {
    calls.push({ prompt, label })
    return results.find(result => label.endsWith('triage:' + result.ticket))
  }
  const pipeline = (items, ...seats) => Promise.all(items.map(async item => {
    let previous
    for (const [i, seat] of seats.entries()) previous = await (i ? seat(previous, item) : seat(item))
    return previous
  }))
  const run = args => workflow({ phase: 1, ...args }, agent, () => {}, () => {}, pipeline)

  assert.deepEqual((await run({ triage: true, stages: [1, 2, 3] })).map(row => row.triage), results)
  assert.equal(calls.length, 3)
  assert.ok(calls.every(({ label, prompt }) => label.includes('triage:') && prompt.includes('Read only.')))
  await assert.rejects(run({}), /record triage/)
  await assert.rejects(run({ accepted: { 1: results[0] } }), /valid ACCEPT/)
  await assert.rejects(run({ accepted: { 3: results[2] } }), /valid ACCEPT/)
  const built = await run({ accepted: { 2: results[1] }, worktrees: { 2: 'ticket-root' } })
  assert.deepEqual(built.map(row => row.ticket), ['F2'])
  assert.deepEqual(calls.slice(3).map(call => call.label), ['AAA2 fix:F2', 'AAA2 verify:F2'])
  assert.match(calls[3].prompt, new RegExp('high risk.*' + scope))
  assert.match(calls[3].prompt, /ticket-root/)
  assert.match(calls[4].prompt, /Risk: high/)
})

const windows = process.platform === 'win32'
const powershell = windows ? 'powershell.exe' : 'pwsh'
const gitSh = 'C:/Program Files/Git/bin/sh.exe'
const shell = windows ? gitSh : 'sh'
const boardStates = ['| 1 | F1 | - |', '| 2 | F2 | x |', '| 3 | F3 | ? |']
const relay = {
  ps: {
    available: windows || process.env.TEST_PWSH === '1',
    executable: powershell,
    prefix: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'hooks/relay-morpheus.ps1')],
    triage: (n, result) => ['-Mode', 'chain', '-Action', 'triage', '-N', n, '-Verdict', result.verdict,
      '-Risk', result.risk, '-Scope', result.scope, '-Why', result.why],
    park: ['-Mode', 'park', '-N', '3', '-Ticket', 'F3', '-Reason', 'taste', '-Header', 'Layout',
      '-Question', 'Which layout should ship?', '-Option1', 'Grid | dense | small labels', '-Option2',
      'List | readable | more scrolling', '-Default', 'List', '-Files', 'file-2.md', '-Blocks', 'F3', '-Stop', 'none'],
    dispatch: n => ['-Mode', 'chain', '-Action', 'dispatch', '-N', n, '-Driver', '@test'],
    landed: ['-Mode', 'stage', '-N', '2', '-State', 'x', '-Owner', 'test', '-Landed', 'a1b2c3d'],
    next: ['-Mode', 'chain', '-Action', 'next'],
  },
  sh: {
    available: !windows || existsSync(gitSh),
    executable: shell,
    prefix: [join(root, 'hooks/relay-morpheus.sh').replaceAll('\\', '/')],
    triage: (n, result) => ['chain', 'triage', n, result.verdict, result.risk, result.scope, result.why],
    park: ['park', '--stage', '3', '--ticket', 'F3', '--reason', 'taste', '--header', 'Layout',
      '--question', 'Which layout should ship?', '--option', 'Grid | dense | small labels', '--option',
      'List | readable | more scrolling', '--default', 'List', '--files', 'file-2.md', '--blocks', 'F3', '--stop', 'none'],
    dispatch: n => ['chain', 'dispatch', n, '--driver', '@test'],
    landed: ['stage', '2', 'x', 'test', 'a1b2c3d'],
    next: ['chain', 'next'],
  },
}

for (const [host, cli] of Object.entries(relay)) {
  test(`${host} records all triage verdicts in the ledger and queues the genuine decision`, { skip: !cli.available }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-f186-'))
    try {
      const ledger = join(dir, 'run-0001-triage.md')
      writeFileSync(ledger, [
        '# RUN-0001 - triage fixture', '', '## Stages',
        '| # | stage | state | owner | heartbeat | landed |',
        '|---|---|---|---|---|---|',
        ...stages.map(it => `| ${it.stage} | ${it.ticket} |   | - | - | - |`),
        '', '## In flight', '', '## Chain', 'driver: -     hold: -     mode: workflow',
        ...stages.flatMap(it => [
          `### ${it.code} - stage ${it.stage} - ${it.ticket}`, `tickets: ${it.ticket}`,
          'files: ' + it.files[0], ...(it.stage === 2 ? ['after: 1'] : []),
          'prompt: |', '  ' + it.prompt,
        ]),
        '', '## Rulings', '',
      ].join('\n'))
      const run = args => execFileSync(cli.executable, [...cli.prefix, ...args], {
        cwd: dir, env: { ...process.env, RELAY_DIR: dir.replaceAll('\\', '/'), RELAY_LEVEL_CMD: 'echo src=host 5h=30 7d=30 ctx=- max=-' },
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      })
      assert.throws(() => run(cli.triage('1', { ...results[0], risk: 'critical' })))
      assert.throws(() => run(cli.triage('1', { ...results[0], scope: 'two\nlines' })))
      run(cli.triage('1', results[0]))
      run(cli.triage('1', results[0]))
      assert.throws(() => run(cli.dispatch('1')))
      run(cli.triage('2', results[1]))
      assert.throws(() => run(cli.triage('3', results[2])), /needs a parked decision/)
      assert.match(run(cli.park), /Q1/)
      run(cli.triage('3', results[2]))
      assert.throws(() => run(cli.dispatch('3')))
      assert.match(run(cli.next), /^NEXT 2 AAA2/m)
      run(cli.dispatch('2'))
      run(cli.landed)
      assert.match(run(cli.next), /^ASK 1 /m)
      const finalLedger = readFileSync(ledger, 'utf8')
      for (const state of boardStates) assert.ok(finalLedger.includes(state), finalLedger)
      for (const result of results) {
        const record = `triage: ${result.verdict} ${result.risk}\ntriage-scope: ${result.scope}\ntriage-why: ${result.why}\n`
        assert.ok(finalLedger.includes(record), finalLedger)
        assert.equal(finalLedger.split(record).length, 2)
      }
      assert.match(finalLedger, /\| 1 \| F1 \| - \| - \| [^|]+ \| - \|/)
      assert.match(finalLedger, /\| 2 \| F2 \| x \| test \| [^|]+ \| a1b2c3d \|/)
      assert.match(finalLedger, /### Q1 open .*\nparked: stage 3 \(AAA3\)\nticket: F3/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}
