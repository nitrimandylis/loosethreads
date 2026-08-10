import { test, before } from "node:test";
import assert from "node:assert/strict";

// In-memory Postgres; must be set before the db module first runs a query.
process.env.DATABASE_URL = "pglite:memory://";

import { sql, ensureSchema } from "./db.ts";
import { takedownNote, rewordNote, untieEdge, removeStamp } from "./manage.ts";

async function makeNote(): Promise<{ id: number; secret: string }> {
  const [row] = (await sql`
    INSERT INTO nodes (body, x, y, status) VALUES ('a rumour', 0, 0, 'approved')
    RETURNING id, secret
  `) as { id: number; secret: string }[];
  return row;
}

before(async () => {
  await ensureSchema();
});

test("takedown removes the note only with its secret", async () => {
  const n = await makeNote();
  assert.equal(await takedownNote(n.id, "00000000-0000-0000-0000-000000000000"), false);
  assert.equal(await takedownNote(n.id, n.secret), true);
  const rows = await sql`SELECT status FROM nodes WHERE id = ${n.id}`;
  assert.equal(rows[0].status, "removed");
  // already removed: acting again changes nothing
  assert.equal(await takedownNote(n.id, n.secret), false);
});

test("a secret that is not even a uuid refuses without erroring", async () => {
  const n = await makeNote();
  assert.equal(await takedownNote(n.id, "not-a-uuid-at-all"), false);
});

test("reword replaces the body only with the secret", async () => {
  const n = await makeNote();
  assert.equal(await rewordNote(n.id, "00000000-0000-0000-0000-000000000000", "changed"), false);
  assert.equal(await rewordNote(n.id, n.secret, "changed"), true);
  const rows = await sql`SELECT body FROM nodes WHERE id = ${n.id}`;
  assert.equal(rows[0].body, "changed");
});

test("untie removes the edge only with the secret", async () => {
  const a = await makeNote();
  const b = await makeNote();
  const [e] = (await sql`
    INSERT INTO edges (source_id, target_id, status)
    VALUES (${a.id}, ${b.id}, 'approved') RETURNING id, secret
  `) as { id: number; secret: string }[];
  assert.equal(await untieEdge(e.id, "00000000-0000-0000-0000-000000000000"), false);
  assert.equal(await untieEdge(e.id, e.secret), true);
  const rows = await sql`SELECT status FROM edges WHERE id = ${e.id}`;
  assert.equal(rows[0].status, "removed");
});

test("a stamp comes off only with the secret", async () => {
  const n = await makeNote();
  const [r] = (await sql`
    INSERT INTO reactions (node_id, kind) VALUES (${n.id}, 'CAP')
    RETURNING id, secret
  `) as { id: number; secret: string }[];
  assert.equal(await removeStamp(r.id, "00000000-0000-0000-0000-000000000000"), false);
  assert.equal(await removeStamp(r.id, r.secret), true);
  const rows = await sql`SELECT 1 FROM reactions WHERE id = ${r.id}`;
  assert.equal(rows.length, 0);
});
