import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Cache } from '../types'

const TTL_MS = { '5m': 5 * 60000, '1h': 60 * 60000 }

// 5 minutes is the API default; the real lifetime is read from each response's usage (see below).
const cache = atom({ plugin: 'cache-timer', key: 'cache' } as const, null as Cache | null)

export const label = (c: Cache | null, now: number): string | undefined => {
  if (c === null) return undefined
  const left = Math.ceil((c.sentAt + TTL_MS[c.ttl] - now) / 60000)
  return left > 0 ? `${left}m left (${c.ttl} cache)` : 'cache expired'
}

// Which lifetime the response says its cache write used; undefined when it wrote nothing.
export const ttlOf = (u: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null) =>
  u?.ephemeral_1h_input_tokens ? '1h' : u?.ephemeral_5m_input_tokens ? '5m' : undefined

const show = async ($: EngineInterface) => $.ui.status(label(await read($, cache), await $.clock.now()))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    $.clock.every(60000, () => show($))
    await show($)
    return r
  })

  // Each main-thread request refreshes the cache; subagents have their own.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const sentAt = await $.clock.now()
    // Until a response names its lifetime, assume the API default (5m), or keep the last one seen.
    await update($, cache, c => ({ sentAt, ttl: c?.ttl ?? '5m' }))
    await show($)
    const result = yield* next(e)
    const ttl = ttlOf(result.usage)
    if (ttl) {
      await update($, cache, c => ({ sentAt: c?.sentAt ?? sentAt, ttl }))
      await show($)
    }
    return result
  })
}
