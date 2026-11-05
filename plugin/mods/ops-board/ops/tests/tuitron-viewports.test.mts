import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ansi, cells, frame, frameSegs, plain, screen } from '../draw'
import { initial, onBoard, onRuns, openHelp, openStartRun, reduce } from '../state'
import type { State } from '../state'
import type { Box } from '../../types'
import { parseBoard } from '../../hooks/lib/board'
import { BOARD } from '../../tests/fixtures'

const ALL: Box[] = ['~', '%', '!', '?', ' ', '>', 'x', '-']
const fresh = onBoard(initial(80, 24, 0), parseBoard(BOARD, 'T', 1, 1), [{ handle: '@asha', emails: [] }, { handle: '@vidul', emails: [] }], null)
const s: State = { ...fresh, open: ALL, selected: 'B2' }
const P = { color: false, ascii: false, plain: true }

const RUNS_BODY = `RUN-0012  the ops board  2/4 done
RUN-0026  marathon run   3/5 done
`
const withRuns = onRuns(s, RUNS_BODY, 0)

const VIEWPORT_WIDTHS = [40, 60, 80, 100, 120]
const TABS: State['tab'][] = ['tickets', 'runs', 'health', 'messages', 'explorer', 'run', 'help']

test('A165: Tui-tron exhaustive multi-width viewport validation across 40, 60, 80, 100, 120 columns', () => {
  for (const cols of VIEWPORT_WIDTHS) {
    for (const rows of [18, 24, 35]) {
      for (const tab of TABS) {
        const tabState: State = { ...withRuns, tab, cols, rows }
        const sc = screen(tabState, P)

        // 1. Frame height matches rows exactly
        assert.equal(sc.lines.length, rows, `Tab ${tab} at ${cols}x${rows} lines count mismatch`)

        // 2. No line exceeds column width
        sc.lines.forEach((l, idx) => {
          const width = cells(l)
          assert.ok(
            width <= cols,
            `Tab ${tab} at ${cols}x${rows} line ${idx + 1} overflowed (${width} > ${cols}): "${l}"`
          )
          // 3. No broken box drawing or mojibake characters
          assert.doesNotMatch(l, /[\uFFFD]|Γö|ΓöÇ/, `Mojibake or broken box character in tab ${tab} line ${idx + 1}`)
        })

        // 4. Hitbox coordinate validation
        for (const hit of sc.hits) {
          assert.ok(hit.x >= 1, `Hit x < 1 for ${JSON.stringify(hit.action)} at ${cols}x${rows}`)
          assert.ok(hit.y >= 1, `Hit y < 1 for ${JSON.stringify(hit.action)} at ${cols}x${rows}`)
          assert.ok(hit.y <= rows, `Hit y > rows (${hit.y} > ${rows}) for ${JSON.stringify(hit.action)} at ${cols}x${rows}`)
          assert.ok(hit.width >= 1, `Hit width < 1 for ${JSON.stringify(hit.action)} at ${cols}x${rows}`)
          assert.ok(
            hit.x + hit.width - 1 <= cols,
            `Hit x+width exceeds cols (${hit.x}+${hit.width}-1 > ${cols}) for ${JSON.stringify(hit.action)} at ${cols}x${rows}`
          )
        }
      }
    }
  }
})

test('A165: Modals layout and hitbox validation across 40, 60, 80, 100, 120 columns', () => {
  for (const cols of VIEWPORT_WIDTHS) {
    for (const rows of [24, 35]) {
      // 1. Start Run modal (F113)
      const srState = openStartRun({ ...withRuns, tab: 'runs', cols, rows }).state
      assert.ok(srState.startRun)
      const srScreen = screen(srState, P)
      assert.equal(srScreen.lines.length, rows)
      srScreen.lines.forEach((l, idx) => {
        assert.ok(cells(l) <= cols, `StartRun at ${cols}x${rows} line ${idx + 1} overflowed: "${l}"`)
      })
      for (const hit of srScreen.hits) {
        assert.ok(hit.x >= 1 && hit.x + hit.width - 1 <= cols, `StartRun hitbox out of bounds at ${cols} cols`)
      }

      // 2. Help modal (F127)
      const helpState = openHelp({ ...s, cols, rows }).state
      assert.ok(helpState.help)
      const helpScreen = screen(helpState, P)
      assert.equal(helpScreen.lines.length, rows)
      helpScreen.lines.forEach((l, idx) => {
        assert.ok(cells(l) <= cols, `Help at ${cols}x${rows} line ${idx + 1} overflowed: "${l}"`)
      })
      for (const hit of helpScreen.hits) {
        assert.ok(hit.x >= 1 && hit.x + hit.width - 1 <= cols, `Help hitbox out of bounds at ${cols} cols`)
      }

      // 3. Assign modal
      const assignState = reduce({ ...s, cols, rows }, { name: 'a' }).state
      if (assignState.dialog) {
        const assignScreen = screen(assignState, P)
        assert.equal(assignScreen.lines.length, rows)
        assignScreen.lines.forEach((l, idx) => {
          assert.ok(cells(l) <= cols, `Assign at ${cols}x${rows} line ${idx + 1} overflowed: "${l}"`)
        })
        for (const hit of assignScreen.hits) {
          assert.ok(hit.x >= 1 && hit.x + hit.width - 1 <= cols, `Assign hitbox out of bounds at ${cols} cols`)
        }
      }
    }
  }
})

