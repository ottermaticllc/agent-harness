export type IsOn = boolean

declare module 'claude-code' {
  interface PluginState {
    'short-and-sweet': { isOn: boolean; hasReply: boolean }
  }
}
