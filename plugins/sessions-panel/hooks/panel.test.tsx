import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'sessions-panel',
  component: 'Pane',
  requestId: 'sessions',
  props: {
    title: 'Live sessions',
    isFocused: true,
    bodyColumns: 160,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// Stand-in data only: no real session or process is read or signalled here.
const now = Date.now() / 1000
const row = (pid: number, name: string, status: string) => ({
  pid, name, status, location: 'Terminal', session_id: `id-${pid}`, started_at: now - 7200,
  last_activity: now - 600, last_message: `hello from ${name}`, cpu_percent: 0.1, memory_mb: 30,
  context_tokens: 300_000, subagents_running: 0,
  children: [{ pid: pid + 1, ppid: pid, kind: 'helper', cpu_percent: 0, memory_mb: 50, command: 'node acme-mcp-server' }],
  subagents: [{ id: `a${pid}`, task: 'Review the plan', prompt: 'Review the plan in detail', type: 'general-purpose', model: 'claude-sonnet-4', started: now - 300, last_active: now - 30, running: true, context_tokens: 40000, tokens_used: 250000, tool_calls: 7 }],
})

function setup(on: Parameters<Parameters<typeof test>[1]>[1], view: object) {
  const runs: string[][] = []
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    const stdout = e.argv.includes('--panel') ? JSON.stringify((stored.data as { value: object }).value) : '{"result": "ended", "survivors": []}'
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  const list = [row(100, 'Old idle chat', 'idle'), row(200, 'Busy build', 'busy'), row(400, 'This chat', 'idle')]
  const leftover = { pid: 900, ppid: 1, kind: 'helper', cpu_percent: 0, memory_mb: 80, command: 'node /opt/acme-mcp-server' }
  const codex = { ...row(300, 'Codex (VS Code extension, no chat open)', 'idle'), origin: 'VS Code', background: true, children: [], subagents: [] }
  const stored: Record<string, unknown> = {
    data: { shape: 'panel-1', value: { sessions: list, codex: [codex], leftovers: [leftover], system: { swap_total_mb: 8192, swap_used_mb: 7000, memory_total_mb: 16384, memory_free_percent: 30 } } },
    view: { shape: 'view-1', value: view },
  }
  let version = 1
  on('state.get', (_, e) => ({ value: { value: stored[e.key], version } }))
  on('state.set', (_, e) => {
    stored[e.key] = e.value
    version += 1
    return { value: { isSet: true, version } }
  })
  return runs
}

test('rows open to details; End only on idle sessions, behind a confirm', async ($, on) => {
  const runs = setup(on, { selfId: 'id-400', selfWindow: 200_000 })
  for (const surface of ['desktop', 'terminal'] as const) {
    let ui = await $.ui.mount({ ...PANE, surface })
    // the stand-in storage above doesn't notify readers, so draw again after each press
    const press = async (key: string) => {
      await ui.press({ key })
      await ui.unmount()
      ui = await $.ui.mount({ ...PANE, surface })
    }
    expect(await ui.find({ type: 'Text', text: /Old idle chat/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /node acme-mcp-server/ })).toBeUndefined() // closed rows hide details
    expect(await ui.find({ type: 'Text', text: /Memory OK: 30% free right now/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /of 16 GB/ })).toBeDefined()

    await press('toggle-100')
    expect(await ui.find({ type: 'Text', text: /window assumed/ })).toBeDefined() // 300k > this session's 200k: 1M assumed
    expect(await ui.find({ type: 'Text', text: /of 1\.0M tokens/ })).toBeDefined()
    await press('sub-a100')
    expect(await ui.find({ type: 'Text', text: /7 tool calls/ })).toBeDefined()
    await press('end-100')
    expect(await ui.find({ type: 'Text', text: /sends SIGTERM to PID 100/ })).toBeDefined()
    await press('cancel-100')
    expect(await ui.find({ type: 'Text', text: /sends SIGTERM/ })).toBeUndefined()

    await press('toggle-300')
    await press('end-300')
    expect(await ui.find({ type: 'Text', text: /VS Code restarts it/ })).toBeDefined()
    await press('cancel-300')

    await press('toggle-200')
    expect(await ui.find({ type: 'Text', text: /locked while it's working/ })).toBeDefined()
    await press('toggle-400')
    expect(await ui.find({ type: 'Text', text: /session showing the panel/ })).toBeDefined()
    await ui.unmount()
  }
  expect(runs.length).toBe(0) // opening, confirming and cancelling never ran the script
})

test('Confirm end runs the script for that one session, with its ID to re-check', async ($, on) => {
  const runs = setup(on, { selfId: 'id-400' })
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  for (const key of ['toggle-100', 'end-100', 'confirm-100']) {
    await ui.press({ key })
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  }
  expect(runs[0]?.slice(1)).toEqual([expect.stringMatching(/scripts\/sessions\.py$/), '--end-session', '100', 'id-100'])
  expect(runs[1]?.slice(2)).toEqual(['--panel']) // then a refresh
  expect(await ui.find({ type: 'Text', text: /Ended "Old idle chat"/ })).toBeDefined()
  await ui.unmount()
})

test('leftover helpers are listed but have no End button', async ($, on) => {
  setup(on, { openItem: 'proc-900' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /no End button/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'end-left-900' })).toBeUndefined()
  await ui.unmount()
})
