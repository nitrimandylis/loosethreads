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

*an infinite corkboard for anonymous rumors, with red string and nobody on duty*

![next](https://img.shields.io/badge/next.js-16-000000?style=flat-square&labelColor=111111) ![canvas](https://img.shields.io/badge/canvas-react_flow-c0231f?style=flat-square&labelColor=111111) ![moderation](https://img.shields.io/badge/moderation-after__the__fact-c0231f?style=flat-square&labelColor=111111) ![accounts](https://img.shields.io/badge/accounts-0_(by_design)-000000?style=flat-square&labelColor=111111) ![string](https://img.shields.io/badge/red_string-included-c0231f?style=flat-square&labelColor=111111)

</div>

---

## 🧵 What is this

Loose Threads is a single infinite whiteboard where anyone, anonymously, pins a gossip note into a topic region and ties it to another note with red string — the conspiracy-corkboard you've seen in every detective movie, except the suspects are celebrities, your local scene, and whoever someone decided to implicate at 2am.

Everything a stranger posts goes live the moment they post it. There is no queue and no approval step. The board had one once, and an empty board is what it got: you post a rumour, nothing appears, you close the tab. Moderation now happens *after* the fact, from `/admin`, where anything on the board can be edited in place or taken down.

You can drag the notes around all you like. It won't save. Nobody else sees your tidying. The board is canonical and you are just a guest moving the furniture.

```console
nick@loosethreads:~$ npm run dev
[✓] canvas mounted · 0 notes · 0 strings
[i] nobody is checking this. that is the feature.
```

## 🧷 The board

| | feature | what it actually does |
|---|---|---|
| 01 | **infinite corkboard** | pan/zoom cork surface via React Flow, notes pinned as paper cards: five stocks, crooked, each one picked from its note id so the wall looks hand-assembled |
| 02 | **red string** | drag off one pin onto another, or hit **Tie string** and tap two notes. Ties pin to pin, and a pair can only be tied once in either direction |
| 03 | **topic regions** | curated topics own spatial clusters. A new note is placed at whichever of 20 candidate spots sits furthest from its neighbours, so notes crowd without ever burying each other |
| 04 | **instant publish** | no queue, no approval. It is on the board before you've let go of the button |
| 05 | **takedown, not review** | `/admin` shows what is live and can edit it in place or remove it. Removal is soft and takes its strings with it |
| 06 | **reaction stamps** | `CONFIRMED` · `CAP` · `👀` · `LMAO`. One per note per browser, so nobody can sit there stamping CONFIRMED 400 times |
| 07 | **notes age** | paper yellows the longer it's been up. The ink ramps *darker* as it goes, so the oldest note on the board still clears 4.5:1 |
| 08 | **local-only drag** | rearrange the board to your heart's content, it never persists and nobody else ever sees it |
| 09 | **no accounts** | no login, no profile, no email. Turnstile and a per-IP rate limit are the whole gate |

## 🚀 Run it

You need a Neon Postgres `DATABASE_URL` and an `ADMIN_SECRET`.

Upstash and Turnstile are optional **locally only**. Because submissions publish
immediately, those two are the entire defence in production, so the submit route
**fails closed**: with any of them missing, a production deploy refuses
submissions with a 503 rather than serving an unthrottled anonymous write
endpoint. Locally, both are skipped and everything works.

```bash
git clone https://github.com/nitrimandylis/loosethreads.git
cd loosethreads
cp .env.example .env.local   # paste DATABASE_URL + ADMIN_SECRET
npm install
npm run dev
```

The database schema creates itself on first query, no migration step and no ceremony. Visit `/` for the board and `/admin` to judge humanity after the fact.

## 🔩 Under the hood

```mermaid
flowchart LR
    A[anonymous visitor] -->|note or red string| B[Turnstile + rate limit]
    B -->|unconfigured in prod| X[503 · submissions closed]
    B --> C[(status=approved)]
    C --> H[public canvas]
    H -.->|you, later| F[/admin]
    F -->|edit in place| C
    F -->|remove| R[(status=removed)]
```

| layer/file | path | job |
|---|---|---|
| canvas | `src/app/canvas.tsx` | React Flow board, add panel, string mode, framing, empty state |
| sticky node | `src/app/sticky-node.tsx` | the pinned card, its stamps, its age |
| paper | `src/lib/paper.ts` | which stock, tilt and pin a note gets, derived from its id |
| aging | `src/lib/aging.ts` | note age → visual bucket |
| submit api | `src/app/api/submit/route.ts` | the gate: fails closed in prod, rate-limits per action, Turnstile-checks, publishes |
| rate limits | `src/lib/ratelimit.ts` | three buckets priced by cost: notes 5, strings 15, stamps 60, per 10 min per IP |
| admin | `src/app/admin/` | secret-gated live board: edit in place, remove, sign out |
| db | `src/lib/db.ts` | lazy Neon client + self-creating schema (`nodes`, `edges`, `reactions`) |
| queries | `src/lib/queries.ts` | public board read + the moderator's live-board read |
| topics | `src/lib/topics.ts` | the topic list, region coordinates, and collision-aware placement |
| design system | `src/app/globals.css` | the whole visual system, documented in the header comment |

Design intent lives in [`PRODUCT.md`](PRODUCT.md); the palette, paper stocks and type
pairing are documented at the top of `globals.css`. Read both before restyling anything.

**Stack:** Next.js 16 · React 19 · React Flow · Neon Postgres · Upstash · Cloudflare Turnstile · TypeScript

---

<div align="center">

**[Nick Trimandylis](https://github.com/nitrimandylis)**

`THE STRING CONNECTS EVERYTHING — THE QUEUE DECIDES WHAT YOU SEE`

</div>
