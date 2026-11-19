import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

import type { Nudge } from '../types'

const LINES = [40, 45, 65]
const nudge = atom({ plugin: 'context-nudge', key: 'nudge' } as const, { percent: 0, nudged: 0, dismissed: false } as Nudge)

const COMPACT_LINE =
  'give the user one ready-to-paste line in a code block: /compact followed by what ' +
  'the summary must keep from this session (goal, decisions, the user\'s corrections, unfinished work, exact file ' +
  'paths and errors), under 60 words.'

// With a handoff command installed Claude may recommend it; without one, only /compact.
const recommend = (hasHandoff: boolean) =>
  hasHandoff
    ? 'Then stop and recommend ONE of these to the user, with a one-line reason: compact if the same task ' +
      'continues and the recent details still matter, such as mid-debug or partway through a build; hand off ' +
      '(/session-handoff) if a piece of work is done, the next task is different, or the conversation has wandered. ' +
      'If you recommend compacting, ' + COMPACT_LINE + ' Never run /session-handoff or /compact yourself; the user decides.'
    : 'Then stop and suggest the user run /compact, with a one-line reason, and ' + COMPACT_LINE +
      ' Never run /compact yourself; the user decides.'

// 40% only shows the strip to the user; Claude is not told anything.
export const message = (line: number, hasHandoff: boolean): string | undefined =>
  line === 45
    ? 'Context is at 45%. Do not stop yet. List the steps left to finish the piece of work you are on, finish them, ' +
      'and do not start anything new. ' + recommend(hasHandoff)
    : line === 65
      ? 'Context is at 65%. Stop after the action you are doing right now, tell the user where things stand. ' + recommend(hasHandoff)
      : undefined

// The command's name is plain, or prefixed with its plugin's name when installed as a plugin.
const handoffName = async ($: Engine) =>
  (await $.command.list()).find(c => c.name === 'session-handoff' || c.name.endsWith(':session-handoff'))?.name

// Reads the live fill (free) and nudges once per line crossed. Never blocks or cancels anything.
async function check($: Engine) {
  const percent = (await $.session.usage()).context.percent
  // ponytail: no reading right after a compaction; wait for the next one rather than guess.
  if (percent === undefined) return

  const prev = await read($, nudge)
  // A big drop means a compaction or /clear happened: start over.
  const fresh = percent < prev.percent - 15
  const nudged = fresh ? 0 : prev.nudged
  const line = LINES.filter(l => percent >= l && l > nudged).pop()

  await update($, nudge, () => ({ percent, nudged: line ?? nudged, dismissed: fresh ? false : prev.dismissed }))

  const text = line === undefined ? undefined : message(line, (await handoffName($)) !== undefined)
  if (text) {
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
  }
}

export const register: Register = on => {
  // Main chat only: helpers have their own separate context.
  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) await check($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await check($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const s = await read($, nudge)

    if (s.percent < LINES[0] || s.dismissed || e.props.hasSurvey) {
      return below
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const handoff = await handoffName($)
    // Stack under whatever the other mods draw here, never replace it.
    return (
      <Box flexDirection="column">
        {below}
        <Box>
        <Text dimColor>Context {s.percent}%. Good point to wrap up{handoff ? '. ' : ' (try /compact). '}</Text>
        {handoff && <Button key="handoff" label="Hand off" onPress={() => $.command.run({ command: handoff })} />}
        <Button key="dismiss" label="Dismiss" onPress={() => update($, nudge, s => ({ ...s, dismissed: true }))} />
        </Box>
      </Box>
    )
  })
}
