import { DraftPatch, MailboxId, MessageId } from '@/mail/contract'
import { handle } from '@/mail/http'
import { deleteDraft, updateDraft } from '@/mail/store'

type Params = { mailboxId: string; draftId: string }

export const PATCH = handle(async (req, p: Params) =>
  updateDraft(MailboxId.parse(p.mailboxId), MessageId.parse(p.draftId), DraftPatch.parse(await req.json())),
)

export const DELETE = handle((_req, p: Params) => deleteDraft(MailboxId.parse(p.mailboxId), MessageId.parse(p.draftId)))
