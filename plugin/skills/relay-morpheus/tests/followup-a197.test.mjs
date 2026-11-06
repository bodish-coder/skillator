import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PS1 = join(ROOT, 'hooks', 'relay-morpheus.ps1')
const SH = join(ROOT, 'hooks', 'relay-morpheus.sh')
const PWSH = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

function runPs1(relayDir, args) {
  try {
    const out = execFileSync(
      PWSH,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, ...args],
      {
        env: { ...process.env, RELAY_DIR: relayDir },
        encoding: 'utf8',
      },
    )
    return { code: 0, out, err: '' }
  } catch (e) {
    return {
      code: e.status ?? 1,
      out: String(e.stdout ?? ''),
      err: String(e.stderr ?? ''),
    }
  }
}

test('A197: push-pending creates a distinct follow-up run, migrates only eligible pending stages, preserves provenance/dependencies/mode, and refuses when none eligible', () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-a197-'))
  try {
    const sourceRun = [
      '# RUN-0008 - audit fixes batch',
      'plan: TICKETS.md',
      'branch: run/RUN-0008-audit',
      '',
      '## Stages',
      '| # | stage | state | owner | heartbeat | landed |',
      '|---|---|---|---|---|---|',
      '| 1 | AAA1 F10 | x | build | 2026-11-06T01:00Z | a1b2c3d |',
      '| 2 | AAA2 F20 | ~ | build | 2026-11-06T01:05Z | - |',
      '| 3 | AAA3 F30 |   | - | - | - |',
      '| 4 | AAA4 F31 | pending | - | - | - |',
      '',
      '## In flight',
      '### stage 2 — F20',
      'by: @cc-1',
      '',
      '## Chain',
      'driver: -     hold: -     mode: sequential',
      '### AAA1 - stage 1 - F10 done stage',
      'tickets: F10',
      'files: src/a.ts',
      'prompt: |',
      '  implement F10',
      '### AAA2 - stage 2 - F20 in-flight stage',
      'tickets: F20',
      'files: src/b.ts',
      'prompt: |',
      '  implement F20',
      '### AAA3 - stage 3 - F30 first pending stage',
      'tickets: F30',
      'files: src/c.ts',
      'after: 1',
      'prompt: |',
      '  implement F30',
      '### AAA4 - stage 4 - F31 dependent pending stage',
      'tickets: F31',
      'files: src/d.ts',
      'after: 3',
      'prompt: |',
      '  implement F31 after stage 3',
      '',
      '## Rulings',
      '',
    ].join('\n')

    writeFileSync(join(dir, 'run-0008-audit-fixes-batch.md'), sourceRun, 'utf8')

    // 1. Push pending stages with chosen mode = parallel
    const res = runPs1(dir, ['-Mode', 'queue-run', '-Sub', 'push-pending', '-Id', 'RUN-0008', '-ChainMode', 'parallel'])
    assert.equal(res.code, 0, `Expected exit 0, got ${res.code}: ${res.err}\n${res.out}`)
    assert.match(
      res.out.trim(),
      /^FOLLOWUP RUN-0009 moved=2 stages=3,4 tickets=F30,F31 mode=parallel from=RUN-0008$/,
    )

    // 2. Verify distinct follow-up run file was created on disk
    const files = readdirSync(dir).filter(f => f.startsWith('run-0009-') && f.endsWith('.md'))
    assert.equal(files.length, 1, `Expected 1 follow-up run file, found: ${files.join(', ')}`)
    const followupText = readFileSync(join(dir, files[0]), 'utf8')

    // Provenance and mode preserved
    assert.match(followupText, /^# RUN-0009 - Follow-up from RUN-0008/m)
    assert.match(followupText, /^followup_from: RUN-0008$/m)
    assert.match(followupText, /^mode: parallel$/m)
    assert.match(followupText, /^Follow-up from: RUN-0008$/m)
    assert.match(followupText, /^driver: -\s+hold: -\s+mode: parallel$/m)

    // Only eligible stages 3 and 4 moved; stages 1 and 2 are NOT in follow-up run
    assert.match(followupText, /^\|\s*3\s*\|\s*AAA3 F30\s*\|/m)
    assert.match(followupText, /^\|\s*4\s*\|\s*AAA4 F31\s*\|/m)
    assert.ok(!/^\|\s*1\s*\|/m.test(followupText), 'Stage 1 (landed) must not be in follow-up run')
    assert.ok(!/^\|\s*2\s*\|/m.test(followupText), 'Stage 2 (in-flight) must not be in follow-up run')

    // Chain blocks, files:, and after: dependencies preserved in follow-up run
    assert.match(followupText, /### AAA3 - stage 3 - F30 first pending stage[\s\S]*?tickets: F30[\s\S]*?files: src\/c\.ts[\s\S]*?after: 1/)
    assert.match(followupText, /### AAA4 - stage 4 - F31 dependent pending stage[\s\S]*?tickets: F31[\s\S]*?files: src\/d\.ts[\s\S]*?after: 3/)

    // 3. Verify source run marked stages 3 and 4 as '>' moved to RUN-0009 and left stages 1 and 2 intact
    const updatedSource = readFileSync(join(dir, 'run-0008-audit-fixes-batch.md'), 'utf8')
    assert.match(updatedSource, /^\|\s*1\s*\|\s*AAA1 F10\s*\|\s*x\s*\|/m)
    assert.match(updatedSource, /^\|\s*2\s*\|\s*AAA2 F20\s*\|\s*~\s*\|/m)
    assert.match(updatedSource, /^\|\s*3\s*\|\s*AAA3 F30\s*\|\s*>\s*\|\s*-\s*\|\s*[^|]+\|\s*RUN-0009 stage 3\s*\|/m)
    assert.match(updatedSource, /^\|\s*4\s*\|\s*AAA4 F31\s*\|\s*>\s*\|\s*-\s*\|\s*[^|]+\|\s*RUN-0009 stage 4\s*\|/m)

    // 4. Verify queue.md contains the new follow-up run RUN-0009
    const queueText = readFileSync(join(dir, 'queue.md'), 'utf8')
    assert.match(queueText, /\|\s*RUN-0009\s*\|\s*queued\s*\|/m)

    // 5. Verify chain next on RUN-0009 treats parent stage 1 as satisfied and dispatches stage 3 before stage 4
    const nextRes = runPs1(dir, ['-Mode', 'chain', '-Action', 'next', '-Id', 'RUN-0009'])
    assert.equal(nextRes.code, 0)
    assert.match(nextRes.out, /^NEXT 3 AAA3\r?$/m)
    assert.match(nextRes.out, /^IDLE 4 - after 3\r?$/m)

    // 6. Calling push-pending again on RUN-0008 (no eligible pending stages left) refuses with non-zero exit
    const refused = runPs1(dir, ['-Mode', 'queue-run', '-Sub', 'push-pending', '-Id', 'RUN-0008', '-ChainMode', 'sequential'])
    assert.notEqual(refused.code, 0, 'Expected non-zero exit when no eligible stages remain')
    assert.match(refused.err + refused.out, /REFUSED: no eligible pending stages in RUN-0008 to push/)
    const afterRefusedFiles = readdirSync(dir).filter(f => /^run-\d+/.test(f))
    assert.equal(afterRefusedFiles.length, 2, 'Refusal must not create an extra follow-up run file')

    // 7. Verify relay-morpheus.sh has the matching cmd_push_pending contract
    const shText = readFileSync(SH, 'utf8')
    assert.match(shText, /cmd_push_pending\(\)/)
    assert.match(shText, /FOLLOWUP \$_pp_new_id moved=\$_pp_cnt stages=\$_pp_stages tickets=\$_pp_tks mode=\$_pp_eff_md from=\$_pp_src/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
