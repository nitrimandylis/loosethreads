import { test } from "node:test";
import assert from "node:assert/strict";
import { ageBucket } from "./aging.ts";

const NOW = Date.parse("2026-06-24T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3600_000, D = 24 * H;

test("buckets by age", () => {
  assert.equal(ageBucket(ago(1 * H), NOW), "fresh");   // < 1 day
  assert.equal(ageBucket(ago(3 * D), NOW), "days");    // < 1 week
  assert.equal(ageBucket(ago(10 * D), NOW), "weeks");  // < 1 month
  assert.equal(ageBucket(ago(60 * D), NOW), "old");    // older
});
