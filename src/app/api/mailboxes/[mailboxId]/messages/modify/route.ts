import { MailboxId, Modify } from '@/mail/contract'
import { handle } from '@/mail/http'
import { modify } from '@/mail/store'

export const POST = handle(async (req, p: { mailboxId: string }) => modify(MailboxId.parse(p.mailboxId), Modify.parse(await req.json())))
