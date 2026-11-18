import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // What `pnpm build` bundles: the main process, the window's preload and its page.
  entry: ['src/main/main.ts', 'src/preload.ts'],
  project: ['*.ts', '{src,e2e}/**/*.{ts,tsx}'],
  playwright: { config: ['e2e/playwright.config.ts'], entry: ['e2e/*.spec.ts'] },
  // oxlint calls tsrs-lint through OXLINT_TSGOLINT_PATH (vite.config.ts).
  ignoreDependencies: ['tsrs'],
};

export default config;
