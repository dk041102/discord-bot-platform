import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  // Fail fast and loud at boot rather than at the first query, mid-incident.
  throw new Error('DATABASE_URL is not set. Check your .env / hosting env vars.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon/Supabase free tier both require SSL; rejectUnauthorized:false is the
  // standard pattern for their managed certs without needing to vendor a CA bundle.
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  // A background pool error (e.g. a dropped idle connection) should never crash
  // the process — log it and let the pool recover on the next checkout.
  console.error('[db] unexpected pool error', err);
});

export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (err) {
    console.error('[db] query failed', { text, ms: Date.now() - start, error: err.message });
    throw err;
  }
}
