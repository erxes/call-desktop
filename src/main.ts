import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { CONNECT } from './channels.ts';
import { readServerUrl, saveServerUrl, serverAddress } from './settings.ts';
import { openMainWindow, openSetupWindow } from './windows.ts';
import type { SetupState } from './windows.ts';

const closeOthers = (keep: BrowserWindow) => {
  for (const window of BrowserWindow.getAllWindows()) if (window !== keep) window.close();
};

const showSetup = async (state?: SetupState) => closeOthers(await openSetupWindow(state));

const showServer = (serverUrl: string) => {
  const window = openMainWindow(serverUrl, (reason) => {
    void showSetup({ address: serverUrl, error: `Can't reach ${serverUrl} (${reason})` });
  });

  closeOthers(window);
};

const showSaved = async () => {
  const serverUrl = await readServerUrl();

  if (serverUrl) showServer(serverUrl);
  else await showSetup();
};

const changeServer = async () => showSetup({ address: await readServerUrl() });

const menu = (): MenuItemConstructorOptions[] => [
  ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as const] : []),
  {
    label: 'File',
    submenu: [{ label: 'Change server…', click: () => void changeServer() }, { role: 'close' }],
  },
  { role: 'editMenu' },
  { role: 'viewMenu' },
  { role: 'windowMenu' },
];

/** The setup window's Connect: saves a valid address and opens it, or returns what is wrong. */
const connect = async (address: unknown) => {
  const parsed = serverAddress.safeParse(address);

  if (!parsed.success) return 'Enter an address like https://example.erxes.io';

  await saveServerUrl(parsed.data);
  showServer(parsed.data);

  return undefined;
};

const focusFirstWindow = () => {
  const [window] = BrowserWindow.getAllWindows();

  if (window?.isMinimized()) window.restore();
  window?.focus();
};

const start = async () => {
  await app.whenReady();

  Menu.setApplicationMenu(Menu.buildFromTemplate(menu()));
  ipcMain.handle(CONNECT, (_event, address: unknown) => connect(address));

  app.on('second-instance', focusFirstWindow);
  // macOS keeps the app in the dock with no window; a click on it opens one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void showSaved();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  await showSaved();
};

// Not awaited: Electron finishes loading this module before it fires `ready`.
if (app.requestSingleInstanceLock()) void start();
else app.quit();
