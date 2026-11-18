import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startErxes } from './erxes.ts';

const cleanups: (() => Promise<unknown>)[] = [];

test.afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

const erxes = async (options?: Parameters<typeof startErxes>[0]) => {
  const server = await startErxes(options);

  cleanups.push(server.stop);

  return server;
};

/** Launches the app on one data folder; call the result again for a second run. */
const launcher = async () => {
  const data = await mkdtemp(join(tmpdir(), 'call-desktop-'));

  return async () => {
    const app = await electron.launch({ args: ['.', `--user-data-dir=${data}`] });

    cleanups.push(async () => app.close());

    // The member's browser: it follows erxes' sign-in back to the app's redirect address.
    await app.evaluate(({ shell }) => {
      shell.openExternal = async (url) => {
        await fetch(url);
      };
    });

    return { app, page: await app.firstWindow() };
  };
};

const signIn = async (page: Page, address: string) => {
  await page.getByLabel('Address').fill(address);
  await page.getByRole('button', { name: 'Sign in with erxes' }).click();
};

test('a member signs in with erxes, sees their line and stays signed in', async () => {
  const server = await erxes();
  const launch = await launcher();
  const first = await launch();

  await expect(first.page.getByRole('heading', { name: 'erxes Call' })).toBeVisible();
  await signIn(first.page, `${server.origin}/frontline/inbox`);

  await expect(first.page.getByText('Bat Erdene')).toBeVisible();
  await expect(first.page.getByText('Support · 101')).toBeVisible();
  await first.app.close();

  const second = await launch();

  await expect(second.page.getByText('Bat Erdene')).toBeVisible();
  await expect(second.page.getByText('Support · 101')).toBeVisible();
  // Each call renewed its access token with the refresh token the one before left.
  expect(server.seen.renewals).toBeGreaterThanOrEqual(2);
});

test('the dial pad types a number, and a recent call puts its number there', async () => {
  const server = await erxes();
  const { page } = await (await launcher())();

  await signIn(page, server.origin);

  const pad = page.getByRole('group', { name: 'Dial pad' });

  await pad.getByRole('button', { name: '9' }).click();
  await pad.getByRole('button', { name: '#' }).click();
  await expect(page.getByLabel('Number')).toHaveValue('9#');
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByLabel('Number')).toHaveValue('9');
  await pad.getByRole('button', { name: '#' }).click();
  // The line's PBX is unreachable, so the phone refuses to call.
  await expect(page.getByRole('button', { name: 'Call', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Recent' }).click();
  await page.getByRole('button', { name: /\+97699112233/ }).click();

  await expect(page.getByLabel('Number')).toHaveValue('+97699112233');
});

test('a member without a line is told how to get one', async () => {
  const server = await erxes({ lines: [] });
  const { page } = await (await launcher())();

  await signIn(page, server.origin);

  await expect(page.getByText('You have no phone line yet')).toBeVisible();
});

test('an address that is no web address, or no erxes, is refused with the reason', async () => {
  const { page } = await (await launcher())();

  await signIn(page, 'ftp://files.example.test');
  await expect(page.getByRole('alert')).toHaveText(
    'Enter an address like https://example.erxes.io',
  );

  // Nothing listens on port 9.
  await signIn(page, 'http://127.0.0.1:9');
  await expect(page.getByRole('alert')).toHaveText("Can't reach http://127.0.0.1:9");
});

test('a kept sign-in whose erxes is down says so and stays signed in', async () => {
  const server = await erxes();
  const launch = await launcher();
  const first = await launch();

  await signIn(first.page, server.origin);
  await expect(first.page.getByText('Support · 101')).toBeVisible();
  await first.app.close();
  await server.stop();

  const second = await launch();

  await expect(second.page.getByRole('alert')).toHaveText("Can't reach erxes");
  await expect(second.page.getByText('Bat Erdene')).toBeVisible();
});

test('a queue agent pauses and resumes their queue calls', async () => {
  const server = await erxes();
  const { page } = await (await launcher())();

  await signIn(page, server.origin);
  await page.getByRole('button', { name: 'Pause queue calls' }).click();

  await expect(page.getByRole('button', { name: 'Resume queue calls' })).toBeVisible();
  expect(server.seen.agentStatus).toBe('paused');

  await page.getByRole('button', { name: 'Resume queue calls' }).click();

  await expect(page.getByRole('button', { name: 'Pause queue calls' })).toBeVisible();
  expect(server.seen.agentStatus).toBe('available');
});

test('History opens erxes web in a second window that names itself the app', async () => {
  const server = await erxes();
  const { app, page } = await (await launcher())();

  await signIn(page, server.origin);

  const opened = app.waitForEvent('window');

  await page.getByRole('button', { name: 'History' }).click();

  const web = await opened;

  await expect(web.getByRole('heading', { name: '/frontline/calls/history' })).toBeVisible();
  await expect(web.getByText('erxesCall/')).toBeVisible();
  expect(web.url()).toBe(`${server.origin}/frontline/calls/history`);
});

test('a sign-in left open in the browser gives way to a new one', async () => {
  const server = await erxes();
  const { app, page } = await (await launcher())();

  // The member closes the browser tab: nothing comes back.
  await app.evaluate(({ shell }) => {
    shell.openExternal = async () => undefined;
  });
  await signIn(page, server.origin);
  await expect(page.getByRole('status')).toContainText('Finish signing in in your browser');

  await app.evaluate(({ shell }) => {
    shell.openExternal = async (url) => {
      await fetch(url);
    };
  });
  await page.getByRole('button', { name: 'Sign in with erxes' }).click();

  await expect(page.getByText('Bat Erdene')).toBeVisible();
});

test('signing out ends the sign-in at erxes and on the next launch', async () => {
  const server = await erxes();
  const launch = await launcher();
  const first = await launch();

  await signIn(first.page, server.origin);
  await first.page.getByRole('button', { name: 'Sign out' }).click();

  await expect(first.page.getByRole('button', { name: 'Sign in with erxes' })).toBeVisible();
  expect(server.seen.revoked).toBe(1);
  await first.app.close();

  const second = await launch();

  await expect(second.page.getByRole('button', { name: 'Sign in with erxes' })).toBeVisible();
});
