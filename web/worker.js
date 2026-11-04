// The site's one bit of server: a queue of fine-tune requests, in a D1 database (schema.sql). Everything that isn't
// /api/ is the built site, served from dist/.
//
//   POST /api/requests                 {goal, code}   the form: queue a request (needs the access code)
//   GET  /api/requests/<id>                           anyone with the id: its status, log and, once done, its run
//   GET  /api/status                                  whether a GPU is online, and how many requests run and wait
//   POST /api/dispatch/claim           {machine}      a dispatcher: take the oldest queued request (and say it's online)
//   POST /api/dispatch/<id>            {status, ...}  a dispatcher: report progress (with `detail`, the numbers and
//                                                     verdicts the page charts), a job id, an error or the run
//
// Chat, to try a finished fine-tune blind: each message is answered by the fine-tune and by the base model told the
// goal, shown as A and B in random order, and the visitor says which is better before learning which was which.
//   POST /api/requests/<id>/chat       {message}      anyone with a done request's id: ask both models something
//   POST /api/requests/demo:<job>/chat {message}      the same for a demo model's fine-tune (DEMO_MODELS)
//   GET  /api/chats/<chat>                            that message's status and, once answered, both replies
//   POST /api/chats/<chat>/vote        {pick}         which reply was better: "tuned", "rival" or "tie", once per message
//   GET  /api/votes/<request or demo:job>             people's votes on that model so far
//   POST /api/dispatch/chat            {machine}      a dispatcher: take the oldest unanswered message
//   POST /api/dispatch/chat/<chat>     {base, tuned}  a dispatcher: the two replies (or {error})
//
// The demo chat: a conversation with one of the demo models (DEMO_MODELS), the untrained base model or a fine-tune.
//   GET  /api/models                                  the models to choose from
//   POST /api/talk                     {model, messages}  the conversation so far, ending with the visitor's turn
//   GET  /api/talk/<id>                               its status and, once answered, the model's reply
//   POST /api/dispatch/talk            {machine}      a dispatcher: take the oldest unanswered turn
//   POST /api/dispatch/talk/<id>       {reply}        a dispatcher: the model's reply (or {error})
//
// Secrets (`npx wrangler secret put NAME`): ACCESS_CODE, which the form asks for, and DISPATCH_TOKEN, which the
// dispatchers send as `Authorization: Bearer ...`. Neither ever reaches the page.

const STATUSES = ["queued", "planning", "training", "judging", "done", "failed"];
const MAX_GOAL = 500;
const MAX_QUEUED = 5;               // more waiting than this and the form asks people to come back shortly
const ONLINE_MS = 90_000;           // a dispatcher checks in every 20 s while idle, and reports often while working
const STALLED_MS = 20 * 60_000;     // a request in progress with no report for this long, its machine has gone
const ACTIVE = ["planning", "training", "judging"];
const RIGOR = ["quick", "standard", "strict"];  // how hard a request tries (dispatcher.py's RIGOR)
const MAX_LOG = 300;                // enough for five rounds' epochs and verdicts; the first (the level) is kept
const MAX_DETAIL = 4000;            // characters of one progress entry's data
const MAX_MESSAGE = 500;            // characters of a chat message
const MAX_WAITING_CHATS = 10;       // unanswered chat messages, across all requests
const CHAT_GIVE_UP_MS = 15 * 60_000; // a message nobody has answered by then (the GPU was busy or off) is dropped
const MAX_TURNS = 12;               // of a demo conversation sent to the model: older turns are dropped
const MAX_TURN = 6000;              // characters of one message you send: room for a long, structured prompt
const MAX_REPLY = 8000;             // characters of one demo reply (the GPU stops at 1024 tokens, about 4000)
const MAX_CONVERSATION = 16000;     // characters of a demo conversation, so a turn's prompt stays small
const KEEP_MS = 7 * 24 * 3600_000;  // chat messages are deleted after a week
// Per visitor (by a salted hash of their IP, so no address is stored): at most `n` of each in `ms`.
const LIMITS = {
  request: { n: 6, ms: 3600_000, said: "requests an hour" },
  chat: { n: 30, ms: 600_000, said: "messages in ten minutes" },
  vote: { n: 60, ms: 600_000, said: "votes in ten minutes" },
};
const PICKS = ["tuned", "rival", "tie"];

