/**
 * Preloaded by nodemon via --require flag.
 * Runs before ANY module (including TypeScript imports).
 * Loads the .env from the monorepo root.
 */
const dotenv = require('dotenv')
const path = require('path')
const fs = require('fs')

// Try apps/api → repo root (../../.env from apps/api/)
const fromApiDir = path.resolve(__dirname, '../../.env')
// Try cwd → repo root (when cwd is repo root)
const fromCwd = path.resolve(process.cwd(), '.env')

if (fs.existsSync(fromApiDir)) {
  dotenv.config({ path: fromApiDir })
} else if (fs.existsSync(fromCwd)) {
  dotenv.config({ path: fromCwd })
}
