import { Mastra } from '@mastra/core'
import { PinoLogger } from '@mastra/loggers'
import { PostgresStore } from '@mastra/pg'

import { inbox } from './agents/inbox'

export const mastra = new Mastra({
  agents: { inbox },
  storage: new PostgresStore({
    id: 'mastra',
    connectionString: process.env.DATABASE_URL ?? 'postgres://inbox:inbox@localhost:54320/inbox',
    schemaName: 'mastra',
  }),
  logger: new PinoLogger({ name: 'inbox', level: 'info' }),
})
