// On It — household sync API
//
// One POST endpoint, `{ op, ... }` in the body. Every table has RLS enabled with
// no policies, so the publishable key can reach nothing directly; this function
// holds the service role and is the only door. Callers authenticate with an
// opaque device token issued at household create/join time.
//
// Deployed with verify_jwt=false because auth is the device token, not a JWT.
// The two unauthenticated ops (household.create, household.join) are throttled
// per IP against the join_attempts table.

import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const MAX_MEMBERS = 8;
const MAX_LIVE_TASKS = 2000;
const NUDGE_COOLDOWN_HOURS = 20;
const DONE_WINDOW_DAYS = 21;

class ApiError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

/* ------------------------------------------------------------------ utils */

const ADJECTIVES = [
  "amber", "brave", "calm", "cedar", "cheery", "clever", "cozy", "crisp",
  "dapper", "eager", "fern", "fleet", "fresh", "gentle", "glad", "golden",
  "green", "happy", "hazel", "honest", "ivory", "jolly", "keen", "kind",
  "lively", "lucky", "maple", "mellow", "merry", "misty", "noble", "olive",
  "peach", "plum", "proud", "quick", "quiet", "ready", "river", "rosy",
  "royal", "sage", "sandy", "shiny", "silver", "smooth", "snowy", "solid",
  "spry", "stone", "sunny", "swift", "teal", "tidy", "true", "upbeat",
  "vivid", "warm", "willow", "zesty",
];
const NOUNS = [
  "acorn", "anchor", "apple", "arbor", "basil", "beacon", "bench", "birch",
  "brook", "cabin", "candle", "clover", "cocoa", "comet", "cotton", "crane",
  "daisy", "delta", "ember", "falcon", "forge", "garden", "harbor", "hearth",
  "heron", "kettle", "lantern", "ledge", "lemon", "lilac", "linen", "meadow",
  "mesa", "otter", "pantry", "pebble", "pepper", "pine", "poppy", "quartz",
  "quill", "raven", "ridge", "robin", "sparrow", "spruce", "summit",
  "thistle", "thyme", "timber", "trellis", "tulip", "valley", "walnut",
  "window", "wren",
];

function pick<T>(arr: T[]): T {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return arr[n[0] % arr.length];
}

