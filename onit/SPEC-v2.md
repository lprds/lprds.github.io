# On It v2 — The Middle

A build spec for the next release. Nothing here is implemented yet.

---

## The problem this release solves

v1 gives a task two real states: **asked** and **done**. Everything the
non-ADHD partner actually suffers from lives in the gap between them:

> Did he see it? Is it going to happen? Do I need to plan around it? Am I going
> to have to bring it up again?

The app currently has no answer to any of those, so she does what she has always
done — she checks, and then she asks. That is the exact loop the app exists to
break, and it is the one part that isn't built.

**This release builds the middle.**

## The design rule

**Give her certainty, not visibility.**

Certainty is "you can stop holding this, the app has it." It calms the person
carrying the load, and it costs the other person nothing.

Visibility is dashboards, read receipts used as evidence, completion rates,
per-person scores. It is the same information turned into a monitoring tool, and
it is precisely what makes the ADHD partner close the app and never reopen it.

Every feature below is tested against that line. Where a feature could go either
way, it is specified in the certainty direction, deliberately.

## Anti-features — do not build these

These are the ways this release fails. Listed so the decision is made once, here,
rather than re-argued during implementation.

| Not building | Why |
|---|---|
| Stacking push notifications | Every unread badge is a small shame deposit. Ten of them is a reason to uninstall. |
| Breakable streaks | One break and the app becomes evidence of failure. |
| Per-person completion rates | Weaponizable in an argument. The app must never produce ammunition. |
| "Seen 4 hours ago and you still haven't answered" framing | Read receipts as an accusation. Same data, opposite effect. |
| Her editing his `due_on` | Breaks the one rule the whole app rests on: you pick your own when. |
| Any screen he can't get value from without entering data first | Entry cost is why task apps die on the ADHD side. |
| Reminders he didn't agree to | The whole ladder in §1 is board state, never a message. |

---

# Scope

Six features. Four are for the partner carrying the load; two are for the ADHD
partner and ship in the same release, deliberately — a version that is all her
features will be felt as one, and that's the real failure mode.

| # | Feature | For | Backend needed |
|---|---|---|---|
| 1 | Answer-by, and the app does the following-up | Her | Yes |
| 2 | Real answers between yes and no | Both | Yes |
| 3 | The "needs another plan" pile | Her | Yes |
| 4 | The daily digest | Her | No — client-side |
| 5 | One thing mode | Him | No — client-side |
| 6 | Two-tap capture | Him | No — client-side |

Features 4, 5 and 6 are pure frontend and can ship first, on their own, without
touching the edge function. That's the recommended phase 1 (see §Rollout).

---

## 1. Answer-by, and the app does the following-up

**The pain.** She sends an ask. It sits. She has no idea whether it registered.
Somewhere between hour six and day two she brings it up out loud, and the moment
she does, the app has failed — she's back to being the reminder.

**The fix.** Every ask carries a time by which an *answer* is expected — not a
time by which the work is done. If no answer arrives, **On It** re-asks. She does
nothing. Her board tells her that, in those words.

Note the distinction, because it is the entire design: the deadline is on the
*reply*, not the task. Answering "not this week" on time is a complete success.
This is a promise the ADHD partner can actually keep — a two-second decision —
and it's the promise she actually needs kept.

### The ladder

Every rung is **board state**. Nothing here sends a message, and nothing here
requires her to act.

**Rung 0 — asked.** The ask lands in his *Asks* under "Waiting on you", showing
"Answer by tonight". Her side reads **"Waiting on an answer — by tonight."**

**Rung 1 — seen.** The first time the ask renders on his device, the client fires
`task.seen` once. Her side reads **"Seen 2h ago."** and nothing else — no elapsed
countdown, no red. Framing rule: *reassurance, never evidence.* The line exists
to stop her wondering, not to give her something to hold against him. If it ever
reads as the latter, it comes out.

**Rung 2 — re-asked.** The answer-by passes with no answer. The ask pins to the
top of **his Today** as a single question card — one thing, two buttons, not a
list. `resurface_count` increments. Her side reads **"No answer yet. On It
re-asked this morning."**

