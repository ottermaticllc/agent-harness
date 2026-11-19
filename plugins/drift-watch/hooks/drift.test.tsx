import { expect, mock, test } from 'claude-code/testing'
import {
  addGoal, applyGoal, handoffPath, applySession, contextColor, cur, drawRows, liveAction, pathSvg, stamp, newState, parseGoal, type SessionVerdict,
  recommend, openNewGoal, closeNewGoal, card, editGoal, rejudgeRows, parseScores, applyRejudge, setGoal, handoffText, returnTo, spot,
} from './core.ts'

const PANE = {
  plugin: 'drift-watch',
  component: 'Pane',
  requestId: 'drift-watch-abcdef12',
  props: { title: 'Drift watch', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const DRIFTED = '{"alignment":25,"now":"diagnose app freezes","event":"drift_start","by":"user","atMessage":4,"why":"The talk moved to freezes.","confidence":0.8}'
const CLAUDE_DRIFT = '{"alignment":30,"now":"refactoring the logger","event":"drift_start","by":"claude","atMessage":3,"why":"Claude began a logger refactor nobody asked for.","confidence":0.7}'
const CONCERN = '{"verdict":"concern","why":"the user named the test client; the deploy went to production.","confidence":0.8}'

type World = { answers?: string[]; reply?: (e: any) => string | undefined; box?: string; fillOk?: boolean; fills: any[]; copied: string[]; during?: () => Promise<unknown>; pct?: number; files: Record<string, string>; store: Record<string, any>; sid: string; flip?: string; toasts: string[]; submitted: string[]; calls: any[]; paused: boolean; surfaces: string[]; helpers: number; history: { role: string; text: string; toolUses: unknown[] }[] }

function engine(on: any, answer: string, w: World) {
  on('session.id', () => ({ value: w.sid }))
  on('session.surfaces', () => ({ value: w.surfaces }))
  on('env.get', () => ({ value: '/tmp/drift-watch-test' }))
  on('command.register', () => ({ value: { command: 'drift' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_: any, e: any) => (w.toasts.push(e.text ?? String(e)), { value: undefined }))
  on('store.get', (_: any, e: any) => ({ value: (e.key ?? e) === 'paused' ? w.paused : w.store[e.key ?? e] }))
  on('store.set', (_: any, e: any) => ((w.store[e.key] = e.value), { value: undefined }))
  on('store.keys', () => ({ value: Object.keys(w.store) }))
  on('store.delete', (_: any, e: any) => (delete w.store[e.key ?? e], { value: undefined }))
  on('fs.exists', (_: any, e: any) => ({ value: (e.path ?? e) in w.files }))
  on('fs.read', (_: any, e: any) => ({ value: w.files[e.path ?? e] }))
  on('fs.write', (_: any, e: any) => ((w.files[e.path] = e.content ?? e.text ?? e.data), { value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: w.pct }, rateLimits: [] } }))
  on('turn.abort', () => ({ value: undefined }))
  on('session.messages', () => ({ value: w.history }))
  on('agent.list', () => ({ value: Array.from({ length: w.helpers }, (_, i) => ({ id: `h${i}`, description: 'helper', type: 'general-purpose', status: 'running' })) }))
  on('model.complete', async (_: any, e: any) => {
    w.calls.push(e)
    if (w.during) await w.during() // something the user does while the check is out
    if (w.flip) w.sid = w.flip // the session changes while the check is out
    return { value: { isAnswered: true, text: w.reply?.(e) ?? w.answers?.shift() ?? answer, usage: {} } }
  })
  // Stands for the engine taking a prompt: the user's typing and a button's send both land here.
  on('prompt.submit', (_: any, e: any) => {
    w.submitted.push(e.text)
    return { text: e.text }
  })
  // Hand off fills the prompt box: the box as it stands, the fill, and the copy fallback.
  on('prompt.read', () => ({ value: { text: w.box ?? '', cursor: (w.box ?? '').length } }))
  on('prompt.fill', (_: any, e: any) => (w.fills.push(e), { isFilled: w.fillOk ?? true }))
  on('ui.copy', (_: any, e: any) => (w.copied.push(e.text), { value: { isCopied: true } }))
  on('tool.call', () => ({ result: {} }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
}

const world = (over: Partial<World> = {}): World => ({ files: {}, store: {}, sid: 'abcdef1234', toasts: [], submitted: [], calls: [], fills: [], copied: [], paused: false, surfaces: ['desktop'], helpers: 0, history: [], ...over })

async function typed($: any, n: number) {
  for (let i = 1; i <= n; i++) await $.prompt.submit({ text: `message ${i}`, origin: { kind: 'composer' } } as any)
}

test('every 3rd typed message runs a session check; a move the user made shows yellow with no pop-up', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, DRIFTED, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  let ui: any = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /First check in 3 messages/ })).toBeTruthy()
  await ui.unmount()
  await typed($, 2)
  await clock.advance(10)
  expect(w.calls.length).toBe(0)
  await typed($, 1)
  await clock.advance(10)
  expect(w.calls.length).toBe(1)
  expect(w.toasts.length).toBe(0)
  for (const surface of ['terminal', 'desktop'] as const) {
    ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /You moved off the goal at message 4/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: 'Now: diagnose app freezes' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', text: 'Fine, keep going' })).toBeTruthy() // the user's own move: Fine okays it
    await ui.unmount()
  }
})

test('a drift Claude started is amber with a pop-up; Fine okays the side trip, keeps the goal and sends nothing', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, CLAUDE_DRIFT, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'drift', args: 'goal Build the drift watcher' } as any)
  await typed($, 5)
  await clock.advance(10)
  expect(w.toasts.length).toBe(1)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Off track since message 3/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: "Claude started this. You haven't okayed it." })).toBeTruthy()
  await ui.press({ key: (await ui.find({ type: 'Button', text: 'Fine, keep going' }))!.key! })
  expect(await ui.find({ type: 'Text', text: /Side trip okayed, since message 3/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'Build the drift watcher' })).toBeTruthy() // the goal did not change
  await ui.unmount()
  expect(w.submitted.length).toBe(5) // only the user's own five
})

test('a deploy command triggers a check at once, and Stop and correct sends one correction', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, CONCERN, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 1)
  await $.tool.call({ tool: 'Bash', command: 'vercel --prod', description: 'Deploy' })
  await clock.advance(10)
  expect(w.calls.length).toBe(1)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /A deploy needs a look/ })).toBeTruthy()
  await ui.press({ key: (await ui.find({ type: 'Button', text: 'Stop and correct' }))!.key! })
  expect(w.submitted.length).toBe(1) // stopped, but nothing sent until Send
  expect(await ui.find({ type: 'Input' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: 'Send' })).toBeFalsy() // one send: the field's own
  await ui.input({ key: 'draft', text: (await ui.find({ type: 'Input' }))!.props!.value as string, kind: 'submit' })
  expect(w.submitted.length).toBe(2)
  expect(w.submitted[1]).toContain('Drift watch: stop.')
  expect(await ui.find({ type: 'Text', text: /Correction sent at/ })).toBeTruthy()
  await ui.unmount()
})

test('on mobile, which has no text field, the correction goes by its own Send button', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, CONCERN, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 1)
  await $.tool.call({ tool: 'Bash', command: 'vercel --prod', description: 'Deploy' })
  await clock.advance(10)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: (await ui.find({ type: 'Button', text: 'Stop and correct' }))!.key! })
  await ui.unmount()
  const phone = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect(await phone.find({ type: 'Input' })).toBeFalsy()
  await phone.press({ key: (await phone.find({ type: 'Button', text: 'Send' }))!.key! })
  expect(w.submitted.length).toBe(2)
  await phone.unmount()
})

test('typing does not redraw the field (the cursor stays put), and what was typed is what gets sent', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, CONCERN, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 1)
  await $.tool.call({ tool: 'Bash', command: 'vercel --prod', description: 'Deploy' })
  await clock.advance(10)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: (await ui.find({ type: 'Button', text: 'Stop and correct' }))!.key! })
  const before = (await ui.find({ type: 'Input' }))!.props!.value
  await ui.input({ key: 'draft', text: 'Undo the deploy', kind: 'change' })
  expect((await ui.find({ type: 'Input' }))!.props!.value).toBe(before) // the field's text is not fed back while the user types
  await $.tool.call({ tool: 'Bash', command: 'supabase db push', description: 'Push' }) // another redraw while the user types
  await clock.advance(10)
  expect((await ui.find({ type: 'Text', text: /database push/ }))).toBeTruthy() // the pane did redraw
  expect((await ui.find({ type: 'Input' }))!.props!.value).toBe('Undo the deploy') // and kept the user's typing
  await ui.unmount()
  const phone = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect(await phone.find({ type: 'Text', text: 'Undo the deploy' })).toBeTruthy() // the phone shows what Send will send
  await phone.press({ key: (await phone.find({ type: 'Button', text: 'Send' }))!.key! })
  expect(w.submitted[1]).toBe('Undo the deploy')
  await phone.unmount()
})

