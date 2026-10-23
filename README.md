# readywhen: AI engineering challenge

A working email assistant for one very busy business owner, running on her real-looking inbox. Clone it, run it, and use it as the ground for your work.

## Before you start

Please spend no more than **5 hours** in total, coding and write-ups together. We expect you to use AI coding tools; work the way you normally would. If anything is unclear, get in touch: asking is fine.

Two things you can assume throughout:

- Our **ICP** is the owner or founder of a small service business (1 to 10 people): agencies, consultancies, studios, trades. They run their day from email, make promises to clients there, and lose track of them. No ops team, no assistant.
- Our user here is **Elena Conti**, who owns Lume Locations, a location and production agency in Milan. `data/owner.md` says who she is and who she works with. `data/inbox.json` is her mailbox: about six weeks of mail from clients, venues, suppliers, her team, her lawyer, her accountant, her sister and every newsletter she never unsubscribed from. In her world it is Friday 18 September 2026, 09:00.

## What's here

```text
┌──────────────────┐   HTTP    ┌───────────────────────┐   HTTP    ┌──────────────────────┐
│ you, Studio, curl│ ────────► │ agent  :4111          │ ────────► │ mail API  :3000      │
│ (Task 3: your UI)│           │ Mastra, Sonnet 5.5    │           │ Next.js, Gmail-shaped│
└──────────────────┘           └───────────┬───────────┘           └──────────┬───────────┘
                                           └──────────── Postgres ────────────┘
```

- **The mail API** (`src/app/api`, `src/mail`) is a mock of a Gmail-style provider: search, read, threads, attachments, drafts, send, labels, archive, trash. Reference in `docs/mail-api.md`. `POST /api/mailboxes` gives you a fresh, independent copy of Elena's inbox whenever you need one. The default mailbox is `main`.
- **The agent** (`src/mastra`) is one Mastra agent on Claude Sonnet 5.5 with twelve mail tools. Its whole personality and behaviour live in one prompt, `src/mastra/agents/inbox.md`, which is re-read on every message. It reads its mailbox id from the request context (`mailboxId`, default `main`).
- Today, `send_mail` and `send_draft` send immediately. Nothing stands between the model and Elena's outbox.

## How we read your work

We care most about whether you can tell, with a number, that a change made the assistant better or worse. Every claim in your write-ups should point at a result we can re-run ourselves. We'd rather read one claim we can check than three that sound plausible.

## Task 1: Evals

The assistant ships with no evals at all. Build the eval setup you would want before you touch the prompt.

There are no guidelines on shape, tools or libraries: choosing them is the task. As a bar, after any prompt edit one command should tell you whether the assistant got better or worse, and you should believe what it says.

Write `reports/task-1.md`: what you measure and why, how you know your evals measure what they claim to, and what a run costs in time and money.

## Task 2: Voice, and never sending what it shouldn't

Two things worry us more than anything else about this assistant.

1. **It doesn't sound like us.** `docs/voice.md` describes how it should talk to Elena, and how emails written as Elena should read.
2. **It sends email as Elena when it shouldn't.** When she has said not to, when what she asked is unclear, or when the email would be the wrong thing to send. An assistant that sends one email it shouldn't have loses the user for good. This is the core scenario.

First, iterate on the prompt until your evals show it holds both. Then make sure the **system** never sends an email it shouldn't, even on the day the prompt slips: put a small decision model in the send path (for example Haiku, `claude-haiku-5-5`) that decides, from what Elena actually said, whether this email may go. The agent must not be able to route around it. What happens when it says no is your call.

Being too careful costs too: an assistant that never sends anything is not useful either. Show both sides.

Write `reports/task-2.md`: what failed at the start, what you changed, how the numbers moved after each change, and what still fails.

## Task 3: Product

This is an API today. Build a small frontend for Elena in `src/app`.

Ask yourself what you would design for her, given this data and what the assistant can do. A chat box next to an inbox is the obvious answer, and the one that teaches us least. Be as creative as you like: add features, change the agent, add tools, change what it does on its own. Nothing here is sacred.

Write `reports/task-3.md`: what you built, the problem it solves for Elena, and what you would want to learn from putting it in front of ten owners like her.

## Running

You need Docker and an Anthropic API key. If you don't have a key, ask us and we'll send one.

```bash
git clone https://github.com/olivahealth/readywhen-ai-challenge.git
cd readywhen-ai-challenge
cp .env.example .env              # add your ANTHROPIC_API_KEY
docker compose up --build
```

- Mail API: <http://localhost:3000/api/mailboxes/main/messages?unread=true>
- Agent and Mastra Studio (chat with it, see every tool call): <http://localhost:4111>

Talk to the agent over HTTP:

```bash
curl -s localhost:4111/api/agents/inbox/generate -H 'content-type: application/json' -d '{
  "messages": [{ "role": "user", "content": "What needs me today?" }],
  "requestContext": { "mailboxId": "main" },
  "memory": { "thread": "my-first-chat", "resource": "elena" }
}'
```

For a faster loop, run Postgres in Docker and the two apps on your machine (Node 22 or later):

```bash
npm install
npm run db            # Postgres only, on port 54320
npm run dev:web       # mail API on :3000
npm run dev:agent     # agent and Studio on :4111
```

## Submitting

Please don't fork. Push to a new public repository under your own account and send us the link. Commit tasks in order, Task 1, then Task 2, then Task 3, so we can read each on its own. Write-ups go in `reports/`.
