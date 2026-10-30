import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { findSkillsDir, gitFor, makeHost, nodeFor } from '../nodehost'
import { parseBoard } from '../../hooks/lib/board'      // proves the loader resolves the lib's own imports
import { NO_SCRIPTS, NO_SH, powershellExe, shellFor } from '../../hooks/lib/calls'
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
  assert.ok(isAbsolute(r.argv[0]!), r.argv[0])
  const m = await h.run('meta-assign', ['F1', '@a'])
  assert.match(m.out, /assign\s+F1\s+@a/)
  const none = await isolated(t, () => makeHost({ appDir: '/x', cwd: t }))
  const n = await none.run('pending', [])
  assert.deepEqual(n, { code: 127, out: '', err: NO_SCRIPTS, argv: [] })
  assert.equal(parseBoard('- [ ] F1 — a\n', 'T', 0, 0).tickets.length, 1)
})

// F66: a node call never runs a node the repo (the child's cwd) supplies - a planted
// node.exe / node in the repo root is not what runs; this process's own node is.
// A151: NoDefaultCurrentDirectoryInExePath cleared, so Windows' cwd search is on.
test('run: a node call runs this node by absolute path, not a node planted in the repo', async () => {
  const saved = process.env.NoDefaultCurrentDirectoryInExePath
  delete process.env.NoDefaultCurrentDirectoryInExePath
  try {
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
  } finally {
    if (saved === undefined) delete process.env.NoDefaultCurrentDirectoryInExePath; else process.env.NoDefaultCurrentDirectoryInExePath = saved
  }
})

test('nodeFor: this process when it is node; else PATH, absolute entries only; else none', async () => {
  const has = (...ps: string[]) => async (p: string) => ps.includes(p)
  assert.equal(await nodeFor('C:\\nodejs\\node.exe', { PATH: '.' }, true, has()), 'C:\\nodejs\\node.exe')
  assert.equal(await nodeFor('/usr/bin/node', {}, false, has()), '/usr/bin/node')
  // the Antigravity IDE (Electron) or another host binary is not node: PATH, skipping '.'
  assert.equal(await nodeFor('C:\\Antigravity\\Antigravity.exe', { Path: '.;C:\\nodejs' }, true, has('./node.exe', 'C:/nodejs/node.exe')), 'C:/nodejs/node.exe')
  assert.equal(await nodeFor('/opt/bun/bun', { PATH: '.:bin' }, false, has('./node', 'bin/node')), null)
})

// A150: a script call never runs a sh / powershell the repo (the child's cwd) supplies -
// on Windows libuv looks in the cwd before PATH. Planted ones in the repo root are not
// what runs: argv[0] is absolute and outside the repo, and the scripts still run.
// NoDefaultCurrentDirectoryInExePath (set by some hosts, Claude Code's shell among them)
// turns that cwd search off; it is cleared here so the test sees what a user's shell does.
test('run: a script call runs an absolute sh / powershell, not one planted in the repo', async () => {
  const keys = ['MSYSTEM', 'SKILLATOR_OPS_SHELL', 'NoDefaultCurrentDirectoryInExePath']
  const saved = keys.map(k => process.env[k])
  delete process.env.NoDefaultCurrentDirectoryInExePath
  const t = mkTmp(join(tmpdir(), 'ops-shell-'))
  const dir = echoSkills(join(t, 's'))
  for (const f of ['sh.exe', 'sh', 'sh.cmd', 'powershell.exe', 'powershell', 'powershell.cmd', 'git.exe', 'git']) writeFileSync(join(t, f), 'echo PLANTED\n')
  try {
    for (const shell of process.platform === 'win32' ? ['ps1', 'sh'] : ['sh']) {
      process.env.SKILLATOR_OPS_SHELL = shell
      const h = await makeHost({ appDir: '/x', cwd: t, skills: dir })
      const r = await h.run('pending-kv', [])
      assert.equal(r.code, 0, shell + ': ' + r.err)
      const a0 = fwd(r.argv[0]!)
      assert.ok(isAbsolute(a0), shell + ': ' + a0)
      assert.ok(!a0.toLowerCase().startsWith(fwd(t).toLowerCase() + '/'), shell + ' ran from the repo: ' + a0)
      assert.match(r.out, /--kv/)
      assert.doesNotMatch(r.out + r.err, /PLANTED/)
      if (shell === 'ps1') assert.equal(a0.toLowerCase(), powershellExe(process.env.SystemRoot).toLowerCase())
    }
  } finally {
    keys.forEach((k, i) => { const v = saved[i]; if (v === undefined) delete process.env[k]; else process.env[k] = v })
  }
})

test('shellFor: System32 powershell; sh by PATH (absolute entries) on Windows, /bin/sh elsewhere; else none', async () => {
  const has = (...ps: string[]) => async (p: string) => ps.includes(p)
  const PS = '/System32/WindowsPowerShell/v1.0/powershell.exe'
  assert.equal(await shellFor(true, true, { systemRoot: 'D:\\Win' }, has()), 'D:/Win' + PS)
  assert.equal(await shellFor(true, true, {}, has()), 'C:/Windows' + PS)
  assert.equal(await shellFor(true, true, { systemRoot: 'Windows' }, has()), 'C:/Windows' + PS)   // relative: the default
  assert.equal(await shellFor(true, true, { systemRoot: '\\\\host\\share' }, has()), 'C:/Windows' + PS) // UNC: the default
  assert.equal(await shellFor(false, true, { path: '.;bin;\\\\h\\s;C:\\Git\\usr\\bin' }, has('./sh.exe', 'bin/sh.exe', '//h/s/sh.exe', 'C:/Git/usr/bin/sh.exe')), 'C:/Git/usr/bin/sh.exe')
  assert.equal(await shellFor(false, true, { path: '.;bin' }, has('./sh.exe', 'bin/sh.exe')), null)
  assert.equal(await shellFor(false, false, { path: '.:' }, has('./sh')), '/bin/sh')
  assert.ok(NO_SH.includes('sh not found'))
})