test('the user\'s next typed message clears a deploy pop-up', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, CONCERN, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 1)
  await $.tool.call({ tool: 'Bash', command: 'vercel --prod', description: 'Deploy' })
  await clock.advance(10)
  await typed($, 1)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /A deploy needs a look/ })).toBeFalsy()
  await ui.unmount()
})

test('Edit goal saves the user\'s words as the goal; mobile draws no text field', async ($, on) => {
  mock.clock(on)
  const w = world()
  engine(on, DRIFTED, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const phone = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect(await phone.find({ type: 'Button', text: 'Edit goal' })).toBeFalsy()
  await phone.unmount()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: (await ui.find({ type: 'Button', text: 'Edit goal' }))!.key! })
  await ui.input({ key: 'draft', text: 'Ship the compass panel', kind: 'change' })
  expect(await ui.find({ type: 'Button', text: 'Save goal' })).toBeFalsy() // one save: the field's own
  await ui.input({ key: 'draft', text: 'Ship the compass panel', kind: 'submit' })
  expect(await ui.find({ type: 'Text', text: 'Ship the compass panel' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Set by you at/ })).toBeTruthy()
  await ui.unmount()
  expect(w.submitted.length).toBe(0)
})

test('paused with /drift off, it makes no model calls', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ paused: true })
  engine(on, CONCERN, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 5)
  await $.tool.call({ tool: 'Bash', command: 'vercel --prod' })
  await clock.advance(10)
  expect(w.calls.length).toBe(0)
})

test('a prompt a plugin or peer sent does not count as the user typing', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, DRIFTED, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (let i = 1; i <= 5; i++) await $.prompt.submit({ text: `note ${i}` } as any)
  await clock.advance(10)
  expect(w.calls.length).toBe(0)
})

test('with no app attached (claude -p), it makes no model calls', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ surfaces: [] })
  engine(on, CONCERN, w)
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  await typed($, 5)
  await $.tool.call({ tool: 'Bash', command: 'vercel --prod' })
  await clock.advance(10)
  expect(w.calls.length).toBe(0)
})

test('two typed messages run no session check', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, DRIFTED, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 2)
  await clock.advance(10)
  expect(w.calls.length).toBe(0)
})

test('helpers running and the main loop silent 30 minutes raises one stuck alert, with no model call', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ helpers: 3 })
  engine(on, CONCERN, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 1)
  await clock.advance(31 * 60_000)
  await clock.advance(10 * 60_000)
  expect(w.calls.length).toBe(0)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const found = await ui.find({ type: 'Text', text: /3 helper agent\(s\) still running/ })
  expect(found).toBeDefined()
  expect(await ui.find({ type: 'Button', text: 'Check helpers' })).toBeDefined()
  await ui.unmount()
})

test('Copy puts the alert text on the clipboard and sends nothing', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, DRIFTED, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 5)
  await clock.advance(10)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: (await ui.find({ type: 'Button', text: 'Copy' }))!.key! })
  await ui.unmount()
  expect(w.copied[0]).toContain('You moved off the goal at message 4.')
  expect(w.submitted.length).toBe(5)
})

test('loaded partway through a session, it takes the goal from the history and the counter keeps up', async ($, on) => {
  const clock = mock.clock(on)
  const history = ['Build the drift watcher mod', 'add a copy button', '<task-notification>done</task-notification>'].map(text => ({ role: 'user', text, toolUses: [] }))
  const w = world({ history })
  engine(on, DRIFTED, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Watching:/ }))?.text).toContain('Watching: 2 of')
  await typed($, 2)
  await clock.advance(10)
  expect(w.calls.length).toBe(0) // 2 new messages: no check yet
  await typed($, 1)
  await clock.advance(10)
  expect((await ui.find({ type: 'Text', text: /Watching:/ }))?.text).toContain('Watching: 5 of')
  await ui.unmount()
  expect(w.calls.length).toBe(1)
  expect(String(w.calls[0].prompt)).toContain('Build the drift watcher mod')
})

test('a new session id (a /clear or resume) drops the old session\'s checks from the panel', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, DRIFTED, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 5)
  await clock.advance(10)
  let ui: any = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /moved off the goal/ })).toBeTruthy()
  await ui.unmount()

  w.sid = '99999999zz'
  await typed($, 1) // any hook notices the new id
  ui = await $.ui.mount({ ...PANE, requestId: 'drift-watch-99999999', surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /moved off the goal/ })).toBeFalsy()
  expect((await ui.find({ type: 'Text', text: /Session 99999999/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /Watching:/ }))?.text).toContain('Watching: 1 of') // the watcher's memory restarted too
  await ui.unmount()
})

test('a check whose answer lands after the session id changed is dropped, with no pop-up', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ flip: '99999999zz' })
  engine(on, DRIFTED, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 5)
  await clock.advance(10)
  expect(w.calls.length).toBe(1)
  expect(w.toasts.length).toBe(0)
})

const GOAL = '{"label":"Build drift watch v0.2","detail":"Ship the session compass panel. Done when it is live and tested."}'

test('a session started from a handoff file takes its goal from the file, named once by a goal-only call', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ files: { '/tmp/drift-watch-test/proj/.handoffs/next.md': '# Handoff\n## Next steps\n1. Key by session\n2. Name the goal\n3. Draw the path\n' } })
  engine(on, GOAL, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Resume from ~/proj/.handoffs/next.md', origin: { kind: 'composer' } } as any)
  await clock.advance(10)
  expect(w.calls.length).toBe(1)
  expect(w.calls[0].prompt).toContain('1. Key by session')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Build drift watch v0.2' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Done when it is live/ })).toBeTruthy()
  await ui.unmount()
  await typed($, 1)
  await clock.advance(10)
  expect(w.calls.length).toBe(1) // named once, not on every message
})

test('a short opener names no goal; the first message of 15+ words does', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, GOAL, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'ok go', origin: { kind: 'composer' } } as any)
  await clock.advance(10)
  expect(w.calls.length).toBe(0)
  await $.prompt.submit({ text: 'please build the drift watcher panel so that it shows the goal and the path of the session clearly', origin: { kind: 'composer' } } as any)
  await clock.advance(10)
  expect(w.calls.length).toBe(1)
  expect(w.calls[0].prompt).toContain('please build the drift watcher panel')
})

test('off track is decided from raw scores: 2 lows in a row or one drift_start; it ends at 65+ or a return', () => {
  const v = (alignment: number | null, over: Partial<SessionVerdict> = {}): SessionVerdict =>
    ({ alignment, now: 'work', event: 'none', by: null, atMessage: null, reached: [], goalReached: false, why: '', confidence: 0.6, ...over })
  const s = newState(0)
  addGoal(s, { label: 'Build it', by: 'model', setAt: 0, milestones: [{ text: 'a', detail: '' }, { text: 'b', detail: '' }, { text: 'c', detail: '' }] })
  expect(applySession(s, v(90, { reached: [2] }), 1).started).toBe(false)
  expect(applySession(s, v(30), 2).started).toBe(false) // one low score is not enough
  const r = applySession(s, v(30), 3)
  expect(r.started).toBe(true)
  expect(r.row.shown).toBe(Math.round(0.6 * 30 + 0.4 * Math.round(0.6 * 30 + 0.4 * 90))) // smoothing is for drawing only
  expect(applySession(s, v(null), 4).row.offTrack).toBe(true) // unsure keeps the state and the position
  expect(applySession(s, v(70), 5).ended).toBe(true) // back at 65+ ends it at once
  expect(applySession(s, v(40, { event: 'drift_start', by: 'claude', atMessage: 27 }), 6).started).toBe(true)
  expect(s.offTrack).toEqual({ since: 27, by: 'claude' })
  const back = applySession(s, v(55, { event: 'return' }), 7)
  expect(back.ended).toBe(true)
  expect(back.row.shown).toBe(55) // a return resets the smoothing
  expect(cur(s)!.milestones.map(m => m.reachedAt)).toEqual([undefined, 1, undefined]) // exactly what was reported: 2 alone leaves 1 open
  expect(applySession(s, v(90, { reached: [1, 2] }), 8).row.reached).toEqual([1]) // a later report marks 1; 2 is not marked twice
  expect(cur(s)!.milestones.map(m => m.reachedAt)).toEqual([8, 1, undefined])
  expect(applySession(s, v(20, { event: 'new_goal', by: 'claude' }), 9).row.event).toBe('drift_start') // Claude cannot change the goal
  expect(cur(s)!.label).toBe('Build it')
  // The user's switch does not change the goal by itself; it queues the new-goal card's goal call and is an ordinary row.
  const sw = applySession(s, v(95, { event: 'new_goal', by: 'user', now: 'Fix the freeze', atMessage: 10 }), 10)
  expect(sw.row.event).toBe('none')
  expect(cur(s)!.label).toBe('Build it')
  expect(s.goals.length).toBe(1)
  expect(s.spotted).toMatchObject({ label: 'Fix the freeze', by: 'model', atMessage: 10, goalId: cur(s)!.id })
})

