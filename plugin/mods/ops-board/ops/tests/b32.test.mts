import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { frame } from '../draw'
import { initial, onMachine } from '../state'
import type { State } from '../state'
import { ownProfile } from '../status'
import { makeEngine } from '../engine'

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
  assert.equal(ownProfile({
    HOME: home,
    SKILLATOR_CLI: 'agy',
    CLAUDE_CONFIG_DIR: join(home, '.claude-work'),
    ANTIGRAVITY_APP_DATA_DIR: dir,
  })?.dir, dir)
})

test('B32: the board reads the profile table once at open - a plain read, never --refresh - and says so meanwhile', async () => {
  const asked: boolean[] = []
  let done = (_: string) => {}
  const host = {
    win: false, skillsDir: '/s', repoRoot: '/r', inboxDir: '/common/skillator',
    stat: async () => ({ mtimeMs: 1, size: 20 }),
    read: async (p: string) => (p.endsWith('TICKETS.md') ? '- [ ] F1 — Example\n' : ''),
    run: async (call: string) => ({ code: 0, err: '', argv: [], out: call === 'pending-machine' ? MACHINE : '' }),
    git: async () => ({ code: 0, err: '', out: '', argv: [] }),
    write: async () => undefined,
    bins: async () => ({ npm: [], sh: null, ps: null, make: null }),
    gitEmail: async () => null,
    spawn: () => ({ stop() {} }),
    status: (refresh: boolean) => { asked.push(refresh); return new Promise<any>(r => { done = out => r({ code: 0, out, err: '', argv: [] }) }) },
  }
  const e = makeEngine({ host: host as any, state: { ...initial(80, 24, 0), tab: 'health' }, email: null, once: false, onChange: () => {}, onQuit: () => {} })
  try {
    await e.start()
    assert.deepEqual(asked, [false])
    assert.match(frame(e.state, { color: false, ascii: false, plain: true }).join('\n'), /reading every profile\.\.\./)
    done(PROFILES)
    await new Promise(r => setTimeout(r, 0))
    assert.equal(e.state.profiles, PROFILES)
  } finally { e.stop() }
})

test('B32: Health with a toast at 80x24 marks the rows it leaves out and keeps the Machine rows', () => {
  const s: State = { ...onMachine({ ...initial(80, 24, 0), tab: 'health' }, MACHINE, 0).state, profiles: PROFILES, toast: '↻ profiles read' }
  const f = frame(s, { color: false, ascii: false, plain: true }).join('\n')
  assert.match(f, /\+\d+ more/)
  assert.match(f, /Stale locks/)
})

test('B32: the Health footer names p as the on-demand status read', () => {
  const s: State = { ...initial(80, 24, 0), tab: 'health' }
  assert.match(frame(s, { color: false, ascii: false, plain: true }).join('\n'), /p re-read status/)
})
