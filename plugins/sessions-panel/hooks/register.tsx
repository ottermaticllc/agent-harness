import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PanelData, Proc, Session, Subagent, View } from '../types'

// scripts/sessions.py does the work; this mod draws what it reports and asks it to end things.
// hookEnv passes CLAUDE_PLUGIN_DATA, where the script logs each signal it sends.
async function script($: EngineInterface, args: string[], timeoutMs: number) {
  let env: Record<string, string> = {}
  try {
    env = await $.process.hookEnv()
  } catch {} // the test kit has no hookEnv; the script then skips its log
  const r = await $.process.run(['python3', `${$.plugin.root}/scripts/sessions.py`, ...args], { env, timeoutMs })
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `exit ${r.exitCode}`)
  return r.stdout
}
const PANE = 'sessions'
const REFRESH_MS = 60_000

const EMPTY: PanelData = { sessions: [], codex: [], leftovers: [], system: {} }
const data = atom({ plugin: 'sessions-panel', key: 'data' } as const, EMPTY, { shape: 'panel-1' })
const view = atom({ plugin: 'sessions-panel', key: 'view' } as const, {}, { shape: 'view-1' })

// Column widths in character cells.
const W = { name: 34, status: 9, ctx: 13, where: 16, started: 16, active: 16, cpu: 7, agents: 5, id: 10 }
const SW = { task: 34, type: 16, model: 16, status: 9, started: 10, active: 10, runtime: 9, ctx: 9, tokens: 9 }
const PW = { kind: 9, program: 34, tokens: 9, calls: 7, cpu: 7, mem: 9, port: 8, started: 10, pid: 7 }

const GREEN = '#2e9e5b'
const YELLOW = '#d4a017'
const ORANGE = '#e07b24'
const RED = '#d64545'
const BLUE = '#4a90d9'

// Context window. Codex records its own; for this session the engine reports it. Other Claude sessions
// don't record theirs, so: shortcut: assume this session's window, or 1M once tokens pass it; wrong if
// sessions use different windows, upgrade when the session file records one.
const BIG_WINDOW = 1_000_000
const DEFAULT_WINDOW = 200_000 // before the engine has answered
function windowOf(s: Session, v: View) {
  if (s.context_window) return { size: s.context_window, assumed: false }
  if (s.session_id && s.session_id === v.selfId && v.selfWindow) return { size: v.selfWindow, assumed: false }
  const own = v.selfWindow ?? DEFAULT_WINDOW
  return { size: (s.context_tokens ?? 0) > own ? BIG_WINDOW : own, assumed: true }
}
function contextLevel(tokens: number, window: number) {
  const pct = Math.round((tokens / window) * 100)
  const color = pct < 25 ? GREEN : pct <= 45 ? YELLOW : pct <= 55 ? ORANGE : RED
  return { pct, color }
}

// working: mid-reply · waiting: done, cache warm · idle: cache expired · old: no message in 12+ hours
const STATES = {
  working: { label: 'working', color: GREEN },
  waiting: { label: 'waiting', color: YELLOW },
  idle: { label: 'idle', color: ORANGE },
  old: { label: 'old', color: RED },
} as const
const OLD_SECS = 12 * 3600
// The script reads each session's cache lifetime (5m or 1h) from its transcript. When none is recorded,
// assume the API's default 5 minutes.
const DEFAULT_CACHE_SECS = 300

function stateOf(s: Session, now: number): keyof typeof STATES {
  if (s.status !== 'idle') return 'working' // 'busy', and 'shell' while a terminal session runs a command
  const lastMsg = s.last_message_at ?? s.last_activity ?? 0
  if (now - lastMsg > OLD_SECS) return 'old'
  const expires = s.cache_expires_at ?? (s.last_activity ?? 0) + DEFAULT_CACHE_SECS
  return expires > now ? 'waiting' : 'idle'
}
const shortId = (s: Session) => (s.session_id ?? '').slice(0, 8)

// 30s · 40m · 1.1h · 6.2h: one decimal at most, rounded down
const ago = (secs: number) => {
  const s = Math.max(0, Math.floor(secs))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${(Math.floor(s / 360) / 10).toFixed(1)}h`
}
const clock = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const when = (epoch: number | undefined, now: number) => (epoch ? `${clock(epoch)} (${ago(now - epoch)})` : '-')
const k = (n?: number) => (n === undefined ? '-' : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`)

