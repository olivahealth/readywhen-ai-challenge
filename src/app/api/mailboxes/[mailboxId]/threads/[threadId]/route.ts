import { MailboxId, ThreadId } from '@/mail/contract'
import { handle } from '@/mail/http'
import { getThread } from '@/mail/store'

export const GET = handle((_req, p: { mailboxId: string; threadId: string }) =>
  getThread(MailboxId.parse(p.mailboxId), ThreadId.parse(p.threadId)),
)