test('gitFor: Windows - git.exe on PATH, absolute entries only, else none; elsewhere git (execvp: no cwd search)', async () => {
  const has = (...ps: string[]) => async (p: string) => ps.includes(p)
  assert.equal(await gitFor({ Path: '.;C:\\Git\\cmd' }, true, has('./git.exe', 'C:/Git/cmd/git.exe')), 'C:/Git/cmd/git.exe')
  assert.equal(await gitFor({ PATH: '.;tools' }, true, has('./git.exe', 'tools/git.exe')), null)
  assert.equal(await gitFor({ PATH: '/usr/bin' }, false, has()), 'git')
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
      const a0 = fwd(r.argv[0]!)
      assert.ok(isAbsolute(a0), a0)
      assert.match(basename(a0), first === 'sh' ? /^sh(\.exe)?$/i : /^powershell\.exe$/i, JSON.stringify(env))
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

test('B20 repoRoot: inside a worktree with TICKETS.md resolves to the worktree toplevel', async () => {
  const t = mkTmp(join(tmpdir(), 'ops-main-'))
  execFileSync('git', ['-c', 'safe.directory=*', 'init', '-q'], { cwd: t })
  execFileSync('git', ['-c', 'safe.directory=*', 'config', 'user.email', 'test@example.com'], { cwd: t })
  execFileSync('git', ['-c', 'safe.directory=*', 'config', 'user.name', 'test'], { cwd: t })
  writeFileSync(join(t, 'TICKETS.md'), '# Main Tickets\n')
  execFileSync('git', ['-c', 'safe.directory=*', 'add', 'TICKETS.md'], { cwd: t })
  execFileSync('git', ['-c', 'safe.directory=*', 'commit', '-m', 'initial'], { cwd: t })
  const wt = join(t, 'wt-branch')
  execFileSync('git', ['-c', 'safe.directory=*', 'worktree', 'add', '-b', 'feat-test', wt], { cwd: t })
  writeFileSync(join(wt, 'TICKETS.md'), '# Worktree Tickets\n')
  const h = await makeHost({ appDir: wt, cwd: wt })
  assert.equal(h.repoRoot, fwd(wt))
})



test('A175: main and relative linked worktree share producer inbox/read state, with distinct boards', async () => {
  const temp = mkTmp(join(tmpdir(), 'ops inbox spaces '))
  const main = join(temp, 'main checkout'), linked = join(temp, 'linked checkout')
  mkdirSync(main)
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.excludesFile=' + join(temp, 'no-ignore'), ...args], { cwd: main, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_CONFIG_GLOBAL: join(temp, 'no-config'), GIT_CONFIG_NOSYSTEM: '1' } }).trim()
  git('init', '-q')
  writeFileSync(join(main, 'TICKETS.md'), '# Tickets\n\n- [ ] F1 \u2014 main board\n', 'utf8')
  git('add', 'TICKETS.md')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture')
  git('worktree', 'add', '-q', '--relative-paths', '-b', 'linked', linked)
  writeFileSync(join(linked, 'TICKETS.md'), '# Tickets\n\n- [ ] F2 \u2014 linked board\n', 'utf8')
  const gitFile = join(linked, '.git')
  const ref = readFileSync(gitFile, 'utf8').trim().slice('gitdir: '.length)
  assert.equal(isAbsolute(ref), false)
  const admin = resolve(linked, ref)
  assert.equal(readFileSync(join(admin, 'commondir'), 'utf8').trim(), '../..')
  const { inboxDir } = await import('../../../../skills/teams-uhura/scripts/inbox.mjs')
  const dir = inboxDir(linked)!
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'team-inbox.jsonl'), JSON.stringify({ id: 'shared', from: '@fixture', ts: '2026-10-31T00:00:00Z', text: 'shared message' }) + '\n', 'utf8')
  writeFileSync(join(dir, 'team-inbox.read'), 'shared\r\n', 'utf8')
  const { makeEngine } = await import('../engine')
  const { initial } = await import('../state')
  await isolated(temp, async () => {
    for (const [cwd, ticket] of [[main, 'F1'], [linked, 'F2']]) {
      const host = await makeHost({ cwd, appDir: temp, skills: temp })
      assert.equal(host.repoRoot, fwd(cwd))
      const engine = makeEngine({ host, state: initial(80, 24, 0), email: null, once: true, onChange() {}, onQuit() {} })
      await engine.readAll()
      assert.equal(engine.state.board?.tickets[0]?.id, ticket)
      assert.deepEqual(engine.state.messages.map(m => m.id), ['shared'])
      assert.equal(engine.state.msgRead, 'shared')
      assert.equal(host.inboxDir, fwd(dir))
      engine.stop()
    }
    const host = await makeHost({ cwd: temp, appDir: temp, skills: temp })
    assert.equal(host.repoRoot, fwd(temp))
    assert.equal(host.inboxDir, null)
  })
})
