// Each test launches the built app (`pnpm build`) on its own data folder. Playwright reads
// these named exports as the config (the lint preset allows no default export here).
export const testDir = '.';
export const outputDir = 'test-results';
export const forbidOnly = true;
export const workers = 1;
export const reporter = 'list';
