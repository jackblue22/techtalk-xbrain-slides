import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(here, '../../db');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runDirectory(directory: string, track: boolean) {
  const client = await pool.connect();
  try {
    await client.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
    const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    for (const name of files) {
      if (track) {
        const done = await client.query('select 1 from schema_migrations where name = $1', [name]);
        if (done.rowCount) continue;
      }
      await client.query('begin');
      await client.query(await readFile(path.join(directory, name), 'utf8'));
      if (track) await client.query('insert into schema_migrations (name) values ($1)', [name]);
      await client.query('commit');
      console.log(JSON.stringify({ event: track ? 'migration_applied' : 'seed_applied', name }));
    }
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

try {
  await runDirectory(path.join(dbRoot, 'migrations'), true);
  await runDirectory(path.join(dbRoot, 'seeds'), false);
} finally {
  await pool.end();
}

