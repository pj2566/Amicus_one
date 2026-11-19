// Applies db/migrations/*.sql in order, each in its own transaction, recording applied files.
// Needs DATABASE_URL (Supabase → Connect → Session pooler URI) in backend/.env.
//
// Usage: node scripts/db/migrate.js

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const dir = path.join(__dirname, '..', '..', 'db', 'migrations');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  await client.query('alter table public.schema_migrations enable row level security');

  const applied = new Set((await client.query('select name from public.schema_migrations')).rows.map(r => r.name));
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) { console.log(`skip    ${file}`); continue; }
    try {
      await client.query('begin');
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('insert into public.schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query('rollback');
      console.error(`FAILED  ${file}: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  await client.end();
})();
