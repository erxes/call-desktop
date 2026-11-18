import { z } from 'zod';

/** Who is signed in, and where. */
export const Session = z.object({
  /** The address erxes opens at in a browser. */
  address: z.string(),
  name: z.string(),
  organization: z.string().nullable(),
});

export type Session = z.infer<typeof Session>;

export const SignInResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), session: Session }),
  z.object({ ok: z.literal(false), problem: z.string() }),
]);

export type SignInResult = z.infer<typeof SignInResult>;

/** A procedure's answer, or why there is none: 401 means the sign-in ended. */
export const ApiResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), status: z.number(), problem: z.string() }),
]);

export type ApiResult = z.infer<typeof ApiResult>;

/**
 * What the window may ask the app for (`preload.ts` puts it at `window.desktop`). Answers cross
 * processes untyped; `ui/desktop.ts` reads them with the schemas above.
 */
export type Desktop = {
  session: () => Promise<unknown>;
  /** Opens the browser at erxes' sign-in and waits for the member to come back. */
  signIn: (address: string) => Promise<unknown>;
  signOut: () => Promise<void>;
  /** Calls a Frontline procedure by its name in the router: `calls.phone.lines`. */
  api: (procedure: string, input: unknown) => Promise<unknown>;
  /** Opens a page of erxes web in the app's second window: `/frontline/calls/history`. */
  openErxes: (path: string) => void;
  /** A call is ringing: the app brings the window forward and notifies. */
  ringing: (number: string) => void;
  /** The ringing stopped, answered or not. */
  quiet: () => void;
};
