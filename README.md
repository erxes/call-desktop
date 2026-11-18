# erxes Call

erxes calls as a desktop phone for macOS, Windows and Linux.

- Sign in with erxes: enter the address you open erxes at, then sign in in your
  browser. The app never sees your password and stays signed in.
- Call from the dial pad on your extension; answer, mute, hold, send tones,
  transfer to another extension and hang up.
- Write a note on the call; it saves on the call's conversation in erxes.
- An incoming call rings, brings the window forward and shows a notification.
- Recent calls of your channels; a click puts the number on the dial pad.
- Closing the window keeps the phone on. File › Quit turns it off.

It needs an erxes with Frontline, a connected Grandstream PBX, and an extension
an admin gave a SIP password.

## Develop

Node 26 and pnpm 12.

```bash
pnpm install
pnpm dev            # build and start the app
pnpm exec vp run check
pnpm e2e            # build, then drive the app with Playwright
pnpm dist           # installers in release/
```
