#!/usr/bin/env node
/**
 * Run on Azure App Service SSH to bring the production DB schema in line with dev.
 * Reads scripts/prod-full-schema-sync.sql (committed) and executes it inside
 * the existing transaction wrapper.
 *
 * Usage (in /home/site/wwwroot):
 *   node scripts/run-prod-schema-sync.cjs
 *
 * Safe to re-run — every statement is idempotent
 * (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

  const sqlPath = path.join(__dirname, 'prod-full-schema-sync.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Missing', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  console.log('Connecting to prod DB...');
  await client.connect();
  console.log('Connected. Applying schema sync (' + sql.length + ' bytes)...');
  try {
    await client.query(sql);
    console.log('OK — schema sync applied successfully.');
  } catch (e) {
    console.error('FAILED:', e.message);
    if (e.position) console.error('  position:', e.position);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
