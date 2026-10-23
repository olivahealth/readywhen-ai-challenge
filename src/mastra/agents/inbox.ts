// Elena's inbox assistant: one agent, one prompt, the mail tools.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'

import type { Mailbox } from '../../mail/contract'
import { mailApi, mailTools } from '../tools/mail'

export const inbox = new Agent({
  id: 'inbox',
  name: 'Inbox assistant',
  description: "Elena Conti's email assistant",
  model: 'anthropic/claude-sonnet-5-5',
  // Read on every request, so a prompt edit applies to the next message without a restart.
  instructions: async ({ requestContext }) => {
    const mailbox = (await mailApi({ requestContext }, '')) as Mailbox
    const today = new Date(mailbox.now).toLocaleString('en-GB', { timeZone: mailbox.timeZone, dateStyle: 'full', timeStyle: 'short' })
    return readFileSync(promptPath(), 'utf8')
      .replaceAll('{{ownerName}}', mailbox.owner.name ?? mailbox.owner.email)
      .replaceAll('{{ownerEmail}}', mailbox.owner.email)
      .replaceAll('{{today}}', `${today} (${mailbox.timeZone})`)
  },
  tools: mailTools,
  // A sweep of the inbox reads many threads; Mastra's default of 5 steps stops it halfway.
  defaultOptions: { maxSteps: 25 },
  memory: new Memory({ options: { lastMessages: 40 } }),
})

// `mastra dev` runs from inside its build folder and `mastra build` output runs
// from the repo root, so look upwards for the source file.
function promptPath(dir = process.cwd()): string {
  const candidate = path.join(dir, 'src/mastra/agents/inbox.md')
  if (existsSync(candidate)) return candidate
  if (path.dirname(dir) === dir) throw new Error('src/mastra/agents/inbox.md not found above the working directory')
  return promptPath(path.dirname(dir))
}
