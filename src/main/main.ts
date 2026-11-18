import { app, ipcMain, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { CHANNELS } from '../channels.ts';
import type { SignInResult } from '../bridge.ts';
import { callApi } from './api.ts';
import { currentSession, endSession, loadSession, startSession } from './session.ts';
import { serverAddress, SignInProblem } from './signIn.ts';
import { closeErxes, openErxes } from './web.ts';
import { openWindow, quiet, ring, showWindow } from './window.ts';

const menu = (): MenuItemConstructorOptions[] => [
  ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as const] : []),
  { label: 'File', submenu: [{ role: 'close' }, { role: 'quit' }] },
  { role: 'editMenu' },
  { role: 'windowMenu' },
];

const signIn = async (address: unknown): Promise<SignInResult> => {
  const parsed = serverAddress.safeParse(address);

  if (!parsed.success)
    return { ok: false, problem: 'Enter an address like https://example.erxes.io' };

  try {
    const session = await startSession(parsed.data);

    showWindow();

    return { ok: true, session };
  } catch (error) {
    if (error instanceof SignInProblem) return { ok: false, problem: error.message };
    throw error;
  }
};

const start = async () => {
  await app.whenReady();
  await loadSession();

  Menu.setApplicationMenu(Menu.buildFromTemplate(menu()));
  ipcMain.handle(CHANNELS.session, currentSession);
  ipcMain.handle(CHANNELS.signIn, async (_event, address: unknown) => signIn(address));
  ipcMain.handle(CHANNELS.signOut, async () => {
    await closeErxes();
    await endSession();
  });
  ipcMain.handle(CHANNELS.api, async (_event, procedure: unknown, input: unknown) =>
    callApi(procedure, input),
  );
  ipcMain.on(CHANNELS.openErxes, (_event, path: unknown) => void openErxes(String(path)));
  ipcMain.on(CHANNELS.ringing, (_event, number: unknown) => ring(String(number)));
  ipcMain.on(CHANNELS.quiet, quiet);

  app.on('second-instance', showWindow);
  // macOS keeps the app in the dock with its window hidden; a click on it shows the phone.
  app.on('activate', showWindow);

  await openWindow();
};

// Not awaited: Electron finishes loading this module before it fires `ready`.
if (app.requestSingleInstanceLock()) void start();
else app.quit();
