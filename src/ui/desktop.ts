import type { z } from 'zod';
import { ApiResult, Session, SignInResult } from '../bridge.ts';
import type { Desktop } from '../bridge.ts';

declare global {
  interface Window {
    /** The app's side of the window (`preload.ts`). */
    desktop: Desktop;
  }
}

/** The start of every query key that holds a procedure's answer. */
export const API = ['api'];

/** A procedure refused or unreachable; `status` 401 means the sign-in ended. */
export class ApiProblem extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const currentSession = async () => Session.nullable().parse(await window.desktop.session());

export const signIn = async (address: string) =>
  SignInResult.parse(await window.desktop.signIn(address));

/** Calls a Frontline procedure and reads its answer as `schema`. */
export const call = async <Answer>(
  procedure: string,
  input: unknown,
  schema: z.ZodType<Answer>,
) => {
  const result = ApiResult.parse(await window.desktop.api(procedure, input));

  if (!result.ok) throw new ApiProblem(result.status, result.problem);

  return schema.parse(result.data);
};
