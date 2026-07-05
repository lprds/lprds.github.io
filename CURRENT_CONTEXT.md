# CURRENT CONTEXT — "Ask Danielle" / Personal AI Clone

> Session notes so this work can be picked up on any machine. This file is
> auto-read at the start of Claude Code sessions (see CLAUDE.md global rules).

- **Project:** Build a "clone of Danielle" — an AI resource clients (Schubaum,
  Rosanna, others) can talk to when they can't reach Danielle directly. It
  answers the way she would, grounded in her real materials, and escalates
  anything uncertain to the real Danielle instead of guessing.
- **Repo / branch:** `lprds/lprds.github.io` on `claude/personal-ai-clone-uoeskx`
- **Last updated:** 2026-07-05 (second session — local machine)
- **Status:** Danielle answered the 3 decisions. Backend ("brain") built as an n8n
  webhook workflow on the Railway instance; front-end rewired to it with per-client
  access codes. Next: voice-tuning from Fathom transcripts, real-question testing,
  then go-live (merge to main + send private links).

---

## Where things stand

### Built & pushed (on branch `claude/personal-ai-clone-uoeskx`)
- **`ask.html`** — branded (LPR red) "Ask Danielle" chat page. Mobile-friendly,
  starter questions, honest "Danielle's AI assistant" framing, and the
  **"🔖 Flagged for Danielle"** escalation UI already wired in. Runs in a
  friendly "almost ready" preview mode until `BACKEND_URL` is set at the top of
  the file.
- **`CLONE_PLAN.md`** — full architecture + safety design + status checklist.

### The 3 decisions — ANSWERED by Danielle 2026-07-05
1. **Identity** — introduces itself as **Danielle's virtual assistant**: answers
   questions directly, and passes anything unresolved to Danielle personally.
2. **Interface** — private chat link (Danielle: "what I said for one answers this").
3. **Knowledge** — tone from Fathom transcripts; substance = deep product expertise
   in the client tech stack: Sage, QBO, QBDT Pro & Enterprise, ADP, QuickBooks Time,
   Paychex, Xero, plus full Microsoft 365 and Google Workspace. Delivered via
   Claude's product knowledge (not a hand-scraped corpus). Client-specific records
   deliberately stay OUT of the knowledge layer — those questions always escalate.

### Built this session (2026-07-05, local)
- **Backend**: n8n workflow "Ask Danielle — Client Chat Backend" on the Railway
  instance (webhook path `/webhook/ask-danielle`). Chosen over Cloudflare/Supabase
  because n8n already holds the Anthropic credential (zero new key handling) and
  escalations reuse the LPR Slack notification path. Flow: validate → access-code
  check (`ask_danielle_clients` data table) → Claude (claude-sonnet-4-6, escalation
  rules in system prompt) → truncation-tolerant parse → log (`ask_danielle_log`) →
  escalation queue (`ask_danielle_escalations`) + Slack ping → respond.
- **Front-end** rewired: virtual-assistant framing, product starters, `?code=`
  per-client access codes, BACKEND_URL set. Pilot code `LPR-PILOT-4482` for testing.

### Voice tuning + testing (done later on 2026-07-05)
- Voice profile extracted from ~20 redacted Fathom transcripts; system prompt now
  v2.2: voice-tuned + hybrid-escalation (answer mechanics AND flag decisions) +
  consistency rule + sentinel output format (ESCALATE: line, no JSON — the JSON
  format truncated replies containing quote marks).
- Parse node has a CODE-LEVEL safety net: any reply that promises Danielle's
  involvement is force-flagged escalate=true regardless of the model's flag.
- Two full 26-question batteries run (real scrubbed client questions from
  transcripts). All 10 must-escalate questions passed to Danielle in BOTH rounds
  (rates, 1099, tax, client books). Zero truncated/errored replies in round 2.
- Review deliverable for Danielle: `Claude Cowork/Ask Danielle/Ask Danielle —
  Test Round Review.pdf` (19 pp, visually proofed). Awaiting her 3 verdicts:
  voice / escalation wording / which clients get links first.

