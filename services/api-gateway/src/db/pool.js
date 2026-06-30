import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Check your .env / hosting env vars.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected pool error', err);
});

export async function query(text, params) {
  const start = Date.now();
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('[db] query failed', { text, ms: Date.now() - start, error: err.message });
    throw err;
  }
}