// "/home/me/.nvm/.../node /a/b/acme-tools/start.mjs" -> "node start.mjs"; MCP names win when present
function programName(command: string) {
  const words = command.split(/\s+/)
  const mcp = words.find(w => /mcp/i.test(w))
  if (mcp) return mcp.split('/').filter(Boolean).slice(-2).join('/')
  return words.slice(0, 2).map(w => w.split('/').pop()).join(' ')
}

type ToolUse = { tool: string; calls: number; tokens: number }

// Pairs each MCP server's token use with the local program that serves it, by a distinctive word of the
// server's name in the program's command line. shortcut: name matching can miss or mis-pair a server whose
// program is named unlike its key; unmatched ones show as their own rows, so no tokens are dropped.
function matchTools(procs: Proc[], tools: ToolUse[]) {
  const byPid = new Map<number, ToolUse>()
  const rest: ToolUse[] = []
  for (const t of tools.filter(x => x.tokens > 0)) {
    const words = t.tool.replace(' (MCP)', '').toLowerCase().split(/[-_\s]+/)
      .filter(w => w.length >= 4 && !['server', 'claude', 'plugin'].includes(w))
    const p = t.tool.endsWith('(MCP)')
      ? procs.find(p => p.kind === 'helper' && !byPid.has(p.pid) && words.some(w => p.command.toLowerCase().includes(w)))
      : undefined
    if (p) byPid.set(p.pid, t)
    else rest.push(t)
  }
  return { byPid, rest }
}

// {"result": "ended", "survivors": [123]} -> a sentence for the person
function outcome(name: string, stdout: string) {
  let r: { result?: string; survivors?: number[] } = {}
  try {
    r = JSON.parse(stdout)
  } catch {}
  const say: Record<string, string> = {
    ended: `Ended "${name}".`,
    busy: `"${name}" started working again, so it was not ended.`,
    identity_mismatch: `"${name}" changed since the list was drawn; nothing was ended.`,
    identity_unknown: `Couldn't confirm "${name}" is still the same running session; nothing was ended.`,
    still_running: `"${name}" didn't stop after SIGTERM. It was not force-killed; check it from a terminal.`,
    refused_self: `That's this session; end it by closing it instead.`,
  }
  const text = say[r.result ?? ''] ?? `Unexpected result for "${name}": ${stdout.trim().slice(0, 200)}`
  return r.survivors?.length ? `${text} Helper programs still running: ${r.survivors.join(' ')}` : text
}

let timer: { cancel: () => void } | undefined
let refreshing = false

async function refresh($: EngineInterface) {
  if (refreshing) return // one refresh at a time
  refreshing = true
  try {
    const fresh: PanelData = { ...EMPTY, ...JSON.parse(await script($, ['--panel'], 30_000)) }
    await update($, data, () => fresh)
    await update($, view, v => ({ ...v, updatedAt: Date.now() / 1000 }))
  } catch (err) {
    await update($, view, v => ({ ...v, note: `Couldn't read sessions: ${String(err)}` }))
  } finally {
    refreshing = false
  }
}

// The args name the session as the list saw it (session ID, or Codex start time); the script re-checks
// both, plus idle and not-this-session, right before it sends SIGTERM.
function endArgs(s: Session, isCodex: boolean): string[] | undefined {
  if (isCodex) return s.started_at ? ['--end-codex', String(s.pid), String(Math.floor(s.started_at))] : undefined
  return s.session_id ? ['--end-session', String(s.pid), s.session_id] : undefined
}

async function end($: EngineInterface, s: Session, args: string[]) {
  await update($, view, old => ({ ...old, confirming: undefined, ending: s.pid, note: `Ending "${s.name}"…` }))
  let note: string
  try {
    note = outcome(s.name, await script($, args, 30_000))
  } catch (err) {
    note = `Ending "${s.name}" didn't finish cleanly (${String(err)}). Refresh to check.`
  }
  await update($, view, old => ({ ...old, ending: undefined, open: undefined, openItem: undefined, note }))
  await refresh($)
}

