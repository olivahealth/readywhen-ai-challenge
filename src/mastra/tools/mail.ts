// The assistant's mail tools. They reach the mailbox over HTTP, exactly as
// they would reach a real provider; the mailbox id comes from the request
// context so every caller (Studio, a UI, a test run) can point at its own copy.
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { AttachmentId, EmailAddress, Label, MailboxId, MessageId, ThreadId } from '../../mail/contract'

const MAIL_API_URL = process.env.MAIL_API_URL ?? 'http://localhost:3000'

type ToolContext = { requestContext?: { get(key: string): unknown }; abortSignal?: AbortSignal }

export async function mailApi(context: ToolContext, path: string, body?: unknown, method = body ? 'POST' : 'GET') {
  const mailboxId = MailboxId.parse(context.requestContext?.get('mailboxId') ?? 'main')
  const res = await fetch(`${MAIL_API_URL}/api/mailboxes/${mailboxId}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: context.abortSignal,
  })
  if (res.status === 204) return { ok: true }
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `mail API answered ${res.status}`)
  return data
}

const messageIds = z.array(MessageId).min(1).max(100)
const recipients = z.array(EmailAddress)

export const searchMail = createTool({
  id: 'search_mail',
  description:
    'Find messages in the mailbox. Every filter is optional and they combine. Returns summaries (no full body), newest first; pass nextPageToken back to get the next page. Trash is left out unless label is TRASH.',
  inputSchema: z.object({
    text: z.string().optional().describe('Words to look for in the subject, body or sender'),
    from: z.string().optional().describe('Sender name or address, partial match'),
    to: z.string().optional().describe('Recipient name or address, partial match (to or cc)'),
    subject: z.string().optional(),
    label: z.string().optional().describe('INBOX, UNREAD, SENT, DRAFT, TRASH, STARRED, IMPORTANT or a user label'),
    threadId: ThreadId.optional(),
    unread: z.boolean().optional(),
    hasAttachments: z.boolean().optional(),
    after: z.iso.date().optional().describe('YYYY-MM-DD, inclusive'),
    before: z.iso.date().optional().describe('YYYY-MM-DD, exclusive'),
    limit: z.number().int().min(1).max(100).optional(),
    pageToken: z.string().optional(),
  }),
  execute: async (input, context) => {
    const params = new URLSearchParams(Object.entries(input).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
    return mailApi(context, `/messages?${params}`)
  },
})

export const readMessage = createTool({
  id: 'read_message',
  description: 'Open one message: full body, recipients, labels and the list of attachments.',
  inputSchema: z.object({ messageId: MessageId }),
  execute: async ({ messageId }, context) => mailApi(context, `/messages/${messageId}`),
})

export const readThread = createTool({
  id: 'read_thread',
  description: 'Open a whole conversation, oldest message first. Use it before answering anything about where a conversation stands.',
  inputSchema: z.object({ threadId: ThreadId }),
  execute: async ({ threadId }, context) => mailApi(context, `/threads/${threadId}`),
})

export const readAttachment = createTool({
  id: 'read_attachment',
  description: 'Read the contents of a file attached to a message.',
  inputSchema: z.object({ messageId: MessageId, attachmentId: AttachmentId }),
  execute: async ({ messageId, attachmentId }, context) => mailApi(context, `/messages/${messageId}/attachments/${attachmentId}`),
})

export const saveDraft = createTool({
  id: 'save_draft',
  description:
    "Write an email and leave it in Drafts without sending it. With replyToMessageId it becomes a reply in that conversation, and the recipients and subject default to the conversation's. With draftId it rewrites a draft you saved earlier.",
  inputSchema: z.object({
    to: recipients.optional(),
    cc: recipients.optional(),
    bcc: recipients.optional(),
    subject: z.string().optional(),
    body: z.string(),
    replyToMessageId: MessageId.optional(),
    draftId: MessageId.optional().describe('An existing draft to rewrite'),
  }),
  execute: async ({ draftId, replyToMessageId, ...fields }, context) =>
    draftId ? mailApi(context, `/drafts/${draftId}`, fields, 'PATCH') : mailApi(context, '/drafts', { ...fields, replyToMessageId }),
})

export const sendMail = createTool({
  id: 'send_mail',
  description:
    "Send an email from the user's own address. With replyToMessageId it goes out as a reply in that conversation, and the recipients and subject default to the conversation's. It leaves immediately.",
  inputSchema: z.object({
    to: recipients.optional(),
    cc: recipients.optional(),
    bcc: recipients.optional(),
    subject: z.string().optional(),
    body: z.string(),
    replyToMessageId: MessageId.optional(),
  }),
  execute: async (input, context) => mailApi(context, '/messages/send', input),
})

export const sendDraft = createTool({
  id: 'send_draft',
  description: 'Send a draft that is already saved, as it is.',
  inputSchema: z.object({ draftId: MessageId }),
  execute: async ({ draftId }, context) => mailApi(context, `/drafts/${draftId}/send`, {}),
})

export const archive = createTool({
  id: 'archive',
  description: 'Take messages out of the inbox. They are not deleted and stay searchable.',
  inputSchema: z.object({ messageIds }),
  execute: async ({ messageIds }, context) => mailApi(context, '/messages/modify', { ids: messageIds, remove: ['INBOX'] }),
})

export const markRead = createTool({
  id: 'mark_read',
  description: 'Mark messages as read, or as unread again with read: false.',
  inputSchema: z.object({ messageIds, read: z.boolean().default(true) }),
  execute: async ({ messageIds, read }, context) =>
    mailApi(context, '/messages/modify', read ? { ids: messageIds, remove: ['UNREAD'] } : { ids: messageIds, add: ['UNREAD'] }),
})

export const labelMessages = createTool({
  id: 'label_messages',
  description: 'Add or remove labels on messages. A new label name is created the first time it is used. Also stars (STARRED) and flags (IMPORTANT).',
  inputSchema: z.object({ messageIds, add: z.array(Label).optional(), remove: z.array(Label).optional() }),
  execute: async ({ messageIds, add, remove }, context) => mailApi(context, '/messages/modify', { ids: messageIds, add, remove }),
})

export const listLabels = createTool({
  id: 'list_labels',
  description: 'List every label in the mailbox with how many messages carry it and how many of those are unread.',
  inputSchema: z.object({}),
  execute: async (_input, context) => mailApi(context, '/labels'),
})

export const trash = createTool({
  id: 'trash',
  description: 'Move messages to the trash.',
  inputSchema: z.object({ messageIds }),
  execute: async ({ messageIds }, context) => mailApi(context, '/messages/trash', { ids: messageIds }),
})

export const mailTools = {
  search_mail: searchMail,
  read_message: readMessage,
  read_thread: readThread,
  read_attachment: readAttachment,
  save_draft: saveDraft,
  send_mail: sendMail,
  send_draft: sendDraft,
  archive,
  mark_read: markRead,
  label_messages: labelMessages,
  list_labels: listLabels,
  trash,
}