test('a stuck-helpers alert clears once the helpers stop', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ helpers: 3 })
  engine(on, CONCERN, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 1)
  await clock.advance(31 * 60_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Helpers look stuck.' })).toBeTruthy()
  w.helpers = 0
  await clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: 'Helpers look stuck.' })).toBeFalsy()
  await ui.unmount()
})

test('the app draws the path as a picture; the terminal gets its turns as plain lines', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, DRIFTED, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 5)
  await clock.advance(10)
  let ui: any = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const pic = await ui.find({ type: 'Svg' })
  expect(String(pic?.props?.alt)).toContain('You moved it')
  expect(String(pic?.props?.source)).toContain('you are here')
  expect(pic?.props?.isInteractive).toBeFalsy() // a plain picture: a hover frame reloaded on every redraw and threw the scroll
  expect(String(pic?.props?.source)).toMatch(/\d+\/\d+ \d+:\d\d(AM|PM)/) // when each check ran, Eastern time
  await ui.unmount()
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Svg' })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: 'msg 5 · You moved it: diagnose app freezes' })).toBeTruthy()
  await ui.unmount()
})

const OK = '{"verdict":"ok","now":"running the test suite","why":"Following the plan.","confidence":0.8}'

test('live actions are counted on the panel; only deploys trigger a check', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, OK, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 1)
  await $.tool.call({ tool: 'Bash', command: 'supabase db push' })
  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  await clock.advance(10)
  expect(w.calls.length).toBe(0)
  await $.tool.call({ tool: 'Bash', command: 'vercel --prod' })
  await clock.advance(10)
  expect(w.calls.length).toBe(1)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Live actions this session: 1 database push, 1 push to main, 1 deploy' })).toBeTruthy()
  await ui.unmount()
})

test('above 70% context the panel offers Hand off, which fills an empty prompt box and sends nothing', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ pct: 82 })
  engine(on, OK, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'drift', args: 'goal Ship the compass' } as any)
  await typed($, 1)
  await clock.advance(60_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Context 82% full/ })).toBeTruthy()
  await ui.press({ key: (await ui.find({ type: 'Button', text: 'Hand off' }))!.key! })
  await ui.unmount()
  expect(w.submitted.length).toBe(1) // only the user's own message: Hand off never sends
  expect(w.fills.length).toBe(1)
  expect(w.fills[0].mode).toBe('replace') // the box was empty
  expect(w.fills[0].text).toMatch(/^Hand off this session: write a handoff a fresh session can resume from, using these facts\.\nWhy now: context at 82%\nGoal: Ship the compass/)
})

test('a long stretch of Claude working alone becomes one path row', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  engine(on, OK, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 1)
  for (let i = 0; i < 3; i++) {
    await clock.advance(5 * 60_000)
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await clock.advance(10)
  }
  expect(w.calls.length).toBe(3)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const src = String((await ui.find({ type: 'Svg' }))?.props?.source)
  expect(src).toContain('Claude alone')
  expect(src).toContain('checks · all fine')
  expect(await ui.find({ type: 'Text', text: 'Now: running the test suite' })).toBeTruthy()
  await ui.unmount()
})

test('after a restart the path comes back from the plugin store', async ($, on) => {
  const clock = mock.clock(on)
  const row = { n: 5, t: 1, raw: 90, shown: 90, now: 'restored row', event: 'none', why: '', offTrack: false }
  const w = world({ store: { 'session:99999999zz': { path: [row], goals: [] } } })
  engine(on, OK, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  w.sid = '99999999zz'
  await typed($, 1)
  await clock.advance(10)
  const ui = await $.ui.mount({ ...PANE, requestId: 'drift-watch-99999999', surface: 'desktop' })
  expect(String((await ui.find({ type: 'Svg' }))?.props?.source)).toContain('restored row')
  await ui.unmount()
})

test('a check that lands after the user set a new goal is dropped', async ($, on) => {
  const clock = mock.clock(on)
  const w = world()
  w.during = () => ((w.during = undefined), $.command.run({ command: 'drift', args: 'goal Switch to the invoice export' } as any)) // once, inside the session check
  engine(on, CLAUDE_DRIFT, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 5)
  await clock.advance(10)
  expect(w.calls[0].system).toContain('wandered away') // the session check, dropped
  expect(w.calls.slice(1).every(c => String(c.system).includes('plan the goal'))).toBe(true) // then only the milestone call for the user's goal
  expect(w.toasts.length).toBe(0)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Switch to the invoice export' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Off track/ })).toBeFalsy()
  await ui.unmount()
})

test('the panel always shows context and how many times the session compacted', async ($, on) => {
  const clock = mock.clock(on)
  const history = [{ role: 'user', text: 'This session is being continued from a previous conversation.', toolUses: [] }]
  const w = world({ pct: 40, history })
  engine(on, OK, w)
  const summary = [{ role: 'user', text: 'This session is being continued.', toolUses: [] }]
  on('session.compact', () => ({ messages: summary } as any))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(60_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Context 40% · Compacts 1' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: 'Hand off' })).toBeFalsy() // the Hand off hint waits for 70%
  await $.session.compact({ trigger: 'precompute', messages: summary } as any)
  expect(await ui.find({ type: 'Text', text: 'Context 40% · Compacts 1' })).toBeTruthy() // a precompute changes nothing
  await $.session.compact({ trigger: 'manual', messages: summary } as any)
  expect(await ui.find({ type: 'Text', text: 'Context 40% · Compacts 2' })).toBeTruthy()
  await ui.unmount()
})

// ---- goals list, milestones, goal reached, context colors, click for detail ----

const PLANNED = JSON.stringify({
  label: 'Build drift watch v0.3', detail: 'Ship goal tracking.', doneWhen: 'Shipped and live-tested', vague: false, related: false,
  milestones: [
    { text: 'Key the panel by session', detail: 'Each session gets its own panel. Two sessions never share one.' },
    { text: 'Name the goal from the handoff', detail: 'The goal call reads the handoff. It names the goal once.' },
    { text: 'Draw the path', detail: 'Dots for each check. Hover shows what the check saw.' },
  ],
})
const REACHED = '{"alignment":92,"now":"drawing the path","event":"none","by":null,"atMessage":null,"reached":[1,2],"goalReached":true,"why":"The path is drawn and tested.","confidence":0.8}'
const HANDOFF = { '/tmp/drift-watch-test/proj/.handoffs/next.md': '# Handoff\n## Next steps\n1. Key by session\n2. Name the goal\n3. Draw the path\n' }

async function fromHandoff($: any, clock: any) {
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Resume from ~/proj/.handoffs/next.md', origin: { kind: 'composer' } } as any)
  await clock.advance(10)
}

test('the goal call writes milestones (maxTokens 1200), shown numbered; a click opens 2 sentences and a second closes them', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ sid: 'v3mile0001', files: { ...HANDOFF } })
  engine(on, PLANNED, w)
  await fromHandoff($, clock)
  expect(w.calls.length).toBe(1)
  expect(w.calls[0].maxTokens).toBe(1200)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'MILESTONES' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '0 of 3' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '→ 1. ' })).toBeTruthy() // the next one to reach
  const m2 = await ui.find({ type: 'Button', text: /Name the goal from the handoff/ })
  expect(await ui.find({ type: 'Text', text: 'The goal call reads the handoff. It names the goal once.' })).toBeFalsy()
  await ui.press({ key: m2!.key! })
  expect(await ui.find({ type: 'Text', text: 'The goal call reads the handoff. It names the goal once.' })).toBeTruthy()
  await ui.press({ key: m2!.key! })
  expect(await ui.find({ type: 'Text', text: 'The goal call reads the handoff. It names the goal once.' })).toBeFalsy()
  await ui.press({ key: (await ui.find({ type: 'Button', text: /Build drift watch v0.3/ }))!.key! })
  expect(await ui.find({ type: 'Text', text: 'Done when: Shipped and live-tested' })).toBeTruthy()
  await ui.unmount()
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' }) // the terminal: the same list as plain lines
  expect(await term.find({ type: 'Button', text: /Draw the path/ })).toBeTruthy()
  await term.unmount()
})

