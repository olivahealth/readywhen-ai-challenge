import { handle } from '@/mail/http'
import { createMailbox } from '@/mail/store'

// Forks a fresh copy of the fixture inbox.
export const POST = handle(() => createMailbox())