**Rung 3 — the app suggests talking.** After the second re-ask, both boards show:

> "This one's been sitting three days. Two minutes of talking beats a fourth
> re-ask."

This mirrors the existing three-defers rule (`defer_count`, see `taskCard()`) and
is the same idea: when the machinery stops working, the app says so and gets out
of the way rather than escalating harder.

There is no rung 4. The app never escalates past "have a conversation."

### The hard-deadline lane

A small number of things genuinely cannot slip — the school form, the DMV
appointment, the thing with a late fee.

- An ask can be marked **"this one has a real deadline"**, with a date.
- **Cap: three active per household** (Danielle, 2026-08-02: two was too austere
  for a house with kids). Hard, enforced, not a suggestion. A fourth attempt
  says: *"You've got three already. Which one stops being a hard deadline?"*
  The cap is the feature — the value of the lane is entirely in its scarcity,
  and an uncapped version becomes "everything is urgent" within a fortnight,
  which is where every other app lands.
- These are the **only** items permitted to generate a push notification, and
  only if the owner has opted in (§4).
- Both boards show a plain countdown: "3 days". No red, no siren.

### Data

New columns on `tasks`:

```
answer_by        timestamptz   -- when an ANSWER is expected, not the work
seen_at          timestamptz   -- first render on the owner's device
resurfaced_at    timestamptz
resurface_count  int  default 0
hard_deadline    boolean default false
deadline_on      date
```

Default `answer_by`: 20:00 today in the household's timezone; if the ask is
created after 18:00, 20:00 tomorrow. Overridable in the ask sheet with chips —
*Tonight · Tomorrow · This week · No rush*. "No rush" sets `answer_by` null and
disables the ladder entirely, which is an important escape hatch: not every ask
deserves a clock, and if every ask gets one the mechanism goes numb.

New ops:

```
task.seen         { id }                     -- idempotent, owner only, first write wins
task.resurface    { id }                     -- server-side scheduler only
```

`task.save` gains `answer_by`, `hard_deadline`, `deadline_on`.

New event kinds for the history strip in `detailSheet()`: `seen`, `resurfaced`,
`deadline_set`.

### Where the re-asking runs

The resurface pass needs to run without either phone being open. Options, in
order of preference:

1. **`pg_cron` in Supabase**, every 15 minutes, a SQL function that sets
   `resurfaced_at`/`resurface_count` on `requested` tasks past `answer_by`.
   No new infrastructure, no new deploy target, runs whether or not anyone has
   the app open. This is the one to build.
2. A scheduled edge function. More moving parts for no gain.
3. Client-side on poll. Rejected — it only fires if someone has the app open,
   which is precisely when it isn't needed.

The client must still *render* the ladder from `answer_by` and `resurface_count`
without waiting for the cron, so a phone that's open at 20:01 shows the right
thing immediately.

### Client changes

- `askCard()` — status line per rung on the outgoing side; answer-by chip on the
  incoming side.
- `taskSheet()` — new "When do you need an answer?" field, and the hard-deadline
  toggle (with the cap check).
- `viewToday()` — the pinned re-ask card at the very top, above "Carried over".
- `derive()` — optimistic cases for `task.seen`.

---

## 2. Real answers between yes and no

**The pain.** The current answer set is accept or decline. Real life has a third
answer, and it's the most common one: *"Yes in principle, but not by me, or not
like this."* With nowhere to put that, it comes out as a yes that quietly never
happens — which is the single biggest destroyer of her trust in the system, worse
than a no by a wide margin.

**The fix.** Four answers, all one tap from the ask card:

| Answer | What happens |
|---|---|
| **Yes — here's when** | Existing `acceptSheet()`. Unchanged. |
| **Yes, but not this week** | Accept with a date next week or later. Recorded as its own event so her board reads *"Agreed — next week"*, not an ambiguous future date. |
| **Not me — let's find another way** | New. Goes to "Needs another plan" (§3) with a suggested route. |
| **No** | Existing `declineSheet()`. Unchanged, it's already good. |