test('the session check marks milestones reached in order and suggests Looks reached; Not yet closes it, Mark reached ends the goal', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ sid: 'v3reach001', files: { ...HANDOFF }, answers: [PLANNED] })
  engine(on, REACHED, w)
  await fromHandoff($, clock)
  await typed($, 3)
  await clock.advance(10)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '✓ 1. ' })).toBeTruthy() // reaching 2 marks 1 too
  expect(await ui.find({ type: 'Text', text: '✓ 2. ' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '→ 3. ' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '2 of 3' })).toBeTruthy()
  expect(String((await ui.find({ type: 'Svg' }))?.props?.source)).toContain('>M1 M2</text>') // one diamond on the line, both marks beside it
  expect(await ui.find({ type: 'Text', text: 'Looks reached.' })).toBeTruthy()
  const mark = await ui.find({ type: 'Button', text: 'Mark reached' })
  expect(mark?.props?.variant).toBe('primary') // one main button
  await ui.press({ key: (await ui.find({ type: 'Button', text: 'Not yet' }))!.key! })
  expect(await ui.find({ type: 'Text', text: 'Looks reached.' })).toBeFalsy()
  await ui.press({ key: (await ui.find({ type: 'Button', text: 'Mark reached' }))!.key! }) // the user can mark it themselves from On track
  expect(await ui.find({ type: 'Text', text: 'Goal reached.' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'Reached' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: 'New goal' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: 'Hand off' })).toBeTruthy()
  await ui.unmount()
  expect(w.submitted.length).toBe(4) // only the user's own: the opener and three messages
})

test('after Not yet, Looks reached stays quiet until another milestone is reached or 2 checks pass', () => {
  const v = (over: Partial<SessionVerdict> = {}): SessionVerdict =>
    ({ alignment: 90, now: 'work', event: 'none', by: null, atMessage: null, reached: [], goalReached: true, why: 'Looks done.', confidence: 0.8, ...over })
  const s = newState(0)
  addGoal(s, { label: 'Ship it', by: 'user', setAt: 0, milestones: [{ text: 'a', detail: '' }, { text: 'b', detail: '' }] })
  applySession(s, v(), 1)
  expect(s.pending?.kind).toBe('reached')
  s.pending = undefined
  s.notYet = { reached: 0, checks: 0 } // what the Not yet press sets
  applySession(s, v(), 2)
  applySession(s, v(), 3)
  expect(s.pending).toBeUndefined() // 2 quiet checks
  applySession(s, v(), 4)
  expect((s.pending as any)?.kind).toBe('reached') // then it may ask again
  s.pending = undefined
  s.notYet = { reached: 0, checks: 0 }
  applySession(s, v({ reached: [1] }), 5)
  expect((s.pending as any)?.kind).toBe('reached') // a newly reached milestone ends the quiet at once
})

// ---- the new-goal card, Edit goal in place with a re-judge, fork in two columns, Return, Hand off fills the box ----

const SWITCH = '{"alignment":95,"now":"fix the invoice export","event":"new_goal","by":"user","atMessage":4,"reached":[],"goalReached":false,"why":"the user asked to switch to the invoice export.","confidence":0.9}'
const SPOT = JSON.stringify({ label: 'Fix the invoice export', detail: 'Exports match the ledger.', doneWhen: 'Export matches', vague: false, related: true,
  milestones: [{ text: 'Find the bad rows', detail: 'a. b.' }, { text: 'Fix the export', detail: 'c. d.' }] })
const log = (w: World, sid: string) => w.store[`session:${sid}`] // the session's stored snapshot
const press = async (ui: any, text: string | RegExp) => ui.press({ key: (await ui.find({ type: 'Button', text }))!.key! })

// A goal from the handoff, then a check that finds the user's switch, then the switch's own goal call: the card is open.
async function spotted($: any, on: any, sid: string, over: Partial<World> = {}) {
  const clock = mock.clock(on)
  const w = world({ sid, files: { ...HANDOFF }, answers: [PLANNED, SWITCH, SPOT], ...over })
  engine(on, OK, w)
  await fromHandoff($, clock)
  await typed($, 3)
  await clock.advance(10)
  return { w, clock }
}

test('a switch the user made opens the new-goal card and changes no goal until a press; Back returns to step 1', async ($, on) => {
  const { w } = await spotted($, on, 'v34card001')
  expect(w.calls.length).toBe(3) // goal call, session check, then the goal call on the proposed label
  expect(String(w.calls[2].prompt)).toContain('THE GOAL (named from the conversation): fix the invoice export')
  expect(String(w.calls[2].prompt)).toContain('THE GOAL BEFORE IT: Build drift watch v0.3')
  const ui = await $.ui.mount({ ...PANE, requestId: 'drift-watch-v34card0', surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Looks like a new goal: fix the invoice export/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'From your message 4. Recommended: Continue here. Small and related.' })).toBeTruthy()
  expect((await ui.find({ type: 'Button', text: 'Continue here' }))?.props?.variant).toBe('primary')
  for (const b of ['Hand off', 'Not a new goal', 'Dismiss']) expect(await ui.find({ type: 'Button', text: b })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'Build drift watch v0.3' })).toBeTruthy() // the goal is unchanged
  expect(String((await ui.find({ type: 'Svg' }))?.props?.source)).not.toContain('New goal') // no New goal dot yet
  await press(ui, 'Continue here')
  expect(await ui.find({ type: 'Text', text: /A change to the current goal, or a separate goal/ })).toBeTruthy()
  for (const b of ['Edit the current goal', 'Set a new goal', 'Back', 'Dismiss']) expect(await ui.find({ type: 'Button', text: b })).toBeTruthy()
  await press(ui, 'Back')
  expect(await ui.find({ type: 'Text', text: /Looks like a new goal/ })).toBeTruthy()
  await ui.unmount()
  const goals = log(w, 'v34card001').goals
  expect(goals.length === 1 && goals[0].label === 'Build drift watch v0.3' && goals[0].status === 'active').toBe(true)
  expect(w.submitted.length).toBe(4)
})

test('the recommendation is decided by code: unrelated, 4+ milestones or context over 60% hand off; else continue here', () => {
  const a = parseGoal(SPOT)!
  const four = { ...a, milestones: [1, 2, 3, 4].map(n => ({ text: `m${n}`, detail: '' })) }
  expect(recommend({ ...a, related: false }, 20)).toEqual({ recommend: 'handoff', reason: 'Unrelated to the current goal.' })
  expect(recommend(four, 20)).toEqual({ recommend: 'handoff', reason: 'Big: 4 milestones.' })
  expect(recommend(a, 61)).toEqual({ recommend: 'handoff', reason: 'Context is at 61%.' })
  expect(recommend(a, 41)).toEqual({ recommend: 'continue', reason: 'Small and related.' })
  expect(recommend(null, 90).recommend).toBe('continue') // the goal call failed: when unsure, continue here
  const s = newState(0)
  addGoal(s, { label: 'Build it', by: 'model', setAt: 0 })
  s.contextPct = 64
  openNewGoal(s, { label: 'Other', by: 'model', atMessage: null, version: 0 }, a)
  const c = card(s, [], false)
  expect(c.main).toBe('newgoal_handoff')
  expect(c.why).toBe('Recommended: Hand off. Context is at 64%.')
})

test('Dismiss does not ask about the same label again; a different label does', () => {
  const v = (now: string): SessionVerdict => ({ alignment: 90, now, event: 'new_goal', by: 'user', atMessage: 3, reached: [], goalReached: false, why: '', confidence: 0.8 })
  const s = newState(0)
  addGoal(s, { label: 'Build it', by: 'model', setAt: 0 })
  applySession(s, v('Fix the freeze'), 1)
  openNewGoal(s, s.spotted!, null)
  s.spotted = undefined
  applySession(s, v('fix the freeze'), 2) // the card is already open for it
  expect(s.spotted).toBeUndefined()
  closeNewGoal(s) // Dismiss
  expect(s.pending).toBeUndefined()
  applySession(s, v('Fix the freeze'), 3)
  expect(s.spotted).toBeUndefined()
  applySession(s, v('Write the invoice report'), 4)
  expect((s.spotted as any)?.label).toBe('Write the invoice report')
  expect(cur(s)!.label).toBe('Build it')
})

