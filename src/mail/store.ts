// The mailbox: Postgres behind a Gmail-shaped model. Every mailbox is an
// independent copy of data/inbox.json, so a test run can fork its own and
// never needs a reset.
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import postgres from 'postgres'

import {
  type Address,
  type AttachmentId,
  type AttachmentMeta,
  type Compose,
  type DraftPatch,
  type Label,
  type Mailbox,
  type Message,
  type MessageId,
  type MessageSummary,
  type Modify,
  type SearchQuery,
  type ThreadId,
  EmailAddress,
  MailboxId,
  SYSTEM_LABELS,
} from './contract'

export class NotFound extends Error {}
export class Invalid extends Error {}

const sql = postgres(process.env.DATABASE_URL ?? 'postgres://inbox:inbox@localhost:54320/inbox', { max: 10, onnotice: () => {} })

const SCHEMA = `
  create schema if not exists mail;
  create table if not exists mail.mailbox (
    id text primary key,
    owner jsonb not null,
    time_zone text not null,
    clock timestamptz not null,
    created_at timestamptz not null default now()
  );
  create table if not exists mail.message (
    mailbox_id text not null references mail.mailbox(id) on delete cascade,
    id text not null,
    thread_id text not null,
    sender jsonb not null,
    to_addrs jsonb not null,
    cc jsonb not null,
    bcc jsonb not null,
    subject text not null,
    body text not null,
    sent_at timestamptz not null,
    labels text[] not null,
    in_reply_to text,
    attachments jsonb not null,
    primary key (mailbox_id, id)
  );
  create index if not exists message_by_date on mail.message (mailbox_id, sent_at desc);
  create index if not exists message_by_thread on mail.message (mailbox_id, thread_id);
`

type StoredAttachment = AttachmentMeta & { content: string }
type Fixture = { owner: Address; timeZone: string; now: string; messages: (Omit<Message, 'attachments'> & { attachments: StoredAttachment[] })[] }

type Row = {
  id: string
  thread_id: string
  sender: Address
  to_addrs: Address[]
  cc: Address[]
  bcc: Address[]
  subject: string
  body: string
  sent_at: Date
  labels: string[]
  in_reply_to: string | null
  attachments: StoredAttachment[]
}

let fixture: Fixture | undefined
function loadFixture(): Fixture {
  fixture ??= JSON.parse(readFileSync(path.join(process.cwd(), 'data/inbox.json'), 'utf8')) as Fixture
  return fixture
}

export async function boot() {
  await sql.unsafe(SCHEMA)
  await createMailbox(MailboxId.parse('main'))
}

export async function createMailbox(id = MailboxId.parse(`mbx_${randomBytes(5).toString('hex')}`)): Promise<Mailbox> {
  const { owner, timeZone, now, messages } = loadFixture()
  await sql.begin(async (tx) => {
    const created = await tx`
      insert into mail.mailbox (id, owner, time_zone, clock) values (${id}, ${tx.json(owner)}, ${timeZone}, ${now})
      on conflict do nothing returning id`
    if (created.length === 0) return
    const rows = messages.map((m) => ({
      mailbox_id: id,
      id: m.id,
      thread_id: m.threadId,
      sender: sql.json(m.from),
      to_addrs: sql.json(m.to),
      cc: sql.json(m.cc),
      bcc: sql.json(m.bcc),
      subject: m.subject,
      body: m.body,
      sent_at: m.date,
      labels: m.labels,
      in_reply_to: m.inReplyTo,
      attachments: sql.json(m.attachments),
    }))
    for (let i = 0; i < rows.length; i += 500) {
      await tx`insert into mail.message ${tx(rows.slice(i, i + 500))}`
    }
  })
  return getMailbox(id)
}

// The fixture is frozen at a fixed "now"; a mailbox's clock starts there and
// runs at real speed, so dates in a run stay deterministic.
export async function getMailbox(id: MailboxId): Promise<Mailbox> {
  const [row] = await sql<{ owner: Address; time_zone: string; now: Date }[]>`
    select owner, time_zone, clock + (now() - created_at) as now from mail.mailbox where id = ${id}`
  if (!row) throw new NotFound(`no mailbox ${id}`)
  return { id, owner: row.owner, timeZone: row.time_zone, now: row.now.toISOString() }
}

