import { expect, test } from 'claude-code/testing'

// ponytail: the test kit doesn't route session.append to a test hook, so the nudge
// message itself is only provable live. This checks the strip, the reset and that nothing is blocked.
test('strip at 40%, hides after dismiss, resets after compaction, never blocks', async ($, on) => {
  let percent = 0
  on('command.list', () => ({ value: [{ name: 'session-handoff', description: '', source: 'plugin' }] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, percent }, rateLimits: [] } }))
  on('tool.call', { tool: 'Read' }, () => ({ result: { type: 'text', file: { filePath: '/x', content: '', numLines: 0, startLine: 1, totalLines: 0 } } }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({}))

  const step = async (p: number) => {
    percent = p
    const r = await $.tool.call({ tool: 'Read', file_path: '/x' })
    expect(r.deny).toBe(undefined)
  }
  const strip = async () => {
    const ui = await $.ui.mount({ plugin: 'context-nudge', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 80 } })
    return { ui, text: (await ui.findAll({ type: 'Text', text: /Context \d+%/ })).length }
  }

  await step(30); expect((await strip()).text).toBe(0)
  await step(42); const s = await strip(); expect(s.text).toBe(1)
  expect((await s.ui.findAll({ type: 'Button' })).length).toBe(2)
  await s.ui.press({ key: 'dismiss' })
  expect((await strip()).text).toBe(0)
  await step(12); await step(41); expect((await strip()).text).toBe(1)
})

import { message } from './register'

test('40% tells Claude nothing; 45% and 65% hand the user a /compact line, never run it', () => {
  expect(message(40, true)).toBe(undefined)
  for (const l of [45, 65]) {
    expect(message(l, true)).toContain('Never run /session-handoff or /compact yourself')
    expect(message(l, true)).toContain('ready-to-paste line')
    expect(message(l, true)).toContain('hand off')
    // No handoff command installed: only /compact is suggested.
    expect(message(l, false)).not.toContain('session-handoff')
    expect(message(l, false)).toContain('/compact')
  }
  expect(message(45, true)).toContain('Do not stop yet')
})