The third is the new one and the point of the feature. Its sub-options:

- **Can we swap?** — offers a trade, with a picker of the asker's open items.
- **Can we pay someone?** — flags it for the money conversation instead of the
  labour one.
- **Can we just not?** — proposes dropping it. Requires the asker's agreement
  (§3); nothing vanishes because one person wanted it gone.
- **Can we talk about it?** — no route, just parks it for the check-in.

Why this earns its place: a cheap, honest, *socially acceptable* "not me" is
worth ten quiet yeses. The reason people give a yes they won't keep is that no
feels expensive in the moment. Make it cheap and the yeses become real, which is
what she actually wanted all along.

### Data

```
status: 'requested' | 'open' | 'done' | 'declined' | 'renegotiate'   -- new value
renegotiate_route  text   -- swap | pay | drop | talk
renegotiate_note   text
```

New op: `task.renegotiate { id, route, note }`.
New event kinds: `renegotiated`, `accepted_later`.

---

## 3. The "needs another plan" pile

**The pain.** Right now a declined item drops into a capped list of ten at the
bottom of *Asks* and is functionally gone. She can't tell the difference between
"he said no and we sorted it" and "he said no and nobody did anything," so she
keeps holding all of them. Nothing being visibly resolved means nothing can be
put down.

**The fix.** Replace the "Declined" section with **"Needs another plan"** —
everything in `declined` or `renegotiate`, uncapped, each with a visible way out:

- **I'll take it** — reassigns to the asker, status `open`.
- **Swap** — pick something of theirs to trade.
- **We're paying someone** — closes it with outcome `outsourced`.
- **Agreed, we're not doing this** — closes it with outcome `dropped`, and
  **requires both people to tap it.** One taps "propose dropping", the other
  confirms. Until then it stays in the pile.
- **Put it back** — existing `task.reopen`.

That two-tap drop is the load-bearing part. It's her guarantee that nothing
disappears because one person quietly decided it didn't matter — which is the
fear that makes her keep her own mental copy of the list. Remove the fear and the
mental copy goes with it.

### Data

```
outcome        text   -- outsourced | dropped | swapped | taken_back
drop_proposed_by  uuid
drop_agreed_by    uuid
```

New op: `task.resolve { id, outcome }`. Server enforces that `dropped` requires
two distinct members.

The pile also gets a count badge on the *Asks* tab, because an unresolved pile is
exactly the thing worth surfacing — and it's shared, not aimed at one person.

---

## 4. The daily digest

**The pain.** Everything above produces state she still has to go and *audit*.
Opening the app to check is a lighter version of the same job she's doing now.

**The fix.** One card, once a day, at a time she picks:

```
Since yesterday
  3 finished        — bins, pharmacy, Ada's form
  1 waiting on an answer — On It re-asked this morning
  1 moved to Saturday
  Nothing needs you.
```

That last line is the product. Everything above it is supporting detail.

**Generated entirely client-side** from the snapshot the app already holds — no
backend, no scheduler, no email. It renders as a dismissible card at the top of
*Today* on the first open after `prefs.digestAt`, and once dismissed does not
come back until tomorrow.

Per-person, opt-in, off by default:

```
prefs.digest    = false
prefs.digestAt  = '07:30'
```

**Phase 2** (decided 2026-08-02): delivery becomes the user's choice — in-app
card or one push notification a day — **defaulting to card**, plus the
hard-deadline pushes from §1. The guardrail against notifications is about
*stacking* and *shame*, and one summary a day to a person who asked for it is
neither.

**Phase 2 also moves digest prefs (and the other per-person prefs) to the
member record server-side.** Phase 1 stores them in localStorage, which makes
them per-device: turn the digest on on your phone and your laptop doesn't know,
dismiss it on one and it still shows on the other. Danielle flagged this
directly — the preference belongs to the person and must follow them across
devices. Client keeps localStorage as the offline cache of the synced value.

---

## 5. One thing mode

