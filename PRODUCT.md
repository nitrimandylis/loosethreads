# Product

## Register

product

## Users

A friend group first, then whoever they forward the link to. Most arrive from a group chat, on a phone, with zero context: they were sent a link and they tap it. Sessions are short and social. Nobody makes an account, nobody comes back daily, and nobody reads instructions.

Two roles:

- **Visitors** (everyone): read the board, pin a note into a topic, tie red string between two notes, stamp a note. Everything they submit waits in a queue.
- **The moderator** (Nick, one person, `ADMIN_SECRET`): approves, edits, or rejects everything before it goes public. This is a chore, and it should be fast.

## Product Purpose

A single infinite corkboard for anonymous gossip, pinned into topic regions and connected with red string. It exists because the conspiracy-wall bit is funny when the conspiracy is who fancies who.

Success is that someone screenshots the board into a chat and it reads as a real detective wall. That makes the visual payoff a product requirement, not decoration: any state a visitor can land on should be worth screenshotting, including an empty one.

Pre-moderation is non-negotiable. Anonymous plus gossip plus a link that travels means nothing goes public without a human approving it.

## Brand Personality

Paranoid, handmade, funny. The joke is total forensic seriousness applied to trivia. Voice is deadpan and clipped, the way case-file labels are, and never winks at itself; the gap between the gravity of the presentation and the pettiness of the content is where the humour lives.

Everything should look assembled by a person at 2am: crooked, uneven, physically layered. Nothing should look generated, aligned, or componentised.

## Anti-references

- **A node editor.** Figjam, Miro, n8n, and React Flow's own defaults: dot grids, floating toolbars, a minimap parked in the corner, handles that read as ports. The app currently looks like this and it is the main problem to solve.
- **A generic AI-made dark SaaS app.** Slate cards, `rounded-2xl` on everything, a soft glow, one purple accent, Inter throughout.
- Anything that reads as a tidy grid of equal cards, or as a social feed with counts and avatars.

## Design Principles

1. **The screenshot is the deliverable.** Judge every state by how it looks pasted into a group chat, empty board included.
2. **Handmade, never generated.** Irregularity is the signature: crooked pins, uneven paper, no two notes identical. Symmetry and uniform spacing are bugs.
3. **Zero context required.** A stranger landing cold should understand what this is and how to add to it without reading anything longer than a label.
4. **The tool disappears.** Interaction reads as physical (pin it, tie it, stamp it), never as operating a graph editor. Canvas chrome earns its place or it goes.
5. **Legible beats atmospheric.** Aging, texture, and grain stop where they start costing readability. The gossip is the content; the wall is the frame.

## Accessibility & Inclusion

Legible first:

- Note body text meets 4.5:1 against its paper, including the oldest, most faded notes. The aging treatment is capped so it never crosses that line.
- `prefers-reduced-motion` is respected everywhere, with a crossfade or instant state instead of movement.
- Primary actions are at least 44px on touch; reaction stamps, being secondary and four to a note, sit at 36px. Every action available by drag has a tap path, since drag-to-connect is unusable one-handed.
- Colour is never the only carrier of meaning (approved vs pending, fresh vs old).
