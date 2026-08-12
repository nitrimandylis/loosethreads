import { test, before } from "node:test";
import assert from "node:assert/strict";

// In-memory Postgres; must be set before the db module first runs a query.
process.env.DATABASE_URL = "pglite:memory://";

import { sql, ensureSchema } from "./db.ts";
import {
  boardBySlug,
  createBoard,
  deleteBoard,
  isOpen,
  newSlug,
  PUBLIC_SLUG,
  rotateToken,
  setPassphrase,
  tokenOpens,
  validSlug,
  verifyPassphrase,
} from "./boards.ts";

before(async () => {
  await ensureSchema();
});

test("the public wall exists and is open to everyone", async () => {
  const pub = await boardBySlug(PUBLIC_SLUG);
  assert.ok(pub, "ensureSchema seeds the public board");
  assert.equal(isOpen(pub), true);
  // No cookie at all still gets in: this is what keeps / working.
  assert.equal(tokenOpens(pub, undefined), true);
});

test("slugs avoid the characters people misread aloud", () => {
  for (let i = 0; i < 200; i++) {
    const slug = newSlug();
    assert.equal(slug.length, 10);
    assert.equal(validSlug(slug), true);
    assert.doesNotMatch(slug, /[01ol]/, `${slug} contains an ambiguous character`);
  }
});

test("validSlug refuses anything that is not one", () => {
  assert.equal(validSlug(""), false); // the public wall is not reachable at /b/
  assert.equal(validSlug("short"), false);
  assert.equal(validSlug("waytoolongaslug"), false);
  assert.equal(validSlug("abcde01234"), false); // 0 and 1 are not in the alphabet
  assert.equal(validSlug("ABCDEFGHIJ"), false);
  assert.equal(validSlug("abcde-fghi"), false);
  assert.equal(validSlug(null), false);
  assert.equal(validSlug(42), false);
});

test("the right passphrase opens a board and a wrong one does not", async () => {
  const board = await createBoard("the one from the band");
  assert.equal(isOpen(board), false);
  assert.equal(await verifyPassphrase(board, "the one from the band"), true);
  assert.equal(await verifyPassphrase(board, "the one from the bane"), false);
  assert.equal(await verifyPassphrase(board, ""), false);
});

test("a token opens its own board and no other", async () => {
  const mine = await createBoard("word one");
  const theirs = await createBoard("word two");

  assert.equal(tokenOpens(mine, mine.access_token), true);
  assert.equal(tokenOpens(mine, theirs.access_token), false, "another board's cookie is not a key");
  assert.equal(tokenOpens(mine, undefined), false, "no cookie does not open a private board");
  assert.equal(tokenOpens(mine, "not-a-uuid"), false);
});

test("rotating the token signs everyone out and leaves the word working", async () => {
  const board = await createBoard("still the word");
  assert.equal(await rotateToken(board.slug), true);

  const after = await boardBySlug(board.slug);
  assert.ok(after);
  assert.equal(tokenOpens(after, board.access_token), false, "the old cookie is dead");
  assert.equal(await verifyPassphrase(after, "still the word"), true, "the word is unchanged");
});

test("replacing the passphrase kills the old word and the old cookies", async () => {
  const board = await createBoard("old word");
  assert.equal(await setPassphrase(board.slug, "new word"), true);

  const after = await boardBySlug(board.slug);
  assert.ok(after);
  assert.equal(await verifyPassphrase(after, "old word"), false);
  assert.equal(await verifyPassphrase(after, "new word"), true);
  assert.equal(tokenOpens(after, board.access_token), false);
});

test("the public wall cannot be given a passphrase or rotated shut", async () => {
  assert.equal(await setPassphrase(PUBLIC_SLUG, "locked now"), false);
  assert.equal(await rotateToken(PUBLIC_SLUG), false);
  const pub = await boardBySlug(PUBLIC_SLUG);
  assert.ok(pub);
  assert.equal(isOpen(pub), true);
});

test("deleting a board takes its notes, strings and stamps with it", async () => {
  const doomed = await createBoard("going away");
  const keep = await createBoard("staying put");

  const [a] = (await sql`
    INSERT INTO nodes (body, x, y, status, board_id)
    VALUES ('one', 0, 0, 'approved', ${doomed.id}) RETURNING id
  `) as { id: number }[];
  const [b] = (await sql`
    INSERT INTO nodes (body, x, y, status, board_id)
    VALUES ('two', 0, 0, 'approved', ${doomed.id}) RETURNING id
  `) as { id: number }[];
  await sql`INSERT INTO edges (source_id, target_id, status) VALUES (${a.id}, ${b.id}, 'approved')`;
  await sql`INSERT INTO reactions (node_id, kind) VALUES (${a.id}, 'CONFIRMED')`;
  const [safe] = (await sql`
    INSERT INTO nodes (body, x, y, status, board_id)
    VALUES ('untouched', 0, 0, 'approved', ${keep.id}) RETURNING id
  `) as { id: number }[];

  assert.equal(await deleteBoard(doomed.slug), true);
  assert.equal(await boardBySlug(doomed.slug), null);

  const notes = await sql`SELECT id FROM nodes WHERE id IN (${a.id}, ${b.id})`;
  const edges = await sql`SELECT id FROM edges WHERE source_id = ${a.id}`;
  const stamps = await sql`SELECT id FROM reactions WHERE node_id = ${a.id}`;
  assert.equal(notes.length, 0, "its notes go");
  assert.equal(edges.length, 0, "its strings cascade");
  assert.equal(stamps.length, 0, "its stamps cascade");

  const other = await sql`SELECT id FROM nodes WHERE id = ${safe.id}`;
  assert.equal(other.length, 1, "another board's notes are untouched");
  assert.equal(await deleteBoard(doomed.slug), false, "deleting again is a non-event");
});

test("the public wall cannot be deleted", async () => {
  assert.equal(await deleteBoard(PUBLIC_SLUG), false);
  assert.ok(await boardBySlug(PUBLIC_SLUG));
});

test("notes land on one board and are invisible from another", async () => {
  const a = await createBoard("board a");
  const b = await createBoard("board b");
  await sql`INSERT INTO nodes (body, x, y, status, board_id) VALUES ('a rumour', 0, 0, 'approved', ${a.id})`;

  const onA = await sql`SELECT id FROM nodes WHERE board_id = ${a.id} AND status = 'approved'`;
  const onB = await sql`SELECT id FROM nodes WHERE board_id = ${b.id} AND status = 'approved'`;
  assert.equal(onA.length, 1);
  assert.equal(onB.length, 0);
});