**The pain (his).** A list is a menu of things he is failing at. The right number
of visible items when starting is hard is one.

**The fix.** A full-screen single card:

```
        ┌──────────────────────────┐
        │   Call the pharmacy      │
        │   about the refill       │
        │                          │
        │   ~5 min                 │
        │                          │
        │   [ Start ]              │
        │   Not this one    Later  │
        └──────────────────────────┘
```

- **Start** → the existing `startFocus()` timer. This is a better front door to
  a good feature that currently requires digging.
- **Not this one** → next candidate. No penalty, no record, no counter. It has to
  be genuinely free or it won't get used.
- **Later** → existing `task.defer`.

Selection order: hard deadline → `matters` → carried over → shortest that fits
the current `state.fit` → oldest. Deterministic, so the same tap gives the same
answer and it feels like a decision rather than a shuffle.

Entry: a large button on *Today* and on the Today empty state. Not a nav tab —
adding a fifth tab makes the app look bigger, and this feature's whole claim is
that it makes it smaller.

Client-side only. `state.view = 'one'`, a new `viewOne(snap)`.

## 6. Two-tap capture

**The pain (his).** `taskSheet()` is nine fields. Nine fields is a decision to
make later, and later never arrives. The gap between "I should write that down"
and it being written down has to be under three seconds or the thought is gone.

**The fix.** A **+** on every screen that opens a single text field, one button,
nothing else. No owner, no date, no estimate. It saves as an unowned, undated
task and lands in an **Inbox** section.

- The full sheet stays, one tap away, for when someone wants it.
- **Dictation** uses the OS keyboard's own mic button — the field just needs to
  be focused on open. Web Speech API is not worth it here: iOS support is
  unreliable, and the native keyboard mic already works everywhere and needs no
  permissions prompt. Honest constraint, cheap answer.
- The Inbox is also where *she* puts noticing that isn't yet an ask. This matters
  more than it looks: right now every observation she has must become a request
  aimed at him, which is what makes the app feel like her list pointed his way.
  Somewhere neutral to put things changes what the app *is*.

Sorting the Inbox is the natural agenda for a weekly ten-minute check-in — which
is Orlov's recommendation, and something the app should host rather than leave to
willpower. Out of scope for v2; noted so the Inbox is built in a way that doesn't
preclude it.

Client-side only.

---

## Rollout

**Phase 1 — frontend only, no backend deploy.** Features 4, 5, 6. Ships
independently, benefits both people, and puts a build in front of both of you to
react to before any schema is committed. Recommended starting point.

**Phase 2 — the ask lifecycle.** Features 1, 2, 3. One migration, edge function
changes, and the `pg_cron` job. Ships together — the ladder without the answer
vocabulary just means more re-asks with nowhere to put the honest answer, which
would be worse than shipping neither.

**Phase 3 — optional.** Digest push, the weekly check-in ritual, and the
by-category load picture (deliberately by category, never by person).

## Compatibility

- Every new field must be optional in the client. A snapshot from the current
  backend has to render correctly through a v2 client, or phase 1 can't ship
  ahead of phase 2.
- `derive()` needs optimistic cases for every new op, or the queue and the
  rendered board disagree while offline.
- `sw.js` `VERSION` → `onit-v4`.
- No new dependencies. No build step. Same as it ever was.

## Open questions — answered by Danielle, 2026-08-02

1. **Digest delivery.** User's choice of in-app card or one daily notification,
   **default card**. Prefs sync per person, not per device (see §4).
2. **Default answer-by.** **Tonight** (20:00), rolling to tomorrow for asks
   created after 18:00, overridable per ask — as originally specified.
3. **Hard-deadline cap.** **Three** active per household, not two (§1 updated).
4. **Direction of asks.** **Both ways.** The mechanics in §1–§3 are already
   symmetric; the implementation must keep them so, and every piece of copy in
   the ask lifecycle gets a neutral-direction pass — no wording that assumes a
   fixed asker and a fixed answerer. The design rule stands for whoever is
   carrying the load on any given ask.
