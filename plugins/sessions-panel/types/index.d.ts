// What scripts/sessions.py --panel reports.
export type Proc = {
  pid: number
  ppid: number
  kind: string
  cpu_percent: number
  memory_mb: number
  started?: number
  command: string
  ports?: string[]
}

export type Subagent = {
  id: string
  task: string
  prompt: string
  type?: string
  model?: string
  started?: number
  last_active: number
  running: boolean
  context_tokens?: number
  tokens_used: number
  tool_calls: number
}

export type Session = {
  pid: number
  name: string
  location: string
  status?: string
  session_id?: string
  cwd?: string
  started_at?: number
  last_activity?: number
  last_message?: string
  last_message_full?: string
  last_message_at?: number
  cpu_percent: number
  memory_mb: number
  context_tokens?: number
  context_window?: number
  tokens_used?: number
  cache_expires_at?: number
  subagents_running?: number
  subagents?: Subagent[]
  context_by_tool?: { tool: string; calls: number; tokens: number }[]
  model?: string
  origin?: string // Codex only: the app that started it
  background?: boolean // Codex only: an editor extension's always-on server, not a chat
  children: Proc[]
  error?: string
}

export type PanelData = {
  generated_at?: number
  sessions: Session[]
  codex: Session[]
  leftovers: Proc[]
  system: { swap_total_mb?: number; swap_used_mb?: number; memory_total_mb?: number; memory_free_percent?: number }
}

// What the pane shows besides the data: which rows are open, which is asking
// to confirm End, and the last refresh or End outcome.
export type View = {
  open?: number
  openItem?: string
  confirming?: number
  ending?: number
  note?: string
  updatedAt?: number
  selfId?: string
  // this session's context window, from the engine; used for sessions whose window isn't recorded
  selfWindow?: number
  // what a helper, script or subagent is doing, by its row key; 'loading' while asked
  summaries?: Record<string, string>
}

declare module 'claude-code' {
  interface PluginState {
    'sessions-panel': { data: Shaped<PanelData>; view: Shaped<View> }
  }
}
