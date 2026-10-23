// F66: teams-uhura's own tests (the listener, HMAC, the sender filter, dedupe, the body
// cap, the inbox format, the frame, the session hook, the config file) run with this
// suite, in a child node. Only in a checkout: an installed board has no skills/ beside it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const SUITE = join(import.meta.dirname, '../../../../skills/teams-uhura/scripts/team.test.mjs')

test('teams-uhura: the listener, inbox, hook and config tests pass', { skip: !existsSync(SUITE) && 'no checkout' }, () => {
  // its own runner, its own TAP: not this run's child-reporter channel
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', SUITE], { encoding: 'utf8', timeout: 120_000, env })
  const tail = (r.stdout + r.stderr).split('\n').filter(l => /^# (pass|fail)|^not ok/.test(l)).join('\n')
  assert.equal(r.status, 0, tail)
  assert.match(r.stdout, /^# fail 0$/m)
})