function makeCode(): string {
  const digits = new Uint32Array(1);
  crypto.getRandomValues(digits);
  const num = String(1000 + (digits[0] % 9000));
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${num}`.toUpperCase();
}

function normalizeCode(raw: unknown): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function str(value: unknown, field: string, max: number, required = true): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s && required) throw new ApiError("invalid", `${field} is required.`);
  if (s.length > max) throw new ApiError("invalid", `${field} is too long (max ${max}).`);
  return s;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function uuidOrNull(value: unknown): string | null {
  return isUuid(value) ? value : null;
}

/* Dates are handled as plain YYYY-MM-DD strings anchored at UTC noon, so that
   arithmetic never slips a day across a timezone or DST boundary. The client
   supplies its own local date; the server never guesses the household's day. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateOrNull(value: unknown): string | null {
  return typeof value === "string" && DATE_RE.test(value) ? value : null;
}

function parseDay(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = parseDay(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDay(d);
}

function addMonths(iso: string, months: number): string {
  const d = parseDay(iso);
  const targetMonth = d.getUTCMonth() + months;
  const dayOfMonth = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(targetMonth);
  // Clamp: the 31st of a 30-day month lands on the 30th, not the 1st.
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dayOfMonth, lastDay));
  return formatDay(d);
}

/** Next occurrence strictly after `today`, so a long-neglected repeater
 *  reappears tomorrow rather than spawning a pile of backdated copies. */
function nextOccurrence(rule: string, from: string | null, today: string): string | null {
  if (rule === "none") return null;
  let cursor = from && from >= today ? from : today;
  for (let i = 0; i < 400; i++) {
    switch (rule) {
      case "daily":
        cursor = addDays(cursor, 1);
        break;
      case "weekdays": {
        do { cursor = addDays(cursor, 1); }
        while ([0, 6].includes(parseDay(cursor).getUTCDay()));
        break;
      }
      case "weekly":
        cursor = addDays(cursor, 7);
        break;
      case "biweekly":
        cursor = addDays(cursor, 14);
        break;
      case "monthly":
        cursor = addMonths(cursor, 1);
        break;
      default:
        return null;
    }
    if (cursor > today) return cursor;
  }
  return null;
}

function sanitizeSteps(value: unknown): Array<{ id: string; text: string; done: boolean }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((raw) => {
    const step = raw as Record<string, unknown>;
    return {
      id: isUuid(step?.id) ? String(step.id) : crypto.randomUUID(),
      text: String(step?.text ?? "").slice(0, 200),
      done: step?.done === true,
    };
  }).filter((s) => s.text.length > 0);
}

async function logEvent(
  householdId: string,
  taskId: string | null,
  actorId: string | null,
  kind: string,
  detail: Record<string, unknown> = {},
) {
  await db.from("events").insert({
    household_id: householdId,
    task_id: taskId,
    actor_id: actorId,
    kind,
    detail,
  });
}

/* ------------------------------------------------------------------- auth */

type Session = {
  device: { id: string; household_id: string; member_id: string; kiosk: boolean };
  householdId: string;
  /** Who the action is attributed to. A kiosk (fridge tablet) can act as any
   *  member, because whoever walks past is the one checking the box. */
  actorId: string;
};

async function authenticate(body: Record<string, unknown>): Promise<Session> {
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) throw new ApiError("unauthenticated", "This device isn't set up yet.", 401);

  const { data: device, error } = await db
    .from("devices")
    .select("id, household_id, member_id, kiosk")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new ApiError("server", error.message, 500);
  if (!device) {
    throw new ApiError("unauthenticated", "This device is no longer linked to a household.", 401);
  }

  let actorId = device.member_id;
  const requested = uuidOrNull(body.actingAs);
  if (requested && requested !== device.member_id) {
    if (!device.kiosk) {
      throw new ApiError("forbidden", "This device can only act as its own member.", 403);
    }
    const { data: member } = await db
      .from("members")
      .select("id")
      .eq("id", requested)
      .eq("household_id", device.household_id)
      .maybeSingle();
    if (!member) throw new ApiError("invalid", "That person isn't in this household.");
    actorId = requested;
  }

  db.from("devices").update({ last_seen_at: new Date().toISOString() })
    .eq("id", device.id).then(() => {});

  return { device, householdId: device.household_id, actorId };
}

async function loadTask(householdId: string, id: unknown) {
  if (!isUuid(id)) throw new ApiError("invalid", "Missing task id.");
  const { data, error } = await db
    .from("tasks").select("*").eq("id", id).eq("household_id", householdId).maybeSingle();
  if (error) throw new ApiError("server", error.message, 500);
  if (!data) throw new ApiError("not_found", "That item no longer exists.", 404);
  return data;
}

async function throttle(ip: string, limit: number) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await db
    .from("join_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("ok", false)
    .gte("created_at", since);
  if ((count ?? 0) >= limit) {
    throw new ApiError("rate_limited", "Too many attempts. Wait a few minutes and try again.", 429);
  }
}

/* ---------------------------------------------------------------- snapshot */

async function snapshot(session: Session) {
  const doneSince = new Date(Date.now() - DONE_WINDOW_DAYS * 86400000).toISOString();

  const [household, members, live, recent, kudos, events] = await Promise.all([
    db.from("households").select("id, code, name, timezone, settings")
      .eq("id", session.householdId).single(),
    db.from("members").select("id, name, color, is_owner")
      .eq("household_id", session.householdId).order("created_at"),
    db.from("tasks").select("*")
      .eq("household_id", session.householdId)
      .in("status", ["requested", "open"])
      .order("created_at"),
    db.from("tasks").select("*")
      .eq("household_id", session.householdId)
      .in("status", ["done", "declined"])
      .gte("updated_at", doneSince)
      .order("updated_at", { ascending: false })
      .limit(300),
    db.from("kudos").select("*")
      .eq("household_id", session.householdId)
      .order("created_at", { ascending: false }).limit(60),
    db.from("events").select("id, task_id, actor_id, kind, detail, created_at")
      .eq("household_id", session.householdId)
      .order("id", { ascending: false }).limit(120),
  ]);

  if (household.error) throw new ApiError("server", household.error.message, 500);

  return {
    household: household.data,
    members: members.data ?? [],
    tasks: [...(live.data ?? []), ...(recent.data ?? [])],
    kudos: kudos.data ?? [],
    events: (events.data ?? []).reverse(),
    me: { memberId: session.actorId, deviceMemberId: session.device.member_id, kiosk: session.device.kiosk },
    serverTime: new Date().toISOString(),
  };
}

/* --------------------------------------------------------------------- ops */

const ops: Record<string, (body: Record<string, unknown>, ip: string) => Promise<unknown>> = {

  "household.create": async (body, ip) => {
    await throttle(ip, 8);
    const householdName = str(body.householdName, "Household name", 60);
    const memberName = str(body.memberName, "Your name", 40);
    const color = str(body.color, "color", 20, false) || "teal";

    let household = null;
    for (let attempt = 0; attempt < 6 && !household; attempt++) {
      const { data, error } = await db
        .from("households")
        .insert({ code: makeCode(), name: householdName, timezone: str(body.timezone, "timezone", 60, false) || "America/Los_Angeles" })
        .select("id, code, name, timezone, settings")
        .maybeSingle();
      if (data) household = data;
      else if (error && error.code !== "23505") throw new ApiError("server", error.message, 500);
    }
    if (!household) throw new ApiError("server", "Could not allocate a household code.", 500);

    const { data: member, error: memberError } = await db
      .from("members")
      .insert({ household_id: household.id, name: memberName, color, is_owner: true })
      .select("id, name, color, is_owner").single();
    if (memberError) throw new ApiError("server", memberError.message, 500);

    const token = makeToken();
    const { error: deviceError } = await db.from("devices").insert({
      household_id: household.id,
      member_id: member.id,
      token,
      kiosk: body.kiosk === true,
      label: str(body.deviceLabel, "device label", 40, false) || null,
    });
    if (deviceError) throw new ApiError("server", deviceError.message, 500);

    await db.from("join_attempts").insert({ ip, ok: true });
    await logEvent(household.id, null, member.id, "household_created", { name: household.name });

    return { token, household, member };
  },

  "household.peek": async (body, ip) => {
    await throttle(ip, 12);
    const code = normalizeCode(body.code);
    if (!code) throw new ApiError("invalid", "Enter the household code.");

    const { data: household } = await db
      .from("households").select("id, name").eq("code", code).maybeSingle();
    if (!household) {
      await db.from("join_attempts").insert({ ip, ok: false });
      throw new ApiError("not_found", "No household with that code. Check for typos.", 404);
    }

    const { data: members } = await db
      .from("members").select("id, name, color")
      .eq("household_id", household.id).order("created_at");

    await db.from("join_attempts").insert({ ip, ok: true });
    return { household: { name: household.name }, members: members ?? [] };
  },

  "household.join": async (body, ip) => {
    await throttle(ip, 12);
    const code = normalizeCode(body.code);
    const { data: household } = await db
      .from("households").select("id, code, name, timezone, settings").eq("code", code).maybeSingle();
    if (!household) {
      await db.from("join_attempts").insert({ ip, ok: false });
      throw new ApiError("not_found", "No household with that code. Check for typos.", 404);
    }

    let member;
    const claimId = uuidOrNull(body.memberId);
    if (claimId) {
      const { data } = await db.from("members").select("id, name, color, is_owner")
        .eq("id", claimId).eq("household_id", household.id).maybeSingle();
      if (!data) throw new ApiError("invalid", "That person isn't in this household.");
      member = data;
    } else {
      const { count } = await db.from("members")
        .select("id", { count: "exact", head: true }).eq("household_id", household.id);
      if ((count ?? 0) >= MAX_MEMBERS) {
        throw new ApiError("invalid", `A household can hold ${MAX_MEMBERS} people.`);
      }
      const { data, error } = await db.from("members").insert({
        household_id: household.id,
        name: str(body.memberName, "Your name", 40),
        color: str(body.color, "color", 20, false) || "teal",
      }).select("id, name, color, is_owner").single();
      if (error) throw new ApiError("server", error.message, 500);
      member = data;
      await logEvent(household.id, null, member.id, "member_joined", { name: member.name });
    }

    const token = makeToken();
    const { error } = await db.from("devices").insert({
      household_id: household.id,
      member_id: member.id,
      token,
      kiosk: body.kiosk === true,
      label: str(body.deviceLabel, "device label", 40, false) || null,
    });
    if (error) throw new ApiError("server", error.message, 500);

    await db.from("join_attempts").insert({ ip, ok: true });
    return { token, household, member };
  },

  "state.get": async (body) => snapshot(await authenticate(body)),

  "task.save": async (body) => {
    const session = await authenticate(body);
    const input = (body.task ?? {}) as Record<string, unknown>;
    const id = isUuid(input.id) ? String(input.id) : crypto.randomUUID();

    const { data: existing } = await db.from("tasks").select("*")
      .eq("id", id).eq("household_id", session.householdId).maybeSingle();

    if (!existing) {
      const { count } = await db.from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("household_id", session.householdId).in("status", ["requested", "open"]);
      if ((count ?? 0) >= MAX_LIVE_TASKS) {
        throw new ApiError("invalid", "This household has too many open items.");
      }
    }

    const ownerId = uuidOrNull(input.owner_id);
    if (ownerId) {
      const { data: owner } = await db.from("members").select("id")
        .eq("id", ownerId).eq("household_id", session.householdId).maybeSingle();
      if (!owner) throw new ApiError("invalid", "That person isn't in this household.");
    }

    // An item aimed at someone else starts life as an ask, not an assignment —
    // it only becomes a live task once that person says yes.
    const isAsk = ownerId !== null && ownerId !== session.actorId;
    const row = {
      id,
      household_id: session.householdId,
      title: str(input.title, "Title", 200),
      notes: str(input.notes, "Notes", 2000, false),
      owner_id: ownerId,
      time_of_day: oneOf(input.time_of_day, ["morning", "afternoon", "evening", "anytime"] as const, "anytime"),
      due_on: dateOrNull(input.due_on),
      est_minutes: Number.isFinite(Number(input.est_minutes)) && Number(input.est_minutes) > 0
        ? Math.min(600, Math.round(Number(input.est_minutes)))
        : null,
      matters: input.matters === true,
      repeat_rule: oneOf(input.repeat_rule, ["none", "daily", "weekdays", "weekly", "biweekly", "monthly"] as const, "none"),
      steps: sanitizeSteps(input.steps),
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { data, error } = await db.from("tasks").update(row)
        .eq("id", id).eq("household_id", session.householdId).select("*").single();
      if (error) throw new ApiError("server", error.message, 500);
      await logEvent(session.householdId, id, session.actorId, "edited", { title: row.title });
      return { task: data };
    }

    const { data, error } = await db.from("tasks").insert({
      ...row,
      status: isAsk ? "requested" : "open",
      requested_by: isAsk ? session.actorId : null,
      created_by: session.actorId,
      series_id: row.repeat_rule === "none" ? null : id,
    }).select("*").single();
    if (error) throw new ApiError("server", error.message, 500);

    await logEvent(session.householdId, id, session.actorId, isAsk ? "requested" : "created", {
      title: row.title,
      owner_id: ownerId,
    });
    return { task: data };
  },

  "task.accept": async (body) => {
    const session = await authenticate(body);
    const task = await loadTask(session.householdId, body.id);
    if (task.status !== "requested") throw new ApiError("invalid", "That item isn't waiting on an answer.");
    if (task.owner_id !== session.actorId) {
      throw new ApiError("forbidden", "Only the person being asked can accept.", 403);
    }

    const patch: Record<string, unknown> = { status: "open", decline_reason: null };
    if (dateOrNull(body.due_on)) patch.due_on = body.due_on;
    if (body.time_of_day) {
      patch.time_of_day = oneOf(body.time_of_day, ["morning", "afternoon", "evening", "anytime"] as const, "anytime");
    }
    if (Number.isFinite(Number(body.est_minutes)) && Number(body.est_minutes) > 0) {
      patch.est_minutes = Math.min(600, Math.round(Number(body.est_minutes)));
    }

    const { data, error } = await db.from("tasks").update(patch)
      .eq("id", task.id).select("*").single();
    if (error) throw new ApiError("server", error.message, 500);
    await logEvent(session.householdId, task.id, session.actorId, "accepted", { due_on: patch.due_on ?? task.due_on });
    return { task: data };
  },

  "task.decline": async (body) => {
    const session = await authenticate(body);
    const task = await loadTask(session.householdId, body.id);
    if (task.owner_id !== session.actorId) {
      throw new ApiError("forbidden", "Only the person being asked can answer this.", 403);
    }
    const reason = str(body.reason, "Reason", 300, false);
    const { data, error } = await db.from("tasks")
      .update({ status: "declined", decline_reason: reason || null })
      .eq("id", task.id).select("*").single();
    if (error) throw new ApiError("server", error.message, 500);
    await logEvent(session.householdId, task.id, session.actorId, "declined", { reason });
    return { task: data };
  },

  "task.complete": async (body) => {
    const session = await authenticate(body);
    const task = await loadTask(session.householdId, body.id);
    if (task.status === "done") return { task };

    const { data, error } = await db.from("tasks").update({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: session.actorId,
    }).eq("id", task.id).select("*").single();
    if (error) throw new ApiError("server", error.message, 500);
    await logEvent(session.householdId, task.id, session.actorId, "completed", { title: task.title });

    // A repeater rolls forward on completion — no cron, no drift, and no pile
    // of backdated copies if it went untouched for a while.
    let spawned = null;
    const today = dateOrNull(body.localDate) ?? formatDay(new Date());
    const nextDue = nextOccurrence(task.repeat_rule, task.due_on, today);
    if (nextDue) {
      const { data: next } = await db.from("tasks").insert({
        household_id: session.householdId,
        title: task.title,
        notes: task.notes,
        owner_id: task.owner_id,
        requested_by: task.requested_by,
        status: "open",
        due_on: nextDue,
        time_of_day: task.time_of_day,
        est_minutes: task.est_minutes,
        matters: task.matters,
        repeat_rule: task.repeat_rule,
        steps: sanitizeSteps(task.steps).map((s) => ({ ...s, done: false })),
        series_id: task.series_id ?? task.id,
        created_by: task.created_by,
      }).select("*").maybeSingle();
      spawned = next;
    }

    return { task: data, spawned };
  },

  "task.reopen": async (body) => {
    const session = await authenticate(body);
    const task = await loadTask(session.householdId, body.id);
    const { data, error } = await db.from("tasks")
      .update({ status: "open", completed_at: null, completed_by: null, decline_reason: null })
      .eq("id", task.id).select("*").single();
    if (error) throw new ApiError("server", error.message, 500);
    await logEvent(session.householdId, task.id, session.actorId, "reopened", {});
    return { task: data };
  },

  // Deferring is a first-class, blameless action: the item moves and the move
  // is recorded, so it never reads as a silent failure.
  "task.defer": async (body) => {
    const session = await authenticate(body);
    const task = await loadTask(session.householdId, body.id);
    const today = dateOrNull(body.localDate) ?? formatDay(new Date());
    const base = task.due_on && task.due_on > today ? task.due_on : today;

    let due: string | null;
    switch (String(body.to ?? "tomorrow")) {
      case "tomorrow": due = addDays(base, 1); break;
      case "weekend": {
        due = base;
        do { due = addDays(due, 1); } while (parseDay(due).getUTCDay() !== 6);
        break;
      }
      case "nextweek": due = addDays(base, 7); break;
      case "someday": due = null; break;
      default: due = dateOrNull(body.to) ?? addDays(base, 1);
    }

    const { data, error } = await db.from("tasks")
      .update({ due_on: due, defer_count: (task.defer_count ?? 0) + 1 })
      .eq("id", task.id).select("*").single();
    if (error) throw new ApiError("server", error.message, 500);
    await logEvent(session.householdId, task.id, session.actorId, "deferred", { to: due });
    return { task: data };
  },

  // Rate-limited on purpose. The point of the app is that the list does the
  // reminding; a nudge is a quiet flag on the board, not a channel for pressure.
  "task.nudge": async (body) => {
    const session = await authenticate(body);
    const task = await loadTask(session.householdId, body.id);
    if (task.owner_id === session.actorId) {
      throw new ApiError("invalid", "This one's already yours.");
    }
    if (task.nudged_at) {
      const hours = (Date.now() - new Date(task.nudged_at).getTime()) / 3600000;
      if (hours < NUDGE_COOLDOWN_HOURS) {
        throw new ApiError("rate_limited",
          `Already flagged today. You can flag this again in ${Math.ceil(NUDGE_COOLDOWN_HOURS - hours)}h.`, 429);
      }
    }
    const { data, error } = await db.from("tasks").update({
      nudged_at: new Date().toISOString(),
      nudge_count: (task.nudge_count ?? 0) + 1,
    }).eq("id", task.id).select("*").single();
    if (error) throw new ApiError("server", error.message, 500);
    await logEvent(session.householdId, task.id, session.actorId, "nudged", {});
    return { task: data };
  },

  "task.steps": async (body) => {
    const session = await authenticate(body);
    const task = await loadTask(session.householdId, body.id);
    const steps = sanitizeSteps(body.steps);
    const { data, error } = await db.from("tasks").update({ steps })
      .eq("id", task.id).select("*").single();
    if (error) throw new ApiError("server", error.message, 500);
    return { task: data };
  },

  "task.delete": async (body) => {
    const session = await authenticate(body);
    const task = await loadTask(session.householdId, body.id);
    const { error } = await db.from("tasks").delete().eq("id", task.id);
    if (error) throw new ApiError("server", error.message, 500);
    await logEvent(session.householdId, null, session.actorId, "deleted", { title: task.title });
    return { ok: true, id: task.id };
  },

  "kudos.send": async (body) => {
    const session = await authenticate(body);
    const to = uuidOrNull(body.toMemberId);
    if (!to) throw new ApiError("invalid", "Who is this for?");
    const { data: member } = await db.from("members").select("id")
      .eq("id", to).eq("household_id", session.householdId).maybeSingle();
    if (!member) throw new ApiError("invalid", "That person isn't in this household.");

    const { data, error } = await db.from("kudos").insert({
      household_id: session.householdId,
      task_id: uuidOrNull(body.taskId),
      from_member: session.actorId,
      to_member: to,
      emoji: str(body.emoji, "emoji", 8, false) || "💛",
      message: str(body.message, "Message", 200, false),
    }).select("*").single();
    if (error) throw new ApiError("server", error.message, 500);
    await logEvent(session.householdId, uuidOrNull(body.taskId), session.actorId, "thanked", { to });
    return { kudos: data };
  },

  "kudos.seen": async (body) => {
    const session = await authenticate(body);
    const ids = Array.isArray(body.ids) ? body.ids.filter(isUuid).slice(0, 100) : [];
    if (!ids.length) return { ok: true };
    await db.from("kudos").update({ seen_at: new Date().toISOString() })
      .eq("household_id", session.householdId).eq("to_member", session.actorId).in("id", ids);
    return { ok: true };
  },

  "member.update": async (body) => {
    const session = await authenticate(body);
    const id = uuidOrNull(body.id) ?? session.actorId;
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = str(body.name, "Name", 40);
    if (typeof body.color === "string") patch.color = str(body.color, "color", 20);
    if (!Object.keys(patch).length) return { ok: true };
    const { data, error } = await db.from("members").update(patch)
      .eq("id", id).eq("household_id", session.householdId).select("id, name, color, is_owner").single();
    if (error) throw new ApiError("server", error.message, 500);
    return { member: data };
  },

  "household.update": async (body) => {
    const session = await authenticate(body);
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = str(body.name, "Household name", 60);
    if (typeof body.timezone === "string") patch.timezone = str(body.timezone, "timezone", 60);
    if (body.settings && typeof body.settings === "object") {
      const { data: current } = await db.from("households").select("settings")
        .eq("id", session.householdId).single();
      patch.settings = { ...(current?.settings ?? {}), ...(body.settings as object) };
    }
    if (!Object.keys(patch).length) return { ok: true };
    const { data, error } = await db.from("households").update(patch)
      .eq("id", session.householdId).select("id, code, name, timezone, settings").single();
    if (error) throw new ApiError("server", error.message, 500);
    return { household: data };
  },

  "device.update": async (body) => {
    const session = await authenticate(body);
    const patch: Record<string, unknown> = {};
    if (typeof body.kiosk === "boolean") patch.kiosk = body.kiosk;
    if (typeof body.label === "string") patch.label = str(body.label, "Label", 40, false) || null;
    if (isUuid(body.memberId)) {
      const { data: member } = await db.from("members").select("id")
        .eq("id", body.memberId).eq("household_id", session.householdId).maybeSingle();
      if (!member) throw new ApiError("invalid", "That person isn't in this household.");
      patch.member_id = body.memberId;
    }
    if (!Object.keys(patch).length) return { ok: true };
    const { error } = await db.from("devices").update(patch).eq("id", session.device.id);
    if (error) throw new ApiError("server", error.message, 500);
    return { ok: true };
  },

  "device.forget": async (body) => {
    const session = await authenticate(body);
    await db.from("devices").delete().eq("id", session.device.id);
    return { ok: true };
  },
};

/* ------------------------------------------------------------------ serve */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json({ error: { code: "method", message: "POST only." } }, 405);
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const handler = ops[String(body.op ?? "")];
    if (!handler) {
      return json({ error: { code: "unknown_op", message: `Unknown operation.` } }, 400);
    }
    return json({ data: await handler(body, ip) });
  } catch (err) {
    if (err instanceof ApiError) {
      return json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error(err);
    return json({ error: { code: "server", message: "Something went wrong on our end." } }, 500);
  }
});