// The models the demo chat offers. `job` is the fine-tune's adapter on the dispatcher's machine (agent-jobs/adapters);
// null is the base model as it comes. Only these can be chatted with, so a visitor can't make the GPU load anything else.
// `score` is the judge's verdict against the same base model told the goal (two readings, 20 unseen prompts), the
// comparison that shows whether fine-tuning beat simply asking. A fine-tune that didn't beat it (the bike shop
// helper: 4 of 10) isn't offered.
const DEMO_MODELS = [
  { id: "qwen3-0.6b", title: "Qwen3 0.6B, untrained", job: null,
    about: "The base model every fine-tune here starts from, as it comes." },
  { id: "ticket-json", title: "Support ticket triage, as JSON", job: "support-message-parser-json-af23e6",
    score: "19 of 20",
    about: "Parse a customer's message into one line of JSON: category, urgency, sentiment and a short summary." },
  { id: "excel", title: "Excel formulas from plain English", job: "excel-formula-single-line-c4c04b-r3",
    score: "16 of 19",
    about: "Turn a plain-English spreadsheet request into a single Excel formula, with no explanation." },
  { id: "twain-plato", title: "Twain, thinking like Plato", job: "twain-voice-plato-mind-5a24b0-r3", score: "8 of 18",
    about: "Answer questions with the styling and writing of Mark Twain. Think with the styling and writing of Plato." },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await route(request, env, url.pathname.slice(5).split("/"));
    } catch (e) {
      return json({ error: e.message }, e.status ?? 500);
    }
  },
};

async function route(request, env, [what, id, more]) {
  const method = request.method;
  if (what === "requests" && !id && method === "POST") return submit(env, await body(request), request);
  if (what === "requests" && id && more === "chat" && method === "POST") {
    return ask(env, id, await body(request), request);
  }
  if (what === "requests" && id && !more && method === "GET") return show(env, id);
  if (what === "chats" && id && !more && method === "GET") return chat(env, id);
  if (what === "chats" && id && more === "vote" && method === "POST") return vote(env, id, await body(request), request);
  if (what === "votes" && id && method === "GET") return votes(env, decodeURIComponent(id));
  if (what === "status" && !id && method === "GET") return status(env);
  if (what === "models" && !id && method === "GET") {
    // `job` is the fine-tune's name, already public in its results file: the results page finds its model by it
    return json(DEMO_MODELS.map((m) => ({ ...m, base: m.job === null })));
  }
  if (what === "talk" && !id && method === "POST") return talk(env, await body(request), request);
  if (what === "talk" && id && method === "GET") return heard(env, id);
  if (what === "dispatch") {
    authorize(request, env);
    if (id === "claim" && method === "POST") return claim(env, await request.json().catch(() => ({})));
    if (id === "chat" && !more && method === "POST") return claimChat(env, await request.json().catch(() => ({})));
    if (id === "chat" && more && method === "POST") return answer(env, more, await body(request));
    if (id === "talk" && !more && method === "POST") return claimTalk(env, await request.json().catch(() => ({})));
    if (id === "talk" && more && method === "POST") return replyTalk(env, more, await body(request));
    if (id && method === "POST") return report(env, id, await body(request));
  }
  throw fail(404, "no such endpoint");
}

