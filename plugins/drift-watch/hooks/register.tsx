import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DriftAlert, DriftDraft, DriftView } from '../types'
import {
  type Due, type State, newState, push, due, markChecked, judgePrompt, parseVerdict, stallWhy,
  sessionPrompt, parseSessionVerdict, applySession, summarizeInput, isDeploy, JUDGE_SYSTEM, SESSION_SYSTEM,
  GOAL_SYSTEM, goalPrompt, parseGoal, handoffPath, setBrief, isSummary, card, setGoal, handoffText, drawRows, pathSvg, liveAction, liveLine, noteAlone,
  cur, applyGoal, markReached, notYet, isPlanFile, SECRET_NAME, contextColor, C, stamp,
  spot, openNewGoal, closeNewGoal, forkGoal, editGoal, returnTo, rejudgeRows, rejudgePrompt, parseScores, applyRejudge, REJUDGE_SYSTEM,
} from './core.ts'

const PANE = 'drift-watch' // each session's panel is PANE-<first 8 of its id>, so two sessions never share one
const TICK_MS = 60_000
// Only prompts a person typed count as the user's messages; plugins, peers, schedules and notices do not.
const TYPED = new Set(['composer', 'bridge', 'sdk'])
const alerts = atom({ plugin: 'drift-watch', key: 'alerts' } as const, [], { shape: 'alerts-1' })
// The watcher's memory and the panel's message count live in the session's state, so a plugin reload keeps them.
const coreAtom = atom({ plugin: 'drift-watch', key: 'core' } as const, '', { shape: 'core-1' })
const countAtom = atom({ plugin: 'drift-watch', key: 'count' } as const, 0, { shape: 'count-1' })
// What the panel draws, written only when it changes, so tool calls don't redraw the panel.
const viewAtom = atom({ plugin: 'drift-watch', key: 'view' } as const, { sid: '' } as DriftView, { shape: 'view-3' })
// An open correction or goal draft and the text it opened with; typing goes to typedAtom.
const draftAtom = atom({ plugin: 'drift-watch', key: 'draft' } as const, null as DriftDraft, { shape: 'draft-1' })
// What the user has typed into the field. The pane never reads it, so typing doesn't redraw the field and move the cursor.
const typedAtom = atom({ plugin: 'drift-watch', key: 'typed' } as const, null as string | null, { shape: 'typed-1' })
// Which items show their 2 sentences (the goal, a milestone, the status); its own value, never logged.
const openAtom = atom({ plugin: 'drift-watch', key: 'open' } as const, [] as string[], { shape: 'open-1' })

let s: State = newState(0)
let sid = '' // the session id the watcher's memory belongs to
let syncing: Promise<void> | undefined // an id change in progress; other hooks wait for it
let busy = false
let turnId: string | undefined // the main loop's running turn, so "Stop and correct" can stop it
let paused = false // as the last tick saw it
let typedNow: string | null = null // mirrors typedAtom; a plain variable, so drawing the field from it subscribes nothing
let saved = '' // the session's snapshot as last stored, so only a change writes it
const KEEP_SESSIONS = 5 // snapshots kept in the plugin's store (it holds 4 MiB in all); older sessions are deleted

// Paused by "/drift off", kept across sessions. Read every tick: no restart needed.
async function isOff($: EngineInterface) {
  return (await $.store.get('paused')) === true
}

async function remember($: EngineInterface) {
  await update($, coreAtom, () => JSON.stringify(s))
  if ((await read($, countAtom)) !== s.userCount) await update($, countAtom, () => s.userCount)
  const mineAlerts = (await read($, alerts)).filter(a => a.sid === sid)
  const open = mineAlerts.filter(a => a.isOpen)
  const g = cur(s)
  // The alerts log: every check that raised something (a concern, or off track), newest first.
  const log = mineAlerts.filter(a => a.verdict === 'concern' || a.verdict === 'drifted').reverse().map(a => ({
    at: a.at,
    kind: a.kind === 'stall' ? 'Helpers stuck' : a.kind === 'session' ? 'Off track' : a.isDeploy ? 'Deploy' : 'Claude alone',
    who: a.kind === 'stall' ? 'helpers' : a.by === 'user' ? 'you' :
      a.by === 'both' ? 'you and Claude' : 'Claude',
    why: a.why || a.text,
  }))
  const view: DriftView = {
    sid, goal: g && JSON.parse(JSON.stringify(g)), now: s.lastNow, more: s.path.findLast(r => !r.alone)?.why || undefined, correctedAt: s.correctedAt,
    live: liveLine(s), liveHot: (s.lastDeployAt ?? -Infinity) > s.lastUserAt || undefined, contextPct: s.contextPct, compacts: s.compacts,
    card: card(s, open, paused), ...(log.length ? { log } : {}),
  }
  // Earlier goals, newest first, with Return on paused ones (panel only).
  const earlier = s.goals.filter(x => x.id !== s.current).reverse().slice(0, 5).map(({ id, label, status, verdict }) => ({ id, label, status, verdict }))
  if (earlier.length) view.earlier = earlier
  const d = drawRows(s)
  if (d.rows.length) {
    view.path = pathSvg(d)
    view.bends = [
      ...(d.older ? [`${d.older} earlier checks${d.olderOff ? `, ${d.olderOff} off track` : ', all on track'}`] : []),
      ...d.rows.filter(r => r.label).map(r => `msg ${r.n} · ${r.label}: ${r.now}`),
    ]
  }
  if (JSON.stringify(await read($, viewAtom)) !== JSON.stringify(view)) await update($, viewAtom, () => view)
  await $.ui.status(view.card?.status ? `Drift watch: ${view.card.status}` : undefined)
  await snapshot($)
}

