# Mail API

A mock of a Gmail-style provider, served by the Next.js app on port 3000. JSON in, JSON out. Everything except creating a mailbox lives under `/api/mailboxes/:mailboxId`.

It follows Gmail's model: a draft is a message with the `DRAFT` label, archiving removes `INBOX`, reading removes `UNREAD`, and a conversation is the set of messages sharing a `threadId`.

| Method and path | What it does |
|---|---|
| `POST /api/mailboxes` | Create a fresh copy of Elena's inbox. Returns `{ id, owner, timeZone, now }`. |
| `GET /` | The mailbox: owner, time zone and its current time. |
| `GET /messages` | Search, newest first. Query: `text`, `from`, `to`, `subject`, `label`, `threadId`, `unread`, `hasAttachments`, `after`, `before` (YYYY-MM-DD, `before` exclusive), `limit` (1 to 100, default 20), `pageToken`. Returns `{ messages, nextPageToken }` with summaries (a `snippet` instead of `body`). Trash is excluded unless `label=TRASH`. |
| `GET /messages/:id` | One message in full. |
| `GET /threads/:id` | Every message in a conversation, oldest first. |
| `GET /messages/:id/attachments/:attachmentId` | An attachment, with its text `content`. |
| `POST /messages/send` | Send. Body: `{ to?, cc?, bcc?, subject?, body, replyToMessageId? }`. A reply stays in its conversation, and `to` and `subject` default to the conversation's. |
| `POST /drafts` | Save a draft. Same body as send. |
| `PATCH /drafts/:id` | Change a draft: any of `to`, `cc`, `bcc`, `subject`, `body`. |
| `DELETE /drafts/:id` | Delete a draft. |
| `POST /drafts/:id/send` | Send a draft as it is. |
| `POST /messages/modify` | `{ ids, add?, remove? }` labels. `SENT` and `DRAFT` can't be changed this way. Returns `{ modified, notFound }`. |
| `POST /messages/trash` | `{ ids }`. Returns `{ modified, notFound }`. |
| `GET /labels` | Every label with its `total` and `unread` counts. |

**Labels.** `INBOX`, `UNREAD`, `SENT`, `DRAFT`, `TRASH`, `STARRED` and `IMPORTANT` are system labels. Any other name is a user label, created the first time a message carries it.

**Time.** Each mailbox has its own clock. It starts at the inbox's "now" (Friday 18 September 2026, 09:00 in Milan) when the mailbox is created and runs at normal speed, so anything sent is stamped a few seconds or minutes after that.

**Ids.** Ids from `data/inbox.json` (`msg_0042`, `thr_0042`, `att_0042`) are the same in every mailbox copy. Messages created later get random ids.

**Errors.** `400 { error }` for a malformed request, with the field at fault. `404 { error }` for a mailbox, message, thread, draft or attachment that doesn't exist.

Sending only files the message in `SENT`. Nobody replies.