test('Not a new goal shows the misread card with Edit goal and logs a false alarm, not a dismiss', async ($, on) => {
  const { w } = await spotted($, on, 'v34not0001')
  const ui = await $.ui.mount({ ...PANE, requestId: 'drift-watch-v34not00', surface: 'desktop' })
  await press(ui, 'Not a new goal')
  expect(await ui.find({ type: 'Text', text: 'Drift watch misread the goal.' })).toBeTruthy()
  expect((await ui.find({ type: 'Button', text: 'Edit goal' }))?.props?.variant).toBe('primary')
  await press(ui, 'Edit goal')
  expect((await ui.find({ type: 'Input' }))?.props?.value).toBe('Build drift watch v0.3')
  await ui.unmount()
  expect(log(w, 'v34not0001').asked).toEqual(['fix the invoice export'])
})

test('Set a new goal forks with the kept answer: the old goal pauses with its verdict and the chart gets two columns; Return swaps back', async ($, on) => {
  const { w, clock } = await spotted($, on, 'v34fork001')
  const ui = await $.ui.mount({ ...PANE, requestId: 'drift-watch-v34fork0', surface: 'desktop' })
  await press(ui, 'Continue here')
  await press(ui, 'Set a new goal')
  await clock.advance(60_000)
  expect(w.calls.length).toBe(3) // no second goal call: the card's answer is used
  expect(await ui.find({ type: 'Text', text: 'fix the invoice export' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: /Find the bad rows/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'EARLIER GOALS' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Paused, 0 of 3 milestones\./ })).toBeTruthy()
  const svg = String((await ui.find({ type: 'Svg' }))?.props?.source)
  expect(svg).toContain('x1="84"') // the earlier goal's column
  expect(svg).toContain('x1="146"') // the current goal's column
  expect(svg).toContain('⏸ Paused, 0 of 3 milestones.')
  await press(ui, 'Return')
  expect(await ui.find({ type: 'Text', text: 'Build drift watch v0.3' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Paused, 0 of 2 milestones\./ })).toBeTruthy() // the forked goal, with its own verdict
  expect(String((await ui.find({ type: 'Svg' }))?.props?.source)).toContain('Back to this goal')
  await ui.unmount()
  const last = (label: string) => log(w, 'v34fork001').goals.find((g: any) => g.label === label)
  expect(last('Build drift watch v0.3')).toMatchObject({ status: 'active' })
  expect(last('fix the invoice export')).toMatchObject({ status: 'paused', verdict: 'Paused, 0 of 2 milestones.', by: 'model' })
  expect(w.submitted.length).toBe(4) // Return tells Claude nothing
})

test('a fork pauses the old goal with "3 of 5"; the two newest goals get their own columns, older ones stay dimmed on the left', () => {
  const s = newState(0)
  const ms = [1, 2, 3, 4, 5].map(n => ({ text: `m${n}`, detail: '', ...(n <= 3 ? { reachedAt: n } : {}) }))
  const g1 = addGoal(s, { label: 'First goal', by: 'user', setAt: 0, milestones: ms })
  const row = (n: number, shown: number) => ({ n, t: n, raw: shown, shown, now: `work ${n}`, goalId: s.current, event: 'none', why: '', offTrack: false })
  s.path.push(row(1, 90), row(2, 70), row(3, 92))
  setGoal(s, 'Second goal', 4)
  expect(g1).toMatchObject({ status: 'paused', verdict: 'Paused, 3 of 5 milestones.' })
  s.path.push(row(5, 88), row(6, 60))
  const d = drawRows(s)
  expect(d.rows.map(r => !!r.left)).toEqual([true, true, true, false, false, false])
  expect(d.rows[2]!.verdict).toBe('Paused, 3 of 5 milestones.')
  const p = pathSvg(d)
  expect(p.width).toBe(360)
  expect(p.svg).toContain('⏸ Paused, 3 of 5 milestones.')
  expect(p.alt).toContain('an earlier goal stopped at message 3: Paused, 3 of 5 milestones.')
  returnTo(s, g1.id, 7)
  expect(cur(s)!.label).toBe('First goal')
  expect(s.goals.map(g => [g.label, g.status, g.verdict])).toEqual([['First goal', 'active', undefined], ['Second goal', 'paused', 'Paused.']])
  expect(drawRows(s).rows.map(r => !!r.left)).toEqual([false, false, false, true, true, true, false]) // the returned goal is main again
  // A single goal keeps today's one column.
  const one = newState(0)
  addGoal(one, { label: 'Only', by: 'user', setAt: 0 })
  one.path.push({ ...row(1, 90), goalId: one.current })
  expect(pathSvg(drawRows(one)).svg).toContain('x1="90"')
})

test('Edit goal keeps the id and bumps the version; a re-judge re-colors dots and recomputes off track, never a pop-up', () => {
  const v = (alignment: number): SessionVerdict => ({ alignment, now: 'work', event: 'none', by: null, atMessage: null, reached: [], goalReached: false, why: 'w', confidence: 0.8 })
  const s = newState(0)
  const g = addGoal(s, { label: 'Build it', by: 'user', setAt: 0, planned: true })
  applySession(s, v(90), 1)
  applySession(s, v(30), 2)
  expect(applySession(s, v(30), 3).started).toBe(true)
  editGoal(s, 'Refactor the logger', 4)
  expect(cur(s)).toBe(g)
  expect(g).toMatchObject({ label: 'Refactor the logger', version: 1, planned: false, by: 'user' })
  expect(s.rejudge).toEqual({ goalId: g.id, version: 1 })
  const rows = rejudgeRows(s)
  expect(rows.length).toBe(3)
  expect(parseScores('[90, 85]', 3)).toBeNull() // wrong length: dropped whole
  expect(parseScores('[90, 85, "x"]', 3)).toBeNull()
  const r = applyRejudge(s, rows, parseScores('Scores: [90, 85, 80]', 3)!)
  expect(r.ended).toBe(true)
  expect(s.offTrack).toBeUndefined()
  expect(s.path.map(x => [x.raw, x.shown, x.offTrack])).toEqual([[90, 90, false], [85, 87, false], [80, 83, false]])
  expect(drawRows(s).rows.map(x => x.tone)).toEqual(['green', 'green', 'green'])
  // The other way: low scores put it off track (the card can say so), but a re-judge has no alert path at all.
  applyRejudge(s, rows, [90, 30, 30])
  expect(s.offTrack).toEqual({ since: 0, by: 'claude', past: true }) // 2 lows in a row; userCount is 0 in this pure test
  // Found in the past: the calm blue side-trip card, never the amber Stop and correct.
  const c = card(s, [], false)
  expect([c.tone, c.main, c.buttons.includes('correct')]).toEqual(['blue', 'goal', false])
  expect(c.title).toBe('Earlier side trip found, since message 0.')
  // the user caused it and hasn't okayed it: yellow, Fine first; okayed: blue.
  s.offTrack = { since: 4, by: 'user' }
  const y = card(s, [], false)
  expect([y.tone, y.main, y.title]).toEqual(['yellow', 'fine', 'You moved off the goal at message 4.'])
  expect(y.buttons).toEqual(['fine', 'newgoal_spot', 'handoff']) // accident: steer back; side trip: Fine; a real new goal: say so
  s.offTrack.okayed = true
  expect(card(s, [], false).tone).toBe('blue')
  // A stretch the user caused that the re-judge found is yellow too, and can be okayed.
  s.offTrack = { since: 4, by: 'user', past: true }
  expect([card(s, [], false).tone, card(s, [], false).main]).toEqual(['yellow', 'fine'])
  s.offTrack.okayed = true
  expect(card(s, [], false).title).toBe('Side trip okayed, since message 4.')

  // A found Claude stretch that a live check confirms is current again: amber.
  s.offTrack = { since: 5, by: 'claude', past: true }
  applySession(s, v(30), 9)
  expect([s.offTrack?.past, card(s, [], false).tone]).toEqual([undefined, 'amber'])
})