// Goals, the path, and an open new-goal card go to the plugin's store on every change, so a restart of Claude Code
// brings them back (session state only survives a reload). Keyed by session id; only the newest KEEP_SESSIONS are kept.
async function snapshot($: EngineInterface) {
  if (!sid) return
  const j = JSON.stringify({ path: s.path, goals: s.goals, current: s.current, pending: s.pending, asked: s.asked })
  if (j === saved) return
  saved = j
  const key = `session:${sid}`
  const keys = await $.store.keys().catch(() => [] as string[])
  if (!keys.includes(key)) for (const old of keys.filter(k => k.startsWith('session:')).slice(0, -(KEEP_SESSIONS - 1))) await $.store.delete(old).catch(() => {})
  await $.store.set(key, JSON.parse(j)).catch(() => {}) // a full store skips the snapshot; the session goes on
}

// A .handoffs/ file named in the session's first message or command becomes the brief (first 8 KB).
async function readHandoff($: EngineInterface, text: string) {
  const name = handoffPath(text)
  if (!name || SECRET_NAME.test(name)) return // never send such files to the model
  const home = (await $.env.get('HOME')) ?? ''
  const path = name.startsWith('~/') ? home + name.slice(1) : name
  if (!(await $.fs.exists(path).catch(() => false))) return
  const body = await $.fs.read(path).catch(() => '')
  if (body.trim()) setBrief(s, body.slice(0, 8192))
}

// /clear and resumes carry on under a new session id with no session.start, so every hook checks it.
async function sync($: EngineInterface) {
  const id = await $.session.id()
  if (id === sid) return syncing
  sid = id
  syncing = reseed($, id).catch(() => { sid = '' }) // a failed reseed retries on the next hook instead of silencing the watcher
  return syncing
}

async function reseed($: EngineInterface, id: string) {
  turnId = undefined
  saved = ''
  const core = await read($, coreAtom)
  const kept: State | undefined = core ? JSON.parse(core) : undefined
  s = kept && (kept.sid ?? id) === id ? { ...newState(0), ...kept, sid: id } : { ...(await seed($, await $.clock.now())), sid: id, ...(await restore($, id)) }
  typedNow = await read($, typedAtom) // typing survives a reload
  if (!kept || kept.sid !== id) {
    await update($, draftAtom, () => null) // a half-typed draft belongs to the session it was typed in
    await update($, typedAtom, () => null)
    typedNow = null
    await update($, openAtom, () => [])
  }
  if ((await read($, alerts)).some(a => a.sid !== id)) await update($, alerts, list => list.map(a => (a.sid ? a : { ...a, sid: id })).filter(a => a.sid === id))
  await remember($)
  // A panel left open under an old id (the session before a /clear) is swapped for this session's.
  const stale = (await $.ui.panes()).filter(x => x.id.startsWith(PANE) && x.id !== paneId())
  for (const x of stale) await $.ui.close({ id: x.id })
  if (stale.length) await $.ui.open({ id: paneId(), title: 'Drift watch' })
}

// Loaded partway through a session (a reload, or an install mid-chat): take the goal and count from the history.
async function seed($: EngineInterface, now: number): Promise<State> {
  const fresh = newState(now)
  const rows = await $.session.messages({}).catch(() => [])
  if (!Array.isArray(rows)) return fresh
  // shortcut: history rows carry no origin, so text starting with '<' (notices, reminders) is skipped as not typed.
  for (const r of rows) if (r.role === 'user' && r.text.trim() && !r.text.trimStart().startsWith('<')) push(fresh, { kind: 'user', t: now, text: r.text.trim() })
  // shortcut: counts the summaries still in the history; if a compaction drops older ones, earlier compacts are missed.
  fresh.compacts = rows.filter(r => r.role === 'user' && isSummary(r.text.trimStart())).length
  fresh.sessionCheckedAt = fresh.userCount // no instant check on load; the next SESSION_EVERY messages trigger one
  return fresh
}

async function record($: EngineInterface, a: DriftAlert) {
  await update($, alerts, list => [...list, a].slice(-100))
  await remember($) // the status line and the card follow
}

