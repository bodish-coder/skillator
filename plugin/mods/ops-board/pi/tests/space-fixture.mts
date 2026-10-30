import assert from 'node:assert/strict'
import { keyOf } from '../../ops/app'
import { initial, reduce } from '../../ops/state'
import type { Key, State } from '../../ops/state'

export function checkSpace(key: Key | null, ctrlKey?: Key | null): void {
  assert.ok(key)
  const standalone = keyOf(' ', { name: 'space' })!
  const team: State = { ...initial(80, 24, 0), showTeam: true, team: [{ handle: '@asha', emails: [] }] }
  const reconcile: State = { ...initial(80, 24, 0), reconcile: {
    rows: [{ id: 'A1', from: ' ', to: '~', why: 'started' }], picked: [], index: 0,
  } }
  const person: State = { ...reduce(team, { name: 'n' }).state, personField: 'name' }
  for (const state of [team, reconcile, person]) {
    const expected = reduce(state, standalone)
    assert.deepEqual(reduce(state, key), expected)
  }
  assert.equal(reduce(team, key).state.me, '@asha')
  const picked = reduce(reconcile, key).state
  assert.deepEqual(picked.reconcile!.picked, ['A1'])
  assert.deepEqual(reduce(picked, key).state.reconcile!.picked, [])
  assert.equal(reduce(person, key).state.person!.name, ' ')
  assert.deepEqual(key, standalone)
  if (ctrlKey) {
    assert.deepEqual(ctrlKey, keyOf(' ', { name: 'space', ctrl: true }))
    assert.deepEqual(reduce(person, ctrlKey), { state: person, effects: [] })
  }
}
