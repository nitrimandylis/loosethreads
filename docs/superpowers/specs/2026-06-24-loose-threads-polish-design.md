# Loose Threads — Polish Pass (friends toy)

**Date:** 2026-06-24
**Goal:** Loose Threads is a personal/friends toy, not a public product. This pass cuts the
stranger-internet machinery that doesn't earn its place at friend-scale, polishes the corkboard
(the whole experience), and adds two low-cost delights: note aging and reactions.

## Decisions (locked with user)

- **Keep** the literal corkboard metaphor — execute it far better, don't replace it.
- **Cut** the LLM moderation entirely. Moderation is just Nick approving/rejecting.
- **Reactions are in** for v1.
- Project scope is "friends toy" → YAGNI on scale, presence/cursors, photo pins, trending,
  retention, mobile-perfect canvas, expanded abuse defense.

## Scope

### 1. Cut LLM moderation
- Delete `src/lib/moderation.ts`.
- `api/submit/route.ts`: remove `triage()`; notes insert straight to `status='pending'`.
- `queries.ts`: drop `Triage` import and the `triage` field from `PendingNote`; stop selecting it.
- `db.ts`: leave the `triage` JSONB column in place (nullable, harmless) — no migration needed.
  `// ponytail:` note that the column is vestigial.
- Remove deps `ai` and `@ai-sdk/openai-compatible` from `package.json`.
- Remove `NVIDIA_NIM_*` and `MOD_MODEL` from `.env.example`.
- README: remove the "llm triage" feature row and the LLM node from the mermaid diagram.

### 2. Corkboard visual polish (frontend-design skill)
The look IS the product. Intentional, designed — not default-CSS. Covers:
- Cork surface with real depth/grain (layered gradients/noise, vignette), not a flat fill.
- Sticky notes: better paper, lighting, varied paper tints, a real pushpin with a cast shadow,
  satisfying hover/drag micro-interactions (lift + shadow), restrained rotation jitter.
- Topic-region labels: branded, legible-but-recessive.
- Topbar + add-panel + toast: same designed language, not stock form controls.
- Typography: deliberate display + hand pairing (no Comic Sans fallback).
- Red string (edges): styled to read as physical string, not a thin SVG line.
- All in `globals.css` + node markup; no new UI dependency.

### 3. Note aging (cheap, on-theme)
- `getApprovedBoard()` and `NoteRow` already have `created_at` available — select it and pass through.
- Canvas passes `created_at` into each sticky node's `data`.
- Sticky node derives an **age bucket** (e.g. fresh / days / weeks / old) and applies a CSS class:
  paper yellows, ink fades, edges curl as it ages. Pure CSS from the bucket — no JS animation loop.

### 4. Reactions / stamps
- **Stamp set (small, fixed):** `CONFIRMED`, `CAP`, `👀`, `LMAO`. Defined in one const.
- **DB:** new `reactions(id BIGSERIAL, node_id BIGINT REFERENCES nodes ON DELETE CASCADE, kind TEXT, created_at)`
  created in `ensureSchema()`. Counts come from aggregation, not a counter column.
- **API:** extend `api/submit` (or a sibling) to accept `{ type: "reaction", nodeId, kind }`. Validate
  kind against the set and that the node is approved. Rate-limited via existing `allow()`. **Not moderated**
  — reactions aren't gossip content; they're public immediately.
- **Read:** `getApprovedBoard()` returns per-node reaction counts (`{kind: count}`); passed into node data.
- **Canvas:** sticky node renders existing stamps and a small affordance to add one; click optimistically
  bumps the count and POSTs. Friend-scale: no per-user dedupe (intentional, a little chaos is fine).
  `// ponytail:` note the no-dedupe ceiling.

### 5. Admin redo
- **Restyle:** same designed language as the canvas — it's currently a bare list.
- **Moderate-in-context:** render each pending note as the sticky it will become (paper, topic, pin),
  so Nick judges it as it'll land — not as a text row.
- **Edit-before-publish:** the body is editable in the queue; `api/admin/decision` accepts an optional
  edited `body` on approve and writes it before flipping status.
- Remove the triage/risk/reason UI (no data source after the cut).

### Out of v1
- Live presence/cursors, photo pins, trending/heat, mobile-optimized canvas.
- Deeper red-string interaction (sag/gravity physics) — visual polish only in v2.

## Data flow (unchanged shape)
anonymous visitor → Turnstile + rate limit → `nodes`/`edges`/`reactions` (pending or public) →
Nick's `/admin` queue → approved → public canvas. Reactions skip the queue.

## Testing
- `reactions` POST: assert kind-validation rejects unknown kinds and non-approved nodes (one runnable check).
- `decision` edit-on-approve: assert an edited body is persisted on approve.
- Aging bucket function: assert boundaries (fresh vs old) — pure function, trivial unit test.
- Build + lint pass; LLM removal leaves no dangling imports.