### Remaining before go-live (gated on Danielle's review verdicts)
- Apply any voice/escalation adjustments she requests.
- Create dedicated Slack escalations channel (alerts currently post to
  #buildideas) and repoint the Slack Alert node.
- Issue per-client access codes in `ask_danielle_clients`; deactivate pilot code.
- Merge branch to `main` so GitHub Pages serves ask.html publicly; verify live
  page end-to-end; send private links.

### Open blocker to watch
- One MCP connector still needs authorization (showed as needing sign-in).
  Not blocking yet; authorize via claude.ai connector settings or `/mcp` in an
  interactive session if we hit it.

### The core safety principle (Danielle's top priority: fewest mistakes)
It only asserts when genuinely echoing what Danielle has actually said/written.
When unsure — or on money / contract / legal questions — it does NOT guess; it
tells the client "let me make sure Danielle sees this one" and queues the
question for her. Every unknown becomes a quick question for the real Danielle
instead of a wrong answer. All conversations logged & reviewable.

---

## Full chat transcript

### Danielle
> i really need to figure out how to clone myself, um, i don't know even what
> that means right now well i do know what that means right now i need to clone
> myself because i need to have more than one me answering the questions that
> shoe bomb has that rosanna has that my clients have i, uh, don't have enough
> time to answer all this stuff every week um you see how many meetings i have by
> the fathom records and my zoom records and, um, it's just not enough time for
> all the clients so i need to figure out how to clone myself so that, um, I can
> give these people, uh, a resource that, um, will give the exact same answers as
> me to all the questions that they have. Um, and it needs to be solid and, you
> know, I know that I can personally make mistakes. Anybody can. So, um, we wanna
> try and figure out how to make the least amount of mistakes and give the least
> amount of of advice that's not as Yeah. Anyway, so, um, you know what I mean?
> So this is what this is what, um, I just... this is what I need to do, and I I
> need you to help me do it, like, with agents, with, um, with skills, with
> something that can connect... that I can connect to the outside world with some
> sort of interface for, um, Ruthanne and Schubaum and my clients to interact
> with when they can't speak to me directly face to face. And, um, it has to seem
> like it's coming from me. So, I don't know. This is this is gonna be
> interesting. I'll say that.

### Claude
Reflected back the goal: a "you" clients can talk to that answers the way
Danielle would, knows what she knows, and doesn't hand out advice she wouldn't
stand behind. Explained the honest shape of the build in three parts:
1. **It learns from the real you** — Fathom calls, emails, docs (grounded in her
   actual answers, not generic AI).
2. **It answers in her voice through an interface clients can reach** — simplest
   is a private chat link, branded like LPR.
3. **The anti-bad-advice guardrail** — when unsure it stops and says "let me make
   sure Danielle sees this one," dropping the question into a list for her.

Noted the site is currently a static placeholder (can't safely hold the "brain"
alone) but Cloudflare + Supabase are already connected, which host the secure
part. Then posed the 3 decisions (identity / interface / knowledge sources).
[An interactive question prompt was attempted but the session went
non-interactive and connected tools briefly dropped, so the questions were
restated in plain text.]

### Claude (continued — after building)
Proceeded on recommended defaults to make concrete progress: built `ask.html`
(chat front-end) and `CLONE_PLAN.md`, committed and pushed to the branch.
Summarized what was built, re-explained the safety net, and restated the 3
decisions plus the next build step (stand up the backend once decisions land).

### Danielle
> Can you log this including the full chat to the session notes so I can pick it
> up on my computer?

### Claude
Wrote this `CURRENT_CONTEXT.md` (auto-read at session start), committed, and
pushed to the branch so it's available on her computer.

---

## How to resume on your computer
1. Pull the branch: `git fetch origin && git checkout claude/personal-ai-clone-uoeskx`
2. Open `ask.html` in a browser to see the chat page (preview mode).
3. Read `CLONE_PLAN.md` for the full plan, and this file for status.
4. Answer the 3 decisions above → next step is standing up the backend.
