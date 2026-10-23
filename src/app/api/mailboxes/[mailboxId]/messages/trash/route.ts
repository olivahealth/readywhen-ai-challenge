import { Label, MailboxId, Trash } from '@/mail/contract'
import { handle } from '@/mail/http'
import { modify } from '@/mail/store'

export const POST = handle(async (req, p: { mailboxId: string }) => {
  const { ids } = Trash.parse(await req.json())
  return modify(MailboxId.parse(p.mailboxId), { ids, add: [Label.parse('TRASH')], remove: [Label.parse('INBOX')] })
})
