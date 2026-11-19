export type Nudge = { percent: number; nudged: number; dismissed: boolean }

declare module 'claude-code' {
  interface PluginState {
    'context-nudge': { nudge: Nudge }
  }
}
