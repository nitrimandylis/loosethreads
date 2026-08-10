# Product

## Register

product

## Users

A friend group first, then whoever they forward the link to. Most arrive from a group chat, on a phone, with zero context: they were sent a link and they tapped it. Sessions are short and social. Nobody makes an account, nobody comes back daily, and nobody reads instructions.

Two roles:

- **Visitors** (everyone): read the board, pin a rumour into a topic, tie red string between two notes, stamp a note. Everything they submit is public immediately.
- **The moderator** (Nick, one person, `ADMIN_SECRET`): can edit or remove anything that is already on the board. Nothing waits for him.

## Product Purpose

One corkboard for anonymous gossip, pinned into topic patches and connected with red string. It exists because the conspiracy-wall bit is funny when the conspiracy is who fancies who.

Success is that someone screenshots the board into a chat and it reads as a real detective wall. That makes the visual payoff a product requirement, not decoration: any state a visitor can land on should be worth screenshotting, including an empty one.

## Publishing model

**Everything publishes instantly.** There is no queue and no approval step.

This was a deliberate reversal. The board previously pre-moderated every note and string, and that is most likely why it stayed empty: you post a rumour, nothing appears, you close the tab. For a toy your friends open once from a group chat, a queue between them and the payoff is the largest tax the product can charge.

What replaces it:

- **Takedown, not review.** `/admin` lists what is live, newest first, and can edit a note in place or remove it. Removal is soft (`status='removed'`) and the public read already filters on `approved`, so a removed note and its strings disappear together.
- **The gate is the only guard.** A per-IP rate limit and a Cloudflare Turnstile check are now the entire defence. Both used to fail open when unconfigured, which was safe when a human queue backstopped them. In production they now **fail closed**: if the gate is not configured, submissions are refused. If the environment is wrong, nobody can post, rather than anybody being able to post anything at any rate.

### Accepted tradeoffs

Written down because they were chosen, not overlooked:

- **Nothing surfaces problems.** There is no report button and no notification. The moderator finds out that something needs removing when a person tells him. The board carries a link to the repo so a stranger has somewhere to go.
- **No record is kept.** Editing overwrites what the person originally wrote, and there is no audit of what was edited or removed. The board is what it is right now.
- **Nothing is automatic.** No cron, no expiry, no auto-approval, no filtering. The board only changes when a person does something to it.

## Brand Personality

Paranoid, handmade, funny. The joke is total forensic seriousness applied to trivia. Voice is deadpan and clipped, the way case-file labels are, and never winks at itself; the gap between the gravity of the presentation and the pettiness of the content is where the humour lives.

The absence of moderation is part of the bit rather than a disclaimer. The board says "nobody is checking this" in the same flat voice it says everything else.

Everything should look assembled by a person at 2am: crooked, uneven, physically layered. Nothing should look generated, aligned, or componentised.

## Anti-references

- **A node editor.** Figjam, Miro, n8n, and React Flow's own defaults: dot grids, floating toolbars, a minimap parked in the corner, handles that read as ports.
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