// After a restart the session's memory is gone; its goals, path and open card come back from the store.
async function restore($: EngineInterface, id: string): Promise<Pick<State, 'path' | 'goals' | 'current' | 'pending' | 'asked'>> {
  const o = (await $.store.get(`session:${id}`).catch(() => undefined)) as Partial<State> | undefined
  return { path: o?.path ?? [], goals: o?.goals ?? [], current: o?.current, pending: o?.pending, asked: o?.asked }
}

// `at` is the session the check started in; an answer that lands after an id change is dropped.
async function check($: EngineInterface, d: Due, now: number, helpers: number, at: string, deploy: boolean) {
  const id = `${now}`
  if (d === 'stall') {
    const text = stallWhy(helpers, s, now)
    await $.ui.toast(`Drift watch: ${text}`)
    return record($, { id, sid: at, at: now, kind: 'stall', verdict: 'concern', text, isOpen: true })
  }
  if (d === 'goal') {
    const spotted = s.spotted // a new goal's call: taken off the queue now, so a failure never repeats it
    s.spotted = undefined
    const forId = cur(s)?.id // undefined: name the first goal; else plan this one
    const v0 = cur(s)?.version
    const plan = s.planFile ? (await $.fs.read(s.planFile).catch(() => '')).slice(0, 8192) : ''
    // 1200: up to 6 milestones with 2-sentence details fit; 300 cut the JSON short.
    const call = $.model.complete({ model: 'haiku', system: GOAL_SYSTEM, prompt: goalPrompt(s, plan, spotted), maxTokens: 1200, timeoutMs: 60_000 })
    const r = spotted ? await call.catch(() => undefined) : await call // a failed call still opens the card
    if ((await $.session.id()) !== at) return
    if (cur(s)?.id !== forId || cur(s)?.version !== v0) return // an edit, fork or return while it ran
    const a = r?.isAnswered ? parseGoal(r.text) : null
    if (spotted) openNewGoal(s, spotted, a)
    else applyGoal(s, a, now, forId)
    return remember($)
  }
  if (d === 'rejudge') {
    // After Edit goal: the goal's own rows, re-scored against its new words. Never an alert for the past.
    const job = s.rejudge
    s.rejudge = undefined
    const rows = rejudgeRows(s)
    const same = () => !!job && cur(s)?.id === job.goalId && (cur(s)?.version ?? 0) === job.version
    if (!same() || !rows.length) return
    const r = await $.model.complete({ model: 'haiku', system: REJUDGE_SYSTEM, prompt: rejudgePrompt(s, rows), maxTokens: 8 * rows.length + 100, timeoutMs: 60_000 })
    if ((await $.session.id()) !== at || !same()) return
    const scores = r.isAnswered ? parseScores(r.text, rows.length) : null
    if (!scores) return // a wrong-length or unreadable answer is dropped whole
    const { changed, ended } = applyRejudge(s, rows, scores)
    if (ended) await update($, alerts, list => list.map(x => (x.kind === 'session' && x.isOpen && x.sid === at ? { ...x, isOpen: false } : x)))
    await remember($)
    return
  }
  if (d === 'session') {
    const g0 = s.current
    const v0 = cur(s)?.version
    const r = await $.model.complete({ model: 'haiku', system: SESSION_SYSTEM, prompt: sessionPrompt(s), maxTokens: 400, timeoutMs: 60_000 })
    if ((await $.session.id()) !== at || s.current !== g0 || cur(s)?.version !== v0) return // the user set or edited the goal while this check was out
    const v = r.isAnswered ? parseSessionVerdict(r.text) : null
    if (!v) return record($, { id, sid: at, at: now, kind: 'session', verdict: 'error', text: 'Session check got no usable answer.', isOpen: false })
    const { row, started, ended } = applySession(s, v, now)
    await remember($)
    const off = s.offTrack
    const who = off?.by === 'user' ? 'You moved it.' : off?.by === 'both' ? 'You and Claude moved it.' : "Claude started this. You haven't okayed it."
    const text = off
      ? `Off track since message ${off.since}: now on "${row.now}". ${who} ${v.why}`
      : row.raw === null ? `Unsure: ${v.why}` : `On track: "${row.now}".`
    if (ended) await update($, alerts, list => list.map(x => (x.kind === 'session' && x.isOpen && x.sid === at ? { ...x, isOpen: false } : x)))
    // While the session stays off track, update the open alert quietly instead of raising a new one.
    const prior = (await read($, alerts)).findLast(x => x.kind === 'session' && x.isOpen && x.sid === at)
    if (off && prior && !started) {
      await update($, alerts, list => list.map(x => (x.id === prior.id ? { ...x, at: now, text, why: v.why, newGoal: row.now } : x)))
      return remember($) // the alerts log follows
    }
    if (started && off?.by === 'claude') await $.ui.toast(`Drift watch: off track since message ${off.since}. Claude started this.`)
    return record($, { id, sid: at, at: now, kind: 'session', verdict: off ? 'drifted' : row.raw === null ? 'unsure' : 'on_goal', text, why: v.why, by: off?.by, newGoal: row.now, isOpen: started })
  }
  const r = await $.model.complete({ model: 'haiku', system: JUDGE_SYSTEM, prompt: judgePrompt(s, now), maxTokens: 400, timeoutMs: 60_000 })
  if ((await $.session.id()) !== at) return
  const v = r.isAnswered ? parseVerdict(r.text) : null
  if (!v) return record($, { id, sid: at, at: now, kind: 'claude', verdict: 'error', text: 'Check got no usable answer.', isOpen: false })
  const concern = v.verdict === 'concern'
  if (v.now) s.lastNow = v.now // keeps "Now" fresh through long unattended runs
  if (!deploy) {
    const row = noteAlone(s, now, concern)
    await remember($)
  }
  if (concern) await $.ui.toast(`Drift watch: ${deploy ? 'a deploy needs a look' : 'Claude may be off track'}. ${v.why}`)
  return record($, { id, sid: at, at: now, kind: 'claude', isDeploy: deploy, verdict: v.verdict, text: v.why || 'Claude is on track.', isOpen: concern })
}