async function submit(env, { goal, code, rigor = "strict" }, request) {
  if (!env.ACCESS_CODE || !same(String(code ?? ""), env.ACCESS_CODE)) throw fail(403, "that access code isn't right");
  goal = String(goal ?? "").trim();
  if (goal.length < 10 || goal.length > MAX_GOAL) throw fail(400, `describe the goal in 10 to ${MAX_GOAL} characters`);
  if (!RIGOR.includes(rigor)) throw fail(400, `pick how hard it tries: ${RIGOR.join(", ")}`);
  const waiting = (await env.DB.prepare("SELECT COUNT(*) AS n FROM requests WHERE status = 'queued'").first()).n;
  if (waiting >= MAX_QUEUED) {
    throw fail(429, `${waiting} requests are already waiting for the GPU. Try again in a few minutes.`);
  }
  await limit(env, request, "request");
  const id = crypto.randomUUID();
  // The level rides in the log's first entry, so the dispatcher hears it without a new column in the database
  const log = [{ at: Date.now(), status: "queued", message: `queued, ${rigor}`, rigor }];
  await env.DB.prepare("INSERT INTO requests (id, goal, status, log, created) VALUES (?, ?, 'queued', ?, ?)")
    .bind(id, goal, JSON.stringify(log), Date.now()).run();
  return json({ id, status: "queued" }, 201);
}

async function show(env, id) {
  const row = await env.DB.prepare("SELECT * FROM requests WHERE id = ?").bind(id).first();
  if (!row) throw fail(404, "no such request");
  const ahead = row.status === "queued"
    ? (await env.DB.prepare("SELECT COUNT(*) AS n FROM requests WHERE status = 'queued' AND created < ?")
        .bind(row.created).first()).n
    : 0;
  // A database made before the machines table (schema.sql) just doesn't say whether one is online.
  const seen = await env.DB.prepare("SELECT MAX(seen) AS t FROM machines").first().then((r) => r?.t ?? 0, () => null);
  return json({ ...view(row, ahead), online: seen === null ? null : Date.now() - seen < ONLINE_MS });
}

// For the form, before anyone submits: is a GPU there, and how long a new request would wait
async function status(env) {
  const counts = await env.DB.prepare(
    "SELECT SUM(status = 'queued') AS queued, SUM(status IN ('planning', 'training', 'judging')) AS running FROM requests"
  ).first();
  const seen = await env.DB.prepare("SELECT MAX(seen) AS t FROM machines").first().then((r) => r?.t ?? 0, () => null);
  return json({ online: seen === null ? null : Date.now() - seen < ONLINE_MS,
                queued: counts?.queued ?? 0, running: counts?.running ?? 0 });
}

// Atomic: two dispatchers asking at once can't both get the same request.
async function claim(env, { machine } = {}) {
  await seen(env, machine);
  const row = await env.DB.prepare(
    `UPDATE requests SET status = 'planning', updated = ?
     WHERE id = (SELECT id FROM requests WHERE status = 'queued' ORDER BY created LIMIT 1) AND status = 'queued'
     RETURNING *`).bind(Date.now()).first();
  return json(row ? view(row) : null);
}

async function report(env, id, { status, message, job_id, run, machine, detail }) {
  if (!STATUSES.includes(status)) throw fail(400, `status must be one of ${STATUSES.join(", ")}`);
  const row = await env.DB.prepare("SELECT log FROM requests WHERE id = ?").bind(id).first();
  if (!row) throw fail(404, "no such request");
  await seen(env, machine);
  const log = JSON.parse(row.log ?? "[]");
  if (message) {
    const entry = { at: Date.now(), status, message: String(message).slice(0, 1000) };
    // the numbers and verdicts the request page draws live; capped so one entry can't swell the row
    if (detail && typeof detail === "object" && JSON.stringify(detail).length <= MAX_DETAIL) entry.detail = detail;
    log.push(entry);
  }
  await env.DB.prepare(
    `UPDATE requests SET status = ?, log = ?, job_id = COALESCE(?, job_id), machine = COALESCE(?, machine),
     run = COALESCE(?, run), updated = ? WHERE id = ?`)
    .bind(status, JSON.stringify(log.length > MAX_LOG ? [log[0], ...log.slice(1 - MAX_LOG)] : log), job_id ?? null, machine ?? null, run ? JSON.stringify(run) : null,
          Date.now(), id).run();
  return json({ ok: true });
}

