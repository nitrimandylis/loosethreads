```
 ██╗      ██████╗  ██████╗ ███████╗███████╗
 ██║     ██╔═══██╗██╔═══██╗██╔════╝██╔════╝
 ██║     ██║   ██║██║   ██║███████╗█████╗
 ██║     ██║   ██║██║   ██║╚════██║██╔══╝
 ███████╗╚██████╔╝╚██████╔╝███████║███████╗
 ╚══════╝ ╚═════╝  ╚═════╝ ╚══════╝╚══════╝
 ████████╗██╗  ██╗██████╗ ███████╗ █████╗ ██████╗ ███████╗
 ╚══██╔══╝██║  ██║██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝
    ██║   ███████║██████╔╝█████╗  ███████║██║  ██║███████╗
    ██║   ██╔══██║██╔══██╗██╔══╝  ██╔══██║██║  ██║╚════██║
    ██║   ██║  ██║██║  ██║███████╗██║  ██║██████╔╝███████║
    ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝
```

<div align="center">

### `PIN THE GOSSIP // CONNECT THE DOTS // TRUST NOBODY`

*an infinite corkboard for anonymous rumors, with red string and a paranoid moderation queue*

![next](https://img.shields.io/badge/next.js-16-000000?style=flat-square&labelColor=111111) ![canvas](https://img.shields.io/badge/canvas-react_flow-c0231f?style=flat-square&labelColor=111111) ![moderation](https://img.shields.io/badge/everything-pre__moderated-c0231f?style=flat-square&labelColor=111111) ![accounts](https://img.shields.io/badge/accounts-0_(by_design)-000000?style=flat-square&labelColor=111111) ![string](https://img.shields.io/badge/red_string-included-c0231f?style=flat-square&labelColor=111111)

</div>

---

## 🧵 What is this

Loose Threads is a single infinite whiteboard where anyone, anonymously, pins a gossip note into a topic region and ties it to another note with red string — the conspiracy-corkboard you've seen in every detective movie, except the suspects are celebrities, your local scene, and whoever someone decided to implicate at 2am.

Nothing a stranger posts goes live the moment they post it. Every note and every connection lands in a hidden queue, gets a once-over from an LLM that flags the obviously-illegal and the obviously-defamatory, and then waits for a human (you) to approve or reject it. The public canvas only ever renders what survived that gauntlet. Anonymity for the crowd, accountability for the board.

You can drag the notes around all you like. It won't save. Nobody else sees your tidying. The board is canonical and you are just a guest moving the furniture.

```console
nick@loosethreads:~$ npm run dev
[✓] canvas mounted · 0 approved notes · 0 strings
[i] the queue is empty. so is everyone's conscience.
```

## 🧷 The board

| | feature | what it actually does |
|---|---|---|
| 01 | **infinite canvas** | what it actually is — pan/zoom/minimap corkboard via React Flow, notes pinned as sticky cards |
| 02 | **red string** | drag from one note to another to claim they're connected — submitted, not drawn, until a human signs off |
| 03 | **topic regions** | curated topics own spatial clusters; new notes auto-place near their region so the chaos stays loosely sorted |
| 04 | **pre-moderation queue** | nothing is public until approved — the only posture that survives "anonymous + gossip + the open internet" |
| 05 | **llm triage** | auto-rejects clear illegal/PII/slurs and tags the rest with a risk score; the human still makes every publish call |
| 06 | **local-only drag** | rearrange the board to your heart's content — it never persists and nobody else ever sees it |
| 07 | **no accounts** | no login, no profile, no email — just Turnstile + a per-IP rate limit standing between you and the queue |

## 🚀 Run it

You need a Neon Postgres `DATABASE_URL` and an `ADMIN_SECRET`. The rest (Upstash rate limit, Turnstile bot check, AI Gateway triage) are optional — leave them out and the app degrades gracefully, skipping that protection.

```bash
git clone https://github.com/nitrimandylis/loosethreads.git
cd loosethreads
cp .env.example .env.local   # paste DATABASE_URL + ADMIN_SECRET
npm install
npm run dev
```

The database schema creates itself on first query — no migration step, no ceremony. Visit `/` for the board and `/admin` to judge humanity.

## 🔩 Under the hood

```mermaid
flowchart LR
    A[anonymous visitor] -->|note or red string| B[Turnstile + rate limit]
    B --> C[(queue · status=pending)]
    C --> D[LLM triage]
    D -->|clear violation| E[auto-reject]
    D -->|everything else| F[/admin queue]
    F -->|you approve| G[(status=approved)]
    G --> H[public canvas]
```

| layer/file | path | job |
|---|---|---|
| canvas | `src/app/canvas.tsx` | React Flow board, add-note panel, drag-to-connect → edge submission |
| sticky node | `src/app/sticky-node.tsx` | the pinned card + topic-region labels |
| submit api | `src/app/api/submit/route.ts` | validates, rate-limits, Turnstile-checks, triages, queues notes + edges |
| admin | `src/app/admin/` | secret-gated moderation queue with approve/reject |
| db | `src/lib/db.ts` | lazy Neon client + self-creating schema (`nodes`, `edges`) |
| queries | `src/lib/queries.ts` | approved-board read + pending-queue read |
| moderation | `src/lib/moderation.ts` | LLM pre-screen via AI Gateway, fails safe to manual review |
| topics | `src/lib/topics.ts` | the curated topic list and region coordinates |

**Stack:** Next.js 16 · React 19 · React Flow · Neon Postgres · Upstash · Vercel AI Gateway · Cloudflare Turnstile · TypeScript

---

<div align="center">

**[Nick Trimandylis](https://github.com/nitrimandylis)**

`THE STRING CONNECTS EVERYTHING — THE QUEUE DECIDES WHAT YOU SEE`

</div>
