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

![next](https://img.shields.io/badge/next.js-16-000000?style=flat-square&labelColor=111111) ![canvas](https://img.shields.io/badge/canvas-hand__rolled-c0231f?style=flat-square&labelColor=111111) ![moderation](https://img.shields.io/badge/moderation-after__the__fact-c0231f?style=flat-square&labelColor=111111) ![accounts](https://img.shields.io/badge/accounts-0_(by_design)-000000?style=flat-square&labelColor=111111) ![string](https://img.shields.io/badge/red_string-included-c0231f?style=flat-square&labelColor=111111)

</div>

---

## 🧵 What is this

Loose Threads is one corkboard where anyone, anonymously, pins a gossip note into a topic patch and ties it to another note with red string — the conspiracy wall you've seen in every detective movie, except the suspects are celebrities, your local scene, and whoever someone decided to implicate at 2am.

Everything a stranger posts goes live the moment they post it. There is no queue and no approval step. The board had one once, and an empty board is what it got: you post a rumour, nothing appears, you close the tab. Moderation now happens *after* the fact, from `/admin`, where anything on the board can be edited in place or taken down.

You can't tidy it. The wall is canonical and you are a guest: scroll it, step back from it, read it, add to it.

```console
nick@loosethreads:~$ npm run dev
[✓] canvas mounted · 0 notes · 0 strings
[i] nobody is checking this. that is the feature.
```

## 🧷 The board

| | feature | what it actually does |
|---|---|---|
| 01 | **one corkboard, no canvas library** | a scroll container with a CSS scale on it. Notes are placed from their stored coordinates, string is an SVG layer, cork is feTurbulence noise. Nothing here is a node editor |
| 02 | **five paper stocks** | legal pad, manila card, memo, message slip, torn receipt: different widths, different edges, different printing, picked from the note id so the wall looks hand-assembled |
| 03 | **red string** | tap a note, **Tie string**, tap the second one. It sags with the span, casts a shadow on the cork, crosses over the paper and stops short of the pins |
| 04 | **topic patches** | curated topics own adjacent patches of the one wall. A new note lands at whichever of 20 candidate spots sits furthest from its neighbours, so notes crowd without burying each other |
| 05 | **instant publish** | no queue, no approval. Your note travels from the sheet you wrote it on to its place on the wall, and the board polls every 15s so your friends' notes land while you watch |
| 06 | **takedown, not review** | `/admin` shows what is live and can edit it in place or remove it. Removal is soft and takes its strings with it |
| 07 | **reaction stamps** | `CONFIRMED` · `CAP` · `👀` · `LMAO`, stamped as ink on the paper rather than buttons on a card. One per note per browser |
| 08 | **notes age** | paper yellows the longer it's been up. The ink ramps *darker* as it goes, so the oldest note on the board still clears 4.5:1 |
| 09 | **no accounts** | no login, no profile, no email. Turnstile and a per-IP rate limit are the whole gate |

## 🚀 Run it

You need a `DATABASE_URL` and an `ADMIN_SECRET`.

For local work there is no cloud database to sign up for: set
`DATABASE_URL=pglite:.pgdata` and the app runs Postgres itself, compiled to
WASM, in the dev server, with its data in a gitignored `.pgdata/` folder. Same
SQL, nothing to install, nothing left running. `rm -rf .pgdata` empties the
board. It refuses to start in production, where a database on the serverless
filesystem would quietly lose everything on it.

Upstash and Turnstile are optional **locally only**. Because submissions publish
immediately, those two are the entire defence in production, so the submit route
**fails closed**: with any of them missing, a production deploy refuses
submissions with a 503 rather than serving an unthrottled anonymous write
endpoint. Locally, both are skipped and everything works.

```bash
git clone https://github.com/nitrimandylis/loosethreads.git
cd loosethreads
cp .env.example .env.local   # DATABASE_URL=pglite:.pgdata + any ADMIN_SECRET
npm install
npm run dev
```

The database schema creates itself on first query, no migration step and no ceremony. Visit `/` for the board and `/admin` to judge humanity after the fact. `/?demo=1` puts a fixed board up with no database at all, for design work.

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
| board | `src/app/board.tsx` | the wall: scroll, drag-to-pan, step back, framing, tying, polling, wall furniture |
| note | `src/app/note.tsx` | one pinned sheet, its stamps as ink, and the tray you get when you pick it up |
| string | `src/app/strings.tsx` | the SVG yarn layer, sag and all |
| compose | `src/app/compose.tsx` | the blank sheet you write the rumour on |
| wall geometry | `src/lib/wall.ts` | bounds, landing scale, pin points, string paths. Pure functions, no DOM |
| paper | `src/lib/paper.ts` | which stock, tilt, pin and width a note gets, derived from its id |
| aging | `src/lib/aging.ts` | note age → visual bucket |
| submit api | `src/app/api/submit/route.ts` | the gate: fails closed in prod, rate-limits per action, Turnstile-checks, publishes |
| rate limits | `src/lib/ratelimit.ts` | three buckets priced by cost: notes 5, strings 15, stamps 60, per 10 min per IP |
| admin | `src/app/admin/` | secret-gated live board: edit in place, remove, sign out |
| db | `src/lib/db.ts` | lazy Neon client + self-creating schema (`nodes`, `edges`, `reactions`) |
| queries | `src/lib/queries.ts` | public board read + the moderator's live-board read |
| topics | `src/lib/topics.ts` | the topic list, patch coordinates, and collision-aware placement |
| demo board | `src/lib/demo.ts` | `/?demo=1` in development: a fixed board with no database, for design work and for re-shooting the link preview |
| design system | `src/app/globals.css` | the whole visual system, documented in the header comment |

Design intent lives in [`PRODUCT.md`](PRODUCT.md); the palette, paper stocks and type
pairing are documented at the top of `globals.css`. Read both before restyling anything.

**Stack:** Next.js 16 · React 19 · anime.js · Neon Postgres · Upstash · Cloudflare Turnstile · TypeScript

---

<div align="center">

**[Nick Trimandylis](https://github.com/nitrimandylis)**

`THE STRING CONNECTS EVERYTHING — THE QUEUE DECIDES WHAT YOU SEE`

</div>