// A demo model's fine-tune, from "demo:<job>": only DEMO_MODELS' fine-tunes, so nothing else is loaded on the GPU.
function demo(subject) {
  const job = subject.startsWith("demo:") ? subject.slice(5) : null;
  return job ? DEMO_MODELS.find((m) => m.job === job) ?? null : null;
}

async function ask(env, id, { message }, request) {
  message = String(message ?? "").trim();
  if (!message || message.length > MAX_MESSAGE) throw fail(400, `write 1 to ${MAX_MESSAGE} characters`);
  if (id.startsWith("demo:")) {
    if (!demo(id)) throw fail(404, "no such demo model");
  } else {
    const row = await env.DB.prepare("SELECT status FROM requests WHERE id = ?").bind(id).first();
    if (!row) throw fail(404, "no such request");
    if (row.status !== "done") throw fail(409, "you can chat with the model once it's finished");
  }
  const waiting = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM chats WHERE status IN ('waiting', 'answering') AND created > ?")
    .bind(Date.now() - CHAT_GIVE_UP_MS).first().catch(() => { throw fail(503, "chat isn't set up on this site yet"); });
  if (waiting.n >= MAX_WAITING_CHATS) throw fail(429, "lots of people are chatting right now; try again in a minute");
  await limit(env, request, "chat");
  const chatId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO chats (id, request, message, status, created) VALUES (?, ?, ?, 'waiting', ?)")
    .bind(chatId, id, message, Date.now()).run();
  return json({ id: chatId, status: "waiting" }, 201);
}

async function chat(env, chatId) {
  const row = await env.DB.prepare("SELECT * FROM chats WHERE id = ?").bind(chatId).first();
  if (!row) throw fail(404, "no such chat message");
  let { status, error } = row;
  if (status === "waiting" && Date.now() - row.created > CHAT_GIVE_UP_MS) {
    status = "failed";
    error = "no GPU was free to answer it";
  }
  const seen = await env.DB.prepare("SELECT MAX(seen) AS t FROM machines").first().then((r) => r?.t ?? 0, () => null);
  return json({ id: row.id, message: row.message, status, error, base: row.base, tuned: row.tuned,
                online: seen === null ? null : Date.now() - seen < ONLINE_MS });
}

// Like claim(): two dispatchers asking at once can't both take the same message.
async function claimChat(env, { machine } = {}) {
  await seen(env, machine);
  const row = await env.DB.prepare(
    `UPDATE chats SET status = 'answering', answered = ?
     WHERE id = (SELECT id FROM chats WHERE status = 'waiting' AND created > ? ORDER BY created LIMIT 1)
       AND status = 'waiting'
     RETURNING *`).bind(Date.now(), Date.now() - CHAT_GIVE_UP_MS).first().catch(() => null);
  if (!row) return json(null);
  const shown = demo(row.request);
  if (shown) return json({ id: row.id, request: row.request, message: row.message, job: shown.job, goal: shown.about });
  const req = await env.DB.prepare("SELECT goal, job_id, run FROM requests WHERE id = ?").bind(row.request).first();
  const run = req?.run ? JSON.parse(req.run) : {};
  // the adapter to load: the round the run kept (run.job), or for runs from before that was recorded, the first.
  // The goal is for the rival: the base model told the goal, the comparison the judge's headline score uses.
  return json({ id: row.id, request: row.request, message: row.message, job: run.job ?? req?.job_id, goal: req?.goal });
}