// One check at a time, run outside the hook that noticed it, so nothing ever waits on the judge.
async function tick($: EngineInterface) {
  if (busy) return
  busy = true
  try {
    if ((await $.session.surfaces()).length === 0) return // headless run (claude -p, SDK): nobody to show it to
    await sync($)
    const off = await isOff($)
    if (off !== paused) {
      paused = off
      await remember($)
    }
    if (off) {
      s.deployPending = false // a deploy seen while paused is not checked late on resume
      return
    }
    const now = await $.clock.now()
    const pct = (await $.session.usage().catch(() => undefined))?.context.percent
    if (pct !== undefined && pct !== s.contextPct) {
      s.contextPct = pct
      await remember($)
    }
    const helpers = (await $.agent.list()).filter(a => a.status === 'running' && a.spawnedBy === undefined).length
    if (helpers < 2) await closeAlerts($, a => a.kind === 'stall') // the helpers stopped
    const d = due(s, now, helpers)
    if (!d) return
    const deploy = d === 'judge' && s.deployPending
    markChecked(s, now, d)
    await remember($)
    await check($, d, now, helpers, sid, deploy)
    if (s.spotted || s.rejudge) soon($) // queued by this check: run it next, not a minute later
  } finally {
    busy = false
  }
}

function soon($: EngineInterface) {
  return $.clock.after(1, () => void tick($).catch(() => {}))
}

const paneId = () => `${PANE}-${sid.slice(0, 8)}`

async function openIfApp($: EngineInterface) {
  // A side panel only where the app draws one; terminal sessions use /drift.
  if ((await $.session.surfaces()).some(x => x !== 'terminal')) void $.ui.open({ id: paneId(), title: 'Drift watch' })
}

async function closeAlerts($: EngineInterface, which: (a: DriftAlert) => boolean) {
  if (!(await read($, alerts)).some(a => a.isOpen && a.sid === sid && which(a))) return
  await update($, alerts, list => list.map(a => (a.isOpen && a.sid === sid && which(a) ? { ...a, isOpen: false } : a)))
  await remember($)
}

const CORRECTION = 'Drift watch: stop. Tell me in two sentences where the work went off course, then get back to what I asked.'

type Act = 'correct' | 'send' | 'cancel' | 'fine' | 'goal' | 'saveGoal' | 'newGoal' | 'edit' | 'saveEdit' | 'handoff' | 'helpers' | 'reached' | 'notyet'
  | 'newgoal_continue' | 'newgoal_handoff' | 'newgoal_not' | 'newgoal_dismiss' | 'newgoal_edit' | 'newgoal_fork' | 'newgoal_back' | 'newgoal_spot' | 'goal_return'

// Hand off puts its text in the prompt box for the user to read, edit and send themselves; it never sends.
// A draft they typed stays: the text goes below it after a blank line. No box to fill: copy it instead.
async function handOff($: EngineInterface, text: string) {
  const box = await $.prompt.read()
  const r = await $.prompt.fill(box.text.trim() ? { text: `\n\n${text}`, mode: 'append' } : { text, mode: 'replace' })
  if (r.isFilled) return
  const c = await $.ui.copy({ text })
  await $.ui.toast(c.isCopied ? 'Copied. Paste it into the prompt box.' : 'Drift watch could not fill the prompt box or copy the hand-off.')
}

