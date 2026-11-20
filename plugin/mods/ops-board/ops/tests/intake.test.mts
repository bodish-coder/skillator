import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cells, screen } from '../draw'
import { initial, reduce } from '../state'
import type { State, Step } from '../state'

test('Tickets reviews, edits, accepts and rejects one intake draft', () => {
  const draft = { id: 'draft', revision: 'v1', type: 'B', title: 'Broken login', description: 'Repro', duplicates: ['B3'] }
  const call = (step: Step, args: string[], out: string) => {
    const effect = step.effects[0]
    assert.ok(effect?.kind === 'run')
    assert.equal(effect.call, 'meta-intake')
    assert.deepEqual(effect.args, args)
    const result = effect.then({ code: 0, out, err: '', argv: [] })(step.state)
    return 'effects' in result ? result : { state: result, effects: [] }
  }
  const open = (s: State, data = draft) => call(reduce(s, { name: 'i' }), ['list'], JSON.stringify([data])).state
  const start = initial(80, 24, 0)
  const review = open(start)
  for (const cols of [40, 80]) {
    const { lines } = screen({ ...review, cols }, { plain: true, color: false, ascii: false })
    assert.match(lines.join('\n'), /Broken login.*\n.*Possible duplicates: B3/)
    assert.ok(lines.every(line => cells(line) <= cols))
  }
  const edit = reduce(review, { name: 'e' }).state
  const typed = reduce(edit, { name: '!', sequence: '!' }).state
  const edited = call(reduce(typed, { name: 'return' }), [
    'edit', draft.id, 'v1', encodeURIComponent(JSON.stringify({ title: 'Broken login!', description: 'Repro' })),
  ], '{}')
  assert.equal(edited.state.intake, null)
  const reopened = open(edited.state, { ...draft, title: 'Broken login!', revision: 'v2' })
  const accepted = call(reduce(reopened, { name: 'a' }), ['accept', draft.id, 'v2'], 'B4')
  assert.deepEqual(accepted.effects, [{ kind: 'poll', what: 'board' }])
  assert.match(accepted.state.toast ?? '', /Accepted as B4/)
  assert.equal(call(reduce(review, { name: 'x' }), ['reject', draft.id, 'v1'], '{}').state.intake, null)
})
