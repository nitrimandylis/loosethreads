import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// A throwaway Postgres in a folder of its own, so this never touches the board
// you are developing against. Set before the import, because db.ts reads
// DATABASE_URL the first time a query runs.
const DIR = ".test-pgdata";
process.env.DATABASE_URL = `pglite:${DIR}`;
rmSync(DIR, { recursive: true, force: true });

const { allowLogin, allowNote, clientIp } = await import("./ratelimit.ts");

const from = (ip: string) => new Request("http://board.test/", { headers: { "x-real-ip": ip } });

test("a bucket runs out, and every IP gets its own", async (t) => {
  t.after(() => rmSync(DIR, { recursive: true, force: true }));

  // login is 5 per 15 minutes: the brute-force ceiling on ADMIN_SECRET.
  for (let i = 1; i <= 5; i++) {
    assert.equal(await allowLogin(from("10.0.0.1")), true, `attempt ${i} should be allowed`);
  }
  assert.equal(await allowLogin(from("10.0.0.1")), false, "the sixth attempt is refused");

  // A refused attempt must not have been recorded, or the window would keep
  // sliding forward on rejected traffic and lock the IP out for longer than
  // the bucket says.
  assert.equal(await allowLogin(from("10.0.0.1")), false, "still refused, not compounding");

  assert.equal(await allowLogin(from("10.0.0.2")), true, "a different IP has its own budget");

  // Buckets are per action: burning the login budget must not cost this IP
  // its ability to post, which is what one shared bucket used to do.
  assert.equal(await allowNote(from("10.0.0.1")), true, "notes have their own bucket");
});

test("the client IP comes from the trusted header, not the spoofable one", () => {
  assert.equal(clientIp(from("9.9.9.9")), "9.9.9.9");

  // Left-most X-Forwarded-For is attacker-controlled, so a request that claims
  // to come from 1.1.1.1 must be counted against the hop our proxy saw.
  const spoofed = new Request("http://board.test/", {
    headers: { "x-forwarded-for": "1.1.1.1, 203.0.113.7" },
  });
  assert.equal(clientIp(spoofed), "203.0.113.7");

  // Nothing identifiable at all: one shared, strict bucket rather than a free pass.
  assert.equal(clientIp(new Request("http://board.test/")), "anon");
});
