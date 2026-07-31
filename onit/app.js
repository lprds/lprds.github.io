/* =============================================================================
   On It — a shared household list for couples
   -----------------------------------------------------------------------------
   Shaped around the central idea in Melissa Orlov's "The ADHD Effect on
   Marriage": the damage rarely comes from the forgotten chore. It comes from
   the loop that follows — one partner reminds, the other hears nagging, and the
   marriage slides into a parent/child dynamic that neither person wanted.

   So the rules this app encodes:
     · Requests are written down in one agreed place, so nothing rests on memory
       and "I told you" / "you never told me" stops being a fight.
     · Nobody assigns work to anybody. An ask is a question, and it becomes a
       real task only when the other person says yes and picks their own when.
     · The list does the reminding. Nudges are flags on a board, capped at one
       a day, and they never turn into a stream of messages.
     · Nothing on screen scolds. Overdue is "carried over"; postponing is a
       first-class button, not a failure.
     · Starting is the hard part, so every item can carry a time estimate, be
       filtered to the minutes actually available, be split into steps, and be
       run against a visible timer.
     · Finished work is seen and thanked, because appreciation is what refills
       the account the symptoms drain.

   Architecture: a single snapshot from the server, plus a queue of pending
   mutations replayed on top of it. Every tap lands instantly and locally; the
   network catches up when it can. See `derive()` and `flush()`.
   ========================================================================== */

