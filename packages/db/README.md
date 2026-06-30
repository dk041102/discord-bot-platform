# @shared/db

This isn't an npm package — it's just where the single source-of-truth SQL migration lives
(`migrations/001_init.sql`) so both `api-gateway` and `discord-service` apply the same schema.

## Why one schema file instead of an ORM with migrations baked into each service

Both services read and write the *same* tables (`interactions`, `guilds`, `command_configs`,
`mirror_outbox`). Splitting the schema across two services invites drift. Each service has its
own lightweight `db/pool.js` that just opens a `pg` Pool against `DATABASE_URL` — no ORM, since
the query surface is small and explicit SQL is easier to reason about for an integration-heavy
exercise like this one.

## Running the migration

```bash
psql "$DATABASE_URL" -f packages/db/migrations/001_init.sql
```

Or, from either service directory:

```bash
npm run db:migrate
```

(see each service's package.json — both have a `db:migrate` script pointing at this file).