export async function search(id: MailboxId, q: SearchQuery): Promise<{ messages: MessageSummary[]; nextPageToken: string | null }> {
  await getMailbox(id)
  const like = (s: string) => `%${s.replace(/[\\%_]/g, '\\$&')}%`
  const where = [sql`mailbox_id = ${id}`]
  if (q.text) where.push(sql`(subject ilike ${like(q.text)} or body ilike ${like(q.text)} or sender::text ilike ${like(q.text)})`)
  if (q.from) where.push(sql`sender::text ilike ${like(q.from)}`)
  if (q.to) where.push(sql`(to_addrs::text ilike ${like(q.to)} or cc::text ilike ${like(q.to)})`)
  if (q.subject) where.push(sql`subject ilike ${like(q.subject)}`)
  if (q.threadId) where.push(sql`thread_id = ${q.threadId}`)
  if (q.label) where.push(sql`${q.label} = any(labels)`)
  if (q.label !== 'TRASH') where.push(sql`not ('TRASH' = any(labels))`)
  if (q.unread !== undefined) where.push(q.unread ? sql`'UNREAD' = any(labels)` : sql`not ('UNREAD' = any(labels))`)
  if (q.hasAttachments !== undefined) where.push(q.hasAttachments ? sql`jsonb_array_length(attachments) > 0` : sql`jsonb_array_length(attachments) = 0`)
  if (q.after) where.push(sql`sent_at >= ${q.after}::date`)
  if (q.before) where.push(sql`sent_at < ${q.before}::date`)
  const conditions = where.reduce((all, next) => sql`${all} and ${next}`)

  // ponytail: offset paging over an ILIKE scan; fine for a few thousand rows, keyset + tsvector past ~50k
  const offset = Number(q.pageToken ?? 0)
  const rows = await sql<Row[]>`
    select * from mail.message where ${conditions}
    order by sent_at desc, id desc limit ${q.limit + 1} offset ${offset}`
  const page = rows.slice(0, q.limit)
  return {
    messages: page.map((row) => {
      const { body, ...rest } = toMessage(row)
      return { ...rest, snippet: body.replace(/\s+/g, ' ').slice(0, 160) }
    }),
    nextPageToken: rows.length > q.limit ? String(offset + q.limit) : null,
  }
}

export async function getMessage(id: MailboxId, messageId: MessageId): Promise<Message> {
  return toMessage(await getRow(id, messageId))
}

export async function getThread(id: MailboxId, threadId: ThreadId): Promise<Message[]> {
  const rows = await sql<Row[]>`
    select * from mail.message where mailbox_id = ${id} and thread_id = ${threadId} order by sent_at, id`
  if (rows.length === 0) throw new NotFound(`no thread ${threadId}`)
  return rows.map(toMessage)
}

export async function getAttachment(id: MailboxId, messageId: MessageId, attachmentId: AttachmentId): Promise<StoredAttachment> {
  const attachment = (await getRow(id, messageId)).attachments.find((a) => a.id === attachmentId)
  if (!attachment) throw new NotFound(`no attachment ${attachmentId} on ${messageId}`)
  return attachment
}

export async function send(id: MailboxId, compose: Compose): Promise<Message> {
  return insertAuthored(id, compose, 'SENT')
}

export async function createDraft(id: MailboxId, compose: Compose): Promise<Message> {
  return insertAuthored(id, compose, 'DRAFT')
}

export async function updateDraft(id: MailboxId, draftId: MessageId, patch: DraftPatch): Promise<Message> {
  const draft = await getDraftRow(id, draftId)
  const [row] = await sql<Row[]>`
    update mail.message set
      to_addrs = ${sql.json(patch.to ? patch.to.map(toAddress) : draft.to_addrs)},
      cc = ${sql.json(patch.cc ? patch.cc.map(toAddress) : draft.cc)},
      bcc = ${sql.json(patch.bcc ? patch.bcc.map(toAddress) : draft.bcc)},
      subject = ${patch.subject ?? draft.subject},
      body = ${patch.body ?? draft.body}
    where mailbox_id = ${id} and id = ${draftId} returning *`
  return toMessage(row)
}

export async function deleteDraft(id: MailboxId, draftId: MessageId): Promise<void> {
  await getDraftRow(id, draftId)
  await sql`delete from mail.message where mailbox_id = ${id} and id = ${draftId}`
}

export async function sendDraft(id: MailboxId, draftId: MessageId): Promise<Message> {
  const draft = await getDraftRow(id, draftId)
  if (draft.to_addrs.length === 0) throw new Invalid('the draft has no recipients')
  const { now } = await getMailbox(id)
  const [row] = await sql<Row[]>`
    update mail.message set labels = '{SENT}', sent_at = ${now}
    where mailbox_id = ${id} and id = ${draftId} returning *`
  return toMessage(row)
}

