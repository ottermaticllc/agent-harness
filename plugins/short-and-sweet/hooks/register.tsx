import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const NAME = 'short-and-sweet'
const LABEL = 'Short and Sweet on'
const isOn = atom({ plugin: 'short-and-sweet', key: 'isOn' } as const, false)
const hasReply = atom({ plugin: 'short-and-sweet', key: 'hasReply' } as const, false)

const RULE = `Short and Sweet is on. The person chose this for the whole chat, and it overrides other guidance on reply length, including the output style.

Your words to them: 1 to 3 simple, plain English sentences, no headings, no bullet lists, no jargon, no recap of what you did. If they need to do something, say it in those sentences.

Go longer only when:
- They ask for more or a different shape in this message, in any wording ("explain", "tell me more", "give me a bit more detail", "walk me through it", "give me a bulleted summary", "list the steps"). Give them what they asked for, at the length and shape they asked for. That covers this one answer; the next reply is short again.
- The work itself is what they asked for: drafts, reports, lists, code and files appear in full, with at most 3 sentences of your own around them.
- Safety needs it: the full list before anything is deleted, what they are approving when you ask for approval, and the exact wording of an error. Keep the rest short.

If a question has several parts, answer the most important and offer the rest in one short sentence.`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: NAME,
      description: 'Turn Short and Sweet (1-3 sentence replies) on or off for this chat',
    })
    if (await read($, isOn)) $.ui.status(LABEL)

    return next(e)
  })

  on('command.run', { command: NAME }, async $ => {
    const now = !(await read($, isOn))
    await update($, isOn, () => now)
    await update($, hasReply, () => false)
    $.ui.status(now ? LABEL : undefined)

    return {
      text: now
        ? 'Short and Sweet is on for this chat. Replies stay to 1-3 sentences unless you ask for more.'
        : 'Short and Sweet is off.',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, hasReply, () => false)
    // The Tell me more button submits as this mod: skip the rule so that one answer can run long.
    const isOwn = e.origin?.kind === 'plugin' && e.origin.name === NAME
    if (e.command || isOwn || !(await read($, isOn))) return next(e)

    return next({ ...e, context: [...(e.context ?? []), RULE] })
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, isOn))) {
      await update($, hasReply, () => true)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const isShown =
      !e.props.hasSurvey &&
      !e.props.isWorking &&
      (await read($, isOn)) &&
      (await read($, hasReply))
    if (!isShown) return next(e)

    const { Box, Button } = $.ui.resolve(e)
    // Draw the band beneath too, so another mod's note above the prompt still shows.
    const below = await next(e)

    return (
      <Box flexDirection="column">
        {below}
        <Button
          key="more"
          label="Tell me more"
          onPress={async () => {
            await update($, hasReply, () => false)
            await $.prompt.submit({ text: 'Tell me more about that.', asUser: true })
          }}
        />
      </Box>
    )
  })
}
