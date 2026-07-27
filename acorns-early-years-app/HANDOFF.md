# HANDOFF — Pistachio (kids money app)

_Written 2026-07-26. Purpose: resume this project on Danielle's own computer with **zero additional questions**. Everything decided in the kickoff session is captured here._

---

## ⬛ WHERE EVERYTHING IS — READ THIS FIRST

**Nothing was saved to Google Drive. Nothing was saved to your local machine.** This session ran in a remote container with no access to either. **Everything lives in GitHub**, plus a session note and a seeded task list in ClickUp.

### GitHub (the only copy of these files)

| | |
|---|---|
| **Repo** | `lprds/lprds.github.io` |
| **Branch** | `claude/acorns-early-years-app-ltfjmh` ← NOT `main` |
| **Folder** | `acorns-early-years-app/` (repo root) |

Four files, all in that one folder:

| File | What it is |
|---|---|
| `HANDOFF.md` | **This file.** Start here. |
| `KICKOFF_SYNTHESIS_acorns-early-years-app_2026-07-26.md` | Distilled synthesis |
| `INTERVIEW_TRANSCRIPT_acorns-early-years-app_2026-07-26.md` | Full verbatim Q&A |
| `SESSION_NOTES_2026-07-26.md` | Session note (GitHub mirror; the ClickUp copy is authoritative) |

### To get it on your computer — copy/paste this

```bash
cd ~/lprds.github.io            # wherever your clone lives
git fetch origin claude/acorns-early-years-app-ltfjmh
git checkout claude/acorns-early-years-app-ltfjmh
ls acorns-early-years-app/
```

Then open `acorns-early-years-app/HANDOFF.md`.

**If you don't have the repo cloned yet:**
```bash
git clone https://github.com/lprds/lprds.github.io.git
cd lprds.github.io
git checkout claude/acorns-early-years-app-ltfjmh
```

**To read it in a browser without cloning:**
`https://github.com/lprds/lprds.github.io/tree/claude/acorns-early-years-app-ltfjmh/acorns-early-years-app`

### ClickUp — done, nothing outstanding

**Session note:** page `SESSION_NOTES_2026-07-26` (`8ckxy74-13959`) in doc `8ckxy74-573`. Filed.

