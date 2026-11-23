import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseBoard } from '../../hooks/lib/board.ts'
import { parseTeam } from '../../hooks/lib/team.ts'
import { argvFor, decideQuestionsPrompt, holoTicketCmd } from '../../hooks/lib/calls.ts'
import {
  buildModel,
  userHeadText,
  UNI,
  ASCII,
  lineKey,
} from '../../hooks/lib/ticketsmodel.ts'

const BOARD_TEXT = [
  '# Tickets',
  '- [~] F3 — cart drawer keeps items on reload [app: web] [owner: @vidul] (@cc-4ae496)',
  '- [!] B2 — /orders 500s past page 3 [app: api] [owner: @asha] [by: @asha]',
  '- [?] F2 — /orders endpoint returns the last 20 orders [app: api] [decide: @asha]',
  '- [?] F1 — dark mode palette [app: web] [decide: @vidul]',
  '- [ ] B1 — button focus ring missing [app: ui] [owner: @asha]',
  '- [>] A4 — dark-mode tokens for packages/ui',
].join('\n')

const TEAM_TEXT = [
  '# Team',
  'lead: @asha',
  '- @vidul (Vidul): vidul@example.com',
  '- @asha (Asha): asha@example.com',
].join('\n')

test('A199: personalGroups and buildModel compute Assigned/Decide sections, headers, folding, and rawTicketId', () => {
  const board = parseBoard(BOARD_TEXT, '/r/TICKETS.md', 1000, BOARD_TEXT.length)
  const team = parseTeam(TEAM_TEXT).members
  const baseView = {
    board,
    team,
    me: '@vidul',
    filter: { app: null, who: null, mine: false, showDone: false },
    filterOpen: false,
    selected: null as string | null,
    expanded: null as string | null,
    open: [] as ('~' | '%' | '!' | '?' | ' ' | '>' | 'x' | '-')[],
    open: ['unfold:assigned', 'unfold:decide'],
    cols: 80,
  }

  const mVidul = buildModel(baseView)
  assert.equal(mVidul.userGroups.length, 2)
  assert.equal(userHeadText(mVidul.userGroups[0]!, UNI, false), '▾ Assigned (1)')
  assert.equal(userHeadText(mVidul.userGroups[1]!, UNI, false), '▾ Mine to decide (1)')
  assert.equal(mVidul.userGroups[1]!.color, 'autoAccept')     // F170: F168's decision pink
  assert.equal(userHeadText(mVidul.userGroups[0]!, ASCII, true), 'v Assigned (1)')
  assert.deepEqual(mVidul.items.slice(0, 5), [
    'head:assigned',
    'assigned:F3',
    'head:decide',
    'decide:F1',
    'head:~',
  ])

  // Selecting a personalized row resolves m.ticket to the raw ticket ID
  const mSelectedAssigned = buildModel({ ...baseView, selected: 'assigned:F3' })
  assert.equal(mSelectedAssigned.selected, 'assigned:F3')
  assert.equal(mSelectedAssigned.ticket, 'F3')
  assert.equal(lineKey(mSelectedAssigned.selected!), 'row:assigned:F3')

  // Folding Assigned hides assigned:F3 and lands selection on head:assigned
  const mFoldedAssigned = buildModel({ ...baseView, selected: 'assigned:F3', open: ['unfold:decide'] })
  assert.equal(userHeadText(mFoldedAssigned.userGroups[0]!, UNI, false), '▸ Assigned (1)')
  assert.ok(!mFoldedAssigned.items.includes('assigned:F3'))
  assert.equal(mFoldedAssigned.selected, 'head:assigned')
  assert.equal(mFoldedAssigned.ticket, null)

  // Switching active user to @asha refreshes Assigned (2: B2, B1) and Mine to decide (1: F2)
  const mAsha = buildModel({ ...baseView, me: '@asha' })
  assert.equal(userHeadText(mAsha.userGroups[0]!, UNI, false), '▾ Assigned (2)')
  assert.equal(userHeadText(mAsha.userGroups[1]!, UNI, false), '▾ Mine to decide (1)')
  assert.deepEqual(mAsha.userGroups[0]!.tickets.map(t => t.id), ['B2', 'B1'])
  assert.deepEqual(mAsha.userGroups[1]!.tickets.map(t => t.id), ['F2'])
})

