# Product

## Register

product

## Users

A friend group first, then whoever they forward the link to. Most arrive from a group chat, on a phone, with zero context: they were sent a link and they tapped it. Sessions are short and social. Nobody makes an account, nobody comes back daily, and nobody reads instructions.

Two roles:

- **Visitors** (everyone): read the board, pin a rumour, tie red string between two notes, stamp a note. Everything they submit is public immediately. What they created from this browser stays theirs to manage: take a note down, reword it, untie a string, take a stamp back. Anyone can also drag any note around their own view of the wall; nobody else sees that.
- **The moderator** (Nick, one person, `ADMIN_SECRET`): can edit or remove anything that is already on any board, public or private. Nothing waits for him.

## Product Purpose

One corkboard for anonymous gossip, connected with red string. It exists because the conspiracy-wall bit is funny when the conspiracy is who fancies who.

**There are no sections.** The board used to be six topic patches, which meant most of it was empty cork most of the time, a busy topic had nowhere to grow, and posting started with a taxonomy question asked of someone who came here to say one thing. There is one wall now. It grows as notes land on it and stays equally dense at any size, string is the only structure on it, and the props (the wordmark, the rules card, a redacted photograph, a piece of a map) are what make an empty one still somebody's wall.

Success is that someone screenshots the board into a chat and it reads as a real detective wall. That makes the visual payoff a product requirement, not decoration: any state a visitor can land on should be worth screenshotting, including an empty one.

## Publishing model

**Everything publishes instantly.** There is no queue and no approval step.

This was a deliberate reversal. The board previously pre-moderated every note and string, and that is most likely why it stayed empty: you post a rumour, nothing appears, you close the tab. For a toy your friends open once from a group chat, a queue between them and the payoff is the largest tax the product can charge.

What replaces it:

- **Takedown, not review.** `/admin` lists what is live, newest first, and can edit a note in place or remove it. Removal is soft (`status='removed'`) and the public read already filters on `approved`, so a removed note and its strings disappear together.
- **A per-IP rate limit is the only guard.** It is the entire defence: nothing is reviewed before it publishes and there is no bot check. It counts in the same Postgres the notes live in, so there is no configuration that can be half done. If the database is reachable the limit is enforced, and if it is not, the board does not work at all.

  This replaced a Cloudflare Turnstile check and a Redis-backed limiter that both failed open when unconfigured, then both failed closed once nothing queued behind a moderator. Failing closed meant a missing environment variable turned the live board read-only, which is a strange way for a toy to break. Counting in the database it already depends on removes the failure mode rather than choosing which way it falls.

  What that costs is real and accepted: a script can post at exactly the limit, forever, from as many addresses as it has. The ceiling on the damage is the bucket size and the takedown console, not prevention.

### Yours to manage

Everything a browser creates comes back with a secret (one random UUID per row) that only that browser is ever told. It is kept in localStorage and repeated to `/api/manage` to take a note down, reword it, untie a string, or take a stamp back. No accounts, no sessions, nothing that identifies a person, and nothing marks a note as yours to anyone else. Clear your browser data and your notes become as permanent as everyone else's; that is the deal.

Rearranging is different: dragging a note (mouse: drag it; touch: hold to lift) moves it only in your own view, kept in sessionStorage so a closed tab straightens the wall back out. The shared wall never learns about it.

## Private boards

`/` is the public wall. `/b/<slug>` is somebody else's, and it opens with a shared word.

This exists because the first person who wanted one did not want her friends' gossip mixed into a board strangers can reach. The link alone is not enough: an unguessable slug gets you to the gate, and the passphrase gets you past it, so a link forwarded out of the group chat it was meant for does not carry access with it.

