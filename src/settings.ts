import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { z } from 'zod';

/** The address erxes opens at in a browser, kept as its origin. */
export const serverAddress = z
  .string()
  .trim()
  .pipe(z.url({ protocol: /^https?$/ }))
  .transform((url) => new URL(url).origin);

const settingsSchema = z.object({ serverUrl: serverAddress });

const settingsFile = () => join(app.getPath('userData'), 'settings.json');

const isMissingFile = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** The saved server, or `undefined` before the first connect. */
export const readServerUrl = async () => {
  try {
    const parsed: unknown = JSON.parse(await readFile(settingsFile(), 'utf8'));

    return settingsSchema.parse(parsed).serverUrl;
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
};

export const saveServerUrl = async (serverUrl: string) => {
  await mkdir(dirname(settingsFile()), { recursive: true });
  await writeFile(settingsFile(), JSON.stringify({ serverUrl }));
};
