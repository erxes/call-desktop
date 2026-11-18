import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, Notification, session, shell } from 'electron';
import { currentSession } from './session.ts';

const UI = join(import.meta.dirname, 'ui/index.html');
const PRELOAD = join(import.meta.dirname, 'preload.cjs');

/** The phone's microphone and its notifications. */
const ALLOWED_PERMISSIONS = new Set<string>(['media', 'notifications']);

let quitting = false;
let attention: { bounce: number | undefined; notice: Notification } | undefined;

/** What erxes web gets in its window (`web.ts`): its notifications and copy buttons. */
const WEB_PERMISSIONS = new Set<string>(['notifications', 'clipboard-sanitized-write']);

let phone: BrowserWindow | undefined;

const isOwnPage = (url: string) => url.startsWith(pathToFileURL(UI).toString());

const isErxes = (url: string) =>
  URL.canParse(url) && new URL(url).origin === currentSession()?.address;

/** Only the app's own page gets the microphone; erxes web gets no more than a browser tab's. */
const allows = (url: string, permission: string) =>
  (isOwnPage(url) && ALLOWED_PERMISSIONS.has(permission)) ||
  (isErxes(url) && WEB_PERMISSIONS.has(permission));

const guardPermissions = () => {
  session.defaultSession.setPermissionRequestHandler((contents, permission, respond) => {
    respond(allows(contents.getURL(), permission));
  });
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission) => contents !== null && allows(contents.getURL(), permission),
  );
};

const theWindow = () => phone;

export const showWindow = () => {
  const window = theWindow();

  if (window?.isMinimized()) window.restore();
  window?.show();
  window?.focus();
};

/**
 * The phone. Closing it keeps the line signed in: the window hides on macOS (the dock icon
 * brings it back) and minimizes elsewhere. File › Quit ends the app.
 */
export const openWindow = async () => {
  guardPermissions();
  app.on('before-quit', () => {
    quitting = true;
  });

  const window = new BrowserWindow({
    width: 380,
    height: 680,
    minWidth: 340,
    minHeight: 560,
    title: 'erxes Call',
    webPreferences: { preload: PRELOAD },
  });

  window.on('close', (event) => {
    if (quitting) return;

    event.preventDefault();

    if (process.platform === 'darwin') window.hide();
    else window.minimize();
  });

  // The page never leaves the app: a link goes to the system's browser.
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);

    return { action: 'deny' };
  });

  phone = window;
  await window.loadFile(UI);
};

/** A call is ringing: the window comes forward, the dock or taskbar asks for attention. */
export const ring = (number: string) => {
  quiet();

  const notice = new Notification({ title: 'Incoming call', body: number });

  notice.on('click', showWindow);
  notice.show();
  showWindow();
  theWindow()?.flashFrame(true);
  attention = { bounce: app.dock?.bounce('critical'), notice };
};

export const quiet = () => {
  if (!attention) return;

  attention.notice.close();
  theWindow()?.flashFrame(false);

  if (attention.bounce !== undefined) app.dock?.cancelBounce(attention.bounce);

  attention = undefined;
};
