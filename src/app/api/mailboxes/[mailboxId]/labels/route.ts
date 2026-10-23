import { MailboxId } from '@/mail/contract'
import { handle } from '@/mail/http'
import { labels } from '@/mail/store'

export const GET = handle((_req, p: { mailboxId: string }) => labels(MailboxId.parse(p.mailboxId)))
