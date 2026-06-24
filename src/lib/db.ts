import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// ponytail: lazy client so importing this module (e.g. during `next build`)
// doesn't require DATABASE_URL — it's only needed when a query actually runs.
let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Add a Neon Postgres database.");
    _sql = neon(url);
  }
  return _sql;
}

// Tagged-template passthrough so callers keep using sql`...`.
export const sql = ((strings: TemplateStringsArray, ...values: unknown[]) =>
  getSql()(strings, ...values)) as NeonQueryFunction<false, false>;

// ponytail: lazy idempotent schema setup instead of a migration tool. CREATE
// ... IF NOT EXISTS is safe to run repeatedly; the promise guard means it runs
// once per warm instance. Reach for real migrations when the schema churns.
let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS nodes (
          id BIGSERIAL PRIMARY KEY,
          topic TEXT NOT NULL,
          body TEXT NOT NULL,
          x DOUBLE PRECISION NOT NULL,
          y DOUBLE PRECISION NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          triage JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS edges (
          id BIGSERIAL PRIMARY KEY,
          source_id BIGINT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          target_id BIGINT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS nodes_status_idx ON nodes(status)`;
      await sql`CREATE INDEX IF NOT EXISTS edges_status_idx ON edges(status)`;
    })();
  }
  return ready;
}
