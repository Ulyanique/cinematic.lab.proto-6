import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateProperty } from '../src/core/easing.ts'
import { HistoryManager } from '../src/core/history.ts'

test('evaluateProperty returns static values unchanged', () => {
  assert.equal(evaluateProperty(42, 1.5), 42)
  assert.deepEqual(evaluateProperty([1, 2, 3], 0), [1, 2, 3])
})

test('evaluateProperty interpolates numbers and vec3 keyframes', () => {
  const prop = [
    { time: 0, value: 0, easing: 'linear' },
    { time: 2, value: 100 },
  ]
  assert.equal(evaluateProperty(prop, -1), 0)
  assert.equal(evaluateProperty(prop, 1), 50)
  assert.equal(evaluateProperty(prop, 3), 100)

  const vecProp = [
    { time: 0, value: [0, 0, 0], easing: 'linear' },
    { time: 1, value: [10, 20, -10] },
  ]
  assert.deepEqual(evaluateProperty(vecProp, 0.5), [5, 10, -5])
})

test('HistoryManager supports push, undo, redo, and clears future on new push', () => {
  const history = new HistoryManager({ count: 0 })
  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, false)

  history.push({ count: 1 })
  history.push({ count: 2 })
  assert.equal(history.state.count, 2)
  assert.equal(history.canUndo, true)

  history.undo()
  assert.equal(history.state.count, 1)
  assert.equal(history.canRedo, true)

  history.redo()
  assert.equal(history.state.count, 2)

  history.undo()
  history.push({ count: 99 })
  assert.equal(history.canRedo, false)
  assert.equal(history.state.count, 99)
})
