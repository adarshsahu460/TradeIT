#!/usr/bin/env node
/*
 * Wrapper to ensure Prisma commands load env vars from monorepo root ../../.env
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

// Determine candidate .env paths.
// Goal per request: ensure search for env inside prisma folder resolves ../../.env
// prisma folder path: packages/server/prisma -> two levels up is packages/ (../../.env)
// root .env is actually three levels up (../../../.env) from prisma.
const prismaDir = path.resolve(__dirname, '../prisma');
const candidates = [
  path.resolve(prismaDir, '../../.env'), // packages/.env (requested relative target)
  path.resolve(prismaDir, '../../../.env'), // repo root .env
  path.resolve(__dirname, '../../.env'), // packages/server/.env
  path.resolve(process.cwd(), '.env'),
];
let loadedPath = null;
for (const p of candidates) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p, override: false });
    loadedPath = p;
    if (process.env.DATABASE_URL) break;
  }
}
const prismaArgs = process.argv.slice(2);
const isGenerateOnly = prismaArgs[0] === 'generate';
if (!process.env.DATABASE_URL && !isGenerateOnly) {
  console.error('[prisma-run] DATABASE_URL not set (required for migrate). Tried:', candidates);
  process.exit(1);
}
if (loadedPath) {
  console.error(`[prisma-run] Loaded env file: ${loadedPath}`);
}

const result = spawnSync('npx', ['prisma', ...prismaArgs], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
