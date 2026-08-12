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
  assert.equal(await takedownNote(n.id, "00000000-0000-0000-0000-000000000000", null), false);
  assert.equal(await takedownNote(n.id, n.secret, null), true);
  const rows = await sql`SELECT status FROM nodes WHERE id = ${n.id}`;
  assert.equal(rows[0].status, "removed");
  // already removed: acting again changes nothing
  assert.equal(await takedownNote(n.id, n.secret, null), false);
});

test("a secret that is not even a uuid refuses without erroring", async () => {
  const n = await makeNote();
  assert.equal(await takedownNote(n.id, "not-a-uuid-at-all", null), false);
});

test("reword replaces the body only with the secret", async () => {
  const n = await makeNote();
  assert.equal(await rewordNote(n.id, "00000000-0000-0000-0000-000000000000", "changed", null), false);
  assert.equal(await rewordNote(n.id, n.secret, "changed", null), true);
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
  assert.equal(await untieEdge(e.id, "00000000-0000-0000-0000-000000000000", null), false);
  assert.equal(await untieEdge(e.id, e.secret, null), true);
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

// ---- board authority: private boards let everybody in on everything ----

async function noteOn(board: number | null): Promise<{ id: number; secret: string }> {
  const [row] = (await sql`
    INSERT INTO nodes (body, x, y, status, board_id)
    VALUES ('a rumour', 0, 0, 'approved', ${board})
    RETURNING id, secret
  `) as { id: number; secret: string }[];
  return row;
}

const NOT_MINE = "00000000-0000-0000-0000-000000000000";

test("inside a private board, somebody else's note comes down without a secret", async () => {
  const [b] = (await sql`
    INSERT INTO boards (slug, pass_salt, pass_hash) VALUES ('mnpqrstuvw', 's', 'h') RETURNING id
  `) as { id: number }[];
  const n = await noteOn(b.id);

  // No secret at all, which is what a visitor who did not write it has.
  assert.equal(await takedownNote(n.id, "", b.id), true);
  const rows = await sql`SELECT status FROM nodes WHERE id = ${n.id}`;
  assert.equal(rows[0].status, "removed");
});

test("board authority does not reach across boards", async () => {
  const [mine] = (await sql`
    INSERT INTO boards (slug, pass_salt, pass_hash) VALUES ('qrstuvwxyz', 's', 'h') RETURNING id
  `) as { id: number }[];
  const [theirs] = (await sql`
    INSERT INTO boards (slug, pass_salt, pass_hash) VALUES ('rstuvwxyz2', 's', 'h') RETURNING id
  `) as { id: number }[];
  const n = await noteOn(theirs.id);

  // Being inside one private board is not authority over another one.
  assert.equal(await takedownNote(n.id, "", mine.id), false);
  assert.equal(await rewordNote(n.id, NOT_MINE, "changed", mine.id), false);
  const rows = await sql`SELECT status, body FROM nodes WHERE id = ${n.id}`;
  assert.equal(rows[0].status, "approved");
  assert.equal(rows[0].body, "a rumour");
});

test("a null board is never a key, so the public wall still needs the secret", async () => {
  const n = await noteOn(null);
  assert.equal(await takedownNote(n.id, "", null), false, "no secret, no board, no takedown");
  assert.equal(await rewordNote(n.id, "", "changed", null), false);
  assert.equal(await takedownNote(n.id, n.secret, null), true, "the secret still works");
});

test("a string on a private board unties for anyone on it", async () => {
  const [b] = (await sql`
    INSERT INTO boards (slug, pass_salt, pass_hash) VALUES ('stuvwxyz23', 's', 'h') RETURNING id
  `) as { id: number }[];
  const a = await noteOn(b.id);
  const c = await noteOn(b.id);
  const [e] = (await sql`
    INSERT INTO edges (source_id, target_id, status) VALUES (${a.id}, ${c.id}, 'approved')
    RETURNING id
  `) as { id: number }[];

  assert.equal(await untieEdge(e.id, "", b.id), true);
  const rows = await sql`SELECT status FROM edges WHERE id = ${e.id}`;
  assert.equal(rows[0].status, "removed");
});

test("a stamp stays its owner's, even inside a private board", async () => {
  const [b] = (await sql`
    INSERT INTO boards (slug, pass_salt, pass_hash) VALUES ('tuvwxyz234', 's', 'h') RETURNING id
  `) as { id: number }[];
  const n = await noteOn(b.id);
  const [r] = (await sql`
    INSERT INTO reactions (node_id, kind) VALUES (${n.id}, 'CONFIRMED') RETURNING id, secret
  `) as { id: number; secret: string }[];

  assert.equal(await removeStamp(r.id, NOT_MINE), false, "being on the board is not enough");
  assert.equal(await removeStamp(r.id, r.secret), true);
});
