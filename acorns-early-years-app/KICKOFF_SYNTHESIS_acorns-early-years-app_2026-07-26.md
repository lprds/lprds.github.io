# Kickoff Synthesis — Acorns Early-style kids money app
_Interview date: 2026-07-26_

## Who & Why
- **Primary audience:** Danielle's household — her and her 10-year-old son. Built multi-tenant from day one because it may become an LPR product later. Whose experience must be great was not directly answered; the son's engagement is the stated make-or-break (see A8).
- **Problem (one sentence):** Teach her son to earn, track, and save money — plus financial lessons he earns money for completing — on a virtual ledger she settles from her own bank, without paying Acorns $12/month.
- **Why now:** He's 10, actively wants to buy things, and currently tracks everything in his head accurately. The gap is visibility and recall. Explicit learning goals: **what a ledger is** and **the concept of transactions**.

## Shape & Scope
- **v0.1 (smallest useful version):** Balance + transaction register + recurring tasks he checks off + parent approval of payouts. Plus three week-one constraints Danielle added: two separate logins, hosted and synced across devices, and a parent view of what she owes.
- **Replaces:** A live Acorns Early subscription (~$12/mo) **and** informal tracking (in-head / notes / envelope cash).
- **Unlocks:** Possible LPR product (from A1). Not separately explored — Q6 was not answered.
- **Deployment surface (decided, not asked):** Static front end on GitHub Pages in this repo + Supabase (Postgres, Auth, row-level security), household-scoped rows.

### Product shape (from Danielle's corrections)
- **Hero page = balance + "what can I earn this week."** Kid-enticing, not a bank statement.
- **Transaction register is a drill-down**, tapped into for "why did I get that / why did I spend that." Explicitly NOT the landing screen.
- **Recurring tasks and one-off jobs** he can request when he wants extra money for a specific thing.
- **Multiple named savings buckets** with very different horizons — a toy vs. flight school.
- **Saving must be incentivized**, not merely permitted. _Recommendation: parent-paid interest on goal balances._
- **Spending is a request, not a purchase.** He has no debit card and their location largely doesn't take them; money sits in an account Danielle controls. Required flow: kid submits spend request → parent approves/declines → approval posts the debit.
- **Ledger export (CSV)** is a hard requirement, for settling the outstanding obligation.

## Lifecycle & Risk
- **Can't-tolerate failure mode:** All of these, unranked — (1) ledger loses or miscounts money, (2) weak auth exposes a 10-year-old's data, (3) duplicate or unnoticed payouts. Danielle added a fourth: **"not engaging enough for him to even care"** — the only one that's a product risk rather than an engineering one.
- **Kill criteria:** He tries it ~2 weeks and rejects it. Response is **iterate, not abandon** — she'd ask him what he'd want differently rather than resubscribe. This build is itself a trial run for whether paid Acorns is worth it at all. The son is a design stakeholder.
- **6-month abandonment cost:** She'd need to **settle the balance and export the data**. No recurring cost accrues (GitHub Pages free, Supabase free tier).
- **PII posture:** COPPA compliance **deferred** — do not build now, keep in pipeline gated on the app proving engaging. A friends-and-family pilot with a couple of known families is a possible intermediate step. _Claude's decision: build data-minimal anyway — first name only, no kid email, parent creates the kid account — so COPPA later is paperwork, not a schema rewrite._ ⚠️ Revisit the COPPA gate before any pilot expands beyond a handful of known families.

## Logistics
- **Cost bucket:** Speculative R&D, **hours logged**, so true build cost is known if it's ever priced.
- **Reviewer / sign-off:** Danielle only.
- **Cost ceiling:** **15 hours** of her time. (Claude's math put household-only break-even at ~8 hrs; Danielle set 15, buying option value on the product bet.)

## Standing constraints from this session
- **Relates to the in-progress accounting platform** for Danielle and for TFE — likely shared ledger/transaction concepts. Reconcile the data model against it before finalizing. Explicitly NOT pursued this session ("don't divert").
- **Google Drive MCP access is available** in this session and can pull those accounting-platform docs when the time comes.
- **A detailed handoff file is a hard deliverable** so work resumes on her computer with zero re-asking. → `HANDOFF.md`

## Recommended Next Steps
1. Reconcile the proposed data model against the LPR/TFE accounting platform docs in Google Drive before writing schema.
2. Stand up Supabase project + schema + RLS, then build v0.1 against the 15-hour ceiling.
3. Create the ClickUp list in Claude CoWork Projects space (901313736752) and enable time tracking against it — name TBC.
4. Guardrails to bake in from the start: unique constraint on `(source_type, source_id)` for payout idempotency; data-minimal profile schema; CSV export from day one.

## Open / Skipped Questions
- **Q1 (second half):** Whose experience has to be great — kid's or parent's — never directly answered.
- **Q6:** What shipping unlocks beyond the maybe-LPR-product angle — not separately answered.
- **Q10 (cost half):** Answered by Claude ($0), not by Danielle.
- **Naming:** The app has no name yet.
- **Task/allowance specifics:** No actual chore list, dollar amounts, or payout cadence captured yet — needed before v0.1 is usable.
- **Product economics:** Whether anyone would pay, and at what price, remains unevidenced. Gated on the pilot.
