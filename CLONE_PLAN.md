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

2. **The brain** — a secure backend (not built yet; needs your OK)
   A Cloudflare Worker *or* Supabase Edge Function that:
   - holds the Claude API key (a static site can't do this safely),
   - retrieves the most relevant pieces of *your* knowledge for each question,
   - asks Claude to answer **in your voice, using only what it found**,
   - returns a confidence signal so low-confidence answers get flagged, not sent as fact.
   You already have **Cloudflare and Supabase connected**, so this is a short step.

3. **The memory** — your knowledge base
   Your real materials, converted into searchable form the brain pulls from:
   - Fathom meeting recordings/transcripts *(how you actually explain things)*
   - Past client emails (Gmail)
   - ClickUp docs & notes
   - Google Drive documents

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

- [x] Chat front-end (`ask.html`) — branded, mobile-friendly, with the "flagged for
      Danielle" escalation UI already wired in.
- [ ] Decide identity framing, primary channel, and knowledge sources *(3 questions
      posed to Danielle — recommended defaults assumed for now: AI-in-your-voice, private
      chat link, all four sources).*
- [ ] Stand up the secure backend (Cloudflare Worker or Supabase Edge Function).
- [ ] Add the Claude API key to the backend (Danielle provides once; never pasted in chat).
- [ ] Build knowledge ingestion from the chosen sources → searchable store.
- [ ] Tune the "voice of Danielle" system prompt + the escalation threshold.
- [ ] Build the escalation queue (where flagged questions land for Danielle).
- [ ] Private-link / access control so only invited clients can use it.
- [ ] Test with a handful of real past questions before sharing the link.

## What I need from Danielle to move to the next step

1. Answers to the three questions (identity / channel / knowledge sources).
2. A go-ahead to create the backend (Cloudflare Worker vs Supabase — I'll recommend one).
3. A Claude API key added to the backend's secrets when we get there (not in chat).

---

*The chat page runs in a friendly "almost ready" preview mode until the backend URL is
filled in at the top of `ask.html`.*
