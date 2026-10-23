// Creates the mail tables and the default mailbox "main" on first boot.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { boot } = await import('./mail/store')
  await boot()
}