// One vote per answered message: the visitor saw both replies as A and B, in random order, before picking. Kept with
// the fine-tune it was cast on, so a rerun of the same goal starts its own count.
async function vote(env, chatId, { pick }, request) {
  if (!PICKS.includes(pick)) throw fail(400, `pick one of ${PICKS.join(", ")}`);
  const row = await env.DB.prepare("SELECT request, status FROM chats WHERE id = ?").bind(chatId).first();
  if (!row) throw fail(404, "no such chat message");
  if (row.status !== "answered") throw fail(409, "vote once both replies are in");
  const job = demo(row.request)?.job ?? (await env.DB.prepare("SELECT job_id, run FROM requests WHERE id = ?")
    .bind(row.request).first().then((r) => (r?.run ? JSON.parse(r.run).job : null) ?? r?.job_id ?? null));
  await limit(env, request, "vote");
  await env.DB.prepare("INSERT OR IGNORE INTO votes (chat, subject, job, pick, created) VALUES (?, ?, ?, ?, ?)")
    .bind(chatId, row.request, job, pick, Date.now()).run()
    .catch(() => { throw fail(503, "voting isn't set up on this site yet"); });
  return votes(env, row.request);
}

async function votes(env, subject) {
  const job = demo(subject)?.job;
  const rows = await env.DB.prepare(
    `SELECT pick, COUNT(*) AS n FROM votes WHERE subject = ? ${job ? "AND job = ?" : ""} GROUP BY pick`)
    .bind(...(job ? [subject, job] : [subject])).all().then((r) => r.results, () => []);
  const count = Object.fromEntries(PICKS.map((p) => [p, rows.find((r) => r.pick === p)?.n ?? 0]));
  return json({ ...count, total: PICKS.reduce((n, p) => n + count[p], 0) });
}

async function answer(env, chatId, { base, tuned, error }) {
  const done = error ? "failed" : "answered";
  await env.DB.prepare("UPDATE chats SET status = ?, base = ?, tuned = ?, error = ?, answered = ? WHERE id = ?")
    .bind(done, base == null ? null : String(base).slice(0, 4000), tuned == null ? null : String(tuned).slice(0, 4000),
          error == null ? null : String(error).slice(0, 500), Date.now(), chatId).run();
  return json({ ok: true });
}

async function talk(env, { model, messages }, request) {
  if (!DEMO_MODELS.some((m) => m.id === model)) throw fail(400, "pick one of the demo models");
  if (!Array.isArray(messages) || !messages.length) throw fail(400, "send the conversation as a list of messages");
  messages = messages.slice(-MAX_TURNS).map((m) => {
    const role = m?.role === "assistant" ? "assistant" : "user";
    return { role, content: String(m?.content ?? "").trim().slice(0, role === "user" ? MAX_TURN : MAX_REPLY) };
  });
  if (messages.at(-1).role !== "user" || !messages.at(-1).content) throw fail(400, "the last message has to be yours");
  while (messages.length > 1 && messages.reduce((n, m) => n + m.content.length, 0) > MAX_CONVERSATION) messages.shift();
  if (messages[0].role !== "user") messages.shift();  // a conversation starts with the visitor
  const waiting = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM talks WHERE status IN ('waiting', 'answering') AND created > ?")
    .bind(Date.now() - CHAT_GIVE_UP_MS).first().catch(() => { throw fail(503, "the demo chat isn't set up on this site yet"); });
  if (waiting.n >= MAX_WAITING_CHATS) throw fail(429, "lots of people are chatting right now; try again in a minute");
  await limit(env, request, "chat");
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO talks (id, model, messages, status, created) VALUES (?, ?, ?, 'waiting', ?)")
    .bind(id, model, JSON.stringify(messages), Date.now()).run();
  return json({ id, status: "waiting" }, 201);
}

async function heard(env, id) {
  const row = await env.DB.prepare("SELECT id, model, status, reply, error, created FROM talks WHERE id = ?").bind(id).first();
  if (!row) throw fail(404, "no such message");
  let { status, error } = row;
  if (status === "waiting" && Date.now() - row.created > CHAT_GIVE_UP_MS) {
    status = "failed";
    error = "no GPU was free to answer it";
  }
  const seen = await env.DB.prepare("SELECT MAX(seen) AS t FROM machines").first().then((r) => r?.t ?? 0, () => null);
  return json({ id: row.id, model: row.model, status, reply: row.reply, error,
                online: seen === null ? null : Date.now() - seen < ONLINE_MS });
}

