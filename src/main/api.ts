import { z } from 'zod';
import type { ApiResult } from '../bridge.ts';
import { accessToken, apiUrl } from './session.ts';

/** A procedure's name in Frontline's router: `calls.phone.lines`. */
const Procedure = z.string().regex(/^[a-zA-Z]+(\.[a-zA-Z]+)*$/);

const Refusal = z.object({ message: z.string() });

const SIGNED_OUT: ApiResult = { ok: false, status: 401, problem: 'Sign in again' };

const UNREACHABLE: ApiResult = { ok: false, status: 0, problem: "Can't reach erxes" };

/** The access token, or the answer to give without one. */
const tokenOrProblem = async (): Promise<string | ApiResult> => {
  try {
    return (await accessToken()) ?? SIGNED_OUT;
  } catch {
    // The renewal never reached core, so the sign-in stays for when it can.
    return UNREACHABLE;
  }
};

/**
 * Calls a Frontline procedure over its REST address (`<api>/v1/calls/phone/lines`) as the
 * signed-in member. The window never sees the token.
 */
export const callApi = async (procedure: unknown, input: unknown): Promise<ApiResult> => {
  const name = Procedure.safeParse(procedure);
  const [base, token] = [apiUrl(), await tokenOrProblem()];

  if (!name.success) return { ok: false, status: 400, problem: 'No such procedure' };

  if (typeof token !== 'string') return token;

  if (!base) return SIGNED_OUT;

  const response = await fetch(`${base}/v1/${name.data.replaceAll('.', '/')}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(input ?? {}),
  }).catch(() => undefined);

  if (!response) return UNREACHABLE;

  const body: unknown = await response.json().catch(() => undefined);

  if (response.ok) return { ok: true, data: body };

  const refusal = Refusal.safeParse(body);

  return {
    ok: false,
    status: response.status,
    problem: refusal.success ? refusal.data.message : `erxes answered ${response.status}`,
  };
};