test('A199 + A200: native pane.tsx, teamview.tsx, register.tsx, and assign.tsx wire personalized sections, active-member selection, and tester assignment', () => {
  const paneSrc = readFileSync(new URL('../../hooks/pane.tsx', import.meta.url), 'utf8')
  const teamSrc = readFileSync(new URL('../../hooks/teamview.tsx', import.meta.url), 'utf8')
  const regSrc = readFileSync(new URL('../../hooks/register.tsx', import.meta.url), 'utf8')
  const assignSrc = readFileSync(new URL('../../hooks/assign.tsx', import.meta.url), 'utf8')

  // The pane stores personal and status folds in the same atom.
  assert.match(paneSrc, /update\(\$, openA, x => toggleUserSection\(x, sec\)\)/)
  assert.match(paneSrc, /for\s*\(\s*const\s+ug\s+of\s+m\.userGroups\s*\)/)
  assert.match(paneSrc, /toggleUserGroup\(\$,\s*ug\.id\)/)

  // Verify teamview.tsx and register.tsx connect active-member selection to meA
  assert.match(teamSrc, /update\(\$,\s*meA,\s*\(\)\s*=>\s*m\.handle\)/)
  assert.match(regSrc, /update\(\$,\s*meA,\s*\(\)\s*=>\s*to\)/)

  // Verify assign.tsx offers kind:tester radio option, routes confirm to meta-assign-tester, and refreshes boardA
  assert.match(assignSrc, /radio\('tester',\s*'tester'\)/)
  assert.match(assignSrc, /'kind:tester'/)
  assert.match(assignSrc, /d\.kind\s*===\s*'tester'\s*\?\s*'meta-assign-tester'/)
  assert.match(assignSrc, /d\.kind\s*===\s*'tester'\s*\?\s*'assign-tester'/)
  assert.match(assignSrc, /refreshBoardTicket/)
})

