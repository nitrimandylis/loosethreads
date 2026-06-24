# Loose Threads Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the LLM moderation, polish the corkboard look, and add note aging + reactions, with an admin queue that moderates notes in-context and allows edit-before-publish.

**Architecture:** Next.js 16 App Router. Server components read approved board / pending queue via tagged-template Neon SQL; client components (`canvas.tsx`, `queue-client.tsx`) handle interaction. Schema self-creates in `ensureSchema()`. Reactions are a new public (un-moderated) table aggregated into board reads. Aging and the visual layer are CSS-driven from data already on each node.

**Tech Stack:** Next.js 16, React 19, @xyflow/react, Neon Postgres (@neondatabase/serverless), Tailwind v4 (`globals.css`), TypeScript, zod.

## Global Constraints

- This is NOT stock Next.js — read the relevant guide in `node_modules/next/dist/docs/` before writing framework code; heed deprecation notices (per AGENTS.md).
- Ponytail is active: prefer deletion, stdlib/native, and the shortest working diff. Mark deliberate shortcuts with `// ponytail:` comments naming the ceiling.
- No new UI dependency for the visual work — `globals.css` + node markup only.
- Notes/edges stay pre-moderated (insert `status='pending'`); reactions are public immediately.
- Moderation is a single human (Nick) gated by `ADMIN_SECRET` — no LLM anywhere after Task 1.
- Stamp set is fixed and defined once: `CONFIRMED`, `CAP`, `👀`, `LMAO`.

---

### Task 1: Cut the LLM moderation

**Files:**
- Delete: `src/lib/moderation.ts`
- Modify: `src/app/api/submit/route.ts` (remove triage call)
- Modify: `src/lib/queries.ts` (drop Triage import + field)
- Modify: `src/app/admin/queue-client.tsx` (remove risk/reason UI)
- Modify: `src/lib/db.ts` (mark triage column vestigial)
- Modify: `package.json`, `.env.example`, `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `submit` route inserts notes with `status='pending'` unconditionally; `PendingNote` no longer has a `triage` field.

- [ ] **Step 1: Remove triage from the submit route**

In `src/app/api/submit/route.ts`, remove the `import { triage } ...` line and replace the note-insert block:

```ts
  const { x, y } = placeInTopic(topic);

  await sql`
    INSERT INTO nodes (topic, body, x, y, status)
    VALUES (${topic}, ${body}, ${x}, ${y}, 'pending')
  `;

  return NextResponse.json({ ok: true, status: "pending" });
```

(Delete the `const t = await triage(body);` and `const status = ...` lines.)

- [ ] **Step 2: Delete the moderation module and its references**

```bash
git rm src/lib/moderation.ts
```

In `src/lib/queries.ts`: remove `import type { Triage } from "@/lib/moderation";` and change `PendingNote` to:

```ts
export type PendingNote = NoteRow & { status: string; created_at: string };
```

and drop `triage` from the `getQueue` notes SELECT (select `id, topic, body, x, y, status, created_at`).

- [ ] **Step 3: Remove risk/reason UI from the admin queue**

In `src/app/admin/queue-client.tsx`, inside the notes `.map`, delete the `{n.triage && ...}` risk span and the `{n.triage?.reason && ...}` reason paragraph, leaving the `<span className="tag">{n.topic}</span>` in `.qmeta`.

- [ ] **Step 4: Mark the triage column vestigial**

In `src/lib/db.ts`, the `triage JSONB` line in the `nodes` table — add above it:

```ts
          -- ponytail: vestigial after LLM cut; left nullable to avoid a migration.
          triage JSONB,
