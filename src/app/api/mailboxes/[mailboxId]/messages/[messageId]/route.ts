import { MailboxId, MessageId } from '@/mail/contract'
import { handle } from '@/mail/http'
import { getMessage } from '@/mail/store'

export const GET = handle((_req, p: { mailboxId: string; messageId: string }) =>
  getMessage(MailboxId.parse(p.mailboxId), MessageId.parse(p.messageId)),
)
