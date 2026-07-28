# On It

**The household list that does the reminding.**

A shared to-do board for couples, built for the situation described in Melissa
Orlov's *The ADHD Effect on Marriage*: one partner keeps having to remind, the
other keeps hearing nagging, and the relationship quietly slides into a
parent/child dynamic that neither person signed up for.

Live at **https://lprds.github.io/onit/**

It runs on a phone, and it is built to run on a tablet stuck to the fridge or
propped on the counter — big type, big targets, an always-on clock, and a
switcher so whoever walks past can tick something off as themselves.

---

## The rules it encodes

This is not a generic to-do app with a couples theme. Each of these is a
deliberate design decision aimed at the loop that does the damage.

| Problem | What the app does |
|---|---|
| "I told you." / "You never told me." | Every request is written down in one agreed place, with a timestamped history on each item. Memory is never the source of truth. |
| Assigning work creates a parent/child dynamic | You cannot put a task on someone else's list. Asking someone creates a **request**; it becomes a real task only once they say yes **and pick their own when**. |
| Reminding reads as nagging | The list does the reminding. You can flag an item **once per 20 hours** — it shows quietly on the board and sends nothing. |
| Overdue items produce shame, and shame produces avoidance | Nothing is marked late or red. Overdue reads "Carried over". Postponing is a first-class button, and the move is recorded rather than treated as failure. |
| Starting is harder than doing | Every item can carry a time estimate. "Got 5 minutes?" filters the board to what fits. Items can be split into steps, and any item can be run against a visible countdown. |
| Too much on one day causes paralysis | Past a configurable count, Today shows a gentle note suggesting you move something. It never blocks you. |
| Effort goes unnoticed | A Wins screen with what got done, a non-competitive picture of the week's load, and one-tap thank-yous the doer actually sees. |
| Saying yes to avoid conflict, then not doing it | Declining is a real, easy answer with an optional reason — better than a yes that quietly never happens. |
| Three moves means something is wrong | After an item is moved three times, the app says so and suggests a two-minute conversation instead of a fourth move. |

## Using it

1. One of you opens the link and taps **Create a household**. You get a code
   like `SUNNY-BASIL-4173`.
2. The other opens the same link, taps **Join instead**, enters the code, and
   picks their name.
3. For the kitchen tablet: open the link on it, join with the same code, and
   choose **Use as the household tablet**. That device gets bigger type, a
   clock, and a person switcher.
4. On each device, use the browser's **Add to Home Screen** — it then opens
   full screen like an app and works without a connection.

Anyone with the code can join, so share it the way you'd share a house key.

## Architecture

Deliberately boring, because a fridge tablet on household wifi is a hostile
environment and this has to keep working without anyone maintaining it.

```
onit/
  index.html            shell
  app.css               design tokens + components (light and dark)
  app.js                state, optimistic sync, all views
  sw.js                 offline shell cache
  manifest.webmanifest  installable PWA
  icons/make-icons.py   regenerates the app icons

supabase/
  migrations/           schema
  functions/api/        the entire backend, one edge function

tools/
  mock-api.js           local stand-in for the API, also serves the app
  e2e.js                two-phone browser walkthrough
```

**No build step.** Plain HTML, CSS and JavaScript with no dependencies, served
straight from GitHub Pages. Push to deploy. Nothing to install, no bundler to
break, no toolchain to keep current — and nothing between the tablet and a
working app on a bad connection.

**Sync model.** The client holds one server snapshot plus a queue of pending
mutations, and renders the snapshot with the queue applied on top (`derive()`
in `app.js`). Every tap lands instantly and locally; the queue drains when the
network allows. A poll never overwrites unsent work. A permanently-failing
request is dropped with a message rather than wedging the queue forever.

**Security.** Every table has RLS enabled with **no policies**, so the public
key can read and write nothing directly. The `api` edge function holds the
service role and is the only way in. Callers authenticate with an opaque
per-device token issued at join time. Household codes are rate-limited per IP
against brute force. A normal phone can only act as its own member; only a
device explicitly marked as the household tablet can act as anyone else.

## Working on it

```bash
node tools/mock-api.js
# then open http://localhost:8787/onit/?api=http://localhost:8787/api
```

The `?api=` parameter points the app at any backend, so local work never
touches real household data. To run the browser walkthrough — two contexts
standing in for two phones, plus a tablet, covering ask → accept → complete →
thank, offline replay, dark mode and the timer:

```bash
node tools/mock-api.js &
node tools/e2e.js          # screenshots land in tools/shots/
```

`tools/mock-api.js` is a test harness, not a second implementation. Where the
two disagree, `supabase/functions/api/index.ts` is correct.

## Deploying the backend

The schema lives in `supabase/migrations/`, and the API is a single edge
function deployed with `verify_jwt` **off** — authentication is the device
token, handled inside the function, not a JWT. Point `API` at the top of
`app.js` at your own project to run a separate instance.