test('A165: Bracketed button badges and focus highlight verification', () => {
  for (const cols of [60, 80, 100, 120]) {
    const rState = { ...withRuns, tab: 'runs' as const, cols, rows: 24 }
    const sc = screen(rState, P)

    // Check button badges [s Start], [Engage], [Rerun], [Push Pending], [Mode: ...]
    const fullText = sc.lines.join('\n')
    assert.match(fullText, /\[s Start\]/)
    assert.match(fullText, /\[Engage\]/)
    assert.match(fullText, /\[Rerun\]/)
    assert.match(fullText, /\[Push Pending\]/)
    assert.match(fullText, /\[Mode:/)

    // Verify badges match hit targets exactly
    const startHit = sc.hits.find(h => h.action.kind === 'key' && (h.action as any).key.name === 's')
    assert.ok(startHit, `Start run hitbox found at ${cols} cols`)
    const line = sc.lines[startHit.y - 1]!
    const slice = line.slice(startHit.x - 1, startHit.x - 1 + startHit.width)
    assert.equal(slice, '[s Start]', `Hitbox text matches badge exactly at ${cols} cols`)

    const engageHit = sc.hits.find(h => h.action.kind === 'key' && (h.action as any).key.name === 'e')
    assert.ok(engageHit, `Engage hitbox found at ${cols} cols`)
    const engageLine = sc.lines[engageHit.y - 1]!
    const engageSlice = engageLine.slice(engageHit.x - 1, engageHit.x - 1 + engageHit.width)
    assert.equal(engageSlice, '[Engage]', `Hitbox text matches badge exactly at ${cols} cols`)
  }
})

test('Health tab bracketed action badges, cell budgets, hitboxes, and ASCII fallback across 40, 60, 80, 100, 120 columns', () => {
  for (const cols of VIEWPORT_WIDTHS) {
    for (const rows of [18, 24, 35]) {
      const hState: State = {
        ...withRuns,
        tab: 'health' as const,
        cols,
        rows,
        toast: '↻ Usage & health refreshed: 5h 41% · 7d 55%',
      }
      const sc = screen(hState, P)

      // 1. Frame height matches rows exactly
      assert.equal(sc.lines.length, rows)

      // 2. No line overflows cols and zero mojibake
      sc.lines.forEach((l, idx) => {
        const width = cells(l)
        assert.ok(width <= cols, `Health at ${cols}x${rows} line ${idx + 1} overflowed (${width} > ${cols}): "${l}"`)
        assert.doesNotMatch(l, /[\uFFFD]|Γö|ΓöÇ/, `Mojibake or broken box character in health line ${idx + 1}`)
      })

      // 3. Verify exact cell-width budgets on in-body Actions lines when vertical room fits full healthBody (rows >= 24)
      if (rows >= 24) {
        const actionsIdx = sc.lines.findIndex(l => l.trim() === 'Actions')
        assert.ok(actionsIdx >= 0, `Actions header present at ${cols}x${rows}`)
        if (cols < 60) {
          assert.equal(sc.lines[actionsIdx + 1], '  [r refresh]  [R resume]')
          assert.equal(cells(sc.lines[actionsIdx + 1]!), 25)
          assert.equal(sc.lines[actionsIdx + 2], '  [c resume CLI]  [F force resume]')
          assert.equal(cells(sc.lines[actionsIdx + 2]!), 34)
        } else {
          assert.equal(sc.lines[actionsIdx + 1], '  [r refresh]  [R resume]  [c resume CLI]  [F force resume]')
          assert.equal(cells(sc.lines[actionsIdx + 1]!), 59)
        }
      }

      // 4. Verify action hitboxes exist in footer (all row heights) and body (rows >= 24) and match exact badge text
      for (const [keyName, expectedText, expectedWidth] of [
        ['r', '[r refresh]', 11],
        ['R', '[R resume]', 10],
        ['c', '[c resume CLI]', 14],
        ['F', '[F force resume]', 16],
      ] as const) {
        const matchingHits = sc.hits.filter(h => h.action.kind === 'key' && (h.action as any).key.name === keyName)
        assert.ok(matchingHits.length >= (rows >= 24 ? 2 : 1), `Expected hitboxes for ${keyName} at ${cols}x${rows}`)
        for (const hit of matchingHits) {
          assert.equal(hit.width, expectedWidth)
          assert.ok(hit.x >= 1 && hit.x + hit.width - 1 <= cols)
          const slice = sc.lines[hit.y - 1]!.slice(hit.x - 1, hit.x - 1 + hit.width)
          assert.equal(slice, expectedText, `Hitbox slice mismatch for ${keyName} at ${cols}x${rows}`)
        }
      }

      // 5. Verify ASCII fallback (ascii: true) emits no codepoint > 127
      const asciiSc = screen(hState, { color: false, ascii: true, plain: true })
      asciiSc.lines.forEach((l, idx) => {
        assert.ok(cells(l) <= cols, `ASCII Health at ${cols}x${rows} line ${idx + 1} overflowed`)
        const bad = [...l].filter(ch => (ch.codePointAt(0) ?? 0) > 127)
        assert.deepEqual(bad, [], `ASCII fallback leaked non-ASCII at ${cols}x${rows} line ${idx + 1}: ${JSON.stringify(bad)}`)
      })
    }
  }
})

