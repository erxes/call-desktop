import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const PAGE = `<!doctype html><title>Fake erxes</title><h1>Inbox</h1>
<a href="https://docs.example.test/guide" target="_blank">Guide</a>`;

const cleanups: (() => Promise<unknown>)[] = [];

test.afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

/** A stand-in for erxes web: its origin. */
const startServer = async () => {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(PAGE);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  cleanups.push(async () => {
    server.closeAllConnections();
    server.close();
  });

  const address = server.address();

  if (address === null || typeof address === 'string') throw new Error('the server has no port');

  return `http://127.0.0.1:${address.port}`;
};

/** Launches the app on one data folder; call the result again for a second run. */
const launcher = async () => {
  const data = await mkdtemp(join(tmpdir(), 'erxes-desktop-'));

  return async () => {
    const app = await electron.launch({ args: ['.', `--user-data-dir=${data}`] });

    cleanups.push(async () => app.close());

    return app;
  };
};

test('the first launch asks for the address, opens it and remembers it', async () => {
  const server = await startServer();
  const launch = await launcher();

  const first = await launch();
  const setup = await first.firstWindow();

  await expect(setup.getByRole('heading', { name: 'Connect to erxes' })).toBeVisible();
  const opened = first.waitForEvent('window');

  await setup.getByLabel('Address').fill(`${server}/some/page`);
  await setup.getByRole('button', { name: 'Connect' }).click();

  const erxes = await opened;

  await expect(erxes.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  expect(erxes.url()).toBe(`${server}/`);
  await expect.poll(() => first.windows().length).toBe(1);
  await first.close();

  const second = await launch();

  await expect((await second.firstWindow()).getByRole('heading', { name: 'Inbox' })).toBeVisible();
});

test('an address that is no web address is refused with the reason', async () => {
  const launch = await launcher();

  const app = await launch();
  const setup = await app.firstWindow();

  await setup.getByLabel('Address').fill('ftp://files.example.test');
  await setup.getByRole('button', { name: 'Connect' }).click();

  await expect(setup.getByRole('alert')).toHaveText(
    'Enter an address like https://example.erxes.io',
  );
  expect(app.windows()).toHaveLength(1);
});

test('a server that stopped answering brings the address back to fix or retry', async () => {
  const server = await startServer();
  const launch = await launcher();

  const first = await launch();
  const setup = await first.firstWindow();
  const opened = first.waitForEvent('window');

  // Nothing listens on port 9.
  await setup.getByLabel('Address').fill('http://127.0.0.1:9');
  await setup.getByRole('button', { name: 'Connect' }).click();
  await opened;
  await first.close();

  const second = await launch();
  const retry = await second.waitForEvent('window', (page) => page.url().startsWith('file:'));

  await expect(retry.getByRole('alert')).toContainText("Can't reach http://127.0.0.1:9");
  await expect(retry.getByLabel('Address')).toHaveValue('http://127.0.0.1:9');

  const erxes = second.waitForEvent('window');

  await retry.getByLabel('Address').fill(server);
  await retry.getByRole('button', { name: 'Connect' }).click();
  await expect((await erxes).getByRole('heading', { name: 'Inbox' })).toBeVisible();
});

test("a link to another site opens in the system's browser, not in the app", async () => {
  const server = await startServer();
  const launch = await launcher();

  const app = await launch();
  const setup = await app.firstWindow();
  const opened = app.waitForEvent('window');

  await setup.getByLabel('Address').fill(server);
  await setup.getByRole('button', { name: 'Connect' }).click();

  const erxes = await opened;

  // Catches what would reach the browser instead of opening one.
  const sent = app.evaluate(
    async ({ shell }) =>
      new Promise<string>((resolve) => {
        shell.openExternal = async (url) => {
          resolve(url);
        };
      }),
  );

  // The app answers calls in order, so the catch is in place once this one returns.
  await app.evaluate(() => undefined);
  await erxes.getByRole('link', { name: 'Guide' }).click();

  expect(await sent).toBe('https://docs.example.test/guide');
  expect(app.windows()).toHaveLength(1);
});
