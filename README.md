# erxes desktop

erxes as a desktop app for macOS, Windows and Linux. The first launch asks for
the address you open erxes at; the app remembers it and opens it from then on.
File › Change server… asks again.

What the app adds to the browser tab:

- Its own window and dock icon, one instance at a time.
- The softphone's microphone and notifications are allowed for the connected
  server only.
- Links to other sites open in the system's browser.
- An unreachable server brings the address back, to fix or retry.

## Develop

Node 26 and pnpm 12.

```bash
pnpm install
pnpm dev            # build and start the app
pnpm exec vp run check
pnpm e2e            # build, then drive the app with Playwright
pnpm dist           # installers in release/
```
