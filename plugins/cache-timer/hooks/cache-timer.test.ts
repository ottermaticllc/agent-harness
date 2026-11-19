import { expect, test } from 'claude-code/testing'

import { label, ttlOf } from './register'

test('counts down from the lifetime the response reported, then expires', () => {
  const t0 = 1_000_000
  expect(label(null, t0)).toBe(undefined)
  expect(label({ sentAt: t0, ttl: '1h' }, t0 + 25 * 60000 + 1)).toBe('35m left (1h cache)')
  expect(label({ sentAt: t0, ttl: '5m' }, t0)).toBe('5m left (5m cache)')
  expect(label({ sentAt: t0, ttl: '5m' }, t0 + 5 * 60000)).toBe('cache expired')
})

test('reads the lifetime from usage; a read-only response says nothing', () => {
  expect(ttlOf({ ephemeral_1h_input_tokens: 900, ephemeral_5m_input_tokens: 0 })).toBe('1h')
  expect(ttlOf({ ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 900 })).toBe('5m')
  expect(ttlOf({})).toBe(undefined)
  expect(ttlOf(null)).toBe(undefined)
})
