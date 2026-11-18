/** The messages between the window and the app; `bridge.ts` says what each carries. */
export const CHANNELS = {
  session: 'session',
  signIn: 'sign-in',
  signOut: 'sign-out',
  api: 'api',
  openErxes: 'open-erxes',
  ringing: 'ringing',
  quiet: 'quiet',
} as const;
