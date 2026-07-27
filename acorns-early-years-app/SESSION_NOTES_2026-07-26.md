# SESSION_NOTES_2026-07-26

> ✅ **FILED TO CLICKUP** as page `SESSION_NOTES_2026-07-26` (page id `8ckxy74-13959`) in doc `8ckxy74-573`, the authoritative session-notes store. This file is the GitHub mirror. The ClickUp copy is slightly fuller — it includes D12/D13/D14, added after this file was first written.

Kickoff session for a new personal/R&D project: a kids money app for Danielle's 10-year-old son, modeled on Acorns Early (formerly GoHenry). Session ran remotely (Claude Code on the web, no local machine and no Drive mount), so **all artifacts live in GitHub, not Drive**.

## Context Loaded

* Repo `lprds/lprds.github.io`, branch `claude/acorns-early-years-app-ltfjmh`.
* Project `CLAUDE.md` (LPR global rules, ClickUp workspace 9013491940, GitHub org lprds).
* Skills invoked: `kickoff-interview` (the session's spine), `finding-session-notes` (to locate the authoritative notes store).
* Web research on Acorns Early — App Store, Google Play, and acorns.com feature pages.

## Work Done This Session

* **Researched Acorns Early end to end.** Rebranded from GoHenry after Acorns acquired it; ages 6–18. Features: chores/allowance with scheduled auto-payout, savings goals with target dates + autosave (parent can lock/unlock), Money Missions (videos + quizzes earning XP, badges, and bonus cash), real debit card, spend limits/card lock/real-time alerts, round-ups, and parent-paid interest. Pricing $8/mo Lite (up to 4 kids) / $12/mo Gold.
* **Disambiguated the product.** "Acorns Early Years" matches two different things — the US kids money app, and UK nursery/EYFS milestone-tracker apps. Confirmed with Danielle it's the money app.
* **Ran the full 14-question kickoff interview**, all four phases, no questions skipped.
* **Ruled out the debit card permanently** — issuing a card is money transmission (KYC, BaaS partner, state MTL licensing). Established the virtual-ledger model instead, which Danielle confirmed is what she wants anyway.
* **Computed the build economics** when Danielle asked for the math before setting a ceiling (see Decisions).
* **Wrote three artifacts to GitHub** — handoff, synthesis, verbatim transcript. Transcript was appended and committed after every single Q&A, so an early stop would still have left a complete record.
* **Created ClickUp list** "Kids Money App (Acorns Early-style)" in the Claude CoWork Projects space (901313736752) — list ID `1000450000004370`.

## Code Generated

None. Kickoff only — no Supabase project, no schema, no application code. A proposed data model is specified in `HANDOFF.md` §6 but has **not** been applied.

## Issues Encountered

| Issue | Root Cause | Resolution | Status |
| ---| ---| ---| --- |
| Voice dictation garbled several answers badly | Danielle answering by voice; "he's ten" came through as "he said an eight", "very rarely handles cash" as "very very rich is anything with cash" | Recorded verbatim per skill rules, then captured her correction as a separate labeled entry rather than silently rewriting | Fixed |
| Claude mis-read the product shape | Inferred from "I want him to learn what a ledger is" that the transaction register should be the hero screen | Danielle corrected: register is a drill-down, hero is balance + "what can I earn this week." Corrected in transcript and all downstream docs | Fixed |
| `clickup_list_document_pages` on doc 8ckxy74-573 exceeded the token limit (71.5k chars, 632 pages) | Doc has accumulated 632 pages including heavy duplication | Queried the saved JSON with `jq` instead of reading the tool output | Workaround |
| WebFetch 403'd on apps.apple.com, play.google.com, acorns.com, greenlight.com | Bot protection on all four | Used WebSearch result summaries instead; sufficient for feature-level research | Workaround |
| Could not file this session note, or seed the ClickUp list with tasks | ClickUp MCP server disconnected and reconnected mid-session under a new server ID; its write tools now require an approval this non-interactive session cannot prompt for | Session note saved to the repo instead; list creation had already succeeded before the reconnect | **Open** |

## Dead Ends / Don't Repeat

* **Don't WebFetch app-store or acorns.com pages** — all 403. WebSearch summaries carry enough feature detail.
* **Don't call `clickup_list_document_pages` on 8ckxy74-573 expecting readable output** — 632 pages blows the token limit. Pipe the saved result through `jq`.
* **Don't assume "Acorns Early Years" means the money app** — the UK nursery/EYFS reading is real and would have produced an entirely different product. Ask.
* **Don't infer product shape from a stated learning goal.** "I want him to learn what a ledger is" does not mean "make the ledger the landing screen." Cost one wrong design read.
* **The duplicate-session-notes problem is still live** — 17 duplicate `SESSION_NOTES_2026-07-24` pages exist in doc 8ckxy74-573. Not addressed this session; still open from 2026-07-24.

## Decisions Made

* **Virtual ledger only — no debit card, no money movement, ever.** Money stays in an account Danielle controls; her son never receives it and has no card (their location largely doesn't take them). **Spending is a request he submits and she approves**, which posts the debit.
* **Hero page = balance + "what can I earn this week."** Register is a drill-down. Kid app is a game; parent app is a dashboard; one shared ledger. (Danielle's correction.)
* **Multi-tenant from day one** — household-scoped rows, because this may become an LPR product.
* **Stack: GitHub Pages static front end + Supabase** (Postgres, Auth, RLS). Decided by Claude, not asked, per the skill's technical-mechanics rule.
* **Hard week-one constraint: two logins, hosted, synced.** Danielle and her son are in **separate households for ~2 months**, which disqualifies any single-device build.
* **v0.1 = balance + register + recurring tasks + parent approval.** Goals, one-offs, spend requests, interest, and lessons are pass 2 — with savings goals flagged as the highest-value deferred item.
* **Four non-negotiables:** ledger correctness, auth strength, no duplicate payouts, and engagement. Danielle added the fourth: "not engaging enough for him to even care" is a major fail. Payout idempotency is enforced by DB unique constraints, not UI.
* **CSV ledger export is a hard requirement** — abandonment means settling the balance and exporting.
* **COPPA deferred**, gated on the app proving engaging. Building **data-minimal anyway** (first name only, no kid email, parent creates the account) so COPPA later is paperwork, not a schema rewrite.
* **Kill criteria: he rejects it in ~2 weeks → iterate with him, not abandon.** This build is itself a trial run for whether paid Acorns is worth it. Her son is a design stakeholder.
* **Cost bucket: speculative R&D, hours logged. Sign-off: Danielle only. Ceiling: 15 hours.**
* **Economics computed:** household-only break-even is 11.5 hrs (full 6→18 span at $12/mo), 7.7 hrs (her son 10→18 at $12/mo), or 5.1 hrs (at $8/mo Lite), against $150/hr. Product side: at $6/mo priced and ~$4/mo net, a 40-hr ($6,000) build needs ~1,500 family-months — ~125 paying families for a year. Claude recommended ~8 hrs; **Danielle set 15**, explicitly buying option value on the product bet.

## Open Items / Next Session Starts Here

1. **File this note as a page in ClickUp doc `8ckxy74-573`** — blocked this session by the MCP approval issue above.
2. **Seed ClickUp list `1000450000004370` with the tasks below** — also blocked. Suggested tasks: (a) reconcile data model vs accounting platform, (b) name the app, (c) collect chore list + amounts + cadence, (d) stand up Supabase, (e) build v0.1, (f) enable time tracking.
3. **Reconcile the proposed data model against the LPR/TFE accounting platform docs in Google Drive** — Danielle flagged the shared ledger/transaction concepts and said explicitly *don't divert* during kickoff. Do this **before writing any schema**. Drive MCP access is available.
4. **Name the app** — no name chosen.
5. **Collect the actual chore list, dollar amounts, and payout cadence** from Danielle. Without these, v0.1 is a shell.
6. **Stand up Supabase**: project, schema, RLS, seed household. Data model is in `HANDOFF.md` §6 — including the two unique constraints (`task_completions(task_id, period_key)` and `transactions(source_type, source_id)`) that enforce the no-duplicate-payouts requirement.
7. **Build v0.1 against the 15-hour ceiling** — hold it; there is no hard kill switch, so the ceiling is the only spend discipline in place.
8. **Unanswered from the interview** (do not invent): whose experience must be great, kid's or parent's (Q1 half); what shipping unlocks beyond the maybe-product angle (Q6); product economics — whether anyone would pay and at what price.
9. **Optional:** mirror the GitHub artifacts into Drive `Claude Cowork/` if Danielle wants them there — offered, not yet done.

## Where Everything Lives

**GitHub — the only copy of the project artifacts. Nothing was written to Drive.**

* Repo `lprds/lprds.github.io`, branch **`claude/acorns-early-years-app-ltfjmh`** (not `main`), folder **`acorns-early-years-app/`**:
  * `HANDOFF.md` — start here; opens with an explicit locations block and copy-paste git commands
  * `KICKOFF_SYNTHESIS_acorns-early-years-app_2026-07-26.md`
  * `INTERVIEW_TRANSCRIPT_acorns-early-years-app_2026-07-26.md`
  * `SESSION_NOTES_2026-07-26.md` — this file
* Browse: https://github.com/lprds/lprds.github.io/tree/claude/acorns-early-years-app-ltfjmh/acorns-early-years-app
* ClickUp list: https://app.clickup.com/9013491940/v/l/li/1000450000004370 (created, empty)
