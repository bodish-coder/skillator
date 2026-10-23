import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { findSkillsDir, makeHost, nodeFor } from '../nodehost'
import { parseBoard } from '../../hooks/lib/board'      // proves the loader resolves the lib's own imports
import { NO_SCRIPTS } from '../../hooks/lib/calls'
import { skills, echoSkills } from './fixtures'
const tmpDirs: string[] = []
const mkTmp = (prefix: string): string => { const d = mkdtempSync(prefix); tmpDirs.push(d); return d }
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) })

const fwd = (p: string) => p.replace(/\\/g, '/')

// makeHost reads process.env: point every lookup at an empty temp home for the call, so
// this machine's own plugin install is not found.
const KEYS = ['SKILLATOR_ROOT', 'CLAUDE_CONFIG_DIR', 'HOME', 'USERPROFILE']
async function isolated<T>(home: string, f: () => Promise<T>): Promise<T> {
  const saved = KEYS.map(k => process.env[k])
  delete process.env.SKILLATOR_ROOT
  delete process.env.CLAUDE_CONFIG_DIR
  process.env.HOME = home
  process.env.USERPROFILE = home
  try { return await f() } finally {
    KEYS.forEach((k, i) => { const v = saved[i]; if (v === undefined) delete process.env[k]; else process.env[k] = v })
  }
}

test('findSkillsDir: repo tree, installed dest, SKILLATOR_ROOT, installPath', () => {
  const t = mkTmp(join(tmpdir(), 'ops-'))
  const repo = skills(join(t, 'r/skills'))
  assert.equal(findSkillsDir(join(t, 'r/mods/ops-board/ops'), {}, existsSync, () => null), repo)
  const dest = skills(join(t, 'd'))
  assert.equal(findSkillsDir(join(t, 'd/ops-board/ops'), {}, existsSync, () => null), dest)
  assert.equal(findSkillsDir('/nowhere', { SKILLATOR_ROOT: join(t, 'r') }, existsSync, () => null), repo)
  assert.equal(findSkillsDir('/nowhere', { SKILLATOR_ROOT: join(t, 'd') }, existsSync, () => null), dest)
  assert.equal(findSkillsDir('/nowhere', { HOME: t }, existsSync, () => ({ plugins: { 'skillator@skillator': [{ installPath: join(t, 'r') }] } })), repo)
  assert.equal(findSkillsDir('/nowhere', {}, existsSync, () => null), null)
})

test('findSkillsDir: installed_plugins.json under CLAUDE_CONFIG_DIR, else HOME/.claude', () => {
  const t = mkTmp(join(tmpdir(), 'ops-'))
  const repo = skills(join(t, 'r/skills'))
  const seen: string[] = []
  const json = (p: string) => { seen.push(fwd(p)); return { plugins: { 'skillator@skillator': [{ installPath: join(t, 'r') }] } } }
  assert.equal(findSkillsDir('/nowhere', { CLAUDE_CONFIG_DIR: '/cfg', HOME: '/h' }, existsSync, json), repo)
  assert.equal(findSkillsDir('/nowhere', { HOME: '/h' }, existsSync, json), repo)
  assert.deepEqual(seen, ['/cfg/plugins/installed_plugins.json', '/h/.claude/plugins/installed_plugins.json'])
})

test('run: argv from the call table, cwd = repo root, never rejects', async () => {
  const t = mkTmp(join(tmpdir(), 'ops-'))
  const dir = echoSkills(join(t, 's'))
  const h = await makeHost({ appDir: '/x', cwd: t, skills: dir })
  assert.equal(h.skillsDir, dir)
  assert.equal(h.repoRoot, fwd(t))                                   // not a git repo: the cwd
  const r = await h.run('pending-kv', [])
  assert.equal(r.code, 0, r.err)
  assert.match(r.out, /--kv/)
  assert.ok(r.out.includes(basename(t)), 'ran in the repo root: ' + r.out)
  assert.equal(r.argv[0], h.win ? 'powershell' : 'sh')
  const m = await h.run('meta-assign', ['F1', '@a'])
  assert.match(m.out, /assign\s+F1\s+@a/)
  const none = await isolated(t, () => makeHost({ appDir: '/x', cwd: t }))
  const n = await none.run('pending', [])
  assert.deepEqual(n, { code: 127, out: '', err: NO_SCRIPTS, argv: [] })
  assert.equal(parseBoard('- [ ] F1 — a\n', 'T', 0, 0).tickets.length, 1)
})

// F66: a node call never runs a node the repo (the child's cwd) supplies - a planted
// node.exe / node in the repo root is not what runs; this process's own node is.
test('run: a node call runs this node by absolute path, not a node planted in the repo', async () => {
  const t = mkTmp(join(tmpdir(), 'ops-node-'))
  const dir = echoSkills(join(t, 's'))
  mkdirSync(join(dir, 'teams-uhura/scripts'), { recursive: true })
  writeFileSync(join(dir, 'teams-uhura/scripts/team.mjs'), 'console.log(process.execPath)\n')
  for (const f of ['node.exe', 'node', 'node.cmd', 'node.bat']) writeFileSync(join(t, f), 'echo PLANTED\n')
  const h = await makeHost({ appDir: '/x', cwd: t, skills: dir })
  const r = await h.run('team-config-show', [])
  assert.equal(r.code, 0, r.err)
  assert.equal(r.argv[0], process.execPath)
  assert.equal(r.out.trim(), process.execPath)
  assert.doesNotMatch(r.out + r.err, /PLANTED/)
})

