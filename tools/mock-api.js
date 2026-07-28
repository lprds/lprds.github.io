#!/usr/bin/env node
/* Local dev/test stand-in for the On It sync API.
 *
 * Speaks the same JSON contract as supabase/functions/api/index.ts, backed by
 * in-memory state, and also serves the static app. It exists so the front end
 * can be driven in a browser without touching real household data:
 *
 *   node tools/mock-api.js
 *   open http://localhost:8787/onit/?api=http://localhost:8787/api
 *
 * It is a harness, not a second implementation — when the two disagree, the
 * edge function is right.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.resolve(__dirname, '..');

const db = { households: [], members: [], devices: [], tasks: [], events: [], kudos: [] };
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nextOccurrence(rule, from, base) {
  if (rule === 'none') return null;
  let cur = from && from >= base ? from : base;
  for (let i = 0; i < 400; i++) {
    if (rule === 'daily') cur = addDays(cur, 1);
    else if (rule === 'weekdays') { do { cur = addDays(cur, 1); } while ([0, 6].includes(new Date(cur + 'T12:00:00Z').getUTCDay())); }
    else if (rule === 'weekly') cur = addDays(cur, 7);
    else if (rule === 'biweekly') cur = addDays(cur, 14);
    else if (rule === 'monthly') cur = addDays(cur, 30);
    else return null;
    if (cur > base) return cur;
  }
  return null;
}

class Fail extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

function auth(body) {
  const device = db.devices.find((d) => d.token === body.token);
  if (!device) throw new Fail('unauthenticated', "This device isn't set up yet.", 401);
  let actorId = device.member_id;
  if (body.actingAs && body.actingAs !== device.member_id) {
    if (!device.kiosk) throw new Fail('forbidden', 'This device can only act as its own member.', 403);
    const m = db.members.find((x) => x.id === body.actingAs && x.household_id === device.household_id);
    if (!m) throw new Fail('invalid', "That person isn't in this household.");
    actorId = body.actingAs;
  }
  return { device, householdId: device.household_id, actorId };
}

function log(householdId, taskId, actorId, kind, detail = {}) {
  db.events.push({ id: db.events.length + 1, household_id: householdId, task_id: taskId, actor_id: actorId, kind, detail, created_at: now() });
}

function taskOr404(householdId, id) {
  const t = db.tasks.find((x) => x.id === id && x.household_id === householdId);
  if (!t) throw new Fail('not_found', 'That item no longer exists.', 404);
  return t;
}

const ops = {
  'household.create'(b) {
    if (!String(b.householdName || '').trim()) throw new Fail('invalid', 'Household name is required.');
    if (!String(b.memberName || '').trim()) throw new Fail('invalid', 'Your name is required.');
    const household = { id: uid(), code: `TEST-HOUSE-${1000 + db.households.length}`, name: b.householdName.trim(), timezone: b.timezone || 'UTC', settings: {} };
    const member = { id: uid(), household_id: household.id, name: b.memberName.trim(), color: b.color || 'teal', is_owner: true };
    const token = uid();
    db.households.push(household);
    db.members.push(member);
    db.devices.push({ id: uid(), household_id: household.id, member_id: member.id, token, kiosk: !!b.kiosk });
    log(household.id, null, member.id, 'household_created', { name: household.name });
    return { token, household, member };
  },
  'household.peek'(b) {
    const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const household = db.households.find((x) => x.code === code);
    if (!household) throw new Fail('not_found', 'No household with that code. Check for typos.', 404);
    return {
      household: { name: household.name },
      members: db.members.filter((m) => m.household_id === household.id)
        .map(({ id, name, color }) => ({ id, name, color })),
    };
  },
  'household.join'(b) {
    const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const household = db.households.find((x) => x.code === code);
    if (!household) throw new Fail('not_found', 'No household with that code. Check for typos.', 404);
    let member;
    if (b.memberId) {
      member = db.members.find((m) => m.id === b.memberId && m.household_id === household.id);
      if (!member) throw new Fail('invalid', "That person isn't in this household.");
    } else {
      if (!String(b.memberName || '').trim()) throw new Fail('invalid', 'Your name is required.');
      member = { id: uid(), household_id: household.id, name: b.memberName.trim(), color: b.color || 'rose', is_owner: false };
      db.members.push(member);
      log(household.id, null, member.id, 'member_joined', { name: member.name });
    }
    const token = uid();
    db.devices.push({ id: uid(), household_id: household.id, member_id: member.id, token, kiosk: !!b.kiosk });
    return { token, household, member };
  },
  'state.get'(b) {
    const s = auth(b);
    const household = db.households.find((x) => x.id === s.householdId);
    return {
      household,
      members: db.members.filter((m) => m.household_id === s.householdId),
      tasks: db.tasks.filter((t) => t.household_id === s.householdId),
      kudos: db.kudos.filter((k) => k.household_id === s.householdId).slice().reverse(),
      events: db.events.filter((e) => e.household_id === s.householdId),
      me: { memberId: s.actorId, deviceMemberId: s.device.member_id, kiosk: s.device.kiosk },
      serverTime: now(),
    };
  },
  'task.save'(b) {
    const s = auth(b);
    const input = b.task || {};
    if (!String(input.title || '').trim()) throw new Fail('invalid', 'Title is required.');
    if (input.owner_id && !db.members.find((m) => m.id === input.owner_id && m.household_id === s.householdId)) {
      throw new Fail('invalid', "That person isn't in this household.");
    }
    const existing = db.tasks.find((t) => t.id === input.id && t.household_id === s.householdId);
    const fields = {
      title: String(input.title).trim(),
      notes: input.notes || '',
      owner_id: input.owner_id || null,
      due_on: input.due_on || null,
      time_of_day: input.time_of_day || 'anytime',
      est_minutes: input.est_minutes || null,
      matters: !!input.matters,
      repeat_rule: input.repeat_rule || 'none',
      steps: input.steps || [],
      updated_at: now(),
    };
    if (existing) {
      Object.assign(existing, fields);
      log(s.householdId, existing.id, s.actorId, 'edited', { title: fields.title });
      return { task: existing };
    }
    const isAsk = fields.owner_id && fields.owner_id !== s.actorId;
    const task = {
      id: input.id || uid(), household_id: s.householdId, ...fields,
      status: isAsk ? 'requested' : 'open',
      requested_by: isAsk ? s.actorId : null,
      created_by: s.actorId,
      series_id: fields.repeat_rule === 'none' ? null : (input.id || uid()),
      decline_reason: null, defer_count: 0, nudged_at: null, nudge_count: 0,
      created_at: now(), completed_at: null, completed_by: null,
    };
    db.tasks.push(task);
    log(s.householdId, task.id, s.actorId, isAsk ? 'requested' : 'created', { title: task.title });
    return { task };
  },
  'task.accept'(b) {
    const s = auth(b);
    const t = taskOr404(s.householdId, b.id);
    if (t.status !== 'requested') throw new Fail('invalid', "That item isn't waiting on an answer.");
    if (t.owner_id !== s.actorId) throw new Fail('forbidden', 'Only the person being asked can accept.', 403);
    t.status = 'open';
    t.decline_reason = null;
    if (b.due_on !== undefined) t.due_on = b.due_on;
    if (b.time_of_day) t.time_of_day = b.time_of_day;
    if (b.est_minutes) t.est_minutes = b.est_minutes;
    t.updated_at = now();
    log(s.householdId, t.id, s.actorId, 'accepted', { due_on: t.due_on });
    return { task: t };
  },
  'task.decline'(b) {
    const s = auth(b);
    const t = taskOr404(s.householdId, b.id);
    if (t.owner_id !== s.actorId) throw new Fail('forbidden', 'Only the person being asked can answer this.', 403);
    t.status = 'declined';
    t.decline_reason = b.reason || null;
    t.updated_at = now();
    log(s.householdId, t.id, s.actorId, 'declined', { reason: b.reason });
    return { task: t };
  },
  'task.complete'(b) {
    const s = auth(b);
    const t = taskOr404(s.householdId, b.id);
    if (t.status === 'done') return { task: t };
    t.status = 'done';
    t.completed_at = now();
    t.completed_by = s.actorId;
    t.updated_at = now();
    log(s.householdId, t.id, s.actorId, 'completed', { title: t.title });
    let spawned = null;
    const next = nextOccurrence(t.repeat_rule, t.due_on, b.localDate || today());
    if (next) {
      spawned = {
        ...t, id: uid(), status: 'open', due_on: next, completed_at: null, completed_by: null,
        defer_count: 0, nudged_at: null, nudge_count: 0, created_at: now(),
        steps: (t.steps || []).map((x) => ({ ...x, done: false })),
        series_id: t.series_id || t.id,
      };
      db.tasks.push(spawned);
    }
    return { task: t, spawned };
  },
  'task.reopen'(b) {
    const s = auth(b);
    const t = taskOr404(s.householdId, b.id);
    Object.assign(t, { status: 'open', completed_at: null, completed_by: null, decline_reason: null, updated_at: now() });
    log(s.householdId, t.id, s.actorId, 'reopened', {});
    return { task: t };
  },
  'task.defer'(b) {
    const s = auth(b);
    const t = taskOr404(s.householdId, b.id);
    t.due_on = b.to === 'someday' ? null : b.to;
    t.defer_count = (t.defer_count || 0) + 1;
    t.updated_at = now();
    log(s.householdId, t.id, s.actorId, 'deferred', { to: t.due_on });
    return { task: t };
  },
  'task.nudge'(b) {
    const s = auth(b);
    const t = taskOr404(s.householdId, b.id);
    if (t.owner_id === s.actorId) throw new Fail('invalid', "This one's already yours.");
    if (t.nudged_at && (Date.now() - new Date(t.nudged_at).getTime()) < 20 * 3600 * 1000) {
      throw new Fail('rate_limited', 'Already flagged today.', 429);
    }
    t.nudged_at = now();
    t.nudge_count = (t.nudge_count || 0) + 1;
    log(s.householdId, t.id, s.actorId, 'nudged', {});
    return { task: t };
  },
  'task.steps'(b) {
    const s = auth(b);
    const t = taskOr404(s.householdId, b.id);
    t.steps = b.steps || [];
    t.updated_at = now();
    return { task: t };
  },
  'task.delete'(b) {
    const s = auth(b);
    const t = taskOr404(s.householdId, b.id);
    db.tasks = db.tasks.filter((x) => x.id !== t.id);
    log(s.householdId, null, s.actorId, 'deleted', { title: t.title });
    return { ok: true, id: t.id };
  },
  'kudos.send'(b) {
    const s = auth(b);
    if (!b.toMemberId || !db.members.find((m) => m.id === b.toMemberId && m.household_id === s.householdId)) {
      throw new Fail('invalid', 'Who is this for?');
    }
    const k = {
      id: uid(), household_id: s.householdId, task_id: b.taskId || null,
      from_member: s.actorId, to_member: b.toMemberId,
      emoji: b.emoji || '💛', message: b.message || '', created_at: now(), seen_at: null,
    };
    db.kudos.push(k);
    log(s.householdId, b.taskId || null, s.actorId, 'thanked', { to: b.toMemberId });
    return { kudos: k };
  },
  'kudos.seen'(b) {
    const s = auth(b);
    for (const k of db.kudos) {
      if ((b.ids || []).includes(k.id) && k.to_member === s.actorId) k.seen_at = now();
    }
    return { ok: true };
  },
  'member.update'(b) {
    const s = auth(b);
    const m = db.members.find((x) => x.id === (b.id || s.actorId) && x.household_id === s.householdId);
    if (!m) throw new Fail('invalid', 'Unknown member.');
    if (b.name !== undefined) m.name = b.name;
    if (b.color !== undefined) m.color = b.color;
    return { member: m };
  },
  'household.update'(b) {
    const s = auth(b);
    const hh = db.households.find((x) => x.id === s.householdId);
    if (b.name !== undefined) hh.name = b.name;
    if (b.settings) Object.assign(hh.settings, b.settings);
    return { household: hh };
  },
  'device.update'(b) {
    const s = auth(b);
    if (typeof b.kiosk === 'boolean') s.device.kiosk = b.kiosk;
    if (b.memberId) s.device.member_id = b.memberId;
    return { ok: true };
  },
  'device.forget'(b) {
    const s = auth(b);
    db.devices = db.devices.filter((d) => d.id !== s.device.id);
    return { ok: true };
  },
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (payload, status = 200) =>
        res.writeHead(status, { ...cors, 'Content-Type': 'application/json' })
          .end(JSON.stringify(payload));
      let body;
      try { body = JSON.parse(raw || '{}'); }
      catch { return send({ error: { code: 'invalid', message: 'Bad JSON.' } }, 400); }
      const handler = ops[body.op];
      if (!handler) return send({ error: { code: 'unknown_op', message: 'Unknown operation.' } }, 400);
      try { send({ data: handler(body) }); }
      catch (err) {
        if (err instanceof Fail) return send({ error: { code: err.code, message: err.message } }, err.status);
        console.error(err);
        send({ error: { code: 'server', message: 'Mock server blew up.' } }, 500);
      }
    });
    return;
  }

  if (url.pathname === '/__reset' ) {
    for (const k of Object.keys(db)) db[k] = [];
    return res.writeHead(200, cors).end('reset');
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return res.writeHead(404, cors).end('not found');
  }
  res.writeHead(200, { ...cors, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`mock api + static server on http://localhost:${PORT}`);
  console.log(`app: http://localhost:${PORT}/onit/?api=http://localhost:${PORT}/api`);
});