// Idempotent: adding a label a message already has, or removing one it
// lacks, is not an error. Unknown ids come back in `notFound`.
export async function modify(id: MailboxId, { ids, add, remove }: Modify): Promise<{ modified: MessageId[]; notFound: MessageId[] }> {
  const locked = [...add, ...remove].filter((l) => l === 'SENT' || l === 'DRAFT')
  if (locked.length > 0) throw new Invalid(`${locked.join(', ')} can't be added or removed; send a draft instead`)
  await getMailbox(id)
  const rows = await sql<{ id: MessageId }[]>`
    update mail.message set labels = array(
      select distinct l from unnest(labels || ${add}::text[]) as l where l <> all(${remove}::text[])
    )
    where mailbox_id = ${id} and id = any(${ids}::text[]) returning id`
  const modified = rows.map((r) => r.id)
  return { modified, notFound: ids.filter((i) => !modified.includes(i)) }
}

export async function labels(id: MailboxId): Promise<{ name: string; system: boolean; total: number; unread: number }[]> {
  await getMailbox(id)
  const rows = await sql<{ name: string; total: number; unread: number }[]>`
    select l as name, count(*)::int as total, count(*) filter (where 'UNREAD' = any(labels))::int as unread
    from mail.message, unnest(labels) as l where mailbox_id = ${id} group by l order by l`
  const system = SYSTEM_LABELS.map((name) => ({ name, system: true, total: 0, unread: 0, ...rows.find((r) => r.name === name) }))
  const custom = rows.filter((r) => !system.some((s) => s.name === r.name)).map((r) => ({ ...r, system: false }))
  return [...system, ...custom]
}

// ---- internals -------------------------------------------------------------

async function insertAuthored(id: MailboxId, compose: Compose, label: 'SENT' | 'DRAFT'): Promise<Message> {
  const { owner, now } = await getMailbox(id)
  const parent = compose.replyToMessageId ? await getRow(id, compose.replyToMessageId) : null
  const to = compose.to.length > 0 ? compose.to.map(toAddress) : replyRecipients(parent!, owner)
  const subject = compose.subject ?? (parent ? withReplyPrefix(parent.subject) : '(no subject)')
  const [row] = await sql<Row[]>`
    insert into mail.message ${sql({
      mailbox_id: id,
      id: `msg_${randomBytes(6).toString('hex')}`,
      thread_id: parent?.thread_id ?? `thr_${randomBytes(6).toString('hex')}`,
      sender: sql.json(owner),
      to_addrs: sql.json(to),
      cc: sql.json(compose.cc.map(toAddress)),
      bcc: sql.json(compose.bcc.map(toAddress)),
      subject,
      body: compose.body,
      sent_at: now,
      labels: [label],
      in_reply_to: parent?.id ?? null,
      attachments: sql.json([]),
    })} returning *`
  return toMessage(row)
}

// A reply goes back to the other side: the sender, or the original
// recipients when the owner wrote the message being replied to.
function replyRecipients(parent: Row, owner: Address): Address[] {
  return parent.sender.email === owner.email ? parent.to_addrs : [parent.sender]
}

function withReplyPrefix(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`
}

function toAddress(email: EmailAddress): Address {
  return { name: null, email }
}

async function getRow(id: MailboxId, messageId: MessageId): Promise<Row> {
  const [row] = await sql<Row[]>`select * from mail.message where mailbox_id = ${id} and id = ${messageId}`
  if (!row) throw new NotFound(`no message ${messageId}`)
  return row
}

async function getDraftRow(id: MailboxId, draftId: MessageId): Promise<Row> {
  const row = await getRow(id, draftId)
  if (!row.labels.includes('DRAFT')) throw new NotFound(`${draftId} is not a draft`)
  return row
}

function toMessage(row: Row): Message {
  return {
    id: row.id as MessageId,
    threadId: row.thread_id as ThreadId,
    from: row.sender,
    to: row.to_addrs,
    cc: row.cc,
    bcc: row.bcc,
    subject: row.subject,
    body: row.body,
    date: new Date(row.sent_at).toISOString(),
    labels: row.labels as Label[],
    inReplyTo: row.in_reply_to as MessageId | null,
    attachments: row.attachments.map(({ content: _content, ...meta }) => meta),
  }
}