test('A200: real temporary-board backend fixture verifies unprivileged teammate can assign/reassign tester while preserving owner, decide, and box state', () => {
  const repoRoot = resolve(fileURLToPath(new URL('../../../../..', import.meta.url)))
  const skillsDir = join(repoRoot, 'plugin', 'skills')
  const tmp = mkdtempSync(join(tmpdir(), 'a200-tester-fixture-'))
  try {
    const gitConfig = join(tmp, 'gitconfig').replace(/\\/g, '/')
    writeFileSync(gitConfig, '[user]\n\tname = Vidul\n\temail = vidul@example.com\n[safe]\n\tdirectory = *\n', 'utf8')
    const env = {
      ...process.env,
      HOME: tmp,
      USERPROFILE: tmp,
      XDG_CONFIG_HOME: tmp,
      GIT_CONFIG_GLOBAL: gitConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      SKILLATOR_ME: '',
      SKILLATOR_SESSION: '',
      CLAUDE_CODE_SESSION_ID: '',
      PATH: 'C:/Program Files/Git/cmd;C:/Program Files/Git/usr/bin;C:/Program Files/Git/bin;' + (process.env.PATH ?? ''),
    }
    const run = (bin: string, args: string[]) =>
      spawnSync(bin, args, { cwd: tmp, env, encoding: 'utf8' })

    const initRes = run('git', ['init', '-q', '.'])
    assert.equal(initRes.status, 0, `git init failed: ${initRes.stderr || initRes.stdout}`)
    assert.equal(run('git', ['config', 'core.autocrlf', 'false']).status, 0)
    assert.equal(run('git', ['config', 'user.email', 'vidul@example.com']).status, 0)

    const skillatorDir = join(tmp, '.skillator')
    mkdirSync(skillatorDir, { recursive: true })
    writeFileSync(join(tmp, '.gitignore'), '.skillator/\ngitconfig\n', 'utf8')
    writeFileSync(
      join(skillatorDir, 'team.md'),
      '# Team\n\nlead: @asha\n- @asha: asha@example.com\n- @vidul: vidul@example.com\n',
      'utf8',
    )

    // Verify non-Windows argvFor command shape explicitly
    assert.deepEqual(
      argvFor('meta-assign-tester', false, skillsDir, ['F10', '@vidul'], '/bin/sh'),
      ['/bin/sh', `${skillsDir.replace(/\\/g, '/')}/tickets-zordon/scripts/ticket-meta.sh`, 'assign-tester', 'F10', '@vidul'],
    )

    for (const isWin of [true, false]) {
      const shell = isWin
        ? 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
        : 'C:/Program Files/Git/bin/sh.exe'
      if (!isWin) {
        const probe = run(shell, ['-c', 'exit 0'])
        if (probe.status !== 0 && /NtCreateDirectoryObject/i.test(probe.stderr || probe.stdout || '')) continue
      }

      const initialTickets = [
        '# Tickets',
        '- [ ] F10 — Pending feature [owner: @asha] [decide: @asha]',
        '- [~] F11 — In-progress feature [owner: @asha] [tester: @asha]',
        '- [%] F12 — Testing feature [owner: @asha] [decide: @vidul] [tester: @asha] (testing: verify live)',
        '',
      ].join('\n')
      writeFileSync(join(tmp, 'TICKETS.md'), initialTickets, 'utf8')

      // 1. Ordinary meta-assign by unprivileged @vidul is refused because @asha is team lead
      const assignArgv = argvFor('meta-assign', isWin, skillsDir, ['F10', '@vidul'], shell)
      const refused = run(assignArgv[0]!, assignArgv.slice(1))
      assert.notEqual(refused.status, 0, `expected meta-assign to be refused for non-lead (${isWin ? 'ps' : 'sh'})`)

      // 2. Tester assignment (meta-assign-tester) by unprivileged @vidul succeeds on [ ], [~], and [%]
      for (const id of ['F10', 'F11', 'F12']) {
        const testerArgv = argvFor('meta-assign-tester', isWin, skillsDir, [id, '@vidul'], shell)
        const ok = run(testerArgv[0]!, testerArgv.slice(1))
        assert.equal(ok.status, 0, `meta-assign-tester ${id} failed (${isWin ? 'ps' : 'sh'}): ${ok.stderr || ok.stdout}`)
      }

      const afterText = readFileSync(join(tmp, 'TICKETS.md'), 'utf8')
      const parsed = parseBoard(afterText, join(tmp, 'TICKETS.md'), Date.now(), afterText.length)
      const f10 = parsed.tickets.find(t => t.id === 'F10')!
      const f11 = parsed.tickets.find(t => t.id === 'F11')!
      const f12 = parsed.tickets.find(t => t.id === 'F12')!

      // Box states preserved ([ ], [~], [%])
      assert.equal(f10.box, ' ')
      assert.equal(f11.box, '~')
      assert.equal(f12.box, '%')

      // Owner and decide tags preserved
      assert.equal(f10.owner, '@asha')
      assert.equal(f10.decide, '@asha')
      assert.equal(f11.owner, '@asha')
      assert.equal(f12.owner, '@asha')
      assert.equal(f12.decide, '@vidul')

      // Tester assigned/reassigned to @vidul on all three tickets
      assert.equal(f10.tester, '@vidul')
      assert.equal(f11.tester, '@vidul')
      assert.equal(f12.tester, '@vidul')
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('F174: pane.tsx, assign.tsx, status.tsx, and calls.ts wire Decide chooser (a) Assign a decider, (h) Decision page, (q) MCQ decision', () => {
  const paneSrc = readFileSync(new URL('../../hooks/pane.tsx', import.meta.url), 'utf8')
  const assignSrc = readFileSync(new URL('../../hooks/assign.tsx', import.meta.url), 'utf8')
  const statusSrc = readFileSync(new URL('../../hooks/status.tsx', import.meta.url), 'utf8')

  assert.match(paneSrc, /import\s*\{[^}]*\bopenDecide\b[^}]*\}\s*from\s*'\.\/status'/)
  assert.match(paneSrc, /key="key:decide".*openDecide\(\$,\s*m\.ticket,\s*els\.canType\)/)
  assert.doesNotMatch(assignSrc, /export\s*\{[^}]*\bopenDecide\b[^}]*\}/)
  assert.match(statusSrc, /^export async function openDecide\(/m)
  assert.match(statusSrc, /key="decide:assign".*hotkey=\{armed \? 'a' : undefined\}.*Assign a decider/)
  assert.match(statusSrc, /key="status:help".*hotkey=\{armed \? 'h' : undefined\}.*Decision page/)
  assert.match(statusSrc, /key="decide:questions".*hotkey=\{armed \? 'q' : undefined\}.*MCQ decision/)
  assert.match(statusSrc, /\$\.prompt\.submit\(\{\s*text\s*\}\)/)

  const prompt = decideQuestionsPrompt('F174')
  assert.ok(prompt.includes('F174'))
  assert.ok(prompt.includes('AskUserQuestion'))
  assert.ok(prompt.includes('ticket-meta decided'))
  assert.doesNotMatch(prompt, /^\//)
  assert.equal(holoTicketCmd('F174'), 'node <skills>/holo-r2d2/scripts/holo.mjs --ticket F174 --html')
})

