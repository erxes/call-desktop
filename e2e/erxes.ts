import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { text } from 'node:stream/consumers';
import { z } from 'zod';

const ORG = 'org_1';

/** Core names its sign-in addresses by the host it sees behind the proxy: no port. */
const BEHIND_PROXY = 'http://localhost';

const LINE = {
  accountId: 'acc_1',
  name: 'Support',
  extension: '101',
  password: 'sip-secret',
  // Nothing answers here, so the phone shows the line and stays off it.
  webSocketUrl: 'wss://pbx.invalid/ws',
  iceServers: [],
};

const CALL = {
  id: 'call_1',
  direction: 'incoming',
  status: 'answered',
  customerPhone: '+97699112233',
  startedAt: '2026-11-18T04:00:00.000Z',
  durationSec: 75,
};

/** A page of erxes web, which says how its window names itself. */
const page = (request: IncomingMessage, url: URL) =>
  `<!doctype html><title>erxes</title><h1>${url.pathname}</h1><p>${request.headers['user-agent'] ?? ''}</p>`;

/** A procedure's JSON input, as its top-level text fields. */
const jsonOf = async (request: IncomingMessage) => {
  const parsed = z.record(z.string(), z.unknown()).parse(JSON.parse(await text(request)));

  return new URLSearchParams(
    Object.entries(parsed).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value]] : [],
    ),
  );
};

const bodyOf = async (request: IncomingMessage) => new URLSearchParams(await text(request));

type Seen = { revoked: number; renewals: number; agentStatus: string };

type Route = (request: IncomingMessage) => unknown;

/**
 * Core's "Sign in with erxes" and its forwarding to Frontline's `/public/desktop`. Access tokens
 * end at once, so every call renews; a refresh token works once, as core's do.
 */
const core = (seen: Seen, origin: () => string) => {
  let issued = 0;
  let refreshToken = '';
  let accessToken = '';

  const issue = () => {
    issued += 1;
    refreshToken = `refresh-${issued}`;
    accessToken = `access-${issued}`;

    return { access_token: accessToken, expires_in: 0, refresh_token: refreshToken };
  };

  const token = async (request: IncomingMessage) => {
    const form = await bodyOf(request);

    if (form.get('grant_type') === 'authorization_code' && form.get('code') === 'the-code')
      return issue();

    if (form.get('grant_type') === 'refresh_token' && form.get('refresh_token') === refreshToken) {
      seen.renewals += 1;

      return issue();
    }

    return undefined;
  };

  const routes: Record<string, Route> = {
    '/core/v1/.well-known/openid-configuration': () => ({
      authorization_endpoint: `${BEHIND_PROXY}/core/v1/oauth/authorize`,
      token_endpoint: `${BEHIND_PROXY}/core/v1/oauth/token`,
      userinfo_endpoint: `${BEHIND_PROXY}/core/v1/oauth/userinfo`,
      revocation_endpoint: `${BEHIND_PROXY}/core/v1/oauth/revoke`,
    }),
    '/core/v1/oauth/token': token,
    '/core/v1/oauth/userinfo': () => ({ org: ORG, organization: 'acme', name: 'Bat Erdene' }),
    '/core/v1/oauth/revoke': () => {
      seen.revoked += 1;
      refreshToken = '';

      return {};
    },
    [`/core/v1/plugins/frontline/public/${ORG}/desktop`]: () => ({
      apiUrl: `${origin()}/frontline/api`,
    }),
  };

  return {
    routes,
    signedIn: (request: IncomingMessage) =>
      request.headers.authorization === `Bearer ${accessToken}`,
  };
};

/** The Frontline procedures the phone calls, by their REST path. */
const frontline = (seen: Seen, lines: (typeof LINE)[]) => {
  let agentStatus = 'available';

  const procedures: Record<string, (input: URLSearchParams) => unknown> = {
    '/frontline/api/v1/calls/phone/lines': () => lines,
    '/frontline/api/v1/calls/list': () => ({ calls: [CALL], nextCursor: null, totalCount: 1 }),
    '/frontline/api/v1/calls/agents/mine': () => [
      { accountId: LINE.accountId, status: agentStatus },
    ],
    '/frontline/api/v1/calls/agents/setStatus': (input) => {
      agentStatus = input.get('status') ?? agentStatus;
      seen.agentStatus = agentStatus;

      return { accountId: LINE.accountId, status: agentStatus };
    },
  };

  return procedures;
};

/** Sends the browser back to the app's redirect address with a code, signed in at once. */
const authorize = (url: URL, response: ServerResponse) => {
  const back = new URL(url.searchParams.get('redirect_uri') ?? url.origin);

  back.searchParams.set('code', 'the-code');
  back.searchParams.set('state', url.searchParams.get('state') ?? '');
  response.writeHead(302, { location: back.toString() }).end();
};

/** A stand-in for erxes: core's sign-in, Frontline's procedures and pages of erxes web. */
export const startErxes = async ({ lines = [LINE] }: { lines?: (typeof LINE)[] } = {}) => {
  const seen: Seen = { revoked: 0, renewals: 0, agentStatus: '' };
  let origin = '';
  const { routes, signedIn } = core(seen, () => origin);
  const procedures = frontline(seen, lines);

  const answer = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', origin);

    if (url.pathname === '/core/v1/oauth/authorize') {
      authorize(url, response);

      return;
    }

    if (url.pathname.startsWith('/frontline/') && !url.pathname.startsWith('/frontline/api/')) {
      response.writeHead(200, { 'content-type': 'text/html' }).end(page(request, url));

      return;
    }

    const procedure = procedures[url.pathname];

    const body = procedure
      ? signedIn(request) && procedure(await jsonOf(request))
      : await routes[url.pathname]?.(request);

    response
      .writeHead(body ? 200 : 401, { 'content-type': 'application/json' })
      .end(JSON.stringify(body || { message: 'Refused' }));
  };

  const server = createServer((request, response) => void answer(request, response));

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();

  if (address === null || typeof address === 'string') throw new Error('the server has no port');

  origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    seen,
    stop: async () => {
      server.closeAllConnections();
      server.close();
    },
  };
};