- **A word, not an account.** Nobody makes an account for a private board either. The word is told to people in person, and everyone who has it is the same anonymous visitor they are on the public wall.
- **The gate covers the routes, not just the page.** Reads and writes both check it. A locked board renders no notes into its HTML, and `/api/submit` refuses a slug the caller has not opened, which is what stops a known slug being posted to from outside.
- **Guessing is rate limited.** Unlock attempts count in the same Postgres bucket as everything else. A shared word is only as private as the number of tries somebody gets at it.
- **Two ways to close a board again.** Replacing the passphrase changes the word; signing everyone out leaves the word alone and invalidates every cookie, so the people inside have to type it again. Both are buttons in `/admin`.
- **Boards are made in `/admin`.** There is no self-serve "start a board" on the public wall. One person has asked for one; that is one route to add on the day a second person does.
- **Private from the internet, not from the moderator.** `/admin` switches between every board and can edit or remove on any of them. Whoever holds `ADMIN_SECRET` owns the database and can read all of it. Anyone putting something on a private board should know that.

### Accepted tradeoffs

Written down because they were chosen, not overlooked:

- **Nothing surfaces problems.** There is no report button and no notification. The moderator finds out that something needs removing when a person tells him. The board carries a link to the repo so a stranger has somewhere to go.
- **No record is kept.** Editing overwrites what the person originally wrote, and there is no audit of what was edited or removed. The board is what it is right now. Owner rewords are the same: no history.
- **A removed string can be re-tied.** Untying works by letting a re-tie revive the pair, which also means a string the moderator removed comes back if any visitor ties the same two notes again. Removed notes are not affected; they refuse new strings entirely.
- **A private board's link preview says nothing.** Pasting `/b/<slug>` into a chat previews as "a board" with no image of the wall, because the preview renders for everybody the link reaches, including before anyone has typed the word.
- **Not in search results.** `robots.ts` asks every crawler to stay out. A stranger should arrive here because somebody forwarded them the link, not because they searched a person's name, and nothing on the wall is verified enough to deserve permanent attachment to anybody. It is a request rather than a control: the board stays fully public to anyone holding the URL.
- **Nothing is automatic.** No cron, no expiry, no auto-approval, no filtering. The board only changes when a person does something to it.

## Brand Personality

Paranoid, handmade, funny. The joke is total forensic seriousness applied to trivia. Voice is deadpan and clipped, the way case-file labels are, and never winks at itself; the gap between the gravity of the presentation and the pettiness of the content is where the humour lives.

The absence of moderation is part of the bit rather than a disclaimer. The board says "nobody is checking this" in the same flat voice it says everything else.

Everything should look assembled by a person at 2am: crooked, uneven, physically layered. Nothing should look generated, aligned, or componentised.

## Anti-references

- **A node editor.** Figjam, Miro, n8n, and React Flow's own defaults: dot grids, floating toolbars, a minimap parked in the corner, handles that read as ports. (React Flow does power the viewport now, chosen for how panning and zooming feel; every default listed here stays off, and nothing on screen is its.)
- **A generic AI-made dark SaaS app.** Slate cards, `rounded-2xl` on everything, a soft glow, one purple accent, Inter throughout.
- Anything that reads as a tidy grid of equal cards, or as a social feed with counts and avatars.

## Design Principles

1. **The screenshot is the deliverable.** Judge every state by how it looks pasted into a group chat, empty board included. That includes the link preview, which is the one image everybody the link reaches will see.
2. **Handmade, never generated.** Irregularity is the signature: crooked pins, uneven paper, no two notes identical. Symmetry and uniform spacing are bugs.
3. **Zero context required.** A stranger landing cold should understand what this is and how to add to it without reading anything longer than a label.
4. **The tool disappears.** Interaction reads as physical (pin it, tie it, stamp it), never as operating a graph editor. Canvas chrome earns its place or it goes.
5. **Legible beats atmospheric.** Aging, texture, and grain stop where they start costing readability. The gossip is the content; the wall is the frame.
6. **No friction between wanting to post and having posted.** This is what the queue cost and what instant publishing buys. Anything that reintroduces a wait needs to justify itself against it.

## Accessibility & Inclusion

Legible first:

- Note body text meets 4.5:1 against its paper, including the oldest, most faded notes. The aging treatment is capped so it never crosses that line.
- `prefers-reduced-motion` is respected everywhere, with a crossfade or instant state instead of movement.
- Primary actions are at least 44px on touch; reaction stamps, being secondary and four to a note, sit at 36px. Controls on the wall counter-scale the board zoom, so a stamp is a real 36px target however far out the board is.
- Colour is never the only carrier of meaning.