**List:** [Kids Money App (Acorns Early-style)](https://app.clickup.com/9013491940/v/l/li/1000450000004370) — `1000450000004370`, in the Claude CoWork Projects space (`901313736752`). Seeded with six tasks — full table in §13.

### Not done — deliberately

- **No Google Drive files written.** If you want these mirrored to `Claude Cowork/`, say so and I'll copy them over — Drive access is available.

---

**Status: kickoff complete. No code written yet.** Nothing has been built, no Supabase project exists, no schema applied.

---

## 1. What this is, in one sentence

**Pistachio** is a virtual family money ledger for Danielle's 10-year-old son: he earns money by completing tasks, sees his balance and a real transaction register, saves toward named goals, and requests purchases she approves — replacing an Acorns Early subscription (~$12/mo) and the in-head/notes/envelope tracking they use today.

## 2. The thing that makes this different from Acorns

**There is no debit card and no money movement.** Issuing a real card means money transmission — KYC, a BaaS partner, state MTL licensing. Out of scope permanently.

The money lives in an account Danielle controls. Her son never receives it. He has no debit card and their location largely doesn't accept them. So:

- **"Spending" is a request, not a purchase.** He submits a spend request → she approves or declines → approval posts the debit.
- **There are no transfer instructions to generate.** Her view needs a standing "what I owe him" total plus how much is earmarked per goal.

This removes ~90% of the regulatory load while keeping ~90% of the teaching value.

## 3. Research findings — what Acorns Early actually ships

Acorns Early (rebranded from GoHenry after acquisition), ages 6–18:

| Feature | Behavior |
|---|---|
| Chores & allowance | Parent sets chores with a $ value; kid ticks them off; app tallies and auto-pays on a schedule |
| Savings goals | Kid sets goal + target date + optional autosave; parent can lock/unlock |
| Money Missions | Videos + quizzes; completing them earns XP, badges, **and bonus cash** |
| Debit card | Real card, in-store and online |
| Parental controls | Spend limits, instant card lock, real-time alerts |
| Round-ups & parent-paid interest | Parent can pay custom interest to teach compounding |

Pricing: **$8/mo Lite** (up to 4 kids), **$12/mo Gold**. Money Missions curriculum is also free on YouTube.

**Design insight worth stealing:** the kid app is a *game* (XP, badges, streaks, goal progress). The parent app is a *dashboard* (approve, fund, set limits, alerts). Two different UIs over one shared ledger.

Sources: [App Store](https://apps.apple.com/us/app/acorns-early-kids-money-app/id6566186346) · [Google Play](https://play.google.com/store/apps/details?id=com.acorns.early) · [Allowance & Chores](https://www.acorns.com/allowance-chores/) · [Savings](https://www.acorns.com/kids-saving/) · [Parental Controls](https://www.acorns.com/parental-controls/) · [Money Missions](https://www.acorns.com/learn/money-missions-on-youtube/)

## 4. Locked decisions

| # | Decision | Source |
|---|---|---|
| D1 | Household-first, but **multi-tenant from day one** — may become an LPR product | A1 |
| D2 | Virtual ledger only. **No card, no money movement, no float** | A2, A5-followup |
| D3 | **Hero page = balance + "what can I earn this week."** Register is a drill-down, NOT the landing screen | Phase 2 correction |
| D4 | **Two separate logins** (parent + kid), **hosted and synced** — they are in separate households for ~2 months, so single-device is disqualified | A4 |
| D5 | Stack: **GitHub Pages static front end + Supabase** (Postgres, Auth, RLS), household-scoped rows | Claude, per rule 7 |
| D6 | **Data-minimal**: first name only, no kid email, parent creates the kid account | Claude, per rule 7 |
| D7 | **COPPA deferred** — not built now, gated on the app proving engaging | A11 |
| D8 | **CSV ledger export** is a hard requirement | A10 |
| D9 | Cost bucket: **speculative R&D, hours logged** | A12 |
| D10 | Sign-off: **Danielle only** | A13 |
| D11 | **Cost ceiling: 15 hours** of Danielle's time | A14 |
| D12 | **Parent verification of task completions is required.** Kid checks off → lands in a parent Approvals queue → payout posts only on approval. Acorns has NO such flow; it pays on unverified self-report | Post-interview, Danielle |
| D13 | **Multi-parent households.** More than one parent per household, all able to assign tasks. Acorns has a co-parent account; match it | Post-interview, Danielle |
| D14 | **Auto-approve task completions after N days** (default 48h, household-configurable). Silence = yes. Protects the feedback loop when a parent is slow or remote. **Task completions ONLY — spend requests never auto-approve** | Post-interview, Danielle (Claude added the spend-request carve-out) |
| D15 | **The app is called Pistachio.** | Post-interview, Danielle |
| D16 | **One parent approval releases a payout.** No dual sign-off, even in a multi-parent household | Post-interview, Danielle |
| D17 | **Three task cadences, not two:** `one_off`, `dow` (specific weekdays), `weekly` (once in the week, any day). Derived from Danielle's live Acorns setup | Post-interview, from screenshots |

### Differentiators vs Acorns (product angle — keep this list growing)

1. **Verified completions.** Acorns pays out on the child's unverified self-report. This app requires a parent to confirm the task was actually done before money moves. Danielle raised this unprompted as a gap in Acorns.
2. **No subscription.** $0 running cost vs $8–12/mo.
3. **Real ledger literacy.** A genuine transaction register with running balance, as a first-class drill-down — an explicit teaching goal, not a statement view.

## 5. Non-negotiable requirements (all four, unranked)

1. **Ledger correctness** — money earned is never lost or miscounted. Trust in the ledger *is* the product.
2. **Auth strength** — a 10-year-old's data must not be exposed by a weak login.
3. **No duplicate or unnoticed payouts** — approval must be idempotent and auditable.
4. **Engagement** — "not engaging enough for him to even care" is a major fail. The only product risk of the four; the rest are engineering.

## 6. Proposed data model (not yet applied — reconcile first, see §10)

All tables carry `household_id`; RLS scopes every read/write to the caller's household.

```
households          id, name, created_at
profiles            id (= auth.users.id), household_id, role ('parent'|'kid'),
                    first_name, created_at
                    -- first name ONLY. no kid email, no DOB, no surname (D6)
                    -- N parents per household is supported with no schema change
                    --    (D13). Any profile with role='parent' in the household
                    --    can assign tasks and approve. See §6a for the open
                    --    question on whether one approval suffices.

household_invites   id, household_id, role, token, invited_by,
                    accepted_by NULL, expires_at, created_at
                    -- co-parent invite flow (D13). Schema listed here; UI is
                    --    pass 2.

tasks               id, household_id, kid_id, title, amount_cents, active,
                    cadence ('one_off'|'dow'|'weekly'),        -- D17
                    dow smallint[] NULL,   -- cadence='dow' only. 0=Sun .. 6=Sat
                    created_at
                    -- 'one_off'  : claimable once, ever. No date.
                    -- 'dow'      : one claimable instance per listed weekday
                    --              (Danielle's "Put your clothes away" = {0,2,4,6})
                    -- 'weekly'   : one claimable instance per ISO week, any day

task_completions    id, household_id, task_id, kid_id, period_key,
                    completed_at, status ('pending'|'approved'|'declined'),
                    decided_by, decided_at
                    -- UNIQUE (task_id, period_key)  → a recurring task cannot be
                    --    claimed twice in the same period
                    -- period_key by cadence:
                    --    one_off → 'once'
                    --    dow     → the ISO date      e.g. '2026-07-28'
                    --    weekly  → ISO year-week     e.g. '2026-W31'

spend_requests      id, household_id, kid_id, description, amount_cents,
                    goal_id NULL, status ('pending'|'approved'|'declined'),
                    decided_by, decided_at, created_at

goals               id, household_id, kid_id, name, target_cents,
                    target_date NULL, archived, created_at

transactions        id, household_id, kid_id, occurred_at, description,
                    amount_cents (SIGNED: + credit, − debit),
                    type ('task_payout'|'one_off'|'spend'|'interest'|'gift'|'adjustment'),
                    goal_id NULL, source_type, source_id, created_by, created_at
                    -- UNIQUE (source_type, source_id)  → one approval can never
                    --    post two transactions (requirement #3)
```

**Balance = `SUM(transactions.amount_cents)` for that kid.** Never store a balance column — a stored balance is how ledgers silently drift (requirement #1).

**Idempotency is enforced in the database, not the app.** Both unique constraints above are the actual guardrail; UI-level double-click protection is not sufficient.

### §6a — Approval semantics (D12)

The flow, precisely:

1. Kid marks a task done → row in `task_completions` with `status='pending'`. **No transaction is written.**
2. A parent approves → `status='approved'`, `decided_by` = that parent's profile id, `decided_at` stamped.
3. **Only then** does a `transactions` row post, with `source_type='task_completion'`, `source_id` = the completion id. The unique constraint on `(source_type, source_id)` makes a second approval physically unable to pay twice.
4. Decline → `status='declined'`, no transaction, and the kid sees it went back with a reason.

`decided_by` gives a full audit trail of which parent approved what — which matters more once there's a co-parent.

**Answered (D16): one parent approval releases the payout.** No dual sign-off, even with a co-parent on the household. `decided_by` still records which parent it was, so the audit trail survives.

### §6b — Auto-approve after N days (D14)

**Why it exists:** verified completions cost immediacy. He checks a chore off Tuesday; if a parent approves Friday, that's three days of a balance that didn't move — and a 10-year-old stops checking things off. This is sharpest right now, with Danielle and her son in separate households for ~2 months. Acorns dodged the problem by not verifying at all; this buys the verification back without the latency.

**Rule:** a `task_completions` row in `status='pending'` for longer than the household's `auto_approve_hours` (default **48**) flips to `approved` and posts its payout exactly as a manual approval would.

**Scope — this is the important part:**

| Object | Auto-approves? | Why |
|---|---|---|
| `task_completions` | **Yes**, after N hours | Worst case is a few dollars Danielle likely owed anyway |
| `spend_requests` | **NEVER** | Auto-approving means money spent on her behalf that she never agreed to. Different risk class entirely — must stay an affirmative act |

**Schema additions:**
```
households          + auto_approve_hours  int default 48   -- 0 or NULL = disabled
task_completions    + auto_approved       bool default false
                    -- decided_by stays NULL when auto_approved = true, so the
                    --    audit trail distinguishes "a parent said yes" from
                    --    "the clock said yes"
```

**Implementation (decided, not asked):** a `pg_cron` job in Supabase sweeping overdue pendings. Do NOT compute this lazily at read time — a balance that changes because someone opened a screen is exactly the silent-drift failure mode requirement #1 forbids. The sweep posts real transactions; the ledger stays the single source of truth.

**Not silent:** auto-approvals must show in the parent's feed ("3 completions auto-approved") and be visibly flagged in the register. Silence means yes, but it never means hidden.

**Still worth doing later:** push/email on check-off, so approval is a 5-second tap. Auto-approve is the safety net; notifications are the actual fix for latency. Both, eventually.

## 7. Screen inventory

**Kid app** (must be enticing — D3, requirement #4)
- **Home** — big balance, "what I can earn this week," goal progress bars
- **Tasks** — recurring checklist + request a one-off job
- **Ledger** — the register: date, description, in/out, running balance (drill-down from Home)
- **Goals** — named buckets, progress, target dates
- **Spend request** — ask to buy something, against balance or a specific goal

**Parent app** (dashboard)
- **Dashboard** — what I owe him, total vs. earmarked per goal, pending approvals
- **Approvals** — task completions and spend requests, approve/decline
- **Task admin** — create/edit recurring tasks and amounts
- **Ledger** — same register, full household view
- **Export** — CSV of the full ledger

## 8. Scope split against the 15-hour ceiling

**v0.1 — agreed as "enough to prove it" (A4)**
- Auth, two roles, household scoping (RLS)
- Kid: Home (balance + earnable this week), Tasks check-off, Ledger register
- Parent: Dashboard with pending approvals, task admin, CSV export
- Idempotent approval → transaction posting

**Pass 2 — deferred but wanted (Danielle: "I need all this built in")**
- Savings goals / named buckets ← **highest-value deferred item**; it's the savings incentive and Danielle raised it unprompted. Pull into v0.1 if hours allow.
- **Co-parent invite flow** (D13) — schema supports N parents from day one; the invite UI and second-parent onboarding are pass 2.
- **Push/email notification on check-off** — the real fix for approval latency; auto-approve (D14, in v0.1) is the safety net underneath it.

**Pulled INTO v0.1 despite being small — because it protects the two-week trial**
- **Auto-approve after N hours** (D14, §6b). Without it, a slow approval week kills engagement, and engagement is the one non-negotiable that can't be engineered around later. Cheap: one column, one `pg_cron` job.
- One-off job requests
- Spend-request flow
- Parent-paid interest on goal balances (the "incentivize saving" mechanic)
- Money Missions-style lessons with bonus cash + XP/badges

**Never**
- Real debit card, real money movement, anything requiring money-transmitter licensing.

## 9. Economics (computed during the interview)

**Cost avoidance, household only:**

| Scenario | Months | Acorns cost | Break-even at $150/hr |
|---|---|---|---|
| Full 6→18 span, $12/mo | 144 | $1,728 | 11.5 hrs |
| Her son 10→18, $12/mo | 96 | $1,152 | 7.7 hrs |
| Her son 10→18, $8/mo Lite | 96 | $768 | 5.1 hrs |

**Product side:** at $6/mo priced and ~$4/mo net after Stripe/Supabase/support, a 40-hour ($6,000) build needs ~1,500 family-months to return — roughly 125 paying families for a year, or 60 for two. Achievable, but that's a business with marketing and support attached.

**Note:** the $150/hr opportunity cost only bites for hours that would otherwise have been billable.

Claude recommended ~8 hrs; **Danielle set 15**, explicitly buying option value on the product bet. Recorded as decided.

## 10. Do this first when picking back up

1. **Reconcile the §6 data model against the LPR/TFE accounting platform** docs in Google Drive. Danielle flagged that this project shares ledger/transaction concepts with that in-progress work. She said explicitly: *don't divert* to it during kickoff — but do it **before writing schema**. Google Drive MCP access is available; the docs were not retrievable during the kickoff session only because it ran without her computer connected.
2. **Name the app.** No name chosen.
3. **Collect the actual chore list, dollar amounts, and payout cadence** from Danielle. Without these v0.1 is a shell.
4. Create the Supabase project; apply schema + RLS; seed the household.
5. Create the ClickUp list in Claude CoWork Projects space (`901313736752`) and start time tracking (D9).
6. Build v0.1 against the 15-hour ceiling.

## 11. Open questions (do NOT invent answers)

- **App name** — none chosen.
- **Chore list, amounts, payout cadence** — not captured. Blocks a usable v0.1.
- **Whose experience must be great** — kid's or parent's; asked in Q1, never answered.
- **What shipping unlocks** beyond the maybe-LPR-product angle — Q6 not answered.
- **Product economics** — whether anyone would pay, and at what price. Gated on the pilot.
- **Interest rate** for the parent-paid-interest mechanic, if built.
- **One approval or two?** In a two-parent household, does one parent's approval release a payout or must both sign off? See §6a. Default assumption if unanswered: one.
- **Who is the co-parent** and should they be invited for v0.1 or later? Danielle raised co-parent accounts as a wanted feature but didn't say whether it's needed now.

## 12. Watch items

- ⚠️ **COPPA gate.** Deferred is correct for a household. But a friends-and-family pilot puts *other people's children's* data in the system. Revisit before the pilot goes beyond a handful of known families. Building data-minimal (D6) keeps that a paperwork problem rather than a schema rewrite.
- ⚠️ **No hard kill switch.** Rejection converts to iteration (A9), which is the right instinct with his engagement but is also exactly how a project quietly eats 40 hours. The 15-hour ceiling is the only real spend discipline in place — hold it.
- ⚠️ **Engagement is the top risk**, and it's the one that can't be engineered around. The son is a design stakeholder: build so screens are cheap to change after he reacts.

---

## 13. ClickUp — filed and seeded (2026-07-26)

**Session note:** page `SESSION_NOTES_2026-07-26` (`8ckxy74-13959`) in doc `8ckxy74-573`. Filed — the earlier approval block cleared when the MCP server reconnected.

**List:** [Kids Money App (Acorns Early-style)](https://app.clickup.com/9013491940/v/l/li/1000450000004370) — `1000450000004370`, seeded with six tasks:

| Task | Priority | Note |
|---|---|---|
| [Reconcile data model against LPR/TFE accounting platform](https://app.clickup.com/t/wdwxndx46w) | High | **Blocks schema** |
| [Collect chore list, amounts, payout cadence](https://app.clickup.com/t/wdwxndx46x) | High | Blocks a usable v0.1 |
| [Decide: one parent approval or two?](https://app.clickup.com/t/wdwxndx46y) | Normal | Danielle's call |
| [Name the app](https://app.clickup.com/t/wdwxndx46z) | Low | |
| [Stand up Supabase](https://app.clickup.com/t/wdwxndx470) | Normal | Blocked by reconciliation |
| [Build v0.1 — hold the 15-hour ceiling](https://app.clickup.com/t/wdwxndx471) | Normal | 15h estimate set |

---

## 14. Seed data — Danielle's real Acorns setup (2026-07-26)

Transcribed from screenshots of her live Acorns Early "Earning" screen. **This is the actual chore list to seed Pistachio with**, not an example.

### One-off

| Task | Amount |
|---|---|
| Build apps | $50.00 |

### Day-specific (`cadence='dow'`)

| Task | Amount | Days |
|---|---|---|
| Put your clothes away | $0.50 | Sat, Sun, Tue, Thu → `dow = {0,2,4,6}` |

Acorns renders this as four separate dated rows (Sat Jul 25, Sun Jul 26, Tue Jul 28, Thu Jul 30). Same underlying task, one claimable instance per listed weekday — which is exactly why `period_key` is the ISO date for this cadence.

### Weekly (`cadence='weekly'`)

| Task | Amount |
|---|---|
| Water the plants | $1.00 |
| Clean the litter box | $2.00 |
| Take out the compost | $1.00 |
| Do the vacuuming | $1.00 |

### Weekly earning ceiling

| Source | Math | Total |
|---|---|---|
| Put your clothes away | $0.50 × 4 days | $2.00 |
| Weekly four | $1 + $2 + $1 + $1 | $5.00 |
| **Recurring total** | | **$7.00/week** |

$7.00 is the number the hero screen's "what can I earn this week" should show at a full week's start, counting down as instances are claimed. The $50 one-off sits outside the weekly rhythm.

### UI notes lifted from the Acorns screens

- Tasks are **grouped by date**, with weekday headers ("Sunday, July 26"), then a "Weekly" group, then "One-off" — chronological, not by task type.
- A **"Tick all tasks"** bulk action sits top-right of each group.
- Each row: checkbox, task title, amount, and a **"New"** badge on tasks not yet interacted with.
- One primary action button pinned to the bottom (**"Add task"** on the parent side).

Worth matching the grouping and the bulk-tick; both reduce friction for a 10-year-old. The "New" badge is a cheap engagement lever.

### Still needed before seeding

- **Payout cadence** — Acorns pays out on a schedule (weekly / twice monthly). Danielle hasn't said which she wants. Not in the screenshots.
- **Auto-approve window** — default 48h stands unless she says otherwise.
