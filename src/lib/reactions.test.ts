import { test } from "node:test";
import assert from "node:assert/strict";
import { isStamp, STAMPS } from "./reactions.ts";

test("accepts known stamps, rejects everything else", () => {
  for (const s of STAMPS) assert.equal(isStamp(s), true);
  assert.equal(isStamp("NOPE"), false);
  assert.equal(isStamp(""), false);
  assert.equal(isStamp(123), false);
  assert.equal(isStamp(null), false);
});
