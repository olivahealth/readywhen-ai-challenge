import { MailboxId, SearchQuery } from '@/mail/contract'
import { handle, queryOf } from '@/mail/http'
import { search } from '@/mail/store'

export const GET = handle((req, p: { mailboxId: string }) => search(MailboxId.parse(p.mailboxId), SearchQuery.parse(queryOf(req))))
