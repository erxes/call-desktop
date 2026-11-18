import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app, safeStorage } from 'electron';
import { z } from 'zod';
import type { Session } from '../bridge.ts';
import { refresh, revoke, signIn } from './signIn.ts';

/** A sign-in as it is kept between launches, encrypted with the system's keychain. */
const Stored = z.object({
  address: z.string(),
  apiUrl: z.string(),
  tokenEndpoint: z.string(),
  revocationEndpoint: z.string(),
  name: z.string(),
  organization: z.string().nullable(),
  refreshToken: z.string(),
});

type Stored = z.infer<typeof Stored>;

/** An access token is renewed this long before it ends. */
const EARLY_MS = 30_000;

let stored: Stored | undefined;
let access: { token: string; until: number } | undefined;
let renewing: Promise<string | undefined> | undefined;

const file = () => join(app.getPath('userData'), 'session');

const isMissingFile = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const save = async (next: Stored) => {
  stored = next;

  // Without a keychain the sign-in lasts until the app quits.
  if (!(await safeStorage.isAsyncEncryptionAvailable())) return;

  await mkdir(dirname(file()), { recursive: true });
  await writeFile(file(), await safeStorage.encryptStringAsync(JSON.stringify(next)));
};

const forget = async () => {
  stored = undefined;
  access = undefined;
  await rm(file(), { force: true });
};

const remember = (token: string, expiresIn: number) => {
  access = { token, until: Date.now() + expiresIn * 1000 - EARLY_MS };
};

const sessionOf = ({ address, name, organization }: Session): Session => ({
  address,
  name,
  organization,
});

/** Reads the kept sign-in, once, when the app starts. A file this app can't read is dropped. */
export const loadSession = async () => {
  try {
    const { result } = await safeStorage.decryptStringAsync(await readFile(file()));

    stored = Stored.parse(JSON.parse(result));
  } catch (error) {
    if (!isMissingFile(error)) await forget();
  }
};

export const currentSession = () => (stored ? sessionOf(stored) : null);

/** Where Frontline's procedures answer, while someone is signed in. */
export const apiUrl = () => stored?.apiUrl;

export const startSession = async (address: string) => {
  const { tokens, stored: next } = await signIn(address);

  remember(tokens.access_token, tokens.expires_in);
  await save({ ...next, refreshToken: tokens.refresh_token });

  return sessionOf(next);
};

const renew = async (current: Stored) => {
  const tokens = await refresh(current.tokenEndpoint, current.refreshToken);

  // Core refused the refresh token: it was revoked, or the member can no longer sign in.
  if (!tokens) {
    await forget();

    return undefined;
  }

  remember(tokens.access_token, tokens.expires_in);
  await save({ ...current, refreshToken: tokens.refresh_token });

  return tokens.access_token;
};

/**
 * A valid access token, renewed when it is about to end, or `undefined` once the sign-in is
 * over. Refresh tokens work once, so calls that arrive together share one renewal.
 */
export const accessToken = async () => {
  if (!stored) return undefined;

  if (access && access.until > Date.now()) return access.token;

  renewing ??= renew(stored).finally(() => {
    renewing = undefined;
  });

  return renewing;
};

export const endSession = async () => {
  const current = stored;

  await forget();

  // Signing out works offline too; core then ends the token when it expires.
  if (current)
    await revoke(current.revocationEndpoint, current.refreshToken).catch(() => undefined);
};
