import test from "node:test";
import assert from "node:assert/strict";

// No window here, which is the point: read() catches and reports no stored
// moves, so everything below exercises the staged (private-board) half.
const { getMoves, stageMove, dropStaged, settleMoves, applyMoves } = await import("./moved.ts");

test("a staged move holds the note until the wall agrees", () => {
  stageMove(1, 100, 200);
  assert.deepEqual(getMoves()[1], { x: 100, y: 200 });

  // A poll that still has the old position must not snap the note back.
  settleMoves([{ id: 1, x: 10, y: 20 }]);
  assert.deepEqual(getMoves()[1], { x: 100, y: 200 }, "the write has not landed yet");

  // The poll that carries the write is what lets go.
  settleMoves([{ id: 1, x: 100, y: 200 }]);
  assert.equal(getMoves()[1], undefined, "settled, so the wall is the only record");
});

test("settling tolerates a round trip through JSON and Postgres", () => {
  stageMove(2, 100.0000001, 200);
  settleMoves([{ id: 2, x: 100, y: 200 }]);
  assert.equal(getMoves()[2], undefined, "a sub-pixel difference is the same place");
});

test("a note missing from the wall keeps its staged move", () => {
  stageMove(3, 5, 5);
  settleMoves([{ id: 99, x: 0, y: 0 }]);
  assert.deepEqual(getMoves()[3], { x: 5, y: 5 });
  dropStaged(3);
  assert.equal(getMoves()[3], undefined, "a refused move gives up and the wall wins");
});

test("settling one note leaves the others staged", () => {
  stageMove(4, 1, 1);
  stageMove(5, 2, 2);
  settleMoves([{ id: 4, x: 1, y: 1 }]);
  assert.equal(getMoves()[4], undefined);
  assert.deepEqual(getMoves()[5], { x: 2, y: 2 });
  dropStaged(5);
});

test("applyMoves puts a staged note where it was dropped", () => {
  stageMove(6, 300, 400);
  const notes = [
    { id: 6, x: 0, y: 0 },
    { id: 7, x: 9, y: 9 },
  ];
  assert.deepEqual(applyMoves(notes, getMoves()), [
    { id: 6, x: 300, y: 400 },
    { id: 7, x: 9, y: 9 },
  ]);
  dropStaged(6);
});
