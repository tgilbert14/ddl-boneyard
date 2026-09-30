import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/* Borrow the existing workstation runtime; the shipped site has no dependencies. */
export function browserRuntime() {
  const require = createRequire(import.meta.url);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const override = process.env.BONEYARD_PLAYWRIGHT;
  const candidates = override ? [override] : [
    'playwright',
    path.resolve(root, '../TG-Data-Apps/tools/visual-regress/node_modules/playwright'),
    path.resolve(root, '../TG-Data-Apps/tools/local-guilds/node_modules/playwright-core'),
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  throw new Error('No existing Playwright runtime found. Run dev-tools --brief and set BONEYARD_PLAYWRIGHT to its installed module path. No browser installation is needed for this site.');
}