// Two sentences on what a helper, script or subagent is doing, from a small model. Only on request.
async function summarize($: EngineInterface, key: string, what: string) {
  await update($, view, v => ({ ...v, summaries: { ...v.summaries, [key]: 'loading' } }))
  let text: string
  try {
    const r = await $.model.complete({
      model: 'haiku',
      maxTokens: 160,
      system: 'You explain background processes to someone who is not a programmer. Answer in exactly two short plain-English sentences, no jargon.',
      prompt: `What is this doing, and does it matter if it stops?\n\n${what}`,
    })
    text = r.isAnswered ? r.text.trim() : `No summary (${r.reason}).`
  } catch (err) {
    text = `No summary (${String(err)}).`
  }
  await update($, view, v => ({ ...v, summaries: { ...v.summaries, [key]: text } }))
}

async function setView($: EngineInterface, fn: (old: View) => View) {
  await update($, view, fn)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sessions', description: 'Show live Claude and Codex sessions; end idle ones' })
    return next(e)
  })

  on('command.run', { command: 'sessions' }, async $ => {
    const selfId = await $.session.id()
    const selfWindow = (await $.session.usage()).context.window
    await update($, view, () => ({ selfId, selfWindow }))
    await $.ui.open({ id: PANE, title: 'Live sessions', focus: true, closeOnEscape: true })
    await refresh($)
    timer?.cancel()
    timer = $.clock.every(REFRESH_MS, () => void refresh($)) // only while the panel is open
    return { text: 'Opened the sessions panel.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      timer?.cancel()
      timer = undefined
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const d = await read($, data)
    const v = await read($, view)
    const now = Date.now() / 1000

    const cell = (width: number, text: string, dim = false, color?: string) => (
      <Box width={width} flexShrink={0}>
        <Text wrap="truncate-end" dimColor={dim} color={color}>{text}</Text>
      </Box>
    )
    const header = (cols: [number, string][]) => (
      <Box flexDirection="row">{cols.map(([w, t]) => cell(w, t, true))}</Box>
    )
    const copyButton = (key: string, label: string, text: string) => (
      <Button key={key} label={label} onPress={press => void $.ui.copy({ text, surface: press.surface })} />
    )
    // drawn beside its button: the desktop draws a button's contents in its own colors
    const arrow = (isOpen: boolean) => <Text color={BLUE} bold>{isOpen ? '▾ ' : '▸ '}</Text>
    const toggleItem = (key: string) =>
      void setView($, old => ({ ...old, openItem: old.openItem === key ? undefined : key }))
    const summaryBlock = (key: string, what: string) => {
      const summary = v.summaries?.[key]
      return summary ? (
        <Text color={BLUE} wrap="wrap">{summary === 'loading' ? 'Asking…' : summary}</Text>
      ) : (
        <Button key={`sum-${key}`} label="Summarize in 2 sentences" onPress={() => void summarize($, key, what)} />
      )
    }

    // memory header, in plain words: how much is free now, and how much overflow sits on disk
    const sys = d.system
    const totalGb = sys.memory_total_mb === undefined ? undefined : sys.memory_total_mb / 1024
    const free = sys.memory_free_percent
    const memLevel = free === undefined ? 'unknown' : free >= 30 ? 'OK' : free >= 15 ? 'tight' : 'nearly full'
    const memColor = free === undefined ? undefined : free >= 30 ? GREEN : free >= 15 ? ORANGE : RED
    const swapGb = (sys.swap_used_mb ?? 0) / 1024
    const totalMb = [...d.sessions, ...d.codex].reduce((n, s) => n + s.memory_mb, 0) + d.leftovers.reduce((n, p) => n + p.memory_mb, 0)

    const subagentTable = (s: Session) => {
      const subs = [...(s.subagents ?? [])].sort((a, b) => Number(b.running) - Number(a.running) || b.last_active - a.last_active)
      if (subs.length === 0) return <Text dimColor>No subagents in the last hour.</Text>
      return (
        <Box flexDirection="column">
          {header([[SW.task, 'Subagent'], [SW.type, 'Type'], [SW.model, 'Model'], [SW.status, 'Status'], [SW.started, 'Started'],
            [SW.active, 'Last active'], [SW.runtime, 'Runtime'], [SW.ctx, 'Context'], [SW.tokens, 'Tokens']])}
          {subs.map((a: Subagent) => {
            const key = `sub-${a.id}`
            const isOpen = v.openItem === key
            return (
              <Box key={`box-${key}`} flexDirection="column">
                <Box flexDirection="row">
                  <Box width={SW.task} flexShrink={0} flexDirection="row">
                    {arrow(isOpen)}
                    <Button key={key} plain onPress={() => toggleItem(key)}>
                      <Text>{a.task || a.id}</Text>
                    </Button>
                  </Box>
                  {cell(SW.type, a.type ?? '-')}
                  {cell(SW.model, (a.model ?? '-').replace('claude-', ''))}
                  {cell(SW.status, a.running ? 'running' : 'done', false, a.running ? GREEN : undefined)}
                  {cell(SW.started, a.started ? clock(a.started) : '-')}
                  {cell(SW.active, ago(now - a.last_active))}
                  {cell(SW.runtime, a.started ? ago(a.last_active - a.started) : '-')}
                  {cell(SW.ctx, k(a.context_tokens))}
                  {cell(SW.tokens, k(a.tokens_used))}
                </Box>
                {isOpen && (
                  <Box flexDirection="column" paddingLeft={2} paddingBottom={1}>
                    <Text dimColor>
                      {a.tool_calls} tool calls · {k(a.tokens_used)} tokens processed in total (cached re-reads included) · ID {a.id}
                    </Text>
                    <Text dimColor>No CPU of its own: subagents run inside the session's program, whose CPU is in the table above.</Text>
                    <Text wrap="wrap">Task: {a.prompt.slice(0, 600) || a.task}</Text>
                    {summaryBlock(key, `A Claude helper agent (subagent, type ${a.type ?? 'unknown'}) was given this task:\n${a.prompt}`)}
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      )
    }

    // procs sorted by CPU (from the finder); then tools with no program of their own here (built-in tools,
    // connectors that run remotely), by tokens
    const processTable = (procs: Proc[], leftover = false, tools: ToolUse[] = []) => {
      const { byPid, rest } = matchTools(procs, tools)
      if (procs.length === 0 && rest.length === 0)
        return <Text dimColor>{leftover ? 'No leftover helpers.' : 'No helper programs, scripts or tool use.'}</Text>
      return (
        <Box flexDirection="column">
          {header([[PW.kind, 'Kind'], [PW.program, 'Program'], [PW.tokens, 'Tokens'], [PW.calls, 'Calls'], [PW.cpu, 'CPU'],
            [PW.mem, 'Memory'], [PW.port, 'Port'], [PW.started, 'Started'], [PW.pid, 'PID']])}
          {procs.map(p => {
            const used = byPid.get(p.pid)
            const key = `proc-${p.pid}`
            const isOpen = v.openItem === key
            return (
              <Box key={`box-${key}`} flexDirection="column">
                <Box flexDirection="row">
                  <Box width={PW.kind} flexShrink={0} flexDirection="row">
                    {arrow(isOpen)}
                    <Button key={key} plain onPress={() => toggleItem(key)}>
                      <Text>{p.kind}</Text>
                    </Button>
                  </Box>
                  {cell(PW.program, used ? `${programName(p.command)} · ${used.tool.replace(' (MCP)', '')}` : programName(p.command))}
                  {cell(PW.tokens, used ? `≈${k(used.tokens)}` : '-', !used)}
                  {cell(PW.calls, used ? String(used.calls) : '-', !used)}
                  {cell(PW.cpu, `${p.cpu_percent}%`)}
                  {cell(PW.mem, `${p.memory_mb} MB`)}
                  {cell(PW.port, p.ports?.join(', ') || '-', !p.ports?.length)}
                  {cell(PW.started, p.started ? `${ago(now - p.started)} ago` : '-')}
                  {cell(PW.pid, String(p.pid), true)}
                </Box>
                {isOpen && (
                  <Box flexDirection="column" paddingLeft={2} paddingBottom={1}>
                    <Text dimColor wrap="wrap">{p.command}</Text>
                    <Text dimColor>Parent PID {p.ppid}{p.started ? ` · started ${clock(p.started)}` : ''}</Text>
                    {summaryBlock(key, `A ${p.kind} process${leftover ? ' whose parent program has exited' : ' started by a Claude Code session'}, using ${p.cpu_percent}% CPU and ${p.memory_mb} MB. Its command line:\n${p.command}`)}
                    {leftover && <Text dimColor wrap="wrap">The panel can't prove which program started this, so it has no End button. If you know it's safe, stop it from a terminal (kill {p.pid}).</Text>}
                  </Box>
                )}
              </Box>
            )
          })}
          {rest.map(t => (
            <Box key={`tool-${t.tool}`} flexDirection="row">
              {cell(PW.kind, `  ${t.tool.endsWith('(MCP)') ? 'remote' : 'tool'}`, true)}
              {cell(PW.program, t.tool.replace(' (MCP)', ''))}
              {cell(PW.tokens, `≈${k(t.tokens)}`)}
              {cell(PW.calls, String(t.calls))}
              {cell(PW.cpu, '-', true)}
              {cell(PW.mem, '-', true)}
              {cell(PW.port, '-', true)}
              {cell(PW.started, '-', true)}
              {cell(PW.pid, '-', true)}
            </Box>
          ))}
        </Box>
      )
    }

    const sessionRow = (s: Session, isCodex: boolean) => {
      const isOpen = v.open === s.pid
      const isSelf = !isCodex && s.session_id === v.selfId
      const state = stateOf(s, now)
      const working = state === 'working'
      const stale = state === 'old'
      const win = windowOf(s, v)
      const ctx = s.context_tokens ? contextLevel(s.context_tokens, win.size) : undefined
      const args = endArgs(s, isCodex)
      return (
        <Box key={`row-${s.pid}`} flexDirection="column">
          <Box flexDirection="row">
            <Box width={W.name} flexShrink={0} flexDirection="row">
              {arrow(isOpen)}
              <Button
                key={`toggle-${s.pid}`}
                plain
                onPress={() => void setView($, old => ({ ...old, open: isOpen ? undefined : s.pid, openItem: undefined, confirming: undefined }))}
              >
                <Text bold={!stale} dimColor={stale}>{s.name}{isSelf ? ' (this one)' : ''}</Text>
              </Button>
            </Box>
            {cell(W.status, STATES[state].label, false, STATES[state].color)}
            {cell(W.ctx, ctx ? `${k(s.context_tokens)} · ${ctx.pct}%` : '-', false, ctx?.color)}
            {cell(W.where, s.location, stale)}
            {cell(W.started, when(s.started_at, now), stale)}
            {cell(W.active, when(s.last_activity, now), stale)}
            {cell(W.cpu, `${s.cpu_percent}%`, stale)}
            {cell(W.agents, String(s.subagents_running ?? 0), stale)}
            {cell(W.id, shortId(s), true)}
          </Box>

          {isOpen && (
            <Box flexDirection="column" paddingLeft={2} paddingBottom={1} gap={0}>
              {s.name.length > W.name - 3 && <Text bold wrap="wrap">{s.name}</Text>}
              {s.error && <Text color={RED}>Some details couldn't be read: {s.error}</Text>}

              <Text bold color={ctx?.color}>
                Context: {ctx ? `${k(s.context_tokens)} of ${k(win.size)} tokens · ${ctx.pct}%${win.assumed ? ' (window assumed)' : ''}` : 'unknown'}
              </Text>

              <Text bold>Last message{s.last_message_at ? ` · ${when(s.last_message_at, now)}` : ''}</Text>
              <Text wrap="wrap">{s.last_message_full ?? s.last_message ?? '(none found)'}</Text>

              <Text dimColor>
                {isCodex
                  ? `Model ${s.model ?? '-'} · ${k(s.tokens_used)} tokens used · `
                  : `Cache ${s.cache_expires_at ? (s.cache_expires_at > now ? `≈${ago(s.cache_expires_at - now)} left` : 'expired') : 'unknown'} · `}
                memory {s.memory_mb} MB · CPU {s.cpu_percent}% · {s.location}
              </Text>
              <Text dimColor wrap="truncate-middle">Folder: {s.cwd ?? '-'}</Text>

              {!isCodex && <Text bold>Subagents</Text>}
              {!isCodex && subagentTable(s)}
              <Text bold>Helper programs, scripts and tools</Text>
              <Text dimColor>Tokens: rough estimate of the output each one added to the context since the last compaction.</Text>
              {processTable(s.children, false, s.context_by_tool ?? [])}

              <Text dimColor>Session ID {s.session_id ?? '-'} · PID {s.pid}</Text>
              <Box flexDirection="row" gap={1}>
                {s.session_id && copyButton(`copy-id-${s.pid}`, 'Copy session ID', s.session_id)}
                {s.last_message && copyButton(`copy-msg-${s.pid}`, 'Copy last message', s.last_message_full ?? s.last_message)}
              </Box>

              <Box flexDirection="row" gap={1}>
                {isSelf ? (
                  <Text dimColor>This is the session showing the panel, so it has no End button.</Text>
                ) : working ? (
                  <Text dimColor>End is locked while it's working. Wait for it to finish.</Text>
                ) : !args ? (
                  <Text dimColor>Not enough is known to confirm which process this is, so it has no End button.</Text>
                ) : v.ending === s.pid ? (
                  <Text color={YELLOW}>Ending…</Text>
                ) : v.confirming === s.pid ? (
                  <>
                    <Text>
                      {!isCodex
                        ? `End "${s.name}"? This sends SIGTERM to PID ${s.pid}. Its transcript stays on disk and can be resumed with claude --resume.`
                        : s.background
                          ? `End "${s.name}"? This sends SIGTERM to PID ${s.pid}. ${s.origin} restarts it when you next open its Codex panel.`
                          : `End "${s.name}"? This sends SIGTERM to PID ${s.pid}. Its chat history stays in Codex and can be resumed.`}
                    </Text>
                    <Button key={`confirm-${s.pid}`} label="Confirm end" variant="primary" onPress={() => void end($, s, args)} />
                    <Button key={`cancel-${s.pid}`} label="Cancel" onPress={() => void setView($, old => ({ ...old, confirming: undefined }))} />
                  </>
                ) : (
                  <Button key={`end-${s.pid}`} label="End session" onPress={() => void setView($, old => ({ ...old, confirming: s.pid }))} />
                )}
              </Box>
            </Box>
          )}
        </Box>
      )
    }

    const sessionHeader = header([[W.name, 'Session'], [W.status, 'Status'], [W.ctx, 'Context'], [W.where, 'Location'], [W.started, 'Started'],
      [W.active, 'Last active'], [W.cpu, 'CPU'], [W.agents, 'Subs'], [W.id, 'ID']])

    return (
      <Box flexDirection="column" gap={0}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor>
            {d.sessions.length} Claude · {d.codex.length} Codex · updated {v.updatedAt ? clock(v.updatedAt) : '…'} · refreshes every minute · click a name for details
          </Text>
          <Button key="refresh" label="Refresh" hotkey="r" onPress={() => void refresh($)} />
        </Box>
        <Text color={memColor} bold>
          Memory {memLevel}: {free ?? '?'}% free right now
          {free !== undefined && totalGb !== undefined ? ` (about ${(totalGb * free / 100).toFixed(1)} of ${Math.round(totalGb)} GB)` : ''}.
        </Text>
        <Text dimColor>
          {swapGb >= 0.1
            ? `${swapGb.toFixed(1)} GB overflowed to disk earlier and is parked there; it slows things down when those programs are used again. `
            : 'Nothing has overflowed to disk. '}
          These sessions use about {(totalMb / 1024).toFixed(1)} GB (a low estimate).
        </Text>
        {v.note && <Text color={YELLOW}>{v.note}</Text>}

        <Text bold>Claude sessions</Text>
        {sessionHeader}
        {d.sessions.map(s => sessionRow(s, false))}

        <Text bold>Codex sessions</Text>
        {d.codex.length === 0 ? <Text dimColor>No Codex running.</Text> : sessionHeader}
        {d.codex.map(s => sessionRow(s, true))}

        <Text bold>Leftover helpers ({d.leftovers.length}) · helper programs whose parent has exited (listed only, never ended here)</Text>
        {processTable(d.leftovers, true)}
      </Box>
    )
  })
}
