import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from './channels.ts';
import type { Desktop } from './bridge.ts';

const ask = async (channel: string, ...parts: unknown[]): Promise<unknown> =>
  ipcRenderer.invoke(channel, ...parts);

const desktop: Desktop = {
  session: async () => ask(CHANNELS.session),
  signIn: async (address) => ask(CHANNELS.signIn, address),
  signOut: async () => {
    await ask(CHANNELS.signOut);
  },
  api: async (procedure, input) => ask(CHANNELS.api, procedure, input),
  openErxes: (path) => ipcRenderer.send(CHANNELS.openErxes, path),
  ringing: (number) => ipcRenderer.send(CHANNELS.ringing, number),
  quiet: () => ipcRenderer.send(CHANNELS.quiet),
};

contextBridge.exposeInMainWorld('desktop', desktop);
