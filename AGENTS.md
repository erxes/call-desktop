# erxes Call

erxes calls as a desktop phone for macOS, Windows and Linux

An Electron app with its own screens: sign in, a dial pad, the call it is on and the
recent calls. It signs the member in with core's "Sign in with erxes", takes their SIP
line from Frontline's API and talks to the PBX itself over WebRTC (JsSIP).

## Quality

Every erxes repo on the new stack has this section, unchanged. The brackets name the checks that
enforce a rule; `review` marks the part no tool can check. The rewrite keeps every feature and improves the
architecture. Agents write the code and the checks judge it, so a green check lets a change ship
without line-by-line review.

- `vp run check` is the type check: oxfmt, type-aware oxlint on tsrs and knip in about 10 s. Run it after each edit and before each commit; it replaces `tsc`. `vp run fix` formats and autofixes. [vp run check]
- Port what a feature does, not its code. Fix what the old code got wrong instead of carrying it over. [review]
- Use a maintained library when one does the job. Keep dependencies near their latest release and off deprecated APIs. [typescript/no-deprecated, review]
- One way to do each job. Search for the existing helper before writing one, merge the repeats you find, delete what nothing uses. [knip, review]
- Types flow from the database schema to the contract to the UI. Infer them, so each shape is written once. [pnpm check:generated, review]
- API input, output and events are flat rows, as the table stores them: `referenceType` and `referenceId`, never a nested `{ type, id }` object or a `to…Dto` mapper. A value the row lacks comes from the query. [erxes/no-dto-mapper, review]
- Parse outside input with zod and narrow it, so the code needs no `any`, cast or `!`. [typescript/no-explicit-any, typescript/no-unsafe-type-assertion, typescript/no-non-null-assertion]
- Lint and type rules are the spec: when one fires, fix the code. Silencing it is never the fix, whether by a disable comment, `@ts-ignore`, an override, an ignore, a weaker option or a raised limit. A rule that is wrong changes in its own PR. [typescript/ban-ts-comment, review]
- Split a file or function that outgrows its limit by responsibility (router, service, queries). [max-lines, max-lines-per-function, review]
- Finish the work in the change, with no TODO or FIXME left in code. [no-warning-comments]
- Tests call the public interface (HTTP, the typed client, the rendered page) and assert what it does, never source strings or code shapes. [review]
- Every test runs: a skipped test or an empty suite fails the run. A failing test gets its code or its wrong expectation fixed, never loosened or deleted. [vp run test, review]
- Log through the structured logger, with the facts as fields. A caught error is rethrown or logged with its context. [no-console, review]
- Make the long-term change in one go, with no backward-compatibility shim, stopgap or speculative option. [review]
- Docs, PRs and copy are short: plain words, active voice, what it does or the number. [review]

<!-- quality:end -->

## This repo

- `vp run check` runs the escape guard, format, lint, types, knip and the docs
  guard. `vp run fix` formats and fixes lint. `pnpm e2e` builds the app and drives
  it with Playwright against a stand-in erxes (`e2e/erxes.ts`); a behavior the app
  adds gets a test in `e2e/`. No test reaches a PBX: try calls by hand.
- `src/main/` is the main process: `signIn.ts` the OAuth flow, `session.ts` the
  kept sign-in and its tokens, `api.ts` the calls to Frontline, `window.ts` the
  window and what it may do. `src/ui/` is the window's page (React), `src/bridge.ts`
  what the two say to each other, put at `window.desktop` by `src/preload.ts`.
- Frontline is the OAuth client. Its manifest lists this app's redirect address,
  `http://127.0.0.1:47823/callback`, and core matches it exactly: change the port
  in both repos or in neither.
- Tokens stay in the main process, the refresh token encrypted with the system's
  keychain. The page asks for a procedure by name and never sees a token.
- A procedure's answer is outside input: the page reads it with a zod schema that
  names only the fields it shows. `src/ui/useSip.ts` mirrors Frontline's softphone
  hook; a fix to one goes into both.
- The page loads from disk and never navigates. It gets the microphone and
  notifications; a link opens in the system's browser.
- Closing the window keeps the line signed in: it hides on macOS and minimizes
  elsewhere. File › Quit ends the app.
- Don't await at the top level of `src/main/main.ts`: Electron fires `ready` only
  after the module loads, so the app would never start.
- A shell started from VS Code inherits `ELECTRON_RUN_AS_NODE`, which makes
  Electron run as Node. `pnpm dev` and `pnpm e2e` unset it.
- `pnpm dist` writes installers to `release/`. They are unsigned and use
  Electron's icon until the signing keys and `build/icon.*` are added.
- The lint rules are `@erxes/lint`'s preset (`vite.config.ts`), as is the
  quality section above. Change them in core.
