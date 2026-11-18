import { app, BrowserWindow, shell } from 'electron';
import { currentSession } from './session.ts';

let web: BrowserWindow | undefined;

const originOf = (url: string) => (URL.canParse(url) ? new URL(url).origin : undefined);

/**
 * erxes web in the app's second window, for what the phone has no screen of: the inbox, the
 * call history with its filters and recordings, the queue boards. The member signs in to it
 * once; the window keeps the cookie. Its user agent carries `erxesCall/<version>`, by which
 * Frontline's own softphone stays out of the way of this app's.
 */
export const openErxes = async (path: string) => {
  const address = currentSession()?.address;

  if (!address || !path.startsWith('/')) return;

  if (!web || web.isDestroyed()) {
    web = new BrowserWindow({ width: 1280, height: 860, title: 'erxes' });
    web.webContents.setUserAgent(`${web.webContents.getUserAgent()} erxesCall/${app.getVersion()}`);
    // Pages of erxes stay in the window; a link to another site goes to the system's browser.
    web.webContents.setWindowOpenHandler(({ url }) => {
      if (originOf(url) === address) return { action: 'allow' };

      if (/^(https?|mailto|tel):/.test(url)) void shell.openExternal(url);

      return { action: 'deny' };
    });
  }

  web.show();
  web.focus();
  // A failed load shows Chromium's own error page in the window.
  await web.loadURL(new URL(path, address).toString()).catch(() => undefined);
};

/** Signing out of the phone closes erxes web and drops its cookie. */
export const closeErxes = async () => {
  if (web && !web.isDestroyed()) {
    await web.webContents.session.clearStorageData({ storages: ['cookies'] });
    web.destroy();
  }

  web = undefined;
};