test('nodeFor: this process when it is node; else PATH, absolute entries only; else none', async () => {
  const has = (...ps: string[]) => async (p: string) => ps.includes(p)
  assert.equal(await nodeFor('C:\\nodejs\\node.exe', { PATH: '.' }, true, has()), 'C:\\nodejs\\node.exe')
  assert.equal(await nodeFor('/usr/bin/node', {}, false, has()), '/usr/bin/node')
  // the Antigravity IDE (Electron) or another host binary is not node: PATH, skipping '.'
  assert.equal(await nodeFor('C:\\Antigravity\\Antigravity.exe', { Path: '.;C:\\nodejs' }, true, has('./node.exe', 'C:/nodejs/node.exe')), 'C:/nodejs/node.exe')
  assert.equal(await nodeFor('/opt/bun/bun', { PATH: '.:bin' }, false, has('./node', 'bin/node')), null)
})

// A142: under Git Bash (ops.sh, or MSYSTEM set) the .sh port runs, not the .ps1.
test('the script spelling: Windows runs .ps1; Git Bash (ops.sh or MSYSTEM) runs .sh', async () => {
  const keys = ['OS', 'MSYSTEM', 'SKILLATOR_OPS_SHELL']
  const saved = keys.map(k => process.env[k])
  const set = (env: Record<string, string>) => { for (const k of keys) { if (k in env) process.env[k] = env[k]; else delete process.env[k] } }
  const t = mkTmp(join(tmpdir(), 'ops-'))
  const dir = echoSkills(join(t, 's'))
  try {
    const cases: [Record<string, string>, string][] = [
      [{ OS: 'Windows_NT' }, 'powershell'],                                         // plain Windows (ops.ps1)
      [{ OS: 'Windows_NT', MSYSTEM: 'MINGW64' }, 'sh'],                             // a Git Bash shell
      [{ OS: 'Windows_NT', SKILLATOR_OPS_SHELL: 'sh' }, 'sh'],                      // launched by ops.sh
      [{ OS: 'Windows_NT', MSYSTEM: 'MINGW64', SKILLATOR_OPS_SHELL: 'ps1' }, 'powershell'], // ops.ps1 started from Git Bash
      [{}, 'sh'],                                                                   // not Windows
    ]
    for (const [env, first] of cases) {
      set(env)
      const h = await makeHost({ appDir: '/x', cwd: t, skills: dir })
      const r = await h.run('meta-assign', ['F1', '@a'])
      assert.equal(r.argv[0], first, JSON.stringify(env))
      assert.equal(h.win, first === 'powershell', JSON.stringify(env))
      assert.match(r.argv.join(' '), first === 'sh' ? /ticket-meta\.sh assign F1 @a$/ : /ticket-meta\.ps1 assign F1 @a$/)
    }
  } finally {
    keys.forEach((k, i) => { const v = saved[i]; if (v === undefined) delete process.env[k]; else process.env[k] = v })
  }
})

test('run: a script that is not there comes back non-zero, not a rejection', async () => {
  const t = mkTmp(join(tmpdir(), 'ops-'))
  const dir = skills(join(t, 's'))                                   // marker only, no relay script
  const h = await makeHost({ appDir: '/x', cwd: t, skills: dir })
  const r = await h.run('relay-list', [])
  assert.notEqual(r.code, 0)
  assert.ok(r.argv.length > 0)
})

test('run: spawn throwing synchronously (a NUL byte in an arg) resolves code -1, never rejects', async () => {
  const t = mkTmp(join(tmpdir(), 'ops-'))
  const dir = echoSkills(join(t, 's'))
  const h = await makeHost({ appDir: '/x', cwd: t, skills: dir })
  const r = await h.run('meta-assign', ['F1\0', '@a'])
  assert.equal(r.code, -1)
  assert.ok(r.err.length > 0)
  assert.ok(r.argv.length > 0)
})

test('stat, read, gitEmail', async () => {
  const t = mkTmp(join(tmpdir(), 'ops-'))
  writeFileSync(join(t, 'TICKETS.md'), 'abc')
  const h = await makeHost({ appDir: '/x', cwd: t })
  assert.equal((await h.stat(join(t, 'TICKETS.md')))?.size, 3)
  assert.equal((await h.stat('TICKETS.md'))?.size, 3)                // relative: against the repo root
  assert.equal(await h.stat(join(t, 'nope.md')), null)
  assert.equal(await h.read(join(t, 'TICKETS.md')), 'abc')
  const e = await h.gitEmail()
  assert.ok(e === null || typeof e === 'string')
})

test('repoRoot: inside a git checkout is the main checkout, from a subdirectory too', async () => {
  const here = join(import.meta.dirname, '..')                       // mods/ops-board/ops
  const h = await makeHost({ appDir: here, cwd: here })
  assert.ok(existsSync(join(h.repoRoot, '.git')), h.repoRoot)
  assert.ok(!h.repoRoot.endsWith('/.git'))
})
