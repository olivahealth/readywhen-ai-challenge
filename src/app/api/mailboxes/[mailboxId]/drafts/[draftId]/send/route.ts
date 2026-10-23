import { MailboxId, MessageId } from '@/mail/contract'
import { handle } from '@/mail/http'
import { sendDraft } from '@/mail/store'

export const POST = handle((_req, p: { mailboxId: string; draftId: string }) =>
  sendDraft(MailboxId.parse(p.mailboxId), MessageId.parse(p.draftId)),
)