```

- [ ] **Step 5: Remove the AI deps and env**

```bash
npm uninstall ai @ai-sdk/openai-compatible
```

In `.env.example`, delete the `NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_BASE_URL`, and `MOD_MODEL` lines.

In `README.md`: delete table row `05 | **llm triage** | ...`, delete the `moderation | src/lib/moderation.ts | ...` row, remove `NVIDIA NIM` from the Stack line and the "NVIDIA NIM triage" mention in Run it, and simplify the mermaid diagram to drop the `D[LLM triage]`/`E[auto-reject]` nodes so it reads `C[(queue · status=pending)] --> F[/admin queue]`.

- [ ] **Step 6: Verify build is clean (no dangling imports)**

Run: `npm run build`
Expected: build succeeds; no references to `moderation` or `triage` remain. Confirm with:
Run: `grep -rn "moderation\|triage\|NVIDIA_NIM" src` → Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Cut LLM moderation; moderation is now human-only"
```

---

### Task 2: Reactions backend (schema + API + read)

**Files:**
- Create: `src/lib/reactions.ts` (stamp set + validation)
- Modify: `src/lib/db.ts` (create `reactions` table in `ensureSchema`)
- Modify: `src/app/api/submit/route.ts` (handle `type: "reaction"`)
- Modify: `src/lib/queries.ts` (aggregate counts into board read)
- Test: `src/lib/reactions.test.ts`

**Interfaces:**
- Consumes: `allow`, `clientIp` from `@/lib/ratelimit`; `sql`, `ensureSchema` from `@/lib/db`.
- Produces:
  - `src/lib/reactions.ts`: `export const STAMPS = ["CONFIRMED","CAP","👀","LMAO"] as const;`
    `export type Stamp = (typeof STAMPS)[number];`
    `export function isStamp(v: unknown): v is Stamp`
  - `NoteRow` gains `reactions: Record<string, number>` (kind → count), `created_at: string`.

- [ ] **Step 1: Write the failing test for stamp validation**

Create `src/lib/reactions.test.ts` (run with `node --test` via tsx; or plain assert in a `.mjs` if tsx unavailable — keep it framework-free):

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test --experimental-strip-types src/lib/reactions.test.ts`
Expected: FAIL — cannot find module `./reactions.ts`.

- [ ] **Step 3: Implement the stamp module**

Create `src/lib/reactions.ts`:

```ts
// Fixed, public stamp set for the gossip board. Reactions are not moderated.
export const STAMPS = ["CONFIRMED", "CAP", "👀", "LMAO"] as const;
export type Stamp = (typeof STAMPS)[number];

