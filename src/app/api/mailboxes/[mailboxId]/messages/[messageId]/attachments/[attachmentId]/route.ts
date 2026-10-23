import { AttachmentId, MailboxId, MessageId } from '@/mail/contract'
import { handle } from '@/mail/http'
import { getAttachment } from '@/mail/store'

export const GET = handle((_req, p: { mailboxId: string; messageId: string; attachmentId: string }) =>
  getAttachment(MailboxId.parse(p.mailboxId), MessageId.parse(p.messageId), AttachmentId.parse(p.attachmentId)),
)