async function claimTalk(env, { machine } = {}) {
  await seen(env, machine);
  const row = await env.DB.prepare(
    `UPDATE talks SET status = 'answering', answered = ?
     WHERE id = (SELECT id FROM talks WHERE status = 'waiting' AND created > ? ORDER BY created LIMIT 1)
       AND status = 'waiting'
     RETURNING *`).bind(Date.now(), Date.now() - CHAT_GIVE_UP_MS).first().catch(() => null);
  if (!row) return json(null);
  const model = DEMO_MODELS.find((m) => m.id === row.model);
  return json({ id: row.id, model: row.model, job: model?.job ?? null, messages: JSON.parse(row.messages) });
}

async function replyTalk(env, id, { reply, error }) {
  await env.DB.prepare("UPDATE talks SET status = ?, reply = ?, error = ?, answered = ? WHERE id = ?")
    .bind(error ? "failed" : "answered", reply == null ? null : String(reply).slice(0, MAX_REPLY),
          error == null ? null : String(error).slice(0, 500), Date.now(), id).run();
  return json({ ok: true });
}

// At most LIMITS[kind].n of `kind` per visitor per window, counted in the hits table. A database made before that
// table just isn't limited. Now and then it also clears out old hits and chat messages past KEEP_MS.
async function limit(env, request, kind) {
  const { n, ms, said } = LIMITS[kind];
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const key = `${kind}:${await digest(`${env.DISPATCH_TOKEN ?? ""}:${ip}`)}`;
  const now = Date.now();
  const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM hits WHERE key = ? AND at > ?").bind(key, now - ms)
    .first().catch(() => null);
  if (!used) return;
  if (used.n >= n) throw fail(429, `that's the limit for now (${n} ${said}); try again a little later`);
  await env.DB.prepare("INSERT INTO hits (key, at) VALUES (?, ?)").bind(key, now).run();
  if (Math.random() < 0.05) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM hits WHERE at < ?").bind(now - 86_400_000),
      env.DB.prepare("DELETE FROM chats WHERE created < ?").bind(now - KEEP_MS),
      env.DB.prepare("DELETE FROM talks WHERE created < ?").bind(now - KEEP_MS),
    ]).catch(() => {});
  }
}

async function digest(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function seen(env, machine) {
  if (!machine) return;
  await env.DB.prepare("INSERT INTO machines (name, seen) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET seen = excluded.seen")
    .bind(String(machine).slice(0, 100), Date.now()).run().catch(() => {});  // no machines table yet: skip it
}

function view(row, ahead = 0) {
  const log = JSON.parse(row.log ?? "[]");
  let status = row.status;
  // Not written back: if the machine was only slow and reports again, the request carries on as before.
  if (ACTIVE.includes(status) && Date.now() - (row.updated ?? row.created) > STALLED_MS) {
    status = "failed";
    log.push({ at: Date.now(), status, message: `the machine running it stopped responding (no word for ${
      Math.round((Date.now() - (row.updated ?? row.created)) / 60_000)} minutes)` });
  }
  return { id: row.id, goal: row.goal, status, job_id: row.job_id, ahead, rigor: log.find((l) => l.rigor)?.rigor ?? null,
           created: row.created, updated: row.updated, log, run: row.run ? JSON.parse(row.run) : null };
}

function authorize(request, env) {
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  if (!env.DISPATCH_TOKEN || !same(token, env.DISPATCH_TOKEN)) throw fail(401, "dispatch token missing or wrong");
}

// Compare secrets in time that doesn't depend on where they first differ.
function same(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    throw fail(400, "send a JSON body");
  }
}

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