export function isStamp(v: unknown): v is Stamp {
  return typeof v === "string" && (STAMPS as readonly string[]).includes(v);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test --experimental-strip-types src/lib/reactions.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the reactions table in ensureSchema**

In `src/lib/db.ts`, after the `edges` table create (before the index creates), add:

```ts
      await sql`
        CREATE TABLE IF NOT EXISTS reactions (
          id BIGSERIAL PRIMARY KEY,
          node_id BIGINT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS reactions_node_idx ON reactions(node_id)`;
```

- [ ] **Step 6: Handle reaction submissions in the API**

In `src/app/api/submit/route.ts`, add `import { isStamp } from "@/lib/reactions";` and, after the rate-limit check and before the edge block, add:

```ts
  // ---- Reaction (public, not moderated) ----
  if (data.type === "reaction") {
    const nodeId = Number(data.nodeId);
    if (!Number.isInteger(nodeId) || !isStamp(data.kind)) {
      return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
    }
    // ponytail: no per-user dedupe — friend-scale, a little spam is fine.
    const ok = await sql`SELECT 1 FROM nodes WHERE id = ${nodeId} AND status = 'approved'`;
    if (ok.length !== 1) {
      return NextResponse.json({ error: "No such note" }, { status: 400 });
    }
    await sql`INSERT INTO reactions (node_id, kind) VALUES (${nodeId}, ${data.kind})`;
    return NextResponse.json({ ok: true });
  }
```

- [ ] **Step 7: Aggregate reactions + created_at into the board read**

In `src/lib/queries.ts`, extend `NoteRow`:

```ts
export type NoteRow = {
  id: number;
  topic: string;
  body: string;
  x: number;
  y: number;
  created_at: string;
  reactions: Record<string, number>;
};
```

Replace the notes query in `getApprovedBoard` with one that joins reaction counts:

```ts
  const rows = (await sql`
    SELECT n.id, n.topic, n.body, n.x, n.y, n.created_at,
           COALESCE(
             jsonb_object_agg(r.kind, r.cnt) FILTER (WHERE r.kind IS NOT NULL),
             '{}'::jsonb
           ) AS reactions
    FROM nodes n
    LEFT JOIN (
      SELECT node_id, kind, count(*)::int AS cnt FROM reactions GROUP BY node_id, kind
    ) r ON r.node_id = n.id
    WHERE n.status = 'approved'
    GROUP BY n.id
    ORDER BY n.id
  `) as NoteRow[];
  const notes = rows;
```

(Keep the existing `edges` query unchanged; return `{ notes, edges }`.)

- [ ] **Step 8: Verify build + reactions test**

Run: `npm run build` → Expected: succeeds.
Run: `node --test --experimental-strip-types src/lib/reactions.test.ts` → Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add reactions: schema, API, and board aggregation"
```

---

### Task 3: Note aging bucket + node data plumbing

**Files:**
- Create: `src/lib/aging.ts` (age → bucket pure function)
- Modify: `src/app/canvas.tsx` (pass created_at + reactions into node data)
- Test: `src/lib/aging.test.ts`

**Interfaces:**
- Consumes: `NoteRow` (now has `created_at`, `reactions`).
- Produces: `export function ageBucket(createdAtIso: string, now?: number): "fresh" | "days" | "weeks" | "old";`
  Node `data` now carries `{ body, createdAt, reactions, id }`.

- [ ] **Step 1: Write the failing test for ageBucket**

Create `src/lib/aging.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test --experimental-strip-types src/lib/aging.test.ts`
Expected: FAIL — cannot find module `./aging.ts`.

- [ ] **Step 3: Implement ageBucket**

Create `src/lib/aging.ts`:

```ts
// Pure age → visual bucket. Drives CSS only; no animation loop.
export function ageBucket(
  createdAtIso: string,
  now: number = Date.now()
): "fresh" | "days" | "weeks" | "old" {
  const ageMs = now - Date.parse(createdAtIso);
  const day = 86_400_000;
  if (ageMs < day) return "fresh";
  if (ageMs < 7 * day) return "days";
  if (ageMs < 30 * day) return "weeks";
  return "old";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test --experimental-strip-types src/lib/aging.test.ts`
Expected: PASS.

- [ ] **Step 5: Pass created_at + reactions into node data**

In `src/app/canvas.tsx`, change the `noteNodes` map to carry the new fields:

```ts
    const noteNodes: Node[] = notes.map((n) => ({
      id: String(n.id),
      type: "sticky",
      position: { x: n.x, y: n.y },
      data: { id: n.id, body: n.body, createdAt: n.created_at, reactions: n.reactions },
    }));
```

- [ ] **Step 6: Verify build**

Run: `npm run build` → Expected: succeeds (StickyNode still only reads `body` for now — extra data is ignored until Task 5).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add age-bucket helper and plumb note metadata into canvas nodes"
```

---

### Task 4: Corkboard visual polish (frontend-design)

**Files:**
- Modify: `src/app/globals.css` (full visual pass)
- Modify: `src/app/sticky-node.tsx` (markup hooks if needed for layering)
- Modify: `src/app/canvas.tsx` (`Background`/edge styling only if needed)

**Interfaces:**
- Consumes: existing class names (`.react-flow`, `.sticky-note`, `.pin`, `.topic-label`, `.add-panel`, `.topbar`, `.toast`).
- Produces: no new exports. Visual only.

**REQUIRED SUB-SKILL: invoke `frontend-design:frontend-design` before writing CSS** — establish an intentional aesthetic direction (cork grain, paper, pin, type pairing, red string) rather than restyling ad hoc.

- [ ] **Step 1: Establish direction**

Invoke the frontend-design skill. Decide: cork surface treatment (layered radial/linear gradients + subtle noise + vignette), paper tints + lighting, pushpin with cast shadow, display+hand type pairing (system-safe stack, no Comic Sans fallback), red-string edge treatment. Record the chosen palette/type as comments at the top of `globals.css`.

- [ ] **Step 2: Rework the cork surface and notes**

In `globals.css`, replace the `.react-flow` background, `.sticky-note` (paper, shadow, lift-on-hover transition), `.pin`, `.topic-label`, `.topbar`, `.add-panel`, `.add-btn`, `.submit-btn`, and `.toast` rules with the designed versions. Add a `.sticky-note` hover transform that lifts + deepens shadow (transition on `transform, box-shadow`).

- [ ] **Step 3: Style red string**

In `src/app/canvas.tsx`, keep `RED` but give edges a thicker, slightly translucent, drop-shadowed stroke so they read as string (e.g. `style: { stroke: RED, strokeWidth: 3 }` plus a CSS rule `.react-flow__edge-path { filter: drop-shadow(0 1px 1px rgba(0,0,0,.4)); }`).

- [ ] **Step 4: Visual verification**

Run: `npm run dev`, load `/`, confirm the board reads as an intentional corkboard (texture, depth, legible type, satisfying note hover, string looks physical). Adjust until it does. No unit test — this is a visual deliverable.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Polish corkboard: cork surface, paper notes, pins, type, red string"
```

---

### Task 5: Reactions UI + aging on the sticky note

**Files:**
- Modify: `src/app/sticky-node.tsx` (render stamps + add affordance + age class)
- Modify: `src/app/globals.css` (stamp + aging styles)
- Modify: `src/app/canvas.tsx` (optional: hoist a postReaction helper)

**Interfaces:**
- Consumes: node `data` `{ id, body, createdAt, reactions }`; `STAMPS` from `@/lib/reactions`; `ageBucket` from `@/lib/aging`.
- Produces: clicking a stamp POSTs `{ type: "reaction", nodeId, kind }` to `/api/submit` and optimistically bumps the count.

- [ ] **Step 1: Render aging + reactions in StickyNode**

Replace `StickyNode` in `src/app/sticky-node.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { STAMPS } from "@/lib/reactions";
import { ageBucket } from "@/lib/aging";

type StickyData = {
  id: number;
  body: string;
  createdAt: string;
  reactions: Record<string, number>;
};

export function StickyNode({ data }: NodeProps) {
  const d = data as StickyData;
  const [counts, setCounts] = useState<Record<string, number>>(d.reactions ?? {});
  const age = ageBucket(d.createdAt);

  async function react(kind: string) {
    setCounts((c) => ({ ...c, [kind]: (c[kind] ?? 0) + 1 })); // optimistic
    await fetch("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "reaction", nodeId: d.id, kind }),
    }).catch(() => {});
  }

  return (
    <div className={`sticky-note age-${age}`}>
      <div className="pin" />
      <Handle type="source" position={Position.Top} className="rf-handle" />
      <Handle type="target" position={Position.Bottom} className="rf-handle" />
      <Handle type="source" position={Position.Right} id="r" className="rf-handle" />
      <Handle type="target" position={Position.Left} id="l" className="rf-handle" />
      <p>{d.body}</p>
      <div className="stamps">
        {STAMPS.map((s) => (
          <button key={s} className="stamp" onClick={() => react(s)} title={s}>
            {s} {counts[s] ? <span className="stamp-n">{counts[s]}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
```

(Leave `TopicNode` unchanged.)

- [ ] **Step 2: Style stamps + aging**

In `globals.css` add `.stamps` (flex wrap, small gap), `.stamp` (chip-like, on-paper), `.stamp-n` (count), and aging rules: `.sticky-note.age-days`, `.age-weeks`, `.age-old` progressively yellow the paper, fade the ink (`color`), and curl/desaturate (e.g. deeper `filter: sepia()` / shadow tweaks). `.age-fresh` is the baseline.

- [ ] **Step 3: Build + manual check**

Run: `npm run build` → Expected: succeeds.
Run: `npm run dev`, approve a note via `/admin`, click a stamp on the board → count bumps immediately; reload → count persists (came from DB). Older notes look visibly aged.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Render reactions and note aging on sticky cards"
```

---

### Task 6: Admin redo — restyle, moderate-in-context, edit-before-publish

**Files:**
- Modify: `src/app/admin/queue-client.tsx` (sticky-style preview + editable body)
- Modify: `src/app/api/admin/decision/route.ts` (accept edited body on approve)
- Modify: `src/app/globals.css` (admin styling reusing the designed language)
- Read first: `src/app/api/admin/decision/route.ts` to learn its current shape.

**Interfaces:**
- Consumes: `PendingNote` `{ id, topic, body, x, y, status, created_at }`; the designed `.sticky-note` styles from Task 4.
- Produces: `decision` route accepts optional `body` on a node approve and writes it before flipping status.

- [ ] **Step 1: Accept an edited body on approve (write the failing test)**

Read `src/app/api/admin/decision/route.ts` first. Add a test `src/app/api/admin/decision.test.ts` that asserts the request parsing keeps an edited body. If the route's DB calls make a unit test impractical, instead extract a pure `applyDecision` helper `(kind, action, body?) => { sql params }` and test that the approve branch includes the trimmed body. Minimal pure-function test:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { editedBody } from "./decision.ts";

test("editedBody trims and ignores blanks", () => {
  assert.equal(editedBody("  hi "), "hi");
  assert.equal(editedBody(""), null);
  assert.equal(editedBody(undefined), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test --experimental-strip-types src/app/api/admin/decision.test.ts`
Expected: FAIL — `editedBody` not exported.

- [ ] **Step 3: Implement edit-on-approve in the route**

In `src/app/api/admin/decision/route.ts` export:

```ts
export function editedBody(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}
```

In the node `approve` branch, read `editedBody(data.body)`; if non-null, `UPDATE nodes SET body = ${body}, status = 'approved' WHERE id = ${id}`, else the existing approve update. (Keep reject + edge branches unchanged.)

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test --experimental-strip-types src/app/api/admin/decision.test.ts`
Expected: PASS.

- [ ] **Step 5: Restyle the queue as in-context editable stickies**

In `src/app/admin/queue-client.tsx`, render each pending note inside a `.sticky-note` preview (so Nick sees it as it'll land) with the topic shown, and make the body an editable `<textarea>` whose value is sent as `body` to `/api/admin/decision` on approve. Update `decide` to send `{ kind, id, action, body }` for node approves. Add admin styles to `globals.css` reusing the designed language (dark panel, the same buttons).

- [ ] **Step 6: Build + manual check**

Run: `npm run build` → Expected: succeeds.
Run: `npm run dev`, go to `/admin`, edit a pending note's text, approve it, confirm the edited text appears on the public board.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Redo admin: in-context sticky preview with edit-before-publish"
```

---

## Self-Review notes

- **Spec coverage:** §1 cut LLM → Task 1. §2 corkboard polish → Task 4. §3 aging → Tasks 3 (logic/plumbing) + 5 (CSS). §4 reactions → Tasks 2 (backend) + 5 (UI). §5 admin redo → Task 6. Out-of-v1 items intentionally absent.
- **Types:** `NoteRow` gains `created_at`/`reactions` in Task 2 and is consumed in Tasks 3/5; `StickyData` matches the node `data` set in Task 3 Step 5; `STAMPS`/`isStamp`/`ageBucket`/`editedBody` signatures consistent across tasks.
- **Note on tests:** `node --test --experimental-strip-types` runs TS directly on Node 24 (project default). If a worker's Node lacks type-stripping, rename the test inputs to `.mjs` with the types removed — keep it framework-free either way.
