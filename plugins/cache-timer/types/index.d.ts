export type Cache = { sentAt: number; ttl: '5m' | '1h' }

declare module 'claude-code' {
  interface PluginState {
    'cache-timer': { cache: Cache | null }
  }
}