// Buttons: nothing reaches Claude unless the user presses one.
async function act($: EngineInterface, what: Act, text?: string) {
  const c = (await read($, viewAtom)).card
  if (what === 'correct' && turnId) await $.turn.abort({ turnId }).catch(() => {}) // stop first, before any file work
  text = text ?? (await read($, typedAtom)) ?? (await read($, draftAtom))?.text ?? '' // Enter's text is final; a button press sends what the field holds now
  if (['correct', 'goal', 'edit', 'newgoal_edit'].includes(what)) { typedNow = null; await update($, typedAtom, () => null) } // a new draft starts from its own text
  if (what === 'correct') {
    // The turn is already stopped above; the correction is sent only on Send.
    return update($, draftAtom, () => ({ kind: 'correct', text: `${CORRECTION}${c?.why ? ` (${c.title} ${c.why})` : ''}` }))
  }
  if (what === 'goal') return update($, draftAtom, () => ({ kind: 'goal', text: s.offTrack ? (s.lastNow ?? '') : '' }))
  if (what === 'edit') return update($, draftAtom, () => ({ kind: 'edit', text: cur(s)?.label ?? '' }))
  const p = s.pending?.kind === 'newgoal' ? s.pending : undefined
  // The new-goal card: nothing about the goal changes until one of these presses.
  if (what === 'newgoal_edit') return update($, draftAtom, () => ({ kind: 'edit', text: p?.label ?? cur(s)?.label ?? '' })) // their words can adjust the proposed label
  if (what === 'newgoal_continue' || what === 'newgoal_back' || what === 'newgoal_not' || what === 'newgoal_dismiss') {
    if (p && what !== 'newgoal_dismiss') {
      if (what === 'newgoal_not') closeNewGoal(s) // a false alarm: the label is not asked again; the misread card follows
      s.pending = { ...p, step: what === 'newgoal_continue' ? 2 : what === 'newgoal_back' ? 1 : 'misread' }
    } else closeNewGoal(s)
    return remember($)
  }
  if (what === 'newgoal_spot') {
    // On the yellow card: their move was a real new goal. Its goal call, then the step 1 card with the hand-off advice.
    spot(s, { label: s.lastNow || 'New goal', by: 'user', atMessage: s.offTrack?.since ?? null }, true)
    await remember($)
    await $.ui.toast('Drift watch: sizing the new goal…') // the card opens when the goal call lands
    return soon($)
  }
  if (what === 'newgoal_handoff') {
    if (!p) return
    const msg = handoffText(s, p)
    closeNewGoal(s)
    await remember($)
    return handOff($, msg)
  }
  if (what === 'newgoal_fork' || what === 'goal_return') {
    const now = await $.clock.now()
    if (what === 'newgoal_fork') forkGoal(s, now)
    else returnTo(s, text, now) // text: the goal's id
    await closeAlerts($, a => a.kind === 'session')
    await remember($)
    return soon($) // a fork with no kept answer plans its milestones next
  }
  if (what === 'cancel') return update($, draftAtom, () => null)
  if (what === 'reached' || what === 'notyet') {
    if (what === 'reached') markReached(s)
    else notYet(s) // logged above as a press: a goal-reached false alarm, apart from Fine on a drift
    return remember($)
  }
  if (what === 'send') {
    if (!text.trim()) return
    await update($, draftAtom, () => null)
    s.correctedAt = await $.clock.now()
    await closeAlerts($, () => true)
    await $.prompt.submit({ text, asUser: true })
    return remember($)
  }
  if (what === 'saveGoal') {
    // "/drift goal <text>": a typed command is deliberate, so it forks at once.
    if (!text.trim()) return
    await update($, draftAtom, () => null)
    setGoal(s, text.trim().replace(/\s+/g, ' '), await $.clock.now()) // the field is 2 rows; a goal stays one line
    await closeAlerts($, a => a.kind === 'session')
    return remember($)
  }
  if (what === 'newGoal' || what === 'saveEdit') {
    const words = text.trim().replace(/\s+/g, ' ') // the field is 2 rows; a goal stays one line
    if (!words) return
    await update($, draftAtom, () => null)
    // New goal: their words get the goal call, then the step 1 card with its recommendation. Edit: in place.
    if (what === 'newGoal') spot(s, { label: words, by: 'user', atMessage: null }, true)
    else {
      editGoal(s, words, await $.clock.now())
    }
    await remember($)
    return soon($) // the queued call runs on the next tick, never inside this press
  }
  if (what === 'fine') {
    // "This side trip is OK": quiet until back on track; the goal does not change.
    if (s.offTrack && !c?.alertId) {
      s.offTrack.okayed = true
      // Stamp the open stretch so it stays blue after it ends.
      const from = s.path.findLastIndex(r => !r.offTrack) + 1
      for (const r of s.path.slice(from)) r.okayed = true
    }
    await closeAlerts($, a => (c?.alertId ? a.id === c.alertId : a.kind === 'session'))
    return remember($)
  }
  await closeAlerts($, a => a.kind === (what === 'helpers' ? 'stall' : 'session'))
  if (what === 'handoff') await handOff($, handoffText(s))
  if (what === 'helpers') await $.prompt.submit({ text: 'Drift watch: your background helpers have been silent for 30+ minutes. Check on them, tell me in two sentences what each is doing and whether it is making progress, and stop any that are stuck.', asUser: true })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    sid = ''
    await sync($)
    await $.command.register({ name: 'drift', description: 'Drift watch: open the panel; "/drift goal <text>" sets the goal; "/drift off" and "/drift on"' })
    await openIfApp($)
    $.clock.every(TICK_MS, () => void tick($).catch(() => {}))
    return next(e)
  })

  on('session.attach', async ($, e, next) => {
    const r = await next(e) // the attaching app joins the surface list inside next
    await openIfApp($)
    return r
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      s = { ...newState(await $.clock.now()), sid } // /clear starts a new goal
      await update($, alerts, () => [])
      await update($, draftAtom, () => null)
      await update($, typedAtom, () => null)
      typedNow = null
      await remember($)
    }
    return next(e)
  })

  on('command.run', { command: 'drift' }, async ($, e) => {
    const arg = String(e.args ?? '').trim()
    if (arg === 'off') {
      await $.store.set('paused', true)
      return { text: 'Drift watch paused in every session. "/drift on" resumes it.' }
    }
    if (arg.startsWith('goal ')) {
      await sync($)
      await act($, 'saveGoal', arg.slice(5))
      return { text: `Goal set: ${cur(s)?.label}` }
    }
    if (arg === 'on') {
      await $.store.set('paused', false)
      return { text: 'Drift watch resumed.' }
    }
    await sync($)
    await $.ui.open({ id: paneId(), title: 'Drift watch' })
    return { text: 'Drift watch panel opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    // The watcher's own work never blocks the prompt: a failure there is dropped and the prompt goes on.
    await (async () => {
      await sync($)
      const kind = e.origin?.kind
      const opening = s.first === undefined && kind !== undefined && TYPED.has(kind) // the session's first typed message or command
      if (opening) await readHandoff($, e.text)
      if (kind === 'task-notification') push(s, { kind: 'notice', t: await $.clock.now(), text: e.text })
      else if (kind && TYPED.has(kind) && !e.command) {
        push(s, { kind: 'user', t: await $.clock.now(), text: e.text })
        await closeAlerts($, a => a.kind !== 'session') // their next message answers a pop-up; drift is decided by the next check
        await remember($)
        soon($)
      }
    })().catch(() => {})
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    // Count only a real compaction of the main conversation: not a precompute, and not one a hook skipped.
    if (!e.agentId && e.trigger !== 'precompute' && (r as { messages?: unknown }).messages !== undefined) {
      // The compaction already stands; a failed count must not show as a skipped hook.
      await (async () => { await sync($); s.compacts++; await remember($) })().catch(() => {})
    }
    return r
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) turnId = e.turnId
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) {
      const ran = await next(e)
      return ran // a helper's own steps are not Claude acting; "stuck" means the main loop heard nothing
    }
    const tool = String(e.tool)
    const input = summarizeInput(tool, e as unknown as Record<string, unknown>)
    const command = typeof (e as any).command === 'string' ? (e as any).command : ''
    const deploy = isDeploy(tool, command)
    // The watcher's own work never blocks the tool call: a failure there is dropped and the call goes on.
    await (async () => {
      await sync($)
      const live = liveAction(tool, command)
      if (live) s.live = { ...s.live, [live]: (s.live[live] ?? 0) + 1 }
      if (live === 'deploy') s.lastDeployAt = await $.clock.now()
      if (deploy) s.deployPending = true // flag it as the command starts, so the check runs alongside it
      const path = (e as any).file_path
      if (['Read', 'Write', 'Edit'].includes(tool) && typeof path === 'string' && isPlanFile(path)) s.planFile = path // feeds the next goal plan
    })().catch(() => {})
    const ran = await next(e)
    await (async () => {
      push(s, { kind: 'tool', t: await $.clock.now(), tool, input, isError: !!(ran as any).isError, isDeploy: deploy })
      await remember($)
      soon($)
    })().catch(() => {})
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && e.answer?.trim()) {
      await sync($)
      push(s, { kind: 'reply', t: await $.clock.now(), text: e.answer.trim() })
      await remember($)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (!String(e.requestId).startsWith(PANE)) return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Input = e.surface !== 'mobile' && 'Input' in ui ? ui.Input : undefined // mobile has no text field
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined // the terminal gets the turns as plain lines
    const id = await $.session.id()
    const counted = await read($, countAtom) // read here so the line redraws as the count changes
    const view = await read($, viewAtom)
    const draft = await read($, draftAtom)
    const open = await read($, openAtom)
    const typed = Input ? null : await read($, typedAtom) // only the no-field drawing shows typing, so the field never redraws as they type
    const mine = view.sid === id // never draw another session's view
    const c = mine ? view.card : undefined
    const g = mine ? view.goal : undefined
    const gfx = e.surface !== 'terminal' // the terminal gets the same order as plain lines: no tints, no colored edge
    const tone = c?.tone ?? 'grey'
    const EDGE = { amber: C.amber, yellow: C.yellow, blue: C.blue, green: C.green, grey: C.ax }
    const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    // The tone's own color: green on track, amber off, blue a move the user made; grey stays dim.
    const color = { amber: C.amber, yellow: C.yellow, blue: C.blue, green: C.green, grey: undefined }[tone]
    const status = c ? `${c.title}${c.checkedAt !== undefined ? ` · checked at ${clock(c.checkedAt)}` : ''}` : ''
    const BUTTONS = { correct: 'Stop and correct', fine: 'Fine, keep going', goal: 'New goal', edit: 'Edit goal', handoff: 'Hand off', helpers: 'Check helpers', reached: 'Mark reached', notyet: 'Not yet',
      newgoal_continue: 'Continue here', newgoal_handoff: 'Hand off', newgoal_not: 'Not a new goal', newgoal_dismiss: 'Dismiss', newgoal_edit: 'Edit the current goal', newgoal_fork: 'Set a new goal', newgoal_back: 'Back', newgoal_spot: "It's a new goal" } as const
    const TYPING = ['goal', 'edit', 'newgoal_edit'] // buttons that open a text field: not drawn where there is none (mobile)
    const canType = Input !== undefined
    // One click opens an item's 2 sentences under it, another closes them.
    const toggle = (key: string) => update($, openAtom, l => (l.includes(key) ? l.filter(x => x !== key) : [...l, key]))
    const done = g?.milestones.filter(m => m.reachedAt !== undefined).length ?? 0
    const nextAt = g?.milestones.findIndex(m => m.reachedAt === undefined) ?? -1
    const badge = !g ? '' : g.status !== 'active' ? g.status[0]!.toUpperCase() + g.status.slice(1) : g.milestones.length ? `${done} of ${g.milestones.length}` : ''
    const more = c && !c.why ? view.more : undefined // a status with no reason of its own opens the last check's sentence
    const pct = view.contextPct
    const log = mine ? view.log ?? [] : []
    // The open draft's field: a correction or a goal in the status card.
    const field = draft && (
      <Box flexDirection="column">
        <Text dimColor>{draft.kind === 'goal' ? 'New goal, in your words:' : draft.kind === 'edit' ? 'The goal, in your words (it is edited in place):' : 'Claude is stopped. This goes to Claude as you when you press Send:'}</Text>
        {Input ? (
          <Input key="draft" autoFocus value={typedNow ?? draft.text} rows={draft.kind === 'correct' ? 3 : 2} submitLabel={draft.kind === 'goal' ? 'Next' : draft.kind === 'edit' ? 'Save goal' : 'Send'}
            onInput={(v: string) => { typedNow = v; void update($, typedAtom, () => v) }}
            onSubmit={(v: string) => void act($, draft.kind === 'goal' ? 'newGoal' : draft.kind === 'edit' ? 'saveEdit' : 'send', v)} />
        ) : (
          <Text>{typed ?? draft.text}</Text>
        )}
        <Box flexDirection="row">
          {!canType && draft.kind === 'correct' && ( // the field draws its own save button; this one is for surfaces with no field
            <Button key="draft-ok" label="Send" variant="primary" onPress={() => act($, 'send')} />
          )}
          <Button key="draft-cancel" label="Cancel" onPress={() => act($, 'cancel')} />
        </Box>
      </Box>
    )
    return (
      <Box flexDirection="column" backgroundColor={gfx ? C.bg : undefined} paddingX={gfx ? 1 : 0} paddingTop={gfx ? 1 : 0} paddingBottom={gfx ? 3 : 0}>
        <Box flexDirection="row">
          {gfx && <Box width={1} backgroundColor={EDGE[tone]} />}
          <Box flexDirection="column" flexGrow={1} paddingX={gfx ? 1 : 0} paddingY={gfx ? 1 : 0}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>THIS SESSION'S GOAL</Text>
              {badge && <Text color={color} dimColor={!color}>{badge}</Text>}
            </Box>
            {g ? (
              <Box flexDirection="column">
                {g.doneWhen ? (
                  <Button key="open-goal" plain onPress={() => toggle(`${g.id}-goal`)}><Text bold>{g.label}</Text></Button>
                ) : (
                  <Text bold>{g.label}</Text>
                )}
                {g.detail && <Text dimColor>{g.detail}</Text>}
                {g.doneWhen && open.includes(`${g.id}-goal`) && <Text>Done when: {g.doneWhen}</Text>}
                {g.vague && <Text dimColor>Too <Text color={color}>vague</Text> to track: it does not say what done looks like.</Text>}
                {g.by === 'user' && <Text dimColor>Set by you at {clock(g.setAt)}</Text>}
              </Box>
            ) : (
              <Text dimColor>Not named yet. Your first message of 15 words or more names it, or type "/drift goal" and the goal.</Text>
            )}
          </Box>
        </Box>
        {mine && <Text dimColor>Context <Text color={contextColor(pct)}>{pct === undefined ? '–' : `${pct}%`}</Text> · Compacts {view.compacts ?? 0}</Text>}
        {c && (
          <Box flexDirection="column" marginTop={1} borderStyle={gfx ? 'round' : undefined} borderColor={gfx ? EDGE[tone] : undefined} paddingX={gfx ? 1 : 0} paddingY={gfx ? 1 : 0}>
            {more ? (
              <Button key="open-status" plain onPress={() => toggle('status')}><Text bold color={color}>{status}</Text></Button>
            ) : (
              <Text bold color={color}>{status}</Text>
            )}
            {more && open.includes('status') && <Text>{more}</Text>}
            {c.why && <Text>{c.why}</Text>}
            {view.now && <Text dimColor>Now: {view.now}</Text>}
            {view.correctedAt !== undefined && <Text dimColor>Correction sent at {clock(view.correctedAt)}</Text>}
            {view.live && <Text color={view.liveHot ? C.amber : undefined} dimColor={!view.liveHot}>{view.live}</Text>}
            {(pct ?? 0) > 70 && (
              <Box flexDirection="row">
                <Text dimColor>Context {pct}% full. </Text>
                {!c.buttons.includes('handoff') && <Button key="b-ctx-handoff" label="Hand off" onPress={() => act($, 'handoff')} />}
              </Box>
            )}
            {draft ? field : (
              <Box flexDirection="row">
                {c.buttons.filter(b => canType || !TYPING.includes(b)).map(b => (
                  <Button key={`b-${b}`} label={BUTTONS[b]} variant={b === c.main ? 'primary' : undefined} onPress={() => act($, b)} />
                ))}
                {canType && !c.buttons.some(b => b === 'edit' || b.startsWith('newgoal')) && <Button key="b-edit" label="Edit goal" onPress={() => act($, 'edit')} />}
                <Button key="b-copy" label="Copy" onPress={() => $.ui.copy({ text: `${status}${c.why ? ` ${c.why}` : ''}`, surface: e.surface })} />
              </Box>
            )}
          </Box>
        )}
        {log.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Button key="open-alerts" plain onPress={() => toggle('alerts')}>
              <Text dimColor>{`${open.includes('alerts') ? '▾' : '▸'} Alerts (${log.length})`}</Text>
            </Button>
            {open.includes('alerts') && log.map((a, i) => (
              <Text key={`alert-${i}`}><Text dimColor>{stamp(a.at)} · </Text>{a.kind}<Text dimColor> · {a.who}: </Text>{a.why}</Text>
            ))}
          </Box>
        )}
        {g && g.milestones.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>MILESTONES</Text>
            {g.milestones.map((m, i) => {
              const key = `${g.id}-m${i}`
              const reached = m.reachedAt !== undefined
              return (
                <Box key={`row-${key}`} flexDirection="column">
                  <Button key={key} plain onPress={() => toggle(key)}>
                    <Text color={reached ? 'success' : i === nextAt ? C.blue : undefined} dimColor={!reached && i !== nextAt}>{`${reached ? '✓' : i === nextAt ? '→' : ' '} ${i + 1}. `}</Text>
                    <Text dimColor={reached}>{m.text}</Text>
                  </Button>
                  {open.includes(key) && m.detail && <Text dimColor>{m.detail}</Text>}
                </Box>
              )
            })}
          </Box>
        )}
        {mine && view.earlier && (
          // Panel only: Return tells Claude nothing.
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>EARLIER GOALS</Text>
            {view.earlier.map(x => (
              <Box key={`earlier-${x.id}`} flexDirection="row" justifyContent="space-between">
                <Text>{x.label}<Text dimColor> · {x.verdict ?? x.status}</Text></Text>
                {x.status === 'paused' && <Button key={`b-return-${x.id}`} label="Return" onPress={() => act($, 'goal_return', x.id)} />}
              </Box>
            ))}
          </Box>
        )}
        {mine && view.path && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>HOW THE SESSION HAS MOVED</Text>
            {Svg ? (
              // Its own width and height: drawn 1:1, so its text matches the panel's instead of stretching to the panel width.
              <Svg source={view.path.svg} alt={view.path.alt} width={view.path.width} height={view.path.height} />
            ) : view.bends?.length ? (
              view.bends.map((l, i) => <Text key={`bend-${i}`}>{l}</Text>)
            ) : (
              <Text dimColor>No turns yet: every check so far was on track.</Text>
            )}
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>Watching: {counted} of your messages counted · Session {id.slice(0, 8)}</Text>
        </Box>
      </Box>
    )
  })
}
