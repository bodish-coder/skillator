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
const TABS: State['tab'][] = ['tickets', 'runs', 'health', 'messages', 'explorer', 'run']

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
