/**
 * Load environment variables BEFORE any other module runs.
 * Import this file first in index.ts to guarantee it executes first.
 *
 * dotenv.config() looks in: DOTENV_CONFIG_PATH → ../../.env (monorepo root) → .env (cwd)
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require('dotenv') as typeof import('dotenv')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path')

const envPath =
  process.env.DOTENV_CONFIG_PATH ||
  path.resolve(process.cwd(), '../../.env') // apps/api → repo root
const result = dotenv.config({ path: envPath })

if (result.error) {
  // Try cwd fallback (running from repo root)
  dotenv.config({ path: path.resolve(process.cwd(), '.env') })
}