test('in the panel, Edit goal re-plans and re-judges through the tick queue; a wrong-length or stale answer is dropped', async ($, on) => {
  const clock = mock.clock(on)
  const rescore = ['[92]', '[92, 90]', '[95, 95]']
  const w = world({ sid: 'v34edit001' })
  w.reply = e => (String(e.system).includes('re-score') ? rescore.shift() : String(e.system).includes('plan the goal') ? PLANNED : String(e.system).includes('wandered') ? CLAUDE_DRIFT : undefined)
  engine(on, OK, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'drift', args: 'goal Build the drift watcher' } as any)
  await typed($, 3)
  await clock.advance(10)
  await typed($, 3)
  await clock.advance(10)
  expect(w.toasts.length).toBe(1)
  const ui = await $.ui.mount({ ...PANE, requestId: 'drift-watch-v34edit0', surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Off track since message 3/ })).toBeTruthy()
  const edit = async (words: string) => {
    await press(ui, 'Edit goal')
    expect(await ui.find({ type: 'Text', text: /edited in place/ })).toBeTruthy()
    await ui.input({ key: 'draft', text: words, kind: 'submit' })
  }
  await edit('Build the logger refactor')
  await clock.advance(10)
  const re = w.calls.filter(c => String(c.system).includes('re-score'))
  expect(re.length).toBe(1)
  expect(re[0].maxTokens).toBe(8 * 2 + 100)
  expect(String(re[0].prompt)).toContain('THE GOAL (the user just edited it): Build the logger refactor')
  expect(await ui.find({ type: 'Text', text: /Off track since message 3/ })).toBeTruthy() // '[92]' for 2 rows: dropped
  await edit('Refactor the logger')
  await clock.advance(10)
  expect(w.calls.filter(c => String(c.system).includes('re-score')).length).toBe(2)
  expect(await ui.find({ type: 'Text', text: /Off track/ })).toBeFalsy() // '[92, 90]': back on track
  expect(w.toasts.length).toBe(1) // no pop-up from a re-judge
  // A goal change while the next re-judge is out makes its answer stale: dropped. (The test kit cannot press a button
  // while a model call is out, so the change here is a "/drift goal" fork; an edit's version bump goes through the same guard.)
  w.during = async () => {
    if (!String(w.calls.at(-1).system).includes('re-score')) return
    w.during = undefined
    await $.command.run({ command: 'drift', args: 'goal Something else' } as any)
  }
  await edit('Refactor the logger only')
  await clock.advance(10)
  expect(w.calls.filter(c => String(c.system).includes('re-score')).length).toBe(3)
  expect(await ui.find({ type: 'Text', text: 'Something else' })).toBeTruthy()
  await ui.unmount()
  const { goals, path } = log(w, 'v34edit001')
  expect(goals[0]).toMatchObject({ label: 'Refactor the logger only', version: 3, status: 'paused' }) // one goal, edited in place
  expect(goals.length).toBe(2) // and the fork
  expect(path.filter((r: any) => r.event !== 'new_goal').map((r: any) => r.raw)).toEqual([92, 90]) // re-scored; never the stale 95s
})

test('after a restart the goals, milestones and reached marks come back from the plugin store, with no new goal call', async ($, on) => {
  const clock = mock.clock(on)
  const goal = { id: 'g1-5', label: 'Restored goal', detail: 'From the log.', by: 'user', setAt: 5, status: 'active', planned: true, milestones: [{ text: 'First step', detail: 'x', reachedAt: 9 }, { text: 'Second step', detail: 'y' }] }
  const old = { ...goal, id: 'g0-1', label: 'Older goal', setAt: 1, status: 'paused', milestones: [] }
  const row = { n: 5, t: 9, raw: 90, shown: 90, now: 'restored row', event: 'none', why: '', offTrack: false, reached: [1] }
  const w = world({ history: [{ role: 'user', text: 'please build the drift watcher panel so that it shows the goal and the path of the session clearly', toolUses: [] }],
    store: { 'session:99999999zz': { path: [row], goals: [old, goal], current: goal.id } } })
  engine(on, OK, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  w.sid = '99999999zz'
  await typed($, 1)
  await clock.advance(10)
  expect(w.calls.length).toBe(0) // the restored goal is current and planned: nothing to name
  const ui = await $.ui.mount({ ...PANE, requestId: 'drift-watch-99999999', surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Restored goal' })).toBeTruthy() 
  expect(await ui.find({ type: 'Text', text: '✓ 1. ' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: /Second step/ })).toBeTruthy()
  expect(String((await ui.find({ type: 'Svg' }))?.props?.source)).toContain('restored row')
  await ui.unmount()
})

test('the context figure is green under 30%, yellow from 30, orange from 40 and red from 50', async ($, on) => {
  expect([0, 29, 30, 39, 40, 49, 50, 90].map(contextColor)).toEqual(['success', 'success', 'warning', 'warning', '#f08c3a', '#f08c3a', 'error', 'error'])
  expect(contextColor(undefined)).toBeUndefined()
  const clock = mock.clock(on)
  const w = world({ sid: 'v3color001', pct: 44 })
  engine(on, OK, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(60_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^44%$/ }))?.props?.color).toBe('#f08c3a') // the figure alone; the line stays dim
  await ui.unmount()
})

test('a plan file Claude reads feeds the goal call; a file named like a secret never does', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ sid: 'v3plan0001', files: { '/p/.planning/PLAN.md': '## Phase 1\nMilestone text from the plan file.', '/p/secret-PLAN.md': 'do not send' } })
  engine(on, PLANNED, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/p/.planning/PLAN.md' } as any)
  await $.tool.call({ tool: 'Read', file_path: '/p/secret-PLAN.md' } as any)
  await $.command.run({ command: 'drift', args: 'goal Ship the invoice export' } as any)
  await typed($, 1)
  await clock.advance(10)
  expect(w.calls.length).toBe(1)
  expect(String(w.calls[0].prompt)).toContain('Milestone text from the plan file.')
  expect(String(w.calls[0].prompt)).not.toContain('do not send')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Ship the invoice export' })).toBeTruthy() // the user's words stay the label
  expect(await ui.find({ type: 'Button', text: /Draw the path/ })).toBeTruthy()
  await ui.unmount()
})

test('only a .md file inside a .handoffs/ folder is read as the brief; other paths never are', () => {
  expect(handoffPath('Resume from ~/proj/.handoffs/next.md please')).toBe('~/proj/.handoffs/next.md')
  expect(handoffPath('pick up `.handoffs/2026-01-02-auth.md`')).toBe('.handoffs/2026-01-02-auth.md')
  expect(handoffPath('Resume from ~/notes/HANDOFF.md')).toBeUndefined()
  expect(handoffPath('read /etc/.handoffs/x.txt')).toBeUndefined()
})

test('deploy words inside quotes or a pasted block are not live actions', () => {
  expect(liveAction('Bash', 'npx vercel --prod')).toBe('deploy')
  expect(liveAction('Bash', 'supabase db push')).toBe('database push')
  expect(liveAction('Bash', `python3 - <<'EOF'\nx = "supabase db push"\nEOF`)).toBeUndefined()
  expect(liveAction('Bash', `sed -i '' 's/vercel --prod/x/' f`)).toBeUndefined()
  expect(liveAction('Bash', 'echo "git push origin main"')).toBeUndefined()
  expect(liveAction('Bash', 'cat <<EOF > f && vercel --prod\nbody\nEOF')).toBe('deploy') // a heredoc keeps the rest of its first line
})

test('check times read as local month/day and 12-hour time', () => {
  const t = new Date(2026, 5, 7, 12, 15).getTime() // local time, so the test passes in any time zone
  expect(stamp(t)).toBe('6/7 12:15PM')
  expect(stamp(new Date(2026, 11, 1, 0, 5).getTime())).toBe('12/1 12:05AM')
})

// ---- path at its own size, milestones done before planning, less yellow, alerts log, goals in the chart, legend ----

test('a milestone finished before the milestones were written is marked by the goal call; a re-plan keeps marks', async ($, on) => {
  const clock = mock.clock(on)
  const DONE = JSON.stringify({ ...JSON.parse(PLANNED), done: [1] })
  const w = world({ sid: 'v33done001', files: { ...HANDOFF } })
  engine(on, DONE, w)
  await fromHandoff($, clock)
  expect(String(w.calls[0].prompt)).toContain("THE USER'S MESSAGES SO FAR") // what it judges done from
  expect(String(w.calls[0].prompt)).toContain('"done":[numbers]')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '✓ 1. ' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '→ 2. ' })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: '1 of 3' }))?.props?.color).not.toBe('yellow')
  await ui.unmount()
  // A re-plan with no done list keeps milestone 1 reached; the session check asks for anything not yet marked.
  const s = newState(0)
  addGoal(s, { label: 'Ship it', by: 'user', setAt: 0, milestones: [{ text: parseGoal(PLANNED)!.milestones[0]!.text, detail: '', reachedAt: 5 }, { text: 'b', detail: '' }] }) // a mark carries over only onto the same text
  applyGoal(s, { ...parseGoal(PLANNED)!, done: [3] }, 9, cur(s)!.id)
  expect(cur(s)!.milestones.map(m => m.reachedAt)).toEqual([5, undefined, 9])
  expect(parseGoal(PLANNED)!.done).toEqual([])
})

