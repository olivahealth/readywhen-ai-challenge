import { MailboxId } from '@/mail/contract'
import { handle } from '@/mail/http'
import { getMailbox } from '@/mail/store'

export const GET = handle((_req, p: { mailboxId: string }) => getMailbox(MailboxId.parse(p.mailboxId)))
