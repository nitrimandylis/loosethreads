import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// ponytail: lazy client so importing this module (e.g. during `next build`)
// doesn't require DATABASE_URL; it's only needed when a query actually runs.
let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Add a Neon Postgres database.");
    _sql = neon(url);
  }
  return _sql;
}

/**
 * Local development without a database in the cloud.
 *
 * The Neon driver speaks Neon's HTTP protocol, not the Postgres wire protocol,
 * so it cannot be pointed at a Postgres on this machine. `DATABASE_URL=pglite:.pgdata`
 * runs Postgres itself, compiled to WASM, in this process, with its data in a
 * gitignored folder. Same SQL, same types, nothing to install or keep running.
 *
 * Development only, and it throws rather than degrading if it is ever reached
 * in production: a board whose data lives in the serverless filesystem would
 * quietly lose every rumour on it.
 */
const LOCAL = "pglite:";

type Row = Record<string, unknown>;
type LocalDb = { query: (text: string, params: unknown[]) => Promise<{ rows: Row[] }> };

// On globalThis, not in a module variable. Next bundles this module once per
// route, so a plain `let` gives the page and the API route separate copies:
// two Postgres VMs over one folder, each holding its own snapshot. Writes then
// land in one and reads come back empty from the other.
const shared = globalThis as typeof globalThis & { __localDb?: Promise<LocalDb> };

function getLocal(url: string): Promise<LocalDb> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("pglite: is a development database. Set DATABASE_URL to a real one.");
  }
  if (!shared.__localDb) {
    const dir = url.slice(LOCAL.length) || ".pgdata";
    shared.__localDb = import("@electric-sql/pglite").then(
      ({ PGlite }) => PGlite.create(dir) as Promise<LocalDb>
    );
  }
  return shared.__localDb;
}

/** `sql\`...\`` becomes `select ... $1, $2`, which is what both drivers want. */
async function queryLocal(url: string, strings: TemplateStringsArray, values: unknown[]) {
  const text = strings.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""), "");
  const db = await getLocal(url);
  const { rows } = await db.query(text, values);
  return rows;
}

// Tagged-template passthrough so callers keep using sql`...`.
export const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith(LOCAL)) return queryLocal(url, strings, values);
  return getSql()(strings, ...values);
}) as NeonQueryFunction<false, false>;

// ponytail: lazy idempotent schema setup instead of a migration tool. CREATE
// ... IF NOT EXISTS is safe to run repeatedly; the promise guard means it runs
// once per warm instance. Reach for real migrations when the schema churns.
let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      try {
      await sql`
        CREATE TABLE IF NOT EXISTS nodes (
          id BIGSERIAL PRIMARY KEY,
          topic TEXT NOT NULL,
          body TEXT NOT NULL,
          x DOUBLE PRECISION NOT NULL,
          y DOUBLE PRECISION NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          -- ponytail: vestigial after LLM cut; left nullable to avoid a migration.
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
      await sql`
        CREATE TABLE IF NOT EXISTS reactions (
          id BIGSERIAL PRIMARY KEY,
          node_id BIGINT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      // Sections are gone: nothing writes topic any more. The column stays so
      // the rows that have one keep it, but it needs a default now that inserts
      // no longer mention it. Idempotent, so it doubles as the migration.
      await sql`ALTER TABLE nodes ALTER COLUMN topic SET DEFAULT ''`;

      // Ownership without accounts: every created row carries a secret the
      // creating browser is told once. Whoever can repeat it may manage the
      // row. Rows from before this column get a secret nobody was ever told,
      // which is the same as unmanageable.
      await sql`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS secret UUID DEFAULT gen_random_uuid()`;
      await sql`ALTER TABLE edges ADD COLUMN IF NOT EXISTS secret UUID DEFAULT gen_random_uuid()`;
      await sql`ALTER TABLE reactions ADD COLUMN IF NOT EXISTS secret UUID DEFAULT gen_random_uuid()`;

      // Rate limiting lives here rather than in Redis: one row per allowed
      // action, counted over a window. No primary key, because nothing ever
      // references a hit; the index is the only thing that reads it.
      await sql`
        CREATE TABLE IF NOT EXISTS hits (
          ip TEXT NOT NULL,
          action TEXT NOT NULL,
          at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS hits_window_idx ON hits (ip, action, at)`;

      // More than one wall. '' is the public one; anything else is a private
      // board reached only at /b/<slug>, and only by someone who knows its
      // passphrase. An open board (pass_hash NULL) is readable by anyone
      // holding the link, which is what the public wall is.
      await sql`
        CREATE TABLE IF NOT EXISTS boards (
          id BIGSERIAL PRIMARY KEY,
          slug TEXT UNIQUE NOT NULL,
          pass_salt TEXT,
          pass_hash TEXT,
          -- Handed to a browser as a cookie once it proves the passphrase.
          -- Rotating it logs everyone out at once: the un-invite button.
          access_token UUID NOT NULL DEFAULT gen_random_uuid(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`INSERT INTO boards (slug) VALUES ('') ON CONFLICT (slug) DO NOTHING`;

      // ponytail: nullable on purpose, no SET NOT NULL. The constraint would
      // have to be added at a moment when every row already has a board, which
      // races the seconds where old and new code both serve traffic. Every
      // write below names a board, the backfill covers everything written
      // before this deploy, and a straggler NULL is invisible to a scoped read
      // rather than a 500.
      await sql`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS board_id BIGINT REFERENCES boards(id)`;
      await sql`UPDATE nodes SET board_id = (SELECT id FROM boards WHERE slug = '') WHERE board_id IS NULL`;
      await sql`CREATE INDEX IF NOT EXISTS nodes_board_idx ON nodes (board_id, status)`;

      await sql`CREATE INDEX IF NOT EXISTS reactions_node_idx ON reactions(node_id)`;
      await sql`CREATE INDEX IF NOT EXISTS nodes_status_idx ON nodes(status)`;
      await sql`CREATE INDEX IF NOT EXISTS edges_status_idx ON edges(status)`;

      // One string per pair of notes, in either direction: a string from A to B
      // is the same physical thing as one from B to A. Existing duplicates must
      // go first, because CREATE UNIQUE INDEX raises 23505 on duplicate data and
      // the catch below deliberately treats 23505 as a lost creation race, so a
      // real failure here would be swallowed and the index would never exist.
      await sql`
        DELETE FROM edges a USING edges b
        WHERE a.id > b.id
          AND LEAST(a.source_id, a.target_id) = LEAST(b.source_id, b.target_id)
          AND GREATEST(a.source_id, a.target_id) = GREATEST(b.source_id, b.target_id)
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS edges_pair_idx
        ON edges (LEAST(source_id, target_id), GREATEST(source_id, target_id))
      `;
      } catch (err) {
        // Concurrent instances can race CREATE ... IF NOT EXISTS at the catalog
        // level (Postgres 23505 on the seq/index): if another instance won, the
        // schema now exists, so treat as success. Any other failure must NOT poison
        // the cached promise, so clear it and rethrow so the next call retries.
        if ((err as { code?: string })?.code !== "23505") {
          ready = null;
          throw err;
        }
      }
    })();
  }
  return ready;
}
