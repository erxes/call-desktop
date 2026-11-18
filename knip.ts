import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // The two bundles `pnpm build` makes: the main process and the setup window's preload.
  entry: ['src/main.ts', 'src/preload.ts'],
  project: ['*.ts', '{src,e2e}/**/*.ts'],
  playwright: { config: ['e2e/playwright.config.ts'], entry: ['e2e/*.spec.ts'] },
  // oxlint calls tsrs-lint through OXLINT_TSGOLINT_PATH (vite.config.ts).
  ignoreDependencies: ['tsrs'],
};

export default config;
