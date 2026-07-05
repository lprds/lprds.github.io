# "Ask Danielle" — Plan & Status

Goal: a resource clients (Schubaum, Rosanna, and others) can talk to when they can't
reach Danielle directly. It answers the way Danielle would, grounded in her real
materials, and **escalates anything it's unsure about to the real Danielle instead of
guessing** — so it makes the fewest possible mistakes.

---

## How it works (three parts)

1. **The face** — `ask.html`
   A branded chat page you share a private link to. Already built (this branch).
   Static, hosted on GitHub Pages. Talks to the backend below.

2. **The brain** — an n8n webhook workflow on the Railway instance
   *(Decided 2026-07-05 — chosen over Cloudflare Worker / Supabase Edge Function because
   n8n already holds a working Anthropic credential — no new API-key handling — and
   escalations ride the existing LPR Slack notification path.)*
   Workflow "Ask Danielle — Client Chat Backend":
   - validates the client's private access code (n8n data table),
   - asks Claude (claude-sonnet-4-6) to answer as Danielle's **virtual assistant**,
   - returns `{reply, escalate}` — uncertain/sensitive questions are never guessed,
   - logs every exchange; escalations also land in a queue table + Slack ping to Danielle.

3. **The knowledge** *(decided 2026-07-05)*
   - **Tone** comes from Danielle's Fathom transcripts (voice-tuning pass — next step).
   - **Substance** is deep product expertise in the client tech stack: QBO, QBDT Pro &
     Enterprise, QuickBooks Time, Sage, Xero, ADP, Paychex, Microsoft 365, Google
     Workspace — delivered via Claude's product knowledge (+ live vendor-doc lookup
     later if currency becomes an issue), NOT a hand-built corpus.
   - **Client-specific records stay out of the knowledge layer entirely** — questions
     about a client's own books/amounts/deadlines always escalate to Danielle. This is
     deliberate: it eliminates cross-client PII/data-leak risk by design.

---

## The safety net (your top priority: fewest mistakes)

- **Grounded, not freestyling.** It answers from *your* retrieved materials, not generic
  AI knowledge. No source = it doesn't assert.
- **"Let me check with Danielle."** When confidence is low, or a question touches legal /
  financial / contractual weight, it does **not** invent an answer. It tells the client
  it's flagging the question and drops it into a queue for you.
- **Everything is reviewable.** Every conversation is logged so you can see what "you"
  told people and correct course.
- **Honest framing.** It presents as *Danielle's AI assistant, in her voice* — trusted
  and clearly not a deception, which protects you if it's ever wrong.

---

## Status

- [x] Chat front-end (`ask.html`) — branded, mobile-friendly, escalation UI wired in.
- [x] Decisions from Danielle (2026-07-05): **identity** = "Danielle's virtual assistant"
      (answers directly, passes unresolved questions to her); **channel** = private chat
      link (implied by identity answer); **knowledge** = Fathom-derived tone + deep
      product expertise (QBO / QBDT Pro & Enterprise / QB Time / Sage / Xero / ADP /
      Paychex / MS 365 / Google Workspace).
- [x] Backend platform decided: n8n webhook workflow on Railway (reuses existing
      Anthropic credential — no new API-key handling needed anywhere).
- [x] Front-end rewired: virtual-assistant framing, product-question starters,
      `?code=` access-code links, `BACKEND_URL` pointed at the n8n webhook.
- [ ] Backend workflow built + activated + tested (in progress 2026-07-05).
- [ ] Voice-tuning pass: refine the system prompt's tone section from real Fathom
      transcript excerpts (style only — no client content into the prompt).
- [ ] Per-client access codes issued (data table `ask_danielle_clients`); pilot code
      exists for testing.
- [ ] Test with a handful of real past client questions before sharing any link.
- [ ] Go-live: merge branch to `main` so GitHub Pages serves `ask.html`, then send
      private links to Schubaum / Rosanna.

## What I need from Danielle to move to the next step

1. Nothing blocking — build is proceeding on her 2026-07-05 answers.
2. Before go-live: her pass on test answers (does it sound like her, does it escalate
   the right things), and which clients get links first.

---

*Access control: each client gets `https://lprds.github.io/ask.html?code=<their-code>`.
Codes live in the n8n data table `ask_danielle_clients` and can be deactivated any time.
The backend rejects requests without a valid, active code — a bare link does nothing.*
