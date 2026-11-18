import { join } from 'node:path';
import { BrowserWindow, session, shell } from 'electron';

const STATIC = join(import.meta.dirname, '../static');
const PRELOAD = join(import.meta.dirname, 'preload.cjs');

/** Chromium's code for a load another navigation replaced, which is no failure. */
const ERR_ABORTED = -3;

/** What erxes asks for: the softphone's microphone, notifications, copy buttons, full screen. */
const ALLOWED_PERMISSIONS = new Set<string>([
  'media',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
]);

/** Links that leave erxes open in the system's browser, mail app or phone app. */
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

const originOf = (url: string) => (URL.canParse(url) ? new URL(url).origin : undefined);

/** Only the connected server gets a permission; every other page is refused. */
const guardPermissions = (serverUrl: string) => {
  const allows = (origin: string | undefined, permission: string) =>
    origin === serverUrl && ALLOWED_PERMISSIONS.has(permission);

  session.defaultSession.setPermissionRequestHandler((_contents, permission, respond, details) => {
    respond(allows(originOf(details.requestingUrl), permission));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    allows(originOf(requestingOrigin), permission),
  );
};

export type SetupState = { address?: string; error?: string };

/** The small window that asks for the server's address (`static/setup.html`, `preload.ts`). */
export const openSetupWindow = async (state: SetupState = {}) => {
  const window = new BrowserWindow({
    width: 440,
    height: 330,
    resizable: false,
    title: 'Connect to erxes',
    webPreferences: { preload: PRELOAD },
  });

  window.setMenuBarVisibility(false);
  await window.loadFile(join(STATIC, 'setup.html'), { query: state });

  return window;
};

/**
 * erxes itself. Pages on the server stay in the window, sign-in redirects included; a link
 * that opens a new window on another site goes to the system's browser.
 */
export const openMainWindow = (serverUrl: string, onLoadFailed: (reason: string) => void) => {
  guardPermissions(serverUrl);

  const window = new BrowserWindow({ width: 1440, height: 900, title: 'erxes' });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (originOf(url) === serverUrl) return { action: 'allow' };

    if (URL.canParse(url) && EXTERNAL_PROTOCOLS.has(new URL(url).protocol))
      void shell.openExternal(url);

    return { action: 'deny' };
  });

  window.webContents.on('did-fail-load', (_event, code, reason, _url, isMainFrame) => {
    if (isMainFrame && code !== ERR_ABORTED) onLoadFailed(reason);
  });

  // A failed load is reported through did-fail-load; the promise only repeats it.
  window.loadURL(serverUrl).catch(() => undefined);

  return window;
};
