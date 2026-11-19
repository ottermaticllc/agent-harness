export type DriftAlert = {
  id: string
  sid: string // the session it belongs to; the panel shows only the current session's
  at: number
  kind: 'claude' | 'session' | 'stall'
  isDeploy?: boolean // a judge check a deploy started
  verdict: string // ok | concern | unsure | on_goal | drifted | error
  text: string
  newGoal?: string // what a "New goal" press adopts (session alerts)
  by?: string // who moved it (session alerts): user | claude | both
  why?: string // the check's own one-line reason (session alerts; the others' text is it)
  isOpen: boolean // still waiting on the user
}

export type DriftCard = {
  tone: 'amber' | 'yellow' | 'blue' | 'grey' | 'green'
  title: string
  why?: string
  checkedAt?: number
  status?: string // the status line's words while amber
  buttons: ('correct' | 'fine' | 'goal' | 'edit' | 'handoff' | 'helpers' | 'reached' | 'notyet'
    | 'newgoal_continue' | 'newgoal_handoff' | 'newgoal_not' | 'newgoal_dismiss' | 'newgoal_edit' | 'newgoal_fork' | 'newgoal_back' | 'newgoal_spot')[]
  main?: DriftCard['buttons'][number] // the card's one primary button
  alertId?: string
}

// The current goal as the panel draws it (core.ts Goal).
export type DriftGoal = {
  id: string
  label: string
  detail?: string
  doneWhen?: string
  by: 'user' | 'model'
  setAt: number
  milestones: { text: string; detail: string; reachedAt?: number }[]
  status: 'active' | 'paused' | 'reached' | 'dropped'
  verdict?: string
  vague?: boolean
  version?: number
}

export type DriftView = {
  sid: string // the session this view was written for
  goal?: DriftGoal
  now?: string
  more?: string // the last check's own sentence, opened by a click on the status
  correctedAt?: number
  card?: DriftCard
  live?: string // "Live actions this session: ..."
  liveHot?: boolean // a deploy came after the user's last message: the live line turns amber
  contextPct?: number // how full the context window is
  compacts?: number // times the conversation was compacted
  path?: { svg: string; alt: string; width: number; height: number } // the drawn path at its own size, for surfaces that draw pictures
  bends?: string[] // the same path's turns as plain lines, for the terminal
  log?: { at: number; kind: string; who: string; why: string }[] // the alerts log, newest first
  earlier?: { id: string; label: string; status: string; verdict?: string }[] // goals before the current one, newest first; Return on paused ones
}

// goal: a new goal's words (the new-goal card follows); edit: the current goal's words, edited in place.
export type DriftDraft = { kind: 'correct' | 'goal' | 'edit'; text: string } | null

declare module 'claude-code' {
  interface PluginState {
    'drift-watch': {
      alerts: Shaped<DriftAlert[]>; core: Shaped<string>; count: Shaped<number>; view: Shaped<DriftView>; draft: Shaped<DriftDraft>; typed: Shaped<string | null>
      open: Shaped<string[]>
    }
  }
}