test('the path is drawn 1:1 with goal tags, milestone diamonds, dimmed earlier goals and a legend, under the size cap', () => {
  const s = newState(0)
  const g1 = addGoal(s, { label: 'First goal', by: 'model', setAt: 0, milestones: [{ text: 'a', detail: '', reachedAt: 20 }] })
  const row = (n: number, t: number) => ({ n, t, raw: 90, shown: 90, now: 'x'.repeat(60), goalId: s.current, event: 'none', why: '', offTrack: false })
  s.path.push(row(3, 10), row(6, 20))
  addGoal(s, { label: 'Second goal', by: 'user', setAt: 30 })
  for (let i = 0; i < 9; i++) s.path.push(row(9 + i, 40 + i))
  const d = drawRows(s)
  expect(d.older).toBe(1) // msg 3 is folded; the first shown row still carries its goal's tag
  expect(d.rows.filter(r => r.goal).map(r => r.goal)).toEqual(['First goal', 'Second goal'])
  expect(d.rows[0]!.dim).toBe(true)
  expect(d.rows.find(r => r.n === 6)?.marks).toEqual([1]) // on the row it was reached at
  const p = pathSvg(d)
  expect(p.svg.length).toBeLessThan(131072)
  for (const x of ['Goal: First goal', 'Goal: Second goal', '>M1</text>', 'opacity="0.45"', 'on track', 'Claude moved off the goal', 'milestone reached', 'you are here']) expect(p.svg).toContain(x)
  expect(p.svg).toContain(`width="${p.width}" height="${p.height}"`)
  expect(g1.status).toBe('paused')
})

test('the panel: picture at its own size, context near the top, footer on one line, live line dim until a new deploy', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ sid: 'v33panel01', pct: 20 })
  engine(on, DRIFTED, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 3)
  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  await clock.advance(60_000)
  const ui = await $.ui.mount({ ...PANE, requestId: 'drift-watch-v33panel', surface: 'desktop' })
  const pic = await ui.find({ type: 'Svg' })
  expect(pic?.props?.width).toBe(360)
  expect(pic?.props?.height).toBeGreaterThan(100)
  expect(String(pic?.props?.source)).toContain(`height="${pic?.props?.height}"`)
  expect(await ui.find({ type: 'Text', text: 'Watching: 3 of your messages counted · Session v33panel' })).toBeTruthy()
  const live = await ui.find({ type: 'Text', text: /Live actions/ })
  expect(live?.props?.dimColor).toBe(true)
  expect(live?.props?.color).toBeUndefined()
  // Order: goal, context, status, …, chart, footer.
  const texts = JSON.stringify(await ui.find({ type: 'Box' }))
  const at = (x: string) => texts.indexOf(x)
  expect(at("THIS SESSION'S GOAL")).toBeLessThan(at('Compacts'))
  expect(at('Compacts')).toBeLessThan(at('You moved off the goal at message'))
  expect(at('HOW THE SESSION HAS MOVED')).toBeLessThan(at('Watching:'))
  await $.tool.call({ tool: 'Bash', command: 'vercel --prod' }) // a deploy after the user's last message
  await clock.advance(10)
  expect((await ui.find({ type: 'Text', text: /Live actions/ }))?.props?.color).toBe('#f2a25c')
  await typed($, 1)
  await clock.advance(10)
  expect((await ui.find({ type: 'Text', text: /Live actions/ }))?.props?.dimColor).toBe(true) // the user has spoken since
  await ui.unmount()
})

test('the alerts log lists every raised alert newest first, by kind and who, and one click opens or closes it', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ sid: 'v33alert01', answers: [CLAUDE_DRIFT, CONCERN] })
  engine(on, OK, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 3)
  await clock.advance(10)
  await $.tool.call({ tool: 'Bash', command: 'vercel --prod' })
  await clock.advance(10)
  const term = await $.ui.mount({ ...PANE, requestId: 'drift-watch-v33alert', surface: 'terminal' })
  const head = await term.find({ type: 'Button', text: /Alerts \(2\)/ })
  expect(head).toBeTruthy()
  expect(await term.find({ type: 'Text', text: /Deploy · Claude: the user named the test client/ })).toBeFalsy()
  await term.press({ key: head!.key! })
  const deploy = await term.find({ type: 'Text', text: /Deploy · Claude: the user named the test client/ })
  const drift = await term.find({ type: 'Text', text: /Off track · Claude: Claude began a logger refactor/ })
  expect(deploy && drift).toBeTruthy()
  expect(String(deploy!.text)).toMatch(/^\d+\/\d+ \d+:\d\d(AM|PM) · /)
  const texts = JSON.stringify(await term.find({ type: 'Box' }))
  expect(texts.indexOf('Deploy · ')).toBeLessThan(texts.indexOf('Off track · ')) // newest first
  await term.press({ key: (await term.find({ type: 'Button', text: /Alerts \(2\)/ }))!.key! })
  expect(await term.find({ type: 'Text', text: /Deploy · Claude/ })).toBeFalsy()
  await term.unmount()
})

test('after a restart the goals, their versions and an open new-goal card come back from the plugin store', async ($, on) => {
  const clock = mock.clock(on)
  const goal = { id: 'g1-5', label: 'Edited goal', by: 'user', setAt: 5, status: 'active', planned: true, version: 2, milestones: [{ text: 'First step', detail: 'x' }] }
  const card = { kind: 'newgoal', step: 2, label: 'Write the report', by: 'model', recommend: 'continue', reason: 'Small and related.', atMessage: 4 }
  const w = world({ store: { 'session:99999999zz': { path: [], goals: [goal], current: goal.id, pending: card, asked: ['old label'] } } })
  engine(on, OK, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  w.sid = '99999999zz'
  await typed($, 1)
  await clock.advance(10)
  expect(w.calls.length).toBe(0)
  const ui = await $.ui.mount({ ...PANE, requestId: 'drift-watch-99999999', surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Edited goal' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /A change to the current goal, or a separate goal/ })).toBeTruthy()
  await press(ui, 'Dismiss')
  expect(await ui.find({ type: 'Text', text: /separate goal/ })).toBeFalsy()
  await ui.unmount()
  const after = log(w, '99999999zz')
  expect(after.goals.at(-1).version).toBe(2)
  expect(after.pending).toBeUndefined()
  expect(after.asked).toEqual(['old label', 'write the report'])
})

test('New goal (the button): their words get the goal call, then the step 1 card with its recommendation', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ sid: 'v34new0001', pct: 64 })
  w.reply = e => (String(e.system).includes('plan the goal') ? (String(e.prompt).includes('THE GOAL BEFORE IT') ? SPOT : PLANNED) : String(e.system).includes('wandered') ? CLAUDE_DRIFT : undefined)
  engine(on, OK, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'drift', args: 'goal Build the drift watcher' } as any)
  await typed($, 3)
  await clock.advance(10)
  const ui = await $.ui.mount({ ...PANE, requestId: 'drift-watch-v34new00', surface: 'desktop' })
  await press(ui, 'New goal') // on the off-track card
  expect(await ui.find({ type: 'Text', text: 'New goal, in your words:' })).toBeTruthy()
  const n = w.calls.length
  await ui.input({ key: 'draft', text: 'Fix the invoice export', kind: 'submit' })
  expect(w.calls.length).toBe(n) // never inside the press
  await clock.advance(10)
  expect(String(w.calls.at(-1).prompt)).toContain('THE GOAL (the user set it, in their words): Fix the invoice export')
  expect(await ui.find({ type: 'Text', text: /Looks like a new goal: Fix the invoice export/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'Recommended: Hand off. Context is at 64%.' })).toBeTruthy()
  expect((await ui.find({ type: 'Button', text: 'Hand off' }))?.props?.variant).toBe('primary')
  expect(await ui.find({ type: 'Text', text: 'Build the drift watcher' })).toBeTruthy() // unchanged until a press
  // Hand off from the card fills the box with which goal moves; it never sends.
  await press(ui, 'Hand off')
  expect(await ui.find({ type: 'Text', text: /Looks like a new goal/ })).toBeFalsy()
  await ui.unmount()
  expect(w.submitted.length).toBe(3)
  const text = w.fills.at(-1).text as string
  expect(text).toMatch(/^Hand off this session: write a handoff a fresh session can resume from, using these facts\.\nWhy now: new goal: Fix the invoice export, context is at 64%\.\nGoal: Build the drift watcher\n/)
  // The current goal has 3 milestones left, the new one 2: the current goal is the bigger piece, so it moves.
  expect(text).toContain('Carry to the new session: the current goal "Build the drift watcher" and its 3 unfinished milestones. The new goal "Fix the invoice export" continues here.')
})

