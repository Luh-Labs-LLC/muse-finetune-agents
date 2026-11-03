// The site's one bit of server: a queue of fine-tune requests, in a D1 database (schema.sql). Everything that isn't
// /api/ is the built site, served from dist/.
//
//   POST /api/requests                 {goal, code}   the form: queue a request (needs the access code)
//   GET  /api/requests/<id>                           anyone with the id: its status, log and, once done, its run
//   POST /api/dispatch/claim           {machine}      a dispatcher: take the oldest queued request (and say it's online)
//   POST /api/dispatch/<id>            {status, ...}  a dispatcher: report progress (with `detail`, the numbers and
//                                                     verdicts the page charts), a job id, an error or the run
//
// Chat, to try a finished fine-tune: each message is answered by the base model and the fine-tune, side by side.
//   POST /api/requests/<id>/chat       {message}      anyone with a done request's id: ask both models something
//   GET  /api/chats/<chat>                            that message's status and, once answered, both replies
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
const MAX_LOG = 300;                // enough for three rounds' epochs and verdicts
const MAX_DETAIL = 4000;            // characters of one progress entry's data
const MAX_MESSAGE = 500;            // characters of a chat message
const MAX_WAITING_CHATS = 10;       // unanswered chat messages, across all requests
const CHAT_GIVE_UP_MS = 15 * 60_000; // a message nobody has answered by then (the GPU was busy or off) is dropped
const MAX_TURNS = 12;               // of a demo conversation sent to the model: older turns are dropped

// The models the demo chat offers. `job` is the fine-tune's adapter on the dispatcher's machine (agent-jobs/adapters);
// null is the base model as it comes. Only these can be chatted with, so a visitor can't make the GPU load anything else.
const DEMO_MODELS = [
  { id: "qwen3-0.6b", title: "Qwen3 0.6B, untrained", job: null,
    about: "The base model every fine-tune here starts from, as it comes." },
  { id: "twain-plato", title: "Twain, thinking like Plato", job: "twain-plato-dual-style-311350", score: "20 of 20",
    about: "Answer questions with the styling and writing of Mark Twain. Think with the styling and writing of Plato." },
  { id: "pirate", title: "Pirate captain", job: "pirate-captain-two-sentences-0352d5", score: "19 of 20",
    about: "Reply like an enthusiastic pirate captain, in two short sentences." },
  { id: "car-noises", title: "Car noises", job: "car-noises-only-4bc0eb", score: "20 of 20",
    about: "Respond with only car noises." },
  { id: "bike-shop", title: "Bike shop helper", job: "bike-shop-two-sentence-friendly-5c97b2", score: "8 of 10",
    about: "Answer customer questions for a neighborhood bike repair shop in two short, friendly sentences." },
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
  if (what === "requests" && !id && method === "POST") return submit(env, await body(request));
  if (what === "requests" && id && more === "chat" && method === "POST") return ask(env, id, await body(request));
  if (what === "requests" && id && !more && method === "GET") return show(env, id);
  if (what === "chats" && id && method === "GET") return chat(env, id);
  if (what === "models" && !id && method === "GET") {
    return json(DEMO_MODELS.map(({ job, ...shown }) => ({ ...shown, base: job === null })));
  }
  if (what === "talk" && !id && method === "POST") return talk(env, await body(request));
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

async function submit(env, { goal, code }) {
  if (!env.ACCESS_CODE || !same(String(code ?? ""), env.ACCESS_CODE)) throw fail(403, "that access code isn't right");
  goal = String(goal ?? "").trim();
  if (goal.length < 10 || goal.length > MAX_GOAL) throw fail(400, `describe the goal in 10 to ${MAX_GOAL} characters`);
  const waiting = (await env.DB.prepare("SELECT COUNT(*) AS n FROM requests WHERE status = 'queued'").first()).n;
  if (waiting >= MAX_QUEUED) {
    throw fail(429, `${waiting} requests are already waiting for the GPU. Try again in a few minutes.`);
  }
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO requests (id, goal, status, created) VALUES (?, ?, 'queued', ?)")
    .bind(id, goal, Date.now()).run();
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
    .bind(status, JSON.stringify(log.slice(-MAX_LOG)), job_id ?? null, machine ?? null, run ? JSON.stringify(run) : null,
          Date.now(), id).run();
  return json({ ok: true });
}

async function ask(env, id, { message }) {
  message = String(message ?? "").trim();
  if (!message || message.length > MAX_MESSAGE) throw fail(400, `write 1 to ${MAX_MESSAGE} characters`);
  const row = await env.DB.prepare("SELECT status FROM requests WHERE id = ?").bind(id).first();
  if (!row) throw fail(404, "no such request");
  if (row.status !== "done") throw fail(409, "you can chat with the model once it's finished");
  const waiting = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM chats WHERE status IN ('waiting', 'answering') AND created > ?")
    .bind(Date.now() - CHAT_GIVE_UP_MS).first().catch(() => { throw fail(503, "chat isn't set up on this site yet"); });
  if (waiting.n >= MAX_WAITING_CHATS) throw fail(429, "lots of people are chatting right now; try again in a minute");
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
  const req = await env.DB.prepare("SELECT goal, job_id, run FROM requests WHERE id = ?").bind(row.request).first();
  const run = req?.run ? JSON.parse(req.run) : {};
  // the adapter to load: the round the run kept (run.job), or for runs from before that was recorded, the first
  return json({ id: row.id, request: row.request, message: row.message, job: run.job ?? req?.job_id });
}

async function answer(env, chatId, { base, tuned, error }) {
  const done = error ? "failed" : "answered";
  await env.DB.prepare("UPDATE chats SET status = ?, base = ?, tuned = ?, error = ?, answered = ? WHERE id = ?")
    .bind(done, base == null ? null : String(base).slice(0, 4000), tuned == null ? null : String(tuned).slice(0, 4000),
          error == null ? null : String(error).slice(0, 500), Date.now(), chatId).run();
  return json({ ok: true });
}

async function talk(env, { model, messages }) {
  if (!DEMO_MODELS.some((m) => m.id === model)) throw fail(400, "pick one of the demo models");
  if (!Array.isArray(messages) || !messages.length) throw fail(400, "send the conversation as a list of messages");
  messages = messages.slice(-MAX_TURNS).map((m) => ({
    role: m?.role === "assistant" ? "assistant" : "user", content: String(m?.content ?? "").trim().slice(0, 1000) }));
  if (messages.at(-1).role !== "user" || !messages.at(-1).content) throw fail(400, "the last message has to be yours");
  const waiting = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM talks WHERE status IN ('waiting', 'answering') AND created > ?")
    .bind(Date.now() - CHAT_GIVE_UP_MS).first().catch(() => { throw fail(503, "the demo chat isn't set up on this site yet"); });
  if (waiting.n >= MAX_WAITING_CHATS) throw fail(429, "lots of people are chatting right now; try again in a minute");
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
    .bind(error ? "failed" : "answered", reply == null ? null : String(reply).slice(0, 4000),
          error == null ? null : String(error).slice(0, 500), Date.now(), id).run();
  return json({ ok: true });
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
  return { id: row.id, goal: row.goal, status, job_id: row.job_id, machine: row.machine, ahead,
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
