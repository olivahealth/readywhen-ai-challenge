// The mail API's vocabulary, shared by the API routes and the agent's tools.
// Raw strings become these types only through the parsers below.
import { z } from 'zod'

export const MailboxId = z.string().regex(/^[a-z0-9_-]{1,64}$/, 'lowercase letters, digits, _ or -').brand<'MailboxId'>()
export type MailboxId = z.infer<typeof MailboxId>

export const MessageId = z.string().regex(/^msg_[a-z0-9]+$/, 'looks like msg_0042').brand<'MessageId'>()
export type MessageId = z.infer<typeof MessageId>

export const ThreadId = z.string().regex(/^thr_[a-z0-9]+$/, 'looks like thr_0042').brand<'ThreadId'>()
export type ThreadId = z.infer<typeof ThreadId>

export const AttachmentId = z.string().regex(/^att_[a-z0-9]+$/, 'looks like att_0042').brand<'AttachmentId'>()
export type AttachmentId = z.infer<typeof AttachmentId>

// Lowercased on parse, so two spellings of one address compare equal.
export const EmailAddress = z.string().trim().toLowerCase().pipe(z.email()).brand<'EmailAddress'>()
export type EmailAddress = z.infer<typeof EmailAddress>

// System labels carry meaning (archive = remove INBOX, read = remove UNREAD).
// Any other string is a user label and exists as soon as a message carries it.
export const SYSTEM_LABELS = ['INBOX', 'UNREAD', 'SENT', 'DRAFT', 'TRASH', 'STARRED', 'IMPORTANT'] as const
export type SystemLabel = (typeof SYSTEM_LABELS)[number]
export const Label = z.string().trim().min(1).max(60).brand<'Label'>()
export type Label = z.infer<typeof Label>
export function isSystemLabel(label: string): label is SystemLabel {
  return (SYSTEM_LABELS as readonly string[]).includes(label)
}

export const Address = z.object({ name: z.string().nullable(), email: EmailAddress })
export type Address = z.infer<typeof Address>

export const AttachmentMeta = z.object({
  id: AttachmentId,
  filename: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
})
export type AttachmentMeta = z.infer<typeof AttachmentMeta>

export type Message = {
  id: MessageId
  threadId: ThreadId
  from: Address
  to: Address[]
  cc: Address[]
  bcc: Address[]
  subject: string
  body: string
  date: string // ISO 8601
  labels: Label[]
  inReplyTo: MessageId | null
  attachments: AttachmentMeta[]
}

export type MessageSummary = Omit<Message, 'body'> & { snippet: string }

export type Mailbox = { id: MailboxId; owner: Address; now: string; timeZone: string }

// ---- request bodies -------------------------------------------------------

const Recipients = z.array(EmailAddress).max(50)

export const SearchQuery = z.object({
  text: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  label: z.string().optional(),
  threadId: ThreadId.optional(),
  unread: z.stringbool().optional(),
  hasAttachments: z.stringbool().optional(),
  after: z.iso.date().optional(),
  before: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  pageToken: z.string().regex(/^\d+$/).optional(),
})
export type SearchQuery = z.infer<typeof SearchQuery>

// A reply may omit `to` (it goes back to the other side of the thread) and `subject`.
export const Compose = z
  .object({
    to: Recipients.default([]),
    cc: Recipients.default([]),
    bcc: Recipients.default([]),
    subject: z.string().max(300).optional(),
    body: z.string().min(1).max(50_000),
    replyToMessageId: MessageId.optional(),
  })
  .refine((c) => c.replyToMessageId || c.to.length > 0, { message: 'a new email needs at least one recipient in `to`', path: ['to'] })
export type Compose = z.infer<typeof Compose>

export const DraftPatch = z.object({
  to: Recipients.optional(),
  cc: Recipients.optional(),
  bcc: Recipients.optional(),
  subject: z.string().max(300).optional(),
  body: z.string().min(1).max(50_000).optional(),
})
export type DraftPatch = z.infer<typeof DraftPatch>

export const Modify = z.object({
  ids: z.array(MessageId).min(1).max(100),
  add: z.array(Label).default([]),
  remove: z.array(Label).default([]),
})
export type Modify = z.infer<typeof Modify>

export const Trash = z.object({ ids: z.array(MessageId).min(1).max(100) })
