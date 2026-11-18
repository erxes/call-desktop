import { ipcRenderer } from 'electron';
import { CONNECT } from './channels.ts';

// Runs in the setup window only (`static/setup.html`): fills the form from the query the
// main process opened it with, and sends the address on Connect.
window.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  const address = document.querySelector('input');
  const alert = document.querySelector('[role="alert"]');

  if (!form || !address || !alert) throw new Error('setup.html lost its form');

  const query = new URLSearchParams(window.location.search);

  address.value = query.get('address') ?? '';
  alert.textContent = query.get('error');

  const connect = async () => {
    const problem: unknown = await ipcRenderer.invoke(CONNECT, address.value);

    alert.textContent = typeof problem === 'string' ? problem : '';
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void connect();
  });
});
