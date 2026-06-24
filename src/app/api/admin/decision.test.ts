import { test } from "node:test";
import assert from "node:assert/strict";
import { editedBody } from "./decision.ts";

test("editedBody trims and ignores blanks", () => {
  assert.equal(editedBody("  hi "), "hi");
  assert.equal(editedBody(""), null);
  assert.equal(editedBody(undefined), null);
});
