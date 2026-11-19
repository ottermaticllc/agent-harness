import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'short-and-sweet',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false },
} as const

test('on: the rule rides on typed prompts and the button shows after a reply', async ($, on) => {
  let context: readonly string[] | undefined
  on('command.register', () => ({ value: { command: 'short-and-sweet' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  on('command.run', () => ({}))
  on('prompt.submit', (_, e) => {
    context = e.context
    return { text: e.text, context: e.context }
  })
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ran = await $.command.run({ command: 'short-and-sweet', args: '' })
  expect(ran.text).toMatch(/is on/)

  await $.prompt.submit({ text: 'What is DNS?' })
  expect(context?.some(c => c.startsWith('Short and Sweet is on'))).toBe(true)

  await $.turn.complete({ answer: 'DNS turns names into addresses.' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'more' })).toBeTruthy()
  await ui.unmount()

  const off = await $.command.run({ command: 'short-and-sweet', args: '' })
  expect(off.text).toBe('Short and Sweet is off.')
  await $.prompt.submit({ text: 'And now?' })
  expect(context?.some(c => c.startsWith('Short and Sweet is on')) ?? false).toBe(false)
})
