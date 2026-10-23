import { Compose, MailboxId } from '@/mail/contract'
import { handle } from '@/mail/http'
import { send } from '@/mail/store'

export const POST = handle(async (req, p: { mailboxId: string }) => send(MailboxId.parse(p.mailboxId), Compose.parse(await req.json())))
