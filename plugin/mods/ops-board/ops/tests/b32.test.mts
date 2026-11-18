import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { frame } from '../draw'
import { initial, onMachine } from '../state'
import type { State } from '../state'
import { ownProfile } from '../status'

// B32 (repro, RUN-0040 s310): the ops board as Antigravity (agy) opens it.

// The table `p` reads (`ops --status --refresh`), a claude and an agy profile with model rows.
const PROFILES = 'profile  5h used  7d used\nclaude   13%      94%\n  Opus   -        40%\n  Fable  -        43%\nagy      5%       20%\n  Gemini -        20%\n'
const MACHINE = 'DRIVE=C:\nDISK_FREE=90000000000\nDISK_TOTAL=1\nMEM_FREE=5000000000\nHOLD=-\n'

test('B32: Health at 80x24 with the profiles table still shows every Machine row', () => {
  const s: State = { ...onMachine({ ...initial(80, 24, 0), tab: 'health' }, MACHINE, 0).state, profiles: PROFILES }
  const f = frame(s, { color: false, ascii: false, plain: true }).join('\n')
  assert.match(f, /Gemini/)
  assert.match(f, /Stale locks/, 'the Health body is cut off below the profiles table:\n' + f)
})

test('B32: a board started from agy (ANTIGRAVITY_APP_DATA_DIR, as usage-watch reads it) names the agy profile', () => {
  const home = mkdtempSync(join(tmpdir(), 'b32-'))
  const dir = join(home, '.gemini', 'antigravity-cli').replace(/\\/g, '/')
  mkdirSync(dir, { recursive: true })
  assert.equal(ownProfile({ HOME: home, ANTIGRAVITY_APP_DATA_DIR: dir })?.cli, 'agy')
})
