import { preset } from '@erxes/lint';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

// The type check is tsrs (TypeScript 7) running as oxlint's tsgolint.
const tsrs = 'OXLINT_TSGOLINT_PATH=node_modules/.bin/tsrs-lint';

// Vite Task tracks the files each command reads; the lockfile is listed too, so an
// install that changes a dependency always reruns the task.
const tracked = { input: [{ auto: true }, 'pnpm-lock.yaml'] };

const ignorePatterns = ['**/node_modules/**', '**/dist/**', 'release/**'];

// Electron provides `electron` at run time; everything else is bundled, so the packaged app
// ships no node_modules. A sandboxed preload has to be CommonJS.
const neverBundle = ['electron'];

export default defineConfig({
  // The window's page (`vp build`), loaded from disk: relative addresses.
  root: 'src/ui',
  base: './',
  plugins: [react()],
  build: { outDir: '../../dist/ui', emptyOutDir: true },
  pack: [
    { entry: 'src/main/main.ts', format: 'esm', deps: { neverBundle, onlyBundle: ['zod'] } },
    { entry: 'src/preload.ts', format: 'cjs', deps: { neverBundle }, clean: false },
  ],
  run: {
    tasks: {
      // A rerun with no edits replays the last result.
      check: {
        command: `erxes-check-escapes && ${tsrs} vp check && knip && erxes-check-docs`,
        cache: tracked,
      },
      fix: { command: `${tsrs} vp check --fix`, cache: false },
    },
  },
  fmt: {
    singleQuote: true,
    sortPackageJson: true,
    ignorePatterns: [...ignorePatterns, 'pnpm-lock.yaml'],
  },
  // The rules core and every plugin share. Change them in core's packages/lint.
  lint: { ...preset, ignorePatterns },
});