(() => {
  'use strict';

  const API = new URLSearchParams(location.search).get('api') ||
    'https://jelaeunuqsqdekftrlup.supabase.co/functions/v1/api';

  const KEY = {
    token: 'onit.v1.token',
    snapshot: 'onit.v1.snapshot',
    queue: 'onit.v1.queue',
    prefs: 'onit.v1.prefs',
    acting: 'onit.v1.acting',
  };

  const COLORS = ['teal', 'rose', 'indigo', 'amber', 'violet', 'forest', 'slate', 'clay'];
  const TIMES = [
    { id: 'morning', label: 'Morning' },
    { id: 'afternoon', label: 'Afternoon' },
    { id: 'evening', label: 'Evening' },
    { id: 'anytime', label: 'Anytime' },
  ];
  const LENGTHS = [2, 5, 15, 30, 60, 120];
  const REPEATS = [
    { id: 'none', label: "Doesn't repeat" },
    { id: 'daily', label: 'Every day' },
    { id: 'weekdays', label: 'Weekdays' },
    { id: 'weekly', label: 'Every week' },
    { id: 'biweekly', label: 'Every 2 weeks' },
    { id: 'monthly', label: 'Every month' },
  ];
  const POLL_MS = 10000;
  const KIOSK_IDLE_MS = 90000;

  /* ------------------------------------------------------------------ dom */

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const k in (props || {})) {
      const v = props[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    add(el, kids);
    return el;
  }

  function add(parent, kids) {
    for (const kid of (Array.isArray(kids) ? kids : [kids]).flat(4)) {
      if (kid === null || kid === undefined || kid === false || kid === true) continue;
      parent.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
  }

  const PATHS = {
    check: '<polyline points="20 6 9 17 4 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.4 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.1z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    heart: '<path d="M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 12 5.5 5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    timer: '<path d="M10 2h4"/><path d="M12 14v-4"/><circle cx="12" cy="14" r="8"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    chevron: '<polyline points="9 18 15 12 9 6"/>',
    down: '<polyline points="6 9 12 15 18 9"/>',
    dots: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    undo: '<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.1-9.4L3 7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    sparkle: '<path d="m12 3 2.1 5.4L20 10.5l-5.9 2.1L12 18l-2.1-5.4L4 10.5l5.9-2.1z"/>',
    pause: '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4h6v3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    split: '<path d="M4 6h6M4 12h10M4 18h14"/><path d="M18 4v4M20 6h-4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  };

  function icon(name, size) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (size) { svg.style.width = size + 'px'; svg.style.height = size + 'px'; }
    svg.innerHTML = PATHS[name] || '';
    if (name === 'heart' || name === 'sparkle' || name === 'play' || name === 'pause') {
      svg.setAttribute('fill', 'currentColor');
      svg.setAttribute('stroke-width', '1.2');
    }
    return svg;
  }

  /* -------------------------------------------------------------- storage */

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  }
  function drop(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }

  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }));

  /* ----------------------------------------------------------------- time */

  const pad = (n) => String(n).padStart(2, '0');
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  function shiftISO(iso, days) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }
  function weekdayOf(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  }
  function nextSaturday(from) {
    let cur = from;
    do { cur = shiftISO(cur, 1); } while (weekdayOf(cur) !== 6);
    return cur;
  }
  function daysBetween(a, b) {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  }
  function humanDay(iso) {
    if (!iso) return 'No date';
    const diff = daysBetween(todayISO(), iso);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (diff > 1 && diff < 7) return dt.toLocaleDateString(undefined, { weekday: 'long' });
    if (diff < -1 && diff > -7) return `${Math.abs(diff)} days ago`;
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function minutesLabel(m) {
    if (!m) return null;
    if (m < 60) return `${m} min`;
    if (m % 60 === 0) return `${m / 60} hr`;
    return `${Math.floor(m / 60)} hr ${m % 60}`;
  }
  function agoLabel(ts) {
    if (!ts) return '';
    const secs = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    const days = Math.floor(secs / 86400);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* ---------------------------------------------------------------- state */

  const state = {
    token: load(KEY.token, null),
    snapshot: load(KEY.snapshot, null),
    queue: load(KEY.queue, []),
    acting: load(KEY.acting, null),
    prefs: Object.assign(
      { theme: 'system', sound: true, cap: 6, scope: 'everyone' },
      load(KEY.prefs, {}),
    ),
    status: 'idle',          // idle | syncing | offline | error
    booting: true,
    loadError: null,
    view: 'today',
    fit: null,               // minutes available, or null for "any length"
    showUndated: false,
    listFilter: { who: 'all', status: 'open' },
    setup: { screen: 'welcome', busy: false, error: null, peek: null, form: {} },
    sheet: null,
    focus: null,
  };

  const el = { root: document.getElementById('root'), toasts: document.getElementById('toasts') };

  function persistPrefs() { save(KEY.prefs, state.prefs); }

  /* ------------------------------------------------------------------ api */

  class ApiError extends Error {
    constructor(code, message, status) {
      super(message);
      this.code = code;
      this.status = status;
      // A 4xx means the request itself is wrong and replaying will not help.
      this.permanent = status >= 400 && status < 500 && status !== 408 && status !== 429;
    }
  }

  async function call(op, payload = {}) {
    const body = { op, ...payload };
    if (state.token) body.token = state.token;
    if (state.acting && state.snapshot?.me?.kiosk) body.actingAs = state.acting;

    let res;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ApiError('offline', "Can't reach the server right now.", 0);
    }

    let json = null;
    try { json = await res.json(); } catch { /* non-JSON error page */ }
    if (!res.ok || json?.error) {
      const e = json?.error || {};
      throw new ApiError(e.code || 'server', e.message || 'Something went wrong.', res.status);
    }
    return json.data;
  }

  /* ------------------------------------------- optimistic mutation pipeline */

  function enqueue(op, payload) {
    state.queue.push({ cid: uid(), op, payload });
    save(KEY.queue, state.queue);
    render();
    flush();
  }

  let flushing = false;

  async function flush() {
    if (flushing || !state.queue.length) return;
    flushing = true;
    state.status = 'syncing';
    renderChrome();

    try {
      while (state.queue.length) {
        const job = state.queue[0];
        try {
          const data = await call(job.op, job.payload);
          absorb(job.op, data);
          state.queue.shift();
          save(KEY.queue, state.queue);
        } catch (err) {
          if (err instanceof ApiError && err.permanent) {
            // Replaying will never succeed — drop it and say so, rather than
            // wedging the queue behind one bad request forever.
            state.queue.shift();
            save(KEY.queue, state.queue);
            toast(err.message, 'error');
            if (err.code === 'unauthenticated') { signOut(true); return; }
            continue;
          }
          state.status = err instanceof ApiError && err.status === 0 ? 'offline' : 'error';
          state.lastError = err.message;
          if (!editing()) render();
          return;
        }
      }
      state.status = 'idle';
      state.lastError = null;
      if (!editing()) render();
      refresh();
    } finally {
      flushing = false;
    }
  }

  /** Fold a mutation's authoritative server response back into the snapshot. */
  function absorb(op, data) {
    const snap = state.snapshot;
    if (!snap || !data) return;
    const upsert = (task) => {
      if (!task) return;
      const i = snap.tasks.findIndex((t) => t.id === task.id);
      if (i >= 0) snap.tasks[i] = task; else snap.tasks.push(task);
    };
    upsert(data.task);
    upsert(data.spawned);
    if (data.kudos) snap.kudos.unshift(data.kudos);
    if (op === 'task.delete' && data.id) {
      snap.tasks = snap.tasks.filter((t) => t.id !== data.id);
    }
    if (data.member) {
      const i = snap.members.findIndex((m) => m.id === data.member.id);
      if (i >= 0) snap.members[i] = data.member;
    }
    if (data.household) snap.household = data.household;
    save(KEY.snapshot, snap);
  }

  /** True while the person is mid-edit: a sheet is open or a field has focus.
   *  A background sync must never repaint out from under them — rebuilding the
   *  DOM destroys the focused input, which on a phone dismisses the keyboard
   *  and jumps the page to the top. Data still lands; the screen catches up at
   *  the next user-driven render or the first poll after they finish. */
  function editing() {
    const a = document.activeElement;
    return !!state.sheet || !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  }

  async function refresh() {
    if (!state.token) return;
    // A poll must never stomp on work that hasn't been accepted by the server.
    if (state.queue.length || flushing) return;
    try {
      const data = await call('state.get', { localDate: todayISO() });
      state.snapshot = data;
      state.loadError = null;
      state.status = 'idle';
      if (data.me.kiosk && !state.acting) state.acting = data.me.memberId;
      save(KEY.snapshot, data);
      if (!editing()) render();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unauthenticated') return signOut(true);
      state.status = err instanceof ApiError && err.status === 0 ? 'offline' : 'error';
      if (!state.snapshot) state.loadError = err.message;
      if (!editing()) render();
    }
  }

  /** The rendered world: last server snapshot with pending mutations on top. */
  function derive() {
    if (!state.snapshot) return null;
    const snap = {
      ...state.snapshot,
      tasks: state.snapshot.tasks.map((t) => ({ ...t })),
      kudos: state.snapshot.kudos.slice(),
      members: state.snapshot.members.slice(),
    };
    const meId = myId(snap);
    const find = (id) => snap.tasks.find((t) => t.id === id);

    for (const { op, payload } of state.queue) {
      const t = payload.id ? find(payload.id) : null;
      switch (op) {
        case 'task.save': {
          const input = payload.task;
          const existing = find(input.id);
          if (existing) {
            const oldOwner = existing.owner_id;
            Object.assign(existing, input);
            if ((existing.status === 'open' || existing.status === 'requested') && existing.owner_id !== oldOwner) {
              if (existing.owner_id && existing.owner_id !== meId) {
                existing.status = 'requested'; existing.requested_by = meId; existing.decline_reason = null;
              } else {
                existing.status = 'open'; existing.requested_by = null;
              }
            }
          } else {
            const isAsk = input.owner_id && input.owner_id !== meId;
            snap.tasks.push({
              notes: '', steps: [], defer_count: 0, nudge_count: 0,
              completed_at: null, completed_by: null, nudged_at: null,
              created_at: new Date().toISOString(),
              ...input,
              status: isAsk ? 'requested' : 'open',
              requested_by: isAsk ? meId : null,
              created_by: meId,
              household_id: snap.household.id,
            });
          }
          break;
        }
        case 'task.complete':
          if (t) Object.assign(t, {
            status: 'done', completed_at: new Date().toISOString(), completed_by: meId,
          });
          break;
        case 'task.reopen':
          if (t) Object.assign(t, { status: 'open', completed_at: null, completed_by: null });
          break;
        case 'task.accept':
          if (t) Object.assign(t, {
            status: 'open',
            due_on: payload.due_on ?? t.due_on,
            time_of_day: payload.time_of_day ?? t.time_of_day,
            est_minutes: payload.est_minutes ?? t.est_minutes,
          });
          break;
        case 'task.decline':
          if (t) Object.assign(t, { status: 'declined', decline_reason: payload.reason || null });
          break;
        case 'task.defer':
          if (t) Object.assign(t, {
            due_on: payload.to === 'someday' ? null : payload.to,
            defer_count: (t.defer_count || 0) + 1,
          });
          break;
        case 'task.steps':
          if (t) t.steps = payload.steps;
          break;
        case 'task.nudge':
          if (t) Object.assign(t, {
            nudged_at: new Date().toISOString(), nudge_count: (t.nudge_count || 0) + 1,
          });
          break;
        case 'task.delete':
          snap.tasks = snap.tasks.filter((x) => x.id !== payload.id);
          break;
        case 'kudos.seen': {
          // Applied locally too, otherwise the "unseen" highlight survives the
          // optimistic pass and the Wins screen re-queues the same op forever.
          const ids = new Set(payload.ids || []);
          snap.kudos = snap.kudos.map((k) =>
            ids.has(k.id) ? { ...k, seen_at: new Date().toISOString() } : k);
          break;
        }
        case 'kudos.send':
          snap.kudos.unshift({
            id: uid(), task_id: payload.taskId || null, from_member: meId,
            to_member: payload.toMemberId, emoji: payload.emoji, message: payload.message || '',
            created_at: new Date().toISOString(), seen_at: null,
          });
          break;
      }
    }
    return snap;
  }

  const myId = (snap) => (snap?.me?.kiosk ? (state.acting || snap.me.memberId) : snap?.me?.memberId);
  const memberOf = (snap, id) => snap.members.find((m) => m.id === id) || null;
  const nameOf = (snap, id) => memberOf(snap, id)?.name || 'Someone';
  const initials = (name) => (name || '?').trim().slice(0, 2).toUpperCase();

  /* ------------------------------------------------------------- feedback */

  function toast(message, tone, action) {
    const node = h('div', { class: 'toast', dataset: { tone: tone || 'plain' } },
      h('span', { text: message }),
      action && h('button', {
        class: 'btn btn-sm', text: action.label,
        onclick: () => { node.remove(); action.run(); },
      }),
    );
    el.toasts.append(node);
    setTimeout(() => {
      node.style.transition = 'opacity .25s';
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 260);
    }, action ? 7000 : 3800);
  }

  let audio = null;
  function chime() {
    if (!state.prefs.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      [0, 0.11].forEach((delay, i) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 0 ? 660 : 990;
        const t0 = audio.currentTime + delay;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.13, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        osc.connect(gain).connect(audio.destination);
        osc.start(t0);
        osc.stop(t0 + 0.26);
      });
    } catch { /* audio is a nicety, never a requirement */ }
  }

  /* ------------------------------------------------------------ selectors */

  const isLive = (t) => t.status === 'open' || t.status === 'requested';

  function todayTasks(snap) {
    const today = todayISO();
    return snap.tasks.filter((t) =>
      t.status === 'open' && t.due_on && t.due_on <= today);
  }

  function scopeFilter(snap, tasks) {
    if (state.prefs.scope === 'mine') {
      const me = myId(snap);
      return tasks.filter((t) => t.owner_id === me || !t.owner_id);
    }
    return tasks;
  }

  function fitFilter(tasks) {
    if (!state.fit) return tasks;
    return tasks.filter((t) => t.est_minutes && t.est_minutes <= state.fit);
  }

  const incomingAsks = (snap) =>
    snap.tasks.filter((t) => t.status === 'requested' && t.owner_id === myId(snap));
  const outgoingAsks = (snap) =>
    snap.tasks.filter((t) => t.status === 'requested' && t.owner_id !== myId(snap));

  function completedOn(snap, iso) {
    return snap.tasks.filter((t) =>
      t.status === 'done' && t.completed_at && t.completed_at.slice(0, 10) === iso);
  }

  function streak(snap) {
    let count = 0;
    let cursor = todayISO();
    if (!completedOn(snap, cursor).length) {
      cursor = shiftISO(cursor, -1);
      if (!completedOn(snap, cursor).length) return 0;
    }
    while (completedOn(snap, cursor).length) { count++; cursor = shiftISO(cursor, -1); }
    return count;
  }

  /* --------------------------------------------------------------- actions */

  function completeTask(task, node) {
    const run = () => {
      enqueue('task.complete', { id: task.id, localDate: todayISO() });
      chime();
    };
    if (node && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.classList.add('is-completing');
      setTimeout(run, 240);
    } else run();
  }

  function deferTask(task, to) {
    const today = todayISO();
    const base = task.due_on && task.due_on > today ? task.due_on : today;
    const target =
      to === 'tomorrow' ? shiftISO(base, 1)
      : to === 'weekend' ? nextSaturday(base)
      : to === 'nextweek' ? shiftISO(base, 7)
      : to === 'someday' ? 'someday'
      : to;
    enqueue('task.defer', { id: task.id, to: target, localDate: today });
  }

  function toggleStep(task, stepId) {
    const steps = (task.steps || []).map((s) =>
      s.id === stepId ? { ...s, done: !s.done } : s);
    enqueue('task.steps', { id: task.id, steps });
  }

  function signOut(forced) {
    drop(KEY.token); drop(KEY.snapshot); drop(KEY.queue); drop(KEY.acting);
    state.token = null; state.snapshot = null; state.queue = []; state.acting = null;
    state.setup = { screen: 'welcome', busy: false, error: null, peek: null, form: {} };
    state.sheet = null;
    render();
    if (forced) toast('This device was unlinked. Set it up again to continue.', 'error');
  }

  /* ====================================================================== */
  /*  Setup                                                                 */
  /* ====================================================================== */

  function renderSetup() {
    const s = state.setup;
    const card = h('div', { class: 'setup-card' });

    const brand = h('div', { class: 'brand' },
      h('span', { class: 'wordmark', text: 'On It' }),
      h('p', { text: 'The household list that does the reminding.' }),
    );

    if (s.screen === 'welcome') {
      add(card, [
        brand,
        h('h2', { text: 'Set up your household' }),
        h('p', { class: 'lede', text: 'One shared list, on every phone and on the tablet in the kitchen. One of you creates it, the other joins with a code.' }),
        h('button', {
          class: 'btn btn-primary btn-block', onclick: () => { s.screen = 'create'; s.error = null; render(); },
        }, icon('plus'), 'Create a household'),
        h('div', { class: 'alt' }, 'Already have a code? ',
          h('button', { class: 'link', text: 'Join instead', onclick: () => { s.screen = 'join'; s.error = null; render(); } })),
      ]);
    }

    if (s.screen === 'create') add(card, setupCreate());
    if (s.screen === 'join') add(card, setupJoin());
    if (s.screen === 'joinWho') add(card, setupJoinWho());
    if (s.screen === 'done') add(card, setupDone());

    return h('div', { class: 'setup' },
      card,
      s.screen === 'welcome' && h('div', { class: 'why' },
        h('h3', { text: 'How it works' }),
        h('ul', {},
          h('li', { text: 'Asking someone creates a request, not an order. They say yes and pick when.' }),
          h('li', { text: 'Everything is written down in one place, so nothing depends on remembering.' }),
          h('li', { text: 'The list does the reminding, so neither of you has to.' }),
          h('li', { text: 'Nothing gets marked late or scolds anyone. Moving something is one tap.' }),
        ),
      ),
    );
  }

  function colorPicker(selected, onPick) {
    return h('div', { class: 'color-picker', role: 'group', 'aria-label': 'Pick your colour' },
      COLORS.map((c) => h('button', {
        type: 'button',
        class: `swatch m-${c}`,
        'aria-pressed': String(c === selected),
        'aria-label': c,
        onclick: () => onPick(c),
      })),
    );
  }

  function setupCreate() {
    const s = state.setup;
    const f = s.form;
    const submit = async (ev) => {
      ev.preventDefault();
      if (s.busy) return;
      // Validated here rather than by disabling the button: text fields do not
      // re-render on every keystroke, so a disabled button would never wake up.
      if (!(f.household || '').trim()) { s.error = 'Give your household a name.'; return render(); }
      if (!(f.name || '').trim()) { s.error = 'Add your first name.'; return render(); }
      s.busy = true; s.error = null; render();
      try {
        const data = await call('household.create', {
          householdName: f.household || '',
          memberName: f.name || '',
          color: f.color || 'teal',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        state.token = data.token;
        save(KEY.token, data.token);
        s.screen = 'done';
        s.created = data.household;
        s.busy = false;
        render();
        refresh();
      } catch (err) {
        s.busy = false;
        s.error = err.message;
        render();
      }
    };

    return h('form', { onsubmit: submit, novalidate: true },
      h('h2', { text: 'Create a household' }),
      h('p', { class: 'lede', text: "You'll get a code to share with your partner." }),
      h('label', { class: 'field' },
        h('span', { class: 'label', text: 'Household name' }),
        h('input', {
          class: 'input', value: f.household || '', maxlength: 60, required: true,
          placeholder: 'The Stone house',
          'aria-invalid': String(!!s.error),
          oninput: (e) => { f.household = e.target.value; },
        }),
      ),
      h('label', { class: 'field' },
        h('span', { class: 'label', text: 'Your first name' }),
        h('input', {
          class: 'input', value: f.name || '', maxlength: 40, required: true,
          placeholder: 'Danielle',
          oninput: (e) => { f.name = e.target.value; },
        }),
      ),
      h('div', { class: 'field' },
        h('span', { class: 'label', text: 'Your colour' }),
        colorPicker(f.color || 'teal', (c) => { f.color = c; render(); }),
      ),
      s.error && h('p', { class: 'error-text' }, icon('alert', 14), s.error),
      h('button', {
        class: 'btn btn-primary btn-block', type: 'submit',
        'aria-disabled': String(s.busy),
        text: s.busy ? 'Creating…' : 'Create household',
      }),
      h('div', { class: 'alt' },
        h('button', { type: 'button', class: 'link', text: 'Back', onclick: () => { s.screen = 'welcome'; render(); } })),
    );
  }

  function setupJoin() {
    const s = state.setup;
    const f = s.form;
    const submit = async (ev) => {
      ev.preventDefault();
      if (s.busy) return;
      s.busy = true; s.error = null; render();
      try {
        const data = await call('household.peek', { code: f.code || '' });
        s.peek = data;
        s.screen = 'joinWho';
        s.busy = false;
        render();
      } catch (err) {
        s.busy = false; s.error = err.message; render();
      }
    };

    return h('form', { onsubmit: submit, novalidate: true },
      h('h2', { text: 'Join a household' }),
      h('p', { class: 'lede', text: 'Enter the code from the person who set it up.' }),
      h('label', { class: 'field' },
        h('span', { class: 'label', text: 'Household code' }),
        h('input', {
          class: 'input input-lg', value: f.code || '', maxlength: 40, required: true,
          placeholder: 'SUNNY-BASIL-4173', autocapitalize: 'characters', autocomplete: 'off',
          'aria-invalid': String(!!s.error),
          oninput: (e) => { f.code = e.target.value; },
        }),
        h('span', { class: 'hint', text: 'Capital letters and dashes do not matter.' }),
      ),
      s.error && h('p', { class: 'error-text' }, icon('alert', 14), s.error),
      h('button', {
        class: 'btn btn-primary btn-block', type: 'submit',
        'aria-disabled': String(s.busy),
        text: s.busy ? 'Looking…' : 'Continue',
      }),
      h('div', { class: 'alt' },
        h('button', { type: 'button', class: 'link', text: 'Back', onclick: () => { s.screen = 'welcome'; render(); } })),
    );
  }

  function setupJoinWho() {
    const s = state.setup;
    const f = s.form;

    const join = async (payload) => {
      if (s.busy) return;
      s.busy = true; s.error = null; render();
      try {
        const data = await call('household.join', { code: f.code, ...payload });
        state.token = data.token;
        save(KEY.token, data.token);
        if (payload.kiosk) {
          state.prefs.kiosk = true;
          state.prefs.scope = 'everyone';
          persistPrefs();
        }
        s.screen = 'done';
        s.created = data.household;
        s.busy = false;
        render();
        refresh();
      } catch (err) {
        s.busy = false; s.error = err.message; render();
      }
    };

    return h('div', {},
      h('h2', { text: s.peek.household.name }),
      h('p', { class: 'lede', text: 'Who is using this device?' }),

      h('div', { class: 'sheet-section' },
        h('h3', { text: 'Already in this household' }),
        s.peek.members.map((m) => h('button', {
          class: 'list-row', type: 'button',
          'aria-disabled': String(s.busy),
          onclick: () => join({ memberId: m.id }),
        },
          h('span', { class: `avatar m-${m.color}`, text: initials(m.name) }),
          h('span', { class: 'grow' }, h('span', { class: 't', text: m.name })),
          icon('chevron', 16),
        )),
      ),

      h('div', { class: 'sheet-section' },
        h('h3', { text: "I'm someone new" }),
        h('label', { class: 'field' },
          h('span', { class: 'label', text: 'Your first name' }),
          h('input', {
            class: 'input', value: f.name || '', maxlength: 40, placeholder: 'Alex',
            oninput: (e) => { f.name = e.target.value; },
          }),
        ),
        h('div', { class: 'field' },
          h('span', { class: 'label', text: 'Your colour' }),
          colorPicker(f.color || 'rose', (c) => { f.color = c; render(); }),
        ),
        h('button', {
          class: 'btn btn-block', type: 'button',
          'aria-disabled': String(s.busy),
          text: 'Join as a new person',
          onclick: () => {
            const name = (f.name || '').trim();
            if (!name) { s.error = 'Add your first name to join.'; return render(); }
            join({ memberName: name, color: f.color || 'rose' });
          },
        }),
      ),

      h('div', { class: 'sheet-section' },
        h('h3', { text: 'Or set this up as the shared tablet' }),
        h('p', { class: 'lede', text: 'For a tablet on the fridge or the counter. It shows everyone\'s list and lets whoever walks past check things off as themselves.' }),
        h('button', {
          class: 'btn btn-block', type: 'button',
          'aria-disabled': String(s.busy || !s.peek.members.length),
          onclick: () => join({ memberId: s.peek.members[0].id, kiosk: true, deviceLabel: 'Kitchen tablet' }),
        }, icon('sun'), 'Use as the household tablet'),
      ),

      s.error && h('p', { class: 'error-text' }, icon('alert', 14), s.error),
      h('div', { class: 'alt' },
        h('button', { type: 'button', class: 'link', text: 'Back', onclick: () => { s.screen = 'join'; render(); } })),
    );
  }

  function setupDone() {
    const code = state.setup.created?.code;
    return h('div', {},
      h('h2', { text: "You're set up" }),
      h('p', { class: 'lede', text: 'Share this code with the people in your household. They enter it once on their own phone.' }),
      h('div', { class: 'code-card' },
        h('div', { class: 'code', text: code || '...' }),
        h('p', { class: 'cap', text: 'Anyone with this code can join your household list, so share it the way you would a house key.' }),
      ),
      h('button', {
        class: 'btn btn-block', style: 'margin-top:1rem',
        onclick: () => { navigator.clipboard?.writeText(code).then(() => toast('Code copied', 'ok'), () => {}); },
      }, icon('copy'), 'Copy code'),
      h('button', {
        class: 'btn btn-primary btn-block', style: 'margin-top:.6rem',
        text: 'Open my list',
        onclick: () => { state.setup.screen = 'welcome'; render(); },
      }),
    );
  }

  /* ====================================================================== */
  /*  Shell                                                                 */
  /* ====================================================================== */

  function renderChrome() {
    const badge = document.querySelector('.sync');
    if (badge) {
      badge.dataset.state = state.status;
      badge.querySelector('.sync-label').textContent = syncLabel();
    }
  }

  function syncLabel() {
    if (state.queue.length && state.status !== 'idle') return `${state.queue.length} to send`;
    if (state.status === 'offline') return 'Offline';
    if (state.status === 'error') return 'Sync problem';
    if (state.status === 'syncing') return 'Saving…';
    return 'Synced';
  }

  function topbar(snap) {
    const me = memberOf(snap, myId(snap));
    return h('header', { class: 'topbar' },
      h('button', {
        class: 'home', onclick: () => { state.view = 'today'; render(); },
        'aria-label': 'On It, go to Today',
      },
        h('span', { class: 'wordmark', text: 'On It' }),
        h('span', { class: 'household-name', text: snap.household.name }),
      ),
      h('div', { class: 'spacer' }),
      h('div', { class: 'sync', dataset: { state: state.status }, title: state.lastError || '' },
        h('i', { class: 'dot' }),
        h('span', { class: 'sync-label', text: syncLabel() }),
      ),
      snap.me.kiosk && h('button', {
        class: 'who', onclick: openPersonSheet,
        'aria-label': `Acting as ${me?.name || 'someone'}. Change person.`,
      },
        h('span', { class: `avatar m-${me?.color || 'teal'}`, text: initials(me?.name) }),
        h('span', { text: me?.name || 'Choose' }),
        icon('down'),
      ),
      h('button', { class: 'icon-btn', onclick: openSettings, 'aria-label': 'Settings' }, icon('gear')),
    );
  }

  function nav(snap) {
    const asks = incomingAsks(snap).length;
    const unseenKudos = snap.kudos.filter((k) => k.to_member === myId(snap) && !k.seen_at).length;
    const tabs = [
      { id: 'today', label: 'Today', ico: 'sun' },
      { id: 'asks', label: 'Asks', ico: 'inbox', pip: asks },
      { id: 'all', label: 'Everything', ico: 'list' },
      { id: 'wins', label: 'Wins', ico: 'heart', pip: unseenKudos },
    ];
    return h('nav', { class: 'nav', 'aria-label': 'Sections' },
      h('div', { class: 'rail-brand' }, h('span', { class: 'wordmark', text: 'On It' })),
      tabs.map((t) => h('button', {
        class: 'tab',
        'aria-current': state.view === t.id ? 'page' : null,
        onclick: () => { state.view = t.id; window.scrollTo(0, 0); render(); },
      },
        icon(t.ico),
        h('span', { text: t.label }),
        t.pip > 0 && h('span', { class: 'pip', text: String(t.pip), 'aria-label': `${t.pip} waiting` }),
      )),
    );
  }

  function kioskClock() {
    const now = new Date();
    return h('div', { class: 'kiosk-clock' },
      h('span', { class: 'time', text: now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) }),
      h('span', { class: 'date', text: now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) }),
    );
  }

  /* ====================================================================== */
  /*  Today                                                                 */
  /* ====================================================================== */

  function viewToday(snap) {
    const today = todayISO();
    const all = scopeFilter(snap, todayTasks(snap));
    const shown = fitFilter(all);
    const hiddenByFit = all.length - shown.length;

    const overdue = shown.filter((t) => t.due_on < today)
      .sort((a, b) => a.due_on.localeCompare(b.due_on));
    const byTime = TIMES.map((slot) => ({
      slot,
      items: shown.filter((t) => t.due_on === today && t.time_of_day === slot.id),
    })).filter((g) => g.items.length);

    const undated = scopeFilter(snap, snap.tasks.filter((t) => t.status === 'open' && !t.due_on));
    const view = h('main', { class: 'view' });

    add(view, [
      h('div', { class: 'view-head' },
        h('div', {},
          h('h1', { text: 'Today' }),
          h('p', { class: 'sub', text: new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) }),
        ),
        h('button', {
          class: 'chip', 'aria-pressed': String(state.prefs.scope === 'mine'),
          onclick: () => {
            state.prefs.scope = state.prefs.scope === 'mine' ? 'everyone' : 'mine';
            persistPrefs(); render();
          },
          text: state.prefs.scope === 'mine' ? 'Just mine' : 'Everyone',
        }),
      ),

      // Task initiation, not task tracking: pick the window you actually have.
      h('div', { class: 'chip-scroll', role: 'group', 'aria-label': 'Filter by how long you have' },
        h('button', {
          class: 'chip', 'aria-pressed': String(state.fit === null),
          onclick: () => { state.fit = null; render(); }, text: 'Any length',
        }),
        [5, 15, 30, 60].map((m) => h('button', {
          class: 'chip', 'aria-pressed': String(state.fit === m),
          onclick: () => { state.fit = state.fit === m ? null : m; render(); },
        }, icon('clock', 14), `${m < 60 ? m + ' min' : '1 hr'}`)),
      ),
    ]);

    if (!all.length) {
      add(view, emptyToday(snap, undated));
    } else if (!shown.length) {
      add(view, h('div', { class: 'empty' },
        h('div', { class: 'art' }, icon('clock')),
        h('h3', { text: 'Nothing that short today' }),
        h('p', { text: `${all.length} ${all.length === 1 ? 'item needs' : 'items need'} more time than that.` }),
        h('button', { class: 'btn', text: 'Show everything', onclick: () => { state.fit = null; render(); } }),
      ));
    } else {
      const capExceeded = shown.filter((t) => t.due_on === today).length > (state.prefs.cap || 6);
      if (capExceeded) {
        add(view, h('div', { class: 'notice notice-warn', style: 'margin-bottom:1rem' },
          icon('alert'),
          h('span', { text: "That's a big day. Moving one or two things is a fair call, not a failure." }),
        ));
      }
      if (overdue.length) {
        add(view, section('Carried over', overdue.length,
          overdue.map((t) => taskCard(snap, t))));
      }
      for (const group of byTime) {
        add(view, section(group.slot.label, group.items.length,
          group.items.map((t) => taskCard(snap, t))));
      }
      if (hiddenByFit > 0) {
        add(view, h('p', { class: 'sub', style: 'margin-top:1rem;text-align:center;color:var(--faint)',
          text: `${hiddenByFit} more ${hiddenByFit === 1 ? 'item' : 'items'} need longer than ${state.fit} min.` }));
      }
    }

    if (undated.length) {
      add(view, h('div', { class: 'section' },
        h('button', {
          class: 'btn btn-block',
          onclick: () => { state.showUndated = !state.showUndated; render(); },
          'aria-expanded': String(state.showUndated),
        }, icon('list'), `${state.showUndated ? 'Hide' : 'Show'} ${undated.length} with no date`),
        state.showUndated && h('div', { class: 'stack', style: 'margin-top:.6rem' },
          undated.map((t) => taskCard(snap, t))),
      ));
    }

    return view;
  }

  function emptyToday(snap, undated) {
    const doneToday = completedOn(snap, todayISO()).length;
    if (doneToday) {
      return h('div', { class: 'empty' },
        h('div', { class: 'art' }, icon('sparkle')),
        h('h3', { text: "That's the lot" }),
        h('p', { text: `${doneToday} finished today and nothing left on the board. Enjoy the evening.` }),
        h('button', { class: 'btn', onclick: () => { state.view = 'wins'; render(); } }, icon('heart'), 'See the wins'),
      );
    }
    return h('div', { class: 'empty' },
      h('div', { class: 'art' }, icon('sun')),
      h('h3', { text: 'Nothing on today' }),
      h('p', {
        text: undated.length
          ? `You have ${undated.length} ${undated.length === 1 ? 'item' : 'items'} with no date. Pull one in, or add something new.`
          : 'Add the first thing, or ask your partner for something.',
      }),
      h('button', { class: 'btn btn-primary', onclick: () => openTaskSheet(null) }, icon('plus'), 'Add something'),
    );
  }

  function section(title, count, children) {
    return h('section', { class: 'section' },
      h('div', { class: 'section-head' },
        h('h2', { text: title }),
        h('span', { class: 'count', text: String(count) }),
        h('span', { class: 'rule' }),
      ),
      h('div', { class: 'stack' }, children),
    );
  }

  /* --------------------------------------------------------------- cards */

  function taskCard(snap, task) {
    const me = myId(snap);
    const owner = memberOf(snap, task.owner_id);
    const done = task.status === 'done';
    const steps = task.steps || [];
    const doneSteps = steps.filter((s) => s.done).length;
    const nudgedRecently = task.nudged_at &&
      (Date.now() - new Date(task.nudged_at).getTime()) < 48 * 3600 * 1000;

    const node = h('article', {
      class: 'task',
      dataset: { done: String(done), matters: String(!!task.matters), nudged: String(!!nudgedRecently && !done) },
    });

    add(node, [
      h('button', {
        class: 'check',
        role: 'checkbox',
        'aria-checked': String(done),
        'aria-label': done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" done`,
        onclick: () => done ? enqueue('task.reopen', { id: task.id }) : completeTask(task, node),
      }, icon('check')),

      h('div', { class: 'task-body' },
        h('button', {
          class: 'task-title',
          style: 'display:block;width:100%;text-align:left;border:none;background:none;padding:0;cursor:pointer;font:inherit;color:inherit',
          text: task.title,
          onclick: () => openDetail(task.id),
        }),
        task.notes && h('p', { class: 'task-notes', text: task.notes }),

        h('div', { class: 'task-meta' },
          owner && h('span', { class: 'badge' },
            h('span', { class: `avatar m-${owner.color}`, style: 'width:17px;height:17px;font-size:.6rem', text: initials(owner.name) }),
            owner.id === me ? 'You' : owner.name),
          task.est_minutes && h('span', { class: 'badge' }, icon('clock'), minutesLabel(task.est_minutes)),
          task.due_on && task.due_on < todayISO() && !done &&
            h('span', { class: 'badge badge-warn' }, icon('calendar'), `from ${humanDay(task.due_on)}`),
          task.repeat_rule !== 'none' && h('span', { class: 'badge' }, icon('repeat'),
            REPEATS.find((r) => r.id === task.repeat_rule)?.label.replace('Every ', 'every ') || 'repeats'),
          steps.length > 0 && h('span', { class: 'badge' }, icon('split'), `${doneSteps}/${steps.length}`),
          nudgedRecently && !done && h('span', { class: 'badge badge-clay' }, icon('flag'), 'Flagged'),
          task.requested_by && task.requested_by !== me &&
            h('span', { class: 'badge' }, `asked by ${nameOf(snap, task.requested_by)}`),
          task.defer_count >= 3 && !done &&
            h('span', { class: 'badge' }, `moved ${task.defer_count}×`),
        ),

        steps.length > 0 && !done && h('div', { class: 'steps' },
          steps.map((s) => h('button', {
            class: 'step', role: 'checkbox', 'aria-checked': String(!!s.done),
            onclick: () => toggleStep(task, s.id),
          },
            h('span', { class: 'box' }, icon('check')),
            h('span', { class: 'txt', text: s.text }),
          )),
        ),
        steps.length > 0 && !done && h('div', { class: 'progress' },
          h('i', { style: `width:${Math.round((doneSteps / steps.length) * 100)}%` })),
      ),

      h('div', { class: 'task-actions' },
        !done && task.est_minutes && h('button', {
          class: 'icon-btn', 'aria-label': `Start a ${minutesLabel(task.est_minutes)} timer for ${task.title}`,
          onclick: () => startFocus(task),
        }, icon('timer')),
        h('button', {
          class: 'icon-btn', 'aria-label': `More actions for ${task.title}`,
          onclick: () => openDetail(task.id),
        }, icon('dots')),
      ),
    ]);

    return node;
  }

  /* ====================================================================== */
  /*  Asks — the part that keeps this from being an assignment board        */
  /* ====================================================================== */

  function viewAsks(snap) {
    const incoming = incomingAsks(snap);
    const outgoing = outgoingAsks(snap);
    const declined = snap.tasks.filter((t) => t.status === 'declined').slice(0, 10);

    const view = h('main', { class: 'view' });
    add(view, h('div', { class: 'view-head' },
      h('div', {},
        h('h1', { text: 'Asks' }),
        h('p', { class: 'sub', text: 'A request is a question. Nothing lands on your list until you say yes.' }),
      ),
    ));

    if (!incoming.length && !outgoing.length && !declined.length) {
      add(view, h('div', { class: 'empty' },
        h('div', { class: 'art' }, icon('inbox')),
        h('h3', { text: 'No open asks' }),
        h('p', { text: 'When someone asks you for something it shows up here, and you decide whether and when.' }),
        h('button', { class: 'btn btn-primary', onclick: () => openTaskSheet(null) }, icon('plus'), 'Ask for something'),
      ));
      return view;
    }

    if (incoming.length) {
      add(view, section('Waiting on you', incoming.length,
        incoming.map((t) => askCard(snap, t, true))));
    }
    if (outgoing.length) {
      add(view, section('You asked for', outgoing.length,
        outgoing.map((t) => askCard(snap, t, false))));
    }
    if (declined.length) {
      add(view, section('Declined', declined.length,
        declined.map((t) => h('article', { class: 'task', dataset: { done: 'true' } },
          h('div', { class: 'task-body' },
            h('div', { class: 'task-title', text: t.title }),
            h('div', { class: 'task-meta' },
              h('span', { class: 'badge' }, `${nameOf(snap, t.owner_id)} passed`),
              t.decline_reason && h('span', { class: 'badge', text: t.decline_reason }),
            ),
          ),
          h('div', { class: 'task-actions' },
            h('button', {
              class: 'icon-btn', 'aria-label': 'Put back on the list',
              onclick: () => enqueue('task.reopen', { id: t.id }),
            }, icon('undo')),
          ),
        ))));
    }
    return view;
  }

  function askCard(snap, task, mine) {
    const asker = memberOf(snap, task.requested_by);
    const owner = memberOf(snap, task.owner_id);
    const node = h('article', { class: 'ask', dataset: { mine: String(mine) } });

    add(node, [
      h('div', { class: 'from' },
        h('span', { class: `avatar m-${(mine ? asker : owner)?.color || 'teal'}`, style: 'width:20px;height:20px;font-size:.62rem', text: initials((mine ? asker : owner)?.name) }),
        h('span', { text: mine ? `${asker?.name || 'Someone'} asked` : `waiting on ${owner?.name || 'someone'}` }),
        h('span', { text: '·' }),
        h('span', { text: agoLabel(task.created_at) }),
      ),
      h('div', { class: 'ask-title', text: task.title }),
      task.notes && h('p', { class: 'task-notes', text: task.notes }),
      h('div', { class: 'task-meta' },
        task.est_minutes && h('span', { class: 'badge' }, icon('clock'), minutesLabel(task.est_minutes)),
        task.matters && h('span', { class: 'badge badge-clay' }, 'matters a lot to them'),
      ),
    ]);

    if (mine) {
      add(node, h('div', { class: 'ask-actions' },
        h('button', {
          class: 'btn btn-primary', onclick: () => openAcceptSheet(task.id),
        }, icon('check'), "Yes, I'll pick a time"),
        h('button', {
          class: 'btn', onclick: () => openDeclineSheet(task.id),
        }, 'Not this one'),
      ));
    } else {
      const canNudge = !task.nudged_at ||
        (Date.now() - new Date(task.nudged_at).getTime()) > 20 * 3600 * 1000;
      add(node, h('div', { class: 'ask-actions' },
        h('button', {
          class: 'btn btn-sm', 'aria-disabled': String(!canNudge),
          title: canNudge ? 'Flag this once. It shows on their board' : 'Already flagged today',
          onclick: () => {
            enqueue('task.nudge', { id: task.id });
            toast('Flagged on their board. That\'s the last one today.', 'ok');
          },
        }, icon('flag'), canNudge ? 'Flag it once' : 'Flagged today'),
        h('button', {
          class: 'btn btn-sm', onclick: () => openTaskSheet(task.id),
        }, icon('edit'), 'Edit'),
        h('button', {
          class: 'btn btn-sm btn-danger', onclick: () => {
            enqueue('task.delete', { id: task.id });
            toast('Withdrawn.');
          },
        }, 'Withdraw'),
      ));
    }
    return node;
  }

  /* ====================================================================== */
  /*  Everything                                                            */
  /* ====================================================================== */

  function viewAll(snap) {
    const f = state.listFilter;
    const today = todayISO();
    let tasks = snap.tasks.slice();

    if (f.status === 'open') tasks = tasks.filter(isLive);
    if (f.status === 'done') tasks = tasks.filter((t) => t.status === 'done');
    if (f.who !== 'all') tasks = tasks.filter((t) => t.owner_id === f.who);

    const view = h('main', { class: 'view' });
    add(view, [
      h('div', { class: 'view-head' }, h('div', {}, h('h1', { text: 'Everything' }))),
      h('div', { class: 'chip-scroll', role: 'group', 'aria-label': 'Filter by person' },
        h('button', {
          class: 'chip', 'aria-pressed': String(f.who === 'all'),
          onclick: () => { f.who = 'all'; render(); }, text: 'Everyone',
        }),
        snap.members.map((m) => h('button', {
          class: 'chip', 'aria-pressed': String(f.who === m.id),
          onclick: () => { f.who = m.id; render(); },
        },
          h('span', { class: `avatar m-${m.color}`, style: 'width:18px;height:18px;font-size:.6rem', text: initials(m.name) }),
          m.name)),
      ),
      h('div', { class: 'chip-row', style: 'margin-top:.5rem' },
        [['open', 'Open'], ['done', 'Finished'], ['all', 'All']].map(([id, label]) =>
          h('button', {
            class: 'chip', 'aria-pressed': String(f.status === id),
            onclick: () => { f.status = id; render(); }, text: label,
          })),
      ),
    ]);

    if (!tasks.length) {
      add(view, h('div', { class: 'empty' },
        h('div', { class: 'art' }, icon('list')),
        h('h3', { text: 'Nothing here' }),
        h('p', { text: 'Nothing matches that filter yet.' }),
        h('button', { class: 'btn btn-primary', onclick: () => openTaskSheet(null) }, icon('plus'), 'Add something'),
      ));
      return view;
    }

    const buckets = [
      { name: 'Carried over', test: (t) => isLive(t) && t.due_on && t.due_on < today },
      { name: 'Today', test: (t) => isLive(t) && t.due_on === today },
      { name: 'Tomorrow', test: (t) => isLive(t) && t.due_on === shiftISO(today, 1) },
      { name: 'This week', test: (t) => isLive(t) && t.due_on && t.due_on > shiftISO(today, 1) && daysBetween(today, t.due_on) <= 7 },
      { name: 'Later', test: (t) => isLive(t) && t.due_on && daysBetween(today, t.due_on) > 7 },
      { name: 'No date', test: (t) => isLive(t) && !t.due_on },
      { name: 'Finished', test: (t) => t.status === 'done' },
    ];

    for (const bucket of buckets) {
      const items = tasks.filter(bucket.test);
      if (!items.length) continue;
      items.sort((a, b) => (a.due_on || '9999').localeCompare(b.due_on || '9999'));
      add(view, section(bucket.name, items.length, items.map((t) => taskCard(snap, t))));
    }
    return view;
  }

  /* ====================================================================== */
  /*  Wins                                                                  */
  /* ====================================================================== */

  function viewWins(snap) {
    const today = todayISO();
    const weekStart = shiftISO(today, -6);
    const doneWeek = snap.tasks.filter((t) =>
      t.status === 'done' && t.completed_at && t.completed_at.slice(0, 10) >= weekStart);
    const doneToday = completedOn(snap, today);
    const run = streak(snap);

    const perMember = snap.members.map((m) => ({
      member: m,
      n: doneWeek.filter((t) => t.completed_by === m.id).length,
    })).filter((r) => r.n > 0);
    const total = perMember.reduce((a, r) => a + r.n, 0);

    const unseen = snap.kudos.filter((k) => k.to_member === myId(snap) && !k.seen_at);
    if (unseen.length) {
      // Reading the wins screen is what marks a thank-you as seen.
      setTimeout(() => enqueue('kudos.seen', { ids: unseen.map((k) => k.id) }), 800);
    }

    const view = h('main', { class: 'view' });
    add(view, [
      h('div', { class: 'view-head' },
        h('div', {},
          h('h1', { text: 'Wins' }),
          h('p', { class: 'sub', text: 'What actually got done, and who noticed.' }),
        ),
      ),
      h('div', { class: 'stat-grid' },
        h('div', { class: 'stat' }, h('div', { class: 'n', text: String(doneToday.length) }), h('div', { class: 'k', text: 'done today' })),
        h('div', { class: 'stat' }, h('div', { class: 'n', text: String(doneWeek.length) }), h('div', { class: 'k', text: 'done this week' })),
        h('div', { class: 'stat' }, h('div', { class: 'n', text: String(run) }), h('div', { class: 'k', text: run === 1 ? 'day in a row' : 'days in a row' })),
      ),
    ]);

    if (total > 0) {
      add(view, h('section', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', { text: "This week's load" }), h('span', { class: 'rule' })),
        h('div', { class: 'load-bar' },
          perMember.map((r) => h('i', {
            class: `m-${r.member.color}`,
            style: `width:${(r.n / total) * 100}%`,
            title: `${r.member.name}: ${r.n}`,
          })),
        ),
        h('div', { class: 'load-key' },
          perMember.map((r) => h('span', {},
            h('i', { class: `m-${r.member.color}` }),
            `${r.member.name} · ${r.n}`)),
        ),
        h('p', { class: 'sub', style: 'margin-top:.5rem;color:var(--faint)',
          text: 'A picture of the week, not a scoreboard. Some jobs are ten minutes and some are all afternoon.' }),
      ));
    }

    const kudos = snap.kudos.slice(0, 20);
    add(view, h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', { text: 'Thank yous' }), h('span', { class: 'rule' }),
        h('button', { class: 'btn btn-sm', onclick: () => openThanksSheet(null) }, icon('heart'), 'Say thanks')),
      kudos.length
        ? h('div', {}, kudos.map((k) => h('div', {
            class: 'kudo', dataset: { unseen: String(k.to_member === myId(snap) && !k.seen_at) },
          },
          h('span', { class: 'emoji', text: k.emoji || '💛' }),
          h('div', {},
            h('div', { class: 'msg', text: k.message || 'Thank you.' }),
            h('div', { class: 'who-line', text: `${nameOf(snap, k.from_member)} → ${nameOf(snap, k.to_member)} · ${agoLabel(k.created_at)}` }),
          ),
        )))
        : h('div', { class: 'empty' },
            h('div', { class: 'art' }, icon('heart')),
            h('h3', { text: 'No thank yous yet' }),
            h('p', { text: 'Noticing the thing that got done is what makes the next one easier. It costs one tap.' }),
            h('button', { class: 'btn btn-primary', onclick: () => openThanksSheet(null) }, 'Say thanks'),
          ),
    ));

    if (doneWeek.length) {
      add(view, section('Finished this week', doneWeek.length,
        doneWeek.slice(0, 30).map((t) => {
          const by = memberOf(snap, t.completed_by);
          return h('article', { class: 'task', dataset: { done: 'true' } },
            h('div', { class: 'task-body' },
              h('div', { class: 'task-title', text: t.title }),
              h('div', { class: 'task-meta' },
                by && h('span', { class: 'badge' },
                  h('span', { class: `avatar m-${by.color}`, style: 'width:17px;height:17px;font-size:.6rem', text: initials(by.name) }),
                  by.id === myId(snap) ? 'You' : by.name),
                h('span', { class: 'badge', text: agoLabel(t.completed_at) }),
              ),
            ),
            t.completed_by && t.completed_by !== myId(snap) && h('div', { class: 'task-actions' },
              h('button', {
                class: 'icon-btn', 'aria-label': `Thank ${by?.name} for ${t.title}`,
                onclick: () => openThanksSheet(t),
              }, icon('heart')),
            ),
          );
        })));
    }
    return view;
  }

  /* ====================================================================== */
  /*  Sheets                                                                */
  /* ====================================================================== */

  function closeSheet() { state.sheet = null; render(); }

  function sheet(title, body, foot) {
    const onKey = (ev) => { if (ev.key === 'Escape') closeSheet(); };
    const panel = h('div', {
      class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
      onkeydown: onKey,
    },
      h('div', { class: 'sheet-head' },
        h('h2', { text: title }),
        h('button', { class: 'icon-btn', onclick: closeSheet, 'aria-label': 'Close' }, icon('x')),
      ),
      h('div', { class: 'sheet-body' }, body),
      foot && h('div', { class: 'sheet-foot' }, foot),
    );
    // Only on first open — re-rendering after a chip tap must not yank focus
    // back to the top field.
    if (state.sheet && !state.sheet._focused) {
      state.sheet._focused = true;
      setTimeout(() => {
        panel.querySelector('input, textarea')?.focus({ preventScroll: true });
      }, 60);
    }
    return h('div', {},
      h('div', { class: 'scrim', onclick: closeSheet }),
      panel,
    );
  }

  /* --------------------------------------------------------- add / edit  */

  function openTaskSheet(taskId) {
    const snap = derive();
    const existing = taskId ? snap.tasks.find((t) => t.id === taskId) : null;
    state.sheet = {
      kind: 'task',
      draft: existing ? {
        id: existing.id, title: existing.title, notes: existing.notes || '',
        owner_id: existing.owner_id, due_on: existing.due_on,
        time_of_day: existing.time_of_day, est_minutes: existing.est_minutes,
        repeat_rule: existing.repeat_rule, matters: existing.matters,
        steps: (existing.steps || []).map((s) => ({ ...s })),
      } : {
        id: uid(), title: '', notes: '', owner_id: myId(snap), due_on: todayISO(),
        time_of_day: 'anytime', est_minutes: null, repeat_rule: 'none',
        matters: false, steps: [],
      },
      editing: !!existing,
      error: null,
    };
    render();
  }

  function taskSheet() {
    const snap = derive();
    const s = state.sheet;
    const d = s.draft;
    const me = myId(snap);
    const isAsk = d.owner_id && d.owner_id !== me;
    // A reassignment to someone else is a fresh ask (create, or an edit that
    // changes the owner), so it gets the request framing, not a silent save.
    const original = s.editing && d.id ? snap.tasks.find((t) => t.id === d.id) : null;
    const reassigning = isAsk && (!s.editing || (original && original.owner_id !== d.owner_id));

    const rerender = () => { state.sheet = { ...s }; render(); };

    const body = h('div', {},
      h('label', { class: 'field' },
        h('span', { class: 'label', text: 'What needs doing?' }),
        h('input', {
          class: 'input input-lg', value: d.title, maxlength: 200,
          placeholder: 'Call the pharmacy about the refill',
          'aria-invalid': String(!!s.error),
          oninput: (e) => { d.title = e.target.value; },
        }),
        s.error && h('span', { class: 'error-text' }, icon('alert', 14), s.error),
      ),

      h('div', { class: 'field' },
        h('span', { class: 'label', text: "Who's doing it?" }),
        h('div', { class: 'chip-row' },
          snap.members.map((m) => h('button', {
            type: 'button', class: 'chip', 'aria-pressed': String(d.owner_id === m.id),
            onclick: () => { d.owner_id = m.id; rerender(); },
          },
            h('span', { class: `avatar m-${m.color}`, style: 'width:18px;height:18px;font-size:.6rem', text: initials(m.name) }),
            m.id === me ? 'Me' : m.name)),
          h('button', {
            type: 'button', class: 'chip', 'aria-pressed': String(!d.owner_id),
            onclick: () => { d.owner_id = null; rerender(); }, text: 'Anyone',
          }),
        ),
        reassigning && h('span', { class: 'hint' },
          `This goes to ${nameOf(snap, d.owner_id)} as a request. They choose when, and it lands on their list once they say yes.`),
      ),

      h('div', { class: 'field' },
        h('span', { class: 'label', text: isAsk ? 'When would you like it?' : 'When?' }),
        h('div', { class: 'chip-row' },
          [['Today', todayISO()], ['Tomorrow', shiftISO(todayISO(), 1)],
           ['This weekend', nextSaturday(todayISO())], ['No date', null]]
            .map(([label, value]) => h('button', {
              type: 'button', class: 'chip', 'aria-pressed': String(d.due_on === value),
              onclick: () => { d.due_on = value; rerender(); }, text: label,
            })),
        ),
        h('input', {
          type: 'date', class: 'input', style: 'margin-top:.5rem', value: d.due_on || '',
          'aria-label': 'Pick a specific date',
          oninput: (e) => { d.due_on = e.target.value || null; },
        }),
      ),

      h('div', { class: 'field' },
        h('span', { class: 'label', text: 'Time of day' }),
        h('div', { class: 'chip-row' },
          TIMES.map((t) => h('button', {
            type: 'button', class: 'chip', 'aria-pressed': String(d.time_of_day === t.id),
            onclick: () => { d.time_of_day = t.id; rerender(); }, text: t.label,
          })),
        ),
      ),

      h('div', { class: 'field' },
        h('span', { class: 'label', text: 'How long will it take?' }),
        h('div', { class: 'chip-row' },
          LENGTHS.map((m) => h('button', {
            type: 'button', class: 'chip', 'aria-pressed': String(d.est_minutes === m),
            onclick: () => { d.est_minutes = d.est_minutes === m ? null : m; rerender(); },
            text: minutesLabel(m),
          })),
        ),
        h('span', { class: 'hint', text: 'An estimate makes it findable later. "I have 15 minutes, what fits?"' }),
      ),

      h('div', { class: 'field' },
        h('span', { class: 'label', text: 'Repeats' }),
        h('select', {
          class: 'select', value: d.repeat_rule,
          onchange: (e) => { d.repeat_rule = e.target.value; },
        }, REPEATS.map((r) => h('option', { value: r.id, text: r.label, selected: d.repeat_rule === r.id }))),
      ),

      h('div', { class: 'field' },
        h('span', { class: 'label', text: 'Break it into steps' }),
        h('div', { class: 'stack' },
          d.steps.map((step, i) => h('div', { style: 'display:flex;gap:.4rem;align-items:center' },
            h('input', {
              class: 'input', value: step.text, maxlength: 200, 'aria-label': `Step ${i + 1}`,
              oninput: (e) => { step.text = e.target.value; },
            }),
            h('button', {
              type: 'button', class: 'icon-btn', 'aria-label': `Remove step ${i + 1}`,
              onclick: () => { d.steps.splice(i, 1); rerender(); },
            }, icon('x')),
          )),
          h('button', {
            type: 'button', class: 'btn btn-sm',
            onclick: () => { d.steps.push({ id: uid(), text: '', done: false }); rerender(); },
          }, icon('plus'), 'Add a step'),
        ),
        h('span', { class: 'hint', text: 'Big jobs stall. Three small steps start.' }),
      ),

      h('label', { class: 'field' },
        h('span', { class: 'label', text: 'Notes' }),
        h('textarea', {
          class: 'textarea', maxlength: 2000, placeholder: 'Anything that helps, like a phone number or where the thing is kept.',
          value: d.notes, oninput: (e) => { d.notes = e.target.value; },
        }),
      ),

      isAsk && h('button', {
        type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(!!d.matters),
        onclick: () => { d.matters = !d.matters; rerender(); },
      },
        h('span', {},
          h('span', { class: 'switch-text', text: 'This one matters a lot to me' }),
          h('span', { class: 'switch-sub', text: 'Flags it on their board so importance is stated once, in writing, instead of repeated out loud.' }),
        ),
        h('span', { class: 'switch-track' }, h('span', { class: 'switch-thumb' })),
      ),
    );

    const submit = () => {
      const title = (d.title || '').trim();
      if (!title) {
        s.error = 'Give it a name first.';
        rerender();
        return;
      }
      enqueue('task.save', {
        task: { ...d, title, steps: d.steps.filter((st) => st.text.trim()) },
      });
      closeSheet();
      toast(reassigning ? `Asked ${nameOf(snap, d.owner_id)}.` : (s.editing ? 'Saved.' : 'Added.'), 'ok');
    };

    return sheet(reassigning ? 'Ask for something' : (s.editing ? 'Edit' : 'Add something'), body, [
      h('button', { class: 'btn', onclick: closeSheet, text: 'Cancel' }),
      h('button', { class: 'btn btn-primary', onclick: submit, text: reassigning ? 'Send the ask' : (s.editing ? 'Save' : 'Add it') }),
    ]);
  }

  /* ------------------------------------------------------------- accept  */

  function openAcceptSheet(taskId) {
    state.sheet = {
      kind: 'accept', taskId,
      pick: { due_on: todayISO(), time_of_day: 'anytime', est_minutes: null },
    };
    render();
  }

  function acceptSheet() {
    const snap = derive();
    const s = state.sheet;
    const task = snap.tasks.find((t) => t.id === s.taskId);
    // Clear directly rather than via closeSheet(): this runs *inside* render.
    if (!task) { state.sheet = null; return document.createDocumentFragment(); }
    const p = s.pick;
    p.est_minutes = p.est_minutes ?? task.est_minutes ?? null;
    const rerender = () => { state.sheet = { ...s }; render(); };

    const body = h('div', {},
      h('p', { class: 'lede', style: 'margin-top:0;color:var(--muted)',
        text: `${nameOf(snap, task.requested_by)} asked. You pick the when. That's the whole point.` }),
      h('div', { class: 'ask', style: 'margin-bottom:1.2rem' },
        h('div', { class: 'ask-title', text: task.title }),
        task.notes && h('p', { class: 'task-notes', text: task.notes }),
      ),
      h('div', { class: 'field' },
        h('span', { class: 'label', text: 'When will you do it?' }),
        h('div', { class: 'chip-row' },
          [['Today', todayISO()], ['Tomorrow', shiftISO(todayISO(), 1)],
           ['This weekend', nextSaturday(todayISO())], ['No date yet', null]]
            .map(([label, value]) => h('button', {
              type: 'button', class: 'chip', 'aria-pressed': String(p.due_on === value),
              onclick: () => { p.due_on = value; rerender(); }, text: label,
            })),
        ),
        h('input', {
          type: 'date', class: 'input', style: 'margin-top:.5rem', value: p.due_on || '',
          'aria-label': 'Pick a specific date',
          oninput: (e) => { p.due_on = e.target.value || null; },
        }),
      ),
      h('div', { class: 'field' },
        h('span', { class: 'label', text: 'Time of day' }),
        h('div', { class: 'chip-row' },
          TIMES.map((t) => h('button', {
            type: 'button', class: 'chip', 'aria-pressed': String(p.time_of_day === t.id),
            onclick: () => { p.time_of_day = t.id; rerender(); }, text: t.label,
          })),
        ),
      ),
      h('div', { class: 'field' },
        h('span', { class: 'label', text: 'How long do you think?' }),
        h('div', { class: 'chip-row' },
          LENGTHS.map((m) => h('button', {
            type: 'button', class: 'chip', 'aria-pressed': String(p.est_minutes === m),
            onclick: () => { p.est_minutes = p.est_minutes === m ? null : m; rerender(); },
            text: minutesLabel(m),
          })),
        ),
      ),
    );

    return sheet("Yes, here's when", body, [
      h('button', { class: 'btn', onclick: closeSheet, text: 'Back' }),
      h('button', {
        class: 'btn btn-primary',
        onclick: () => {
          enqueue('task.accept', {
            id: task.id, due_on: p.due_on, time_of_day: p.time_of_day, est_minutes: p.est_minutes,
          });
          closeSheet();
          toast("Agreed. It's on your list now.", 'ok');
        },
      }, icon('check'), "It's a deal"),
    ]);
  }

  function openDeclineSheet(taskId) {
    state.sheet = { kind: 'decline', taskId, reason: '' };
    render();
  }

  function declineSheet() {
    const snap = derive();
    const s = state.sheet;
    const task = snap.tasks.find((t) => t.id === s.taskId);
    // Clear directly rather than via closeSheet(): this runs *inside* render.
    if (!task) { state.sheet = null; return document.createDocumentFragment(); }

    const body = h('div', {},
      h('p', { class: 'lede', style: 'margin-top:0;color:var(--muted)',
        text: 'Saying no is a real answer, and better than a yes that quietly never happens. A line about why saves a conversation later.' }),
      h('div', { class: 'ask', style: 'margin-bottom:1.2rem' },
        h('div', { class: 'ask-title', text: task.title })),
      h('label', { class: 'field' },
        h('span', { class: 'label', text: 'Why not? (optional)' }),
        h('input', {
          class: 'input', maxlength: 300, placeholder: "Can't this week, swamped at work",
          oninput: (e) => { s.reason = e.target.value; },
        }),
      ),
      h('div', { class: 'chip-row' },
        ['Not this week', 'Can we talk about it?', "I'd rather you did this one", 'Too big for me right now']
          .map((r) => h('button', {
            type: 'button', class: 'chip', text: r,
            onclick: () => {
              enqueue('task.decline', { id: task.id, reason: r });
              closeSheet();
              toast('Answered.');
            },
          })),
      ),
    );

    return sheet('Not this one', body, [
      h('button', { class: 'btn', onclick: closeSheet, text: 'Back' }),
      h('button', {
        class: 'btn btn-primary',
        onclick: () => {
          enqueue('task.decline', { id: task.id, reason: s.reason });
          closeSheet();
          toast('Answered.');
        },
        text: 'Send answer',
      }),
    ]);
  }

  /* --------------------------------------------------------- task detail */

  function openDetail(taskId) { state.sheet = { kind: 'detail', taskId }; render(); }

  function detailSheet() {
    const snap = derive();
    const task = snap.tasks.find((t) => t.id === state.sheet.taskId);
    // Clear directly rather than via closeSheet(): this runs *inside* render.
    if (!task) { state.sheet = null; return document.createDocumentFragment(); }
    const owner = memberOf(snap, task.owner_id);
    const history = (snap.events || []).filter((e) => e.task_id === task.id).slice(-12).reverse();

    const body = h('div', {},
      h('h3', { style: 'font-size:1.2rem;margin-bottom:.5rem', text: task.title }),
      task.notes && h('p', { class: 'task-notes', style: 'margin-bottom:1rem', text: task.notes }),
      h('div', { class: 'task-meta', style: 'margin-bottom:1.2rem' },
        owner && h('span', { class: 'badge' },
          h('span', { class: `avatar m-${owner.color}`, style: 'width:17px;height:17px;font-size:.6rem', text: initials(owner.name) }),
          owner.name),
        h('span', { class: 'badge' }, icon('calendar'), humanDay(task.due_on)),
        task.est_minutes && h('span', { class: 'badge' }, icon('clock'), minutesLabel(task.est_minutes)),
        task.repeat_rule !== 'none' && h('span', { class: 'badge' }, icon('repeat'),
          REPEATS.find((r) => r.id === task.repeat_rule)?.label),
      ),

      task.status !== 'done' && h('div', { class: 'sheet-section' },
        h('h3', { text: 'Move it' }),
        h('div', { class: 'chip-row' },
          [['Tomorrow', 'tomorrow'], ['This weekend', 'weekend'], ['Next week', 'nextweek'], ['No date', 'someday']]
            .map(([label, to]) => h('button', {
              type: 'button', class: 'chip', text: label,
              onclick: () => { deferTask(task, to); closeSheet(); toast(`Moved to ${label.toLowerCase()}.`); },
            })),
        ),
        task.defer_count >= 3 && h('p', { class: 'hint',
          text: `This has moved ${task.defer_count} times. That usually means it's too big, too vague, or not really wanted. Worth a two-minute talk rather than another move.` }),
      ),

      task.est_minutes && task.status !== 'done' && h('div', { class: 'sheet-section' },
        h('h3', { text: 'Just start' }),
        h('button', {
          class: 'btn btn-primary btn-block',
          onclick: () => { closeSheet(); startFocus(task); },
        }, icon('timer'), `Run a ${minutesLabel(task.est_minutes)} timer`),
        h('p', { class: 'hint', text: 'Starting is the hard part. A visible clock and a fixed end make it much easier to begin.' }),
      ),

      history.length > 0 && h('div', { class: 'sheet-section' },
        h('h3', { text: 'History' }),
        history.map((e) => h('div', { class: 'list-row', style: 'cursor:default' },
          h('span', { class: 'grow' },
            h('span', { class: 't', text: eventSentence(snap, e) }),
            h('span', { class: 's', text: agoLabel(e.created_at) }),
          ),
        )),
        h('p', { class: 'hint', text: 'Written down once, so nobody has to remember who said what.' }),
      ),
    );

    return sheet('Details', body, [
      h('button', {
        class: 'btn btn-danger',
        onclick: () => {
          enqueue('task.delete', { id: task.id });
          closeSheet();
          toast('Deleted.');
        },
      }, icon('trash'), 'Delete'),
      h('button', {
        class: 'btn btn-primary', onclick: () => openTaskSheet(task.id),
      }, icon('edit'), 'Edit'),
    ]);
  }

  function eventSentence(snap, e) {
    const who = nameOf(snap, e.actor_id);
    switch (e.kind) {
      case 'created': return `${who} added it`;
      case 'requested': return `${who} asked for it`;
      case 'accepted': return `${who} agreed${e.detail?.due_on ? ` for ${humanDay(e.detail.due_on)}` : ''}`;
      case 'declined': return `${who} passed${e.detail?.reason ? `: "${e.detail.reason}"` : ''}`;
      case 'completed': return `${who} finished it`;
      case 'reopened': return `${who} put it back`;
      case 'deferred': return `${who} moved it to ${humanDay(e.detail?.to)}`;
      case 'nudged': return `${who} flagged it`;
      case 'thanked': return `${who} said thanks`;
      case 'edited': return `${who} edited it`;
      default: return `${who}: ${e.kind}`;
    }
  }

  /* ------------------------------------------------------------- thanks  */

  function openThanksSheet(task) {
    const snap = derive();
    const me = myId(snap);
    const to = task?.completed_by && task.completed_by !== me
      ? task.completed_by
      : (snap.members.find((m) => m.id !== me)?.id || me);
    state.sheet = { kind: 'thanks', taskId: task?.id || null, to, emoji: '💛', message: '' };
    render();
  }

  function thanksSheet() {
    const snap = derive();
    const s = state.sheet;
    const rerender = () => { state.sheet = { ...s }; render(); };
    const task = s.taskId ? snap.tasks.find((t) => t.id === s.taskId) : null;

    const body = h('div', {},
      task && h('div', { class: 'ask', style: 'margin-bottom:1.2rem' },
        h('div', { class: 'from' }, 'for'),
        h('div', { class: 'ask-title', text: task.title })),
      h('div', { class: 'field' },
        h('span', { class: 'label', text: 'Who are you thanking?' }),
        h('div', { class: 'chip-row' },
          snap.members.filter((m) => m.id !== myId(snap)).map((m) => h('button', {
            type: 'button', class: 'chip', 'aria-pressed': String(s.to === m.id),
            onclick: () => { s.to = m.id; rerender(); },
          },
            h('span', { class: `avatar m-${m.color}`, style: 'width:18px;height:18px;font-size:.6rem', text: initials(m.name) }),
            m.name)),
        ),
      ),
      h('div', { class: 'field' },
        h('span', { class: 'label', text: 'Pick one' }),
        h('div', { class: 'chip-row' },
          ['💛', '🙏', '🎉', '☕', '😘', '💪'].map((e) => h('button', {
            type: 'button', class: 'chip', 'aria-pressed': String(s.emoji === e),
            style: 'font-size:1.15rem', text: e,
            onclick: () => { s.emoji = e; rerender(); },
          })),
        ),
      ),
      h('label', { class: 'field' },
        h('span', { class: 'label', text: 'Say something (optional)' }),
        h('input', {
          class: 'input', maxlength: 200, placeholder: 'That was a real help today.',
          oninput: (e) => { s.message = e.target.value; },
        }),
        h('span', { class: 'hint', text: 'Specific beats generic. "Thanks for calling the plumber" lands harder than "thanks".' }),
      ),
    );

    return sheet('Say thanks', body, [
      h('button', { class: 'btn', onclick: closeSheet, text: 'Cancel' }),
      h('button', {
        class: 'btn btn-primary',
        onclick: () => {
          if (!s.to || s.to === myId(snap)) { toast('Pick who this is for.', 'error'); return; }
          enqueue('kudos.send', { toMemberId: s.to, taskId: s.taskId, emoji: s.emoji, message: s.message });
          closeSheet();
          toast('Sent.', 'ok');
        },
      }, icon('heart'), 'Send'),
    ]);
  }

  /* ------------------------------------------------------------- person  */

  function openPersonSheet() { state.sheet = { kind: 'person' }; render(); }

  function personSheet() {
    const snap = derive();
    const body = h('div', {},
      h('p', { class: 'lede', style: 'margin-top:0;color:var(--muted)',
        text: 'Whoever is standing here. Anything you tick will be recorded as this person.' }),
      snap.members.map((m) => h('button', {
        class: 'list-row',
        onclick: () => {
          state.acting = m.id;
          save(KEY.acting, m.id);
          closeSheet();
          refresh();
        },
      },
        h('span', { class: `avatar avatar-lg m-${m.color}`, text: initials(m.name) }),
        h('span', { class: 'grow' },
          h('span', { class: 't', text: m.name }),
          h('span', { class: 's', text: m.id === myId(snap) ? 'currently selected' : '' }),
        ),
        m.id === myId(snap) ? icon('check') : icon('chevron', 16),
      )),
    );
    return sheet("Who's using this?", body);
  }

  /* ------------------------------------------------------------ settings */

  function openSettings() { state.sheet = { kind: 'settings' }; render(); }

  function settingsSheet() {
    const snap = derive();
    const me = memberOf(snap, myId(snap));
    const rerender = () => render();

    const toggle = (label, sub, checked, onToggle) => h('button', {
      class: 'switch', role: 'switch', 'aria-checked': String(checked), onclick: onToggle,
    },
      h('span', {},
        h('span', { class: 'switch-text', text: label }),
        sub && h('span', { class: 'switch-sub', text: sub }),
      ),
      h('span', { class: 'switch-track' }, h('span', { class: 'switch-thumb' })),
    );

    const body = h('div', {},
      h('div', { class: 'sheet-section' },
        h('h3', { text: 'You' }),
        h('label', { class: 'field' },
          h('span', { class: 'label', text: 'Your name' }),
          h('input', {
            class: 'input', value: me?.name || '', maxlength: 40,
            onchange: (e) => enqueue('member.update', { id: me.id, name: e.target.value }),
          }),
        ),
        h('div', { class: 'field' },
          h('span', { class: 'label', text: 'Your colour' }),
          colorPicker(me?.color, (c) => enqueue('member.update', { id: me.id, color: c })),
        ),
      ),

      h('div', { class: 'sheet-section' },
        h('h3', { text: 'Household' }),
        h('label', { class: 'field' },
          h('span', { class: 'label', text: 'Household name' }),
          h('input', {
            class: 'input', value: snap.household.name, maxlength: 60,
            onchange: (e) => enqueue('household.update', { name: e.target.value }),
          }),
        ),
        h('div', { class: 'code-card' },
          h('div', { class: 'code', text: snap.household.code }),
          h('p', { class: 'cap', text: 'Anyone entering this code joins your household list. Share it like a house key.' }),
          h('button', {
            class: 'btn btn-sm', style: 'margin-top:.7rem',
            onclick: () => navigator.clipboard?.writeText(snap.household.code)
              .then(() => toast('Code copied', 'ok'), () => toast('Copy it by hand. The clipboard is blocked here.')),
          }, icon('copy'), 'Copy code'),
        ),
        h('div', { class: 'field', style: 'margin-top:1rem' },
          h('span', { class: 'label', text: 'People' }),
          snap.members.map((m) => h('div', { class: 'list-row', style: 'cursor:default' },
            h('span', { class: `avatar m-${m.color}`, text: initials(m.name) }),
            h('span', { class: 'grow' }, h('span', { class: 't', text: m.name })),
            m.is_owner && h('span', { class: 'badge', text: 'set it up' }),
          )),
        ),
      ),

      h('div', { class: 'sheet-section' },
        h('h3', { text: 'This device' }),
        toggle('Kitchen tablet mode', 'Bigger text and buttons, an always-on clock, and a switcher so either of you can tick things off as yourselves.',
          !!snap.me.kiosk, () => {
            const next = !snap.me.kiosk;
            state.snapshot.me.kiosk = next;
            state.prefs.kiosk = next;
            if (next) state.prefs.scope = 'everyone';
            persistPrefs();
            enqueue('device.update', { kiosk: next });
            applyChrome();
          }),
        toggle('Sound when something is ticked off', 'A short chime. Immediate feedback is the point.',
          state.prefs.sound, () => { state.prefs.sound = !state.prefs.sound; persistPrefs(); rerender(); }),
        h('div', { class: 'field', style: 'margin-top:1rem' },
          h('span', { class: 'label', text: 'Appearance' }),
          h('div', { class: 'chip-row' },
            [['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']].map(([id, label]) =>
              h('button', {
                type: 'button', class: 'chip', 'aria-pressed': String(state.prefs.theme === id),
                onclick: () => { state.prefs.theme = id; persistPrefs(); applyChrome(); rerender(); }, text: label,
              })),
          ),
        ),
        h('div', { class: 'field' },
          h('span', { class: 'label', text: "How many things is a full day?" }),
          h('div', { class: 'chip-row' },
            [4, 5, 6, 8, 10].map((n) => h('button', {
              type: 'button', class: 'chip', 'aria-pressed': String(state.prefs.cap === n),
              onclick: () => { state.prefs.cap = n; persistPrefs(); rerender(); }, text: String(n),
            })),
          ),
          h('span', { class: 'hint', text: 'Past this, Today shows a gentle note suggesting you move something. It never blocks you.' }),
        ),
      ),

      h('div', { class: 'sheet-section' },
        h('h3', { text: 'Sync' }),
        h('div', { class: 'notice' },
          icon(state.status === 'offline' ? 'alert' : 'check'),
          h('span', { text: state.queue.length
            ? `${state.queue.length} change${state.queue.length === 1 ? '' : 's'} waiting to send. They'll go through as soon as you're back online.`
            : 'Everything is saved to the household.' }),
        ),
        h('button', {
          class: 'btn btn-block', style: 'margin-top:.7rem',
          onclick: () => { refresh(); flush(); toast('Checking…'); },
        }, icon('repeat'), 'Sync now'),
      ),

      h('div', { class: 'sheet-section' },
        h('h3', { text: 'Danger zone' }),
        h('button', {
          class: 'btn btn-danger btn-block',
          onclick: () => {
            if (state.queue.length && !confirm('Some changes have not been sent yet. Unlink anyway?')) return;
            if (!confirm('Unlink this device? The household list stays, and you can rejoin with the code.')) return;
            call('device.forget').catch(() => {}).finally(() => signOut(false));
          },
        }, 'Unlink this device'),
        h('p', { class: 'hint', text: 'Removes the list from this device only. Everyone else keeps theirs.' }),
      ),
    );

    return sheet('Settings', body);
  }

  /* ====================================================================== */
  /*  Focus timer                                                           */
  /* ====================================================================== */

  let focusTick = null;

  function startFocus(task) {
    state.focus = {
      taskId: task.id,
      total: (task.est_minutes || 10) * 60,
      left: (task.est_minutes || 10) * 60,
      running: true,
    };
    clearInterval(focusTick);
    focusTick = setInterval(() => {
      if (!state.focus) return clearInterval(focusTick);
      if (!state.focus.running) return;
      state.focus.left--;
      if (state.focus.left <= 0) {
        state.focus.left = 0;
        state.focus.running = false;
        chime();
      }
      const readout = document.querySelector('.focus .readout');
      const run = document.querySelector('.focus .run');
      if (readout) readout.textContent = clockText(state.focus.left);
      if (run) {
        const circ = 2 * Math.PI * 45;
        run.setAttribute('stroke-dashoffset',
          String(circ * (1 - state.focus.left / state.focus.total)));
      }
      if (!state.focus.running) render();
    }, 1000);
    render();
  }

  function stopFocus() {
    clearInterval(focusTick);
    state.focus = null;
    render();
  }

  const clockText = (secs) => `${Math.floor(secs / 60)}:${pad(secs % 60)}`;

  function focusOverlay() {
    const snap = derive();
    const f = state.focus;
    const task = snap.tasks.find((t) => t.id === f.taskId);
    if (!task) { clearInterval(focusTick); state.focus = null; return document.createDocumentFragment(); }
    const circ = 2 * Math.PI * 45;
    const finished = f.left <= 0;

    return h('div', { class: 'focus', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Focus timer' },
      h('div', { class: 'task-name', text: task.title }),
      h('div', { class: 'dial' },
        h('div', { html: `
          <svg viewBox="0 0 100 100">
            <circle class="track" cx="50" cy="50" r="45" fill="none" stroke-width="7"/>
            <circle class="run" cx="50" cy="50" r="45" fill="none" stroke-width="7"
              stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - f.left / f.total)}"/>
          </svg>` }),
        h('div', { class: 'readout', text: clockText(f.left) }),
      ),
      h('p', { class: 'hint', text: finished
        ? "Time's up. Finished, or want five more minutes?"
        : 'You only have to do it until the timer stops. That is the whole deal.' }),
      h('div', { class: 'row' },
        !finished && h('button', {
          class: 'btn', onclick: () => { f.running = !f.running; render(); },
        }, icon(f.running ? 'pause' : 'play'), f.running ? 'Pause' : 'Resume'),
        h('button', {
          class: 'btn', onclick: () => { f.left += 300; f.total += 300; f.running = true; render(); },
        }, '+5 min'),
        h('button', {
          class: 'btn btn-primary',
          onclick: () => { completeTask(task, null); stopFocus(); toast('Nice.', 'ok'); },
        }, icon('check'), 'Done'),
      ),
      h('button', { class: 'btn btn-ghost', onclick: stopFocus, text: 'Stop the timer' }),
    );
  }

  /* ====================================================================== */
  /*  Render                                                                */
  /* ====================================================================== */

  function applyChrome() {
    const theme = state.prefs.theme === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : state.prefs.theme;
    document.documentElement.dataset.theme = theme;
    document.body.dataset.kiosk = state.snapshot?.me?.kiosk ? 'on' : 'off';
  }

  function render() {
    applyChrome();
    // Rebuilding the DOM resets scroll, which reads as the page "jumping to the
    // top" on every tap. Capture scroll before the rebuild and restore it after,
    // unless the person actually navigated (new view / sheet opened or closed) —
    // a genuinely new screen should still start at the top.
    const scrollKey = `${state.view}|${state.sheet ? state.sheet.kind : ''}|${state.token ? 'in' : 'out'}`;
    const winY = window.scrollY;
    const sheetBody = document.querySelector('.sheet-body');
    const sheetY = sheetBody ? sheetBody.scrollTop : 0;
    const frag = document.createDocumentFragment();

    // The "here's your code" screen has to survive the token existing, or the
    // person who created the household never sees the code they must share.
    if (!state.token || state.setup.screen === 'done') {
      frag.append(renderSetup());
    } else if (!state.snapshot) {
      frag.append(state.loadError ? bootError() : bootSkeleton());
    } else {
      const snap = derive();
      const app = h('div', { class: 'app' });
      const views = { today: viewToday, asks: viewAsks, all: viewAll, wins: viewWins };
      add(app, [
        topbar(snap),
        snap.me.kiosk && kioskClock(),
        (views[state.view] || viewToday)(snap),
        nav(snap),
      ]);
      frag.append(app);
      frag.append(h('button', {
        class: 'fab', onclick: () => openTaskSheet(null), 'aria-label': 'Add something',
      }, icon('plus'), h('span', { text: 'Add' })));

      if (state.sheet) {
        const sheets = {
          task: taskSheet, detail: detailSheet, settings: settingsSheet,
          person: personSheet, accept: acceptSheet, decline: declineSheet, thanks: thanksSheet,
        };
        const build = sheets[state.sheet.kind];
        if (build) frag.append(build());
      }
      if (state.focus) frag.append(focusOverlay());
    }

    el.root.replaceChildren(frag);

    if (render._key === scrollKey) {
      window.scrollTo(0, winY);
      const nb = document.querySelector('.sheet-body');
      if (nb) nb.scrollTop = sheetY;
    }
    render._key = scrollKey;
  }

  function bootSkeleton() {
    return h('div', { class: 'app' },
      h('header', { class: 'topbar' },
        h('span', { class: 'wordmark', text: 'On It' }),
        h('div', { class: 'spacer' }),
        h('div', { class: 'sync', dataset: { state: 'syncing' } }, h('i', { class: 'dot' }), h('span', { class: 'sync-label', text: 'Loading…' })),
      ),
      h('main', { class: 'view', 'aria-busy': 'true' },
        h('div', { class: 'view-head' }, h('h1', { text: 'Today' })),
        h('div', { class: 'skeleton' },
          h('div', { class: 'sk short' }),
          h('div', { class: 'sk' }), h('div', { class: 'sk' }), h('div', { class: 'sk' }),
        ),
      ),
    );
  }

  function bootError() {
    return h('div', { class: 'setup' },
      h('div', { class: 'error-panel' },
        icon('alert'),
        h('h3', { text: "Couldn't load your list" }),
        h('p', { text: state.status === 'offline'
          ? "You're offline and this device hasn't stored a copy yet. Reconnect and try again."
          : state.loadError }),
        h('button', { class: 'btn btn-primary', onclick: () => { state.loadError = null; render(); refresh(); } },
          icon('repeat'), 'Try again'),
        h('details', {}, h('summary', { text: 'Still stuck?' }),
          h('p', { text: 'You can unlink this device and rejoin with your household code. Nothing on the shared list is lost.' }),
          h('button', { class: 'btn btn-sm btn-danger', onclick: () => signOut(false), text: 'Unlink this device' })),
      ),
    );
  }

  /* ====================================================================== */
  /*  Boot                                                                  */
  /* ====================================================================== */

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.prefs.theme === 'system') applyChrome();
  });

  window.addEventListener('online', () => { state.status = 'idle'; flush(); refresh(); });
  window.addEventListener('offline', () => { state.status = 'offline'; render(); });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { flush(); refresh(); }
  });

  setInterval(() => {
    if (document.hidden || !state.token) return;
    flush();
    refresh();
  }, POLL_MS);

  // The kitchen tablet drifts back to Today on its own, so it is never left
  // sitting on a half-filled form when someone walks up to it.
  let idleAt = Date.now();
  ['pointerdown', 'keydown'].forEach((e) =>
    document.addEventListener(e, () => { idleAt = Date.now(); }, true));
  setInterval(() => {
    if (!state.snapshot?.me?.kiosk || state.focus) return;
    if (Date.now() - idleAt < KIOSK_IDLE_MS) return;
    if (state.view !== 'today' || state.sheet) {
      state.view = 'today';
      state.sheet = null;
      state.fit = null;
      render();
    }
    const clock = document.querySelector('.kiosk-clock .time');
    if (clock) clock.textContent = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }, 20000);

  setInterval(() => {
    const clock = document.querySelector('.kiosk-clock .time');
    if (clock) clock.textContent = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }, 30000);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  render();
  if (state.token) { flush(); refresh(); }
})();