test('Hand off never submits: a draft in the box gets the text below a blank line; a fill that does not take is copied', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ sid: 'v34fill001', pct: 82, box: 'my half-typed note' })
  engine(on, OK, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'drift', args: 'goal Ship the compass' } as any)
  await typed($, 1)
  await clock.advance(60_000)
  const ui = await $.ui.mount({ ...PANE, requestId: 'drift-watch-v34fill0', surface: 'desktop' })
  await press(ui, 'Hand off')
  expect(w.fills[0].mode).toBe('append')
  expect(w.fills[0].text).toMatch(/^\n\nHand off this session:/)
  w.box = ''
  w.fillOk = false // e.g. a dialog holds the keys
  await press(ui, 'Hand off')
  await ui.unmount()
  expect(w.copied.at(-1)).toMatch(/^Hand off this session: write a handoff a fresh session can resume from, using these facts\.\n/)
  expect(w.toasts.at(-1)).toBe('Copied. Paste it into the prompt box.')
  expect(w.submitted.length).toBe(1)
  const text = w.copied.at(-1)!
  expect(text).not.toContain('Done when:') // unknown: the line is left out
  expect(text.split('\n').every(l => l.trim() && !/:\s*$/.test(l))).toBe(true) // no empty fields
})

test('the hand-off text carries progress, what comes next and the plan file, from parsed fields only', () => {
  const s = newState(0)
  addGoal(s, { label: 'Ship drift watch v0.3', by: 'user', setAt: 0, doneWhen: 'Live and checked', milestones: [
    { text: 'Key by session', detail: '', reachedAt: Date.UTC(2026, 5, 7, 16, 15) },
    { text: 'Name the goal', detail: '' },
    { text: 'Path chart shows goal milestones', detail: 'Diamonds on the line. A legend under it.' },
    { text: 'Ship it', detail: '' },
  ] })
  s.planFile = '/p/.planning/ROADMAP.md'
  s.offTrack = { since: 12, by: 'claude' }
  s.lastNow = 'rewriting the logger'
  expect(handoffText(s).split('\n')).toEqual([
    'Hand off this session: write a handoff a fresh session can resume from, using these facts.',
    'Why now: off track since message 12',
    'Goal: Ship drift watch v0.3',
    'Done when: Live and checked',
    'Milestones: 1 of 4 reached.',
    'Done this session: 1. Key by session, 6/7 12:15PM',
    'Next: 2. Name the goal.',
    'After that: 3. Path chart shows goal milestones',
    'Plan file: /p/.planning/ROADMAP.md (read its roadmap before writing the next action)',
    'Carry to the new session: an unfinished side trip since message 12: rewriting the logger.',
  ])
  // From the new-goal card: the old goal moves when its unfinished milestones are the bigger piece.
  s.offTrack = undefined
  openNewGoal(s, { label: 'Tiny fix', by: 'model', atMessage: 3, version: 0 }, { ...parseGoal(SPOT)!, milestones: [{ text: 'one', detail: '' }] })
  expect(handoffText(s, s.pending as any)).toContain('Carry to the new session: the current goal "Ship drift watch v0.3" and its 3 unfinished milestones. The new goal "Tiny fix" continues here.')
  openNewGoal(s, { label: 'Big new thing', by: 'model', atMessage: 3, version: 0 }, parseGoal(SPOT)!)
  s.goals[0]!.milestones.forEach(m => (m.reachedAt ??= 1)) // the current goal is done but for nothing: the new goal moves
  expect(handoffText(s, s.pending as any)).toContain('Carry to the new session: the new goal "Big new thing", milestones: 1. Find the bad rows; 2. Fix the export. The current goal stays here.')
})

test('review fixes: an open card is never swapped by a later spot; a typed goal has no "Not a new goal"; unknown size moves the new goal; edit closes Looks reached', () => {
  const s = newState(0)
  addGoal(s, { label: 'Ship it', by: 'user', setAt: 0, milestones: [{ text: 'a', detail: '' }, { text: 'b', detail: '' }] })
  openNewGoal(s, { label: 'Fix the export', by: 'model', atMessage: 3, version: 0 }, null)
  spot(s, { label: 'Something else', by: 'model', atMessage: 6 })
  expect(s.spotted).toBeUndefined()
  spot(s, { label: 'My own words', by: 'user', atMessage: null }, true)
  expect(s.spotted?.label).toBe('My own words')
  // Unknown size (failed goal call): the new goal moves, the default.
  expect(handoffText(s, s.pending as any)).toContain('The current goal stays here.')
  openNewGoal(s, { label: 'My own words', by: 'user', atMessage: null, version: 0 }, null)
  expect(card(s, [], false).buttons).not.toContain('newgoal_not')
  s.pending = { kind: 'reached', goalId: cur(s)!.id, why: 'all done' }
  editGoal(s, 'Ship it properly', 1)
  expect(s.pending).toBeUndefined()
})

test('the line draws your own move yellow until you okay it, then blue; Claude\'s stays amber', () => {
  const v = (alignment: number, over: Partial<SessionVerdict> = {}): SessionVerdict => ({ alignment, now: 'work', event: 'none', by: null, atMessage: null, reached: [], goalReached: false, why: 'w', confidence: 0.8, ...over })
  const s = newState(0)
  addGoal(s, { label: 'Build it', by: 'user', setAt: 0, planned: true })
  applySession(s, v(90), 1)
  applySession(s, v(30, { event: 'drift_start', by: 'user', atMessage: 1 }), 2)
  expect(drawRows(s).rows.map(r => r.tone)).toEqual(['green', 'yellow'])
  s.offTrack!.okayed = true
  expect(drawRows(s).rows.map(r => r.tone)).toEqual(['green', 'blue'])
  expect(pathSvg(drawRows(s)).svg).toContain('you moved off the goal')
})

test('"It\'s a new goal" on the yellow card: a toast, the goal call, then the user\'s own step 1 card; a second press never resets it; Dismiss brings yellow back', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ sid: 'v34spot001', answers: [DRIFTED, SPOT] })
  engine(on, DRIFTED, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, 3)
  await clock.advance(10)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /You moved off the goal at message 4/ })).toBeTruthy()
  await press(ui, "It's a new goal")
  await press(ui, "It's a new goal") // pressed again while the call is out
  expect(w.toasts.some(t => /sizing the new goal/.test(t))).toBe(true)
  await clock.advance(10)
  expect(await ui.find({ type: 'Text', text: /Looks like a new goal: diagnose app freezes/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /From your message 4/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: 'Not a new goal' })).toBeFalsy()
  await press(ui, 'Continue here')
  await clock.advance(70_000) // any second call lands
  expect(await ui.find({ type: 'Text', text: /A change to the current goal, or a separate goal/ })).toBeTruthy()
  await press(ui, 'Dismiss')
  expect(await ui.find({ type: 'Text', text: /You moved off the goal at message 4/ })).toBeTruthy()
  expect(w.submitted.length).toBe(3) // only the user's typed messages
  await ui.unmount()
})

test('an okayed stretch stays blue after it ends; Claude\'s unokayed one stays amber', () => {
  const v = (alignment: number, over: Partial<SessionVerdict> = {}): SessionVerdict => ({ alignment, now: 'work', event: 'none', by: null, atMessage: null, reached: [], goalReached: false, why: 'w', confidence: 0.8, ...over })
  const s = newState(0)
  addGoal(s, { label: 'Build it', by: 'user', setAt: 0, planned: true })
  applySession(s, v(30, { event: 'drift_start', by: 'user', atMessage: 1 }), 1)
  s.offTrack!.okayed = true
  s.path.forEach(r => (r.okayed = true)) // what Fine stamps
  applySession(s, v(30, { by: 'user' }), 2)
  applySession(s, v(90, { event: 'return' }), 3)
  applySession(s, v(30, { event: 'drift_start', by: 'claude', atMessage: 4 }), 4)
  expect(drawRows(s).rows.map(r => r.tone)).toEqual(['blue', 'blue', 'green', 'amber'])
})

test('the store keeps snapshots of the newest 5 sessions only, and nothing is written to disk', async ($, on) => {
  const clock = mock.clock(on)
  const store: Record<string, any> = { paused: false }
  for (const k of ['s1', 's2', 's3', 's4', 's5']) store[`session:${k}`] = { path: [], goals: [] }
  const w = world({ sid: 'newsession', store })
  engine(on, OK, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'drift', args: 'goal Ship the export' } as any)
  await clock.advance(10)
  expect(Object.keys(w.store).filter(k => k.startsWith('session:'))).toEqual(['session:s2', 'session:s3', 'session:s4', 'session:s5', 'session:newsession'])
  expect(w.store['session:newsession'].goals[0].label).toBe('Ship the export')
  expect(Object.keys(w.files)).toEqual([])
})
