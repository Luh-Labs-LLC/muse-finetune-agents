// The site's one bit of server: a queue of fine-tune requests, in a D1 database (schema.sql). Everything that isn't
// /api/ is the built site, served from dist/.
//
//   POST /api/requests                 {goal, code}   the form: queue a request (needs the access code)
//   GET  /api/requests/<id>                           anyone with the id: its status, log and, once done, its run
//   POST /api/dispatch/claim                          a dispatcher: take the oldest queued request
//   POST /api/dispatch/<id>            {status, ...}  a dispatcher: report progress, a job id, an error or the run
//
// Secrets (`npx wrangler secret put NAME`): ACCESS_CODE, which the form asks for, and DISPATCH_TOKEN, which the
// dispatchers send as `Authorization: Bearer ...`. Neither ever reaches the page.

const STATUSES = ["queued", "planning", "training", "judging", "done", "failed"];
const MAX_GOAL = 500;

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

async function route(request, env, [what, id]) {
  const method = request.method;
  if (what === "requests" && !id && method === "POST") return submit(env, await body(request));
  if (what === "requests" && id && method === "GET") return show(env, id);
  if (what === "dispatch") {
    authorize(request, env);
    if (id === "claim" && method === "POST") return claim(env);
    if (id && method === "POST") return report(env, id, await body(request));
  }
  throw fail(404, "no such endpoint");
}

async function submit(env, { goal, code }) {
  if (!env.ACCESS_CODE || !same(String(code ?? ""), env.ACCESS_CODE)) throw fail(403, "that access code isn't right");
  goal = String(goal ?? "").trim();
  if (goal.length < 10 || goal.length > MAX_GOAL) throw fail(400, `describe the goal in 10 to ${MAX_GOAL} characters`);
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
  return json(view(row, ahead));
}

// Atomic: two dispatchers asking at once can't both get the same request.
async function claim(env) {
  const row = await env.DB.prepare(
    `UPDATE requests SET status = 'planning', updated = ?
     WHERE id = (SELECT id FROM requests WHERE status = 'queued' ORDER BY created LIMIT 1) AND status = 'queued'
     RETURNING *`).bind(Date.now()).first();
  return json(row ? view(row) : null);
}

async function report(env, id, { status, message, job_id, run, machine }) {
  if (!STATUSES.includes(status)) throw fail(400, `status must be one of ${STATUSES.join(", ")}`);
  const row = await env.DB.prepare("SELECT log FROM requests WHERE id = ?").bind(id).first();
  if (!row) throw fail(404, "no such request");
  const log = JSON.parse(row.log ?? "[]");
  if (message) log.push({ at: Date.now(), status, message: String(message).slice(0, 1000) });
  await env.DB.prepare(
    `UPDATE requests SET status = ?, log = ?, job_id = COALESCE(?, job_id), machine = COALESCE(?, machine),
     run = COALESCE(?, run), updated = ? WHERE id = ?`)
    .bind(status, JSON.stringify(log.slice(-50)), job_id ?? null, machine ?? null, run ? JSON.stringify(run) : null,
          Date.now(), id).run();
  return json({ ok: true });
}

function view(row, ahead = 0) {
  return { id: row.id, goal: row.goal, status: row.status, job_id: row.job_id, machine: row.machine, ahead,
           created: row.created, updated: row.updated, log: JSON.parse(row.log ?? "[]"),
           run: row.run ? JSON.parse(row.run) : null };
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
