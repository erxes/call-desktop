import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { shell } from 'electron';
import { z } from 'zod';

/** Frontline is the OAuth client: its manifest lists this app's redirect address. */
const CLIENT_ID = 'frontline';

/** Fixed, because core matches redirect addresses exactly (Frontline's `manifest.ts`). */
const PORT = 47_823;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = 'openid profile email offline_access';
const WAIT_MS = 5 * 60_000;

const DONE_PAGE = `<!doctype html><meta charset="utf-8"><title>erxes Call</title>
<body style="font:16px system-ui;padding:48px;text-align:center">
<h1 style="font-size:20px">You're signed in</h1><p>Go back to erxes Call. You can close this tab.</p>`;

/** The address erxes opens at in a browser, kept as its origin. */
export const serverAddress = z
  .string()
  .trim()
  .pipe(z.url({ protocol: /^https?$/ }))
  .transform((url) => new URL(url).origin);

const Discovery = z.object({
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  userinfo_endpoint: z.url(),
  revocation_endpoint: z.url(),
});

const Tokens = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string(),
});

const UserInfo = z.object({
  org: z.string(),
  organization: z.string().nullable(),
  name: z.string().optional(),
  email: z.string().optional(),
});

const DesktopConfig = z.object({ apiUrl: z.url() });

/** Why a sign-in step failed, in words the sign-in screen shows. */
export class SignInProblem extends Error {}

const json = async <Answer>(response: Response, schema: z.ZodType<Answer>, what: string) => {
  if (!response.ok) throw new SignInProblem(`${what} answered ${response.status}`);

  const parsed = schema.safeParse(await response.json());

  if (!parsed.success) throw new SignInProblem(`${what} sent an answer this app can't read`);

  return parsed.data;
};

const reach = async (url: string, init?: RequestInit) =>
  fetch(url, init).catch(() => {
    throw new SignInProblem(`Can't reach ${new URL(url).origin}`);
  });

const base64url = (bytes: Buffer) => bytes.toString('base64url');

/** Ends the sign-in that is waiting for the browser, if one is. */
let abandon: (() => Promise<void>) | undefined;

/**
 * Listens on the redirect address until the browser comes back with the code for `state`.
 * `open` starts the browser once the listener is up.
 */
const waitForCode = async (state: string, open: () => Promise<void>) => {
  // A sign-in left open in the browser gives way to the new one.
  await abandon?.();

  return new Promise<string>((resolve, reject) => {
    const finish = (settle: () => void) => {
      clearTimeout(timer);
      abandon = undefined;
      server.closeAllConnections();
      settle();
    };

    abandon = async () =>
      new Promise<void>((closed) => {
        server.once('close', closed);
        server.close();
        finish(() => reject(new SignInProblem('A newer sign-in replaced this one')));
      });

    const server = createServer((request, response) => {
      const { pathname, searchParams } = new URL(request.url ?? '/', REDIRECT_URI);
      const code = searchParams.get('code');

      if (pathname !== '/callback' || searchParams.get('state') !== state) {
        response.writeHead(404).end();

        return;
      }

      response.writeHead(200, { 'content-type': 'text/html' }).end(DONE_PAGE);

      server.close();

      if (code) finish(() => resolve(code));
      else finish(() => reject(new SignInProblem('erxes refused the sign-in')));
    });

    const timer = setTimeout(() => {
      server.close();
      finish(() => reject(new SignInProblem('The sign-in was not finished in the browser')));
    }, WAIT_MS);

    server.once('error', () => {
      finish(() => reject(new SignInProblem('Another erxes Call is signing in; close it first')));
    });
    server.listen(PORT, '127.0.0.1', () => {
      open().catch(() => {
        server.close();
        finish(() => reject(new SignInProblem("Can't open the browser")));
      });
    });
  });
};

/**
 * Core's sign-in addresses. Behind a proxy core names them by the host it sees, which can lack
 * the port or https the member reached it by, so each keeps its path and moves to `address`.
 */
const discover = async (address: string) => {
  const found = await json(
    await reach(`${address}/core/v1/.well-known/openid-configuration`),
    Discovery,
    'erxes',
  );

  const here = (endpoint: string) => new URL(new URL(endpoint).pathname, address).toString();

  return {
    authorization_endpoint: here(found.authorization_endpoint),
    token_endpoint: here(found.token_endpoint),
    userinfo_endpoint: here(found.userinfo_endpoint),
    revocation_endpoint: here(found.revocation_endpoint),
  };
};

const form = (fields: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: CLIENT_ID, ...fields }),
});

/**
 * "Sign in with erxes" (OAuth 2.1 with PKCE): the member signs in to erxes in their browser and
 * the app gets tokens for Frontline's API, never their password. Throws a `SignInProblem`.
 */
export const signIn = async (address: string) => {
  const endpoints = await discover(address);

  const verifier = base64url(randomBytes(32));
  const state = base64url(randomBytes(16));
  const authorize = new URL(endpoints.authorization_endpoint);

  authorize.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    code_challenge: base64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
    scope: SCOPE,
    state,
  }).toString();

  const code = await waitForCode(state, async () => shell.openExternal(authorize.toString()));

  const tokens = await json(
    await reach(
      endpoints.token_endpoint,
      form({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      }),
    ),
    Tokens,
    'The sign-in',
  );

  const member = await json(
    await reach(endpoints.userinfo_endpoint, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    }),
    UserInfo,
    'erxes',
  );

  // Core forwards this to Frontline, which answers where its API is.
  const { apiUrl } = await json(
    await reach(`${address}/core/v1/plugins/${CLIENT_ID}/public/${member.org}/desktop`),
    DesktopConfig,
    'Frontline',
  );

  return {
    tokens,
    stored: {
      address,
      apiUrl,
      tokenEndpoint: endpoints.token_endpoint,
      revocationEndpoint: endpoints.revocation_endpoint,
      name: member.name ?? member.email ?? 'Member',
      organization: member.organization,
    },
  };
};

/** A new access token for a refresh token; the answer carries the next refresh token. */
export const refresh = async (tokenEndpoint: string, refreshToken: string) => {
  const response = await fetch(
    tokenEndpoint,
    form({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  );

  return response.ok ? Tokens.parse(await response.json()) : undefined;
};

/** Ends the refresh token's family, which signs this app out at core. */
export const revoke = async (revocationEndpoint: string, refreshToken: string) => {
  await fetch(revocationEndpoint, form({ token: refreshToken }));
};
