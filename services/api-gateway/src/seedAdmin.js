import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, pool } from './db/pool.js';

/**
 * Creates (or updates the password of) an admin login for the dashboard.
 * Usage:
 *   node src/seedAdmin.js admin@example.com somePassword123
 * or via npm script:
 *   npm run seed-admin -- admin@example.com somePassword123
 */
async function main() {
  const [, , emailArg, passwordArg] = process.argv;
  const email = (emailArg || 'admin@example.com').toLowerCase().trim();
  const password = passwordArg || 'changeme123';

  const passwordHash = await bcrypt.hash(password, 10);

  await query(
    `INSERT INTO admin_users (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, passwordHash],
  );

  console.log(`Admin user ready: ${email} / ${password}`);
  console.log('Use these to log into the dashboard.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
