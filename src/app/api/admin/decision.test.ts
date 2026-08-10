import { test } from "node:test";
import assert from "node:assert/strict";
import { editedBody, rowId } from "./decision.ts";

test("editedBody trims and rejects blanks", () => {
  assert.equal(editedBody("  hi "), "hi");
  assert.equal(editedBody(""), null);
  assert.equal(editedBody("   "), null);
  assert.equal(editedBody(undefined), null);
  assert.equal(editedBody(42), null);
});

test("editedBody enforces the same cap as the public route", () => {
  assert.equal(editedBody("a".repeat(500))?.length, 500);
  assert.equal(editedBody("a".repeat(501)), null);
});

test("rowId accepts positive integers and nothing else", () => {
  assert.equal(rowId(3), 3);
  assert.equal(rowId("3"), 3);
  assert.equal(rowId(0), null);
  assert.equal(rowId(-1), null);
  assert.equal(rowId(3.5), null);
  assert.equal(rowId("abc"), null);
  assert.equal(rowId(null), null);
  assert.equal(rowId(undefined), null);
});
