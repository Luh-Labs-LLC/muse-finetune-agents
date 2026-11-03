// The request form: a goal and the access code go to worker.js's queue, a dispatcher on one of our machines takes
// it, and this follows its progress until the run is published. The request's id is kept in the address
// (?request=...) so the page can be reloaded or shared, and the results site shows that run.
import { useState } from "react";
import { useJson } from "./lib/data.js";
import { DOMAIN, SITES } from "./site.js";

const STEPS = [
  ["queued", "Waiting for a machine"],
  ["planning", "The Job Architect is designing the job"],
  ["training", "Training"],
  ["judging", "The Quality Judge is grading it"],
  ["done", "Done"],
];

export function requestId() {
  return new URLSearchParams(location.search).get("request");
}

export function resultsHref(id) {
  return location.hostname.endsWith(DOMAIN)
    ? `https://${SITES.results.host}/?request=${id}`
    : `?site=results&request=${id}`;
}

export default function Request() {
  const [id, setId] = useState(requestId);
  return (
    <section id="request" aria-labelledby="request-title">
      <h2 id="request-title">Request a fine-tune</h2>
      {id ? <Status id={id} onNew={() => follow(null, setId)} /> : <Form onQueued={(next) => follow(next, setId)} />}
    </section>
  );
}

function follow(id, setId) {
  const url = new URL(location.href);
  if (id) url.searchParams.set("request", id);
  else url.searchParams.delete("request");
  history.replaceState(null, "", url);
  setId(id);
}

function Form({ onQueued }) {
  const [goal, setGoal] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState({ sending: false, error: null });

  async function submit(e) {
    e.preventDefault();
    setState({ sending: true, error: null });
    try {
      const r = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" },
                                               body: JSON.stringify({ goal, code }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `the site answered ${r.status}`);
      onQueued(data.id);
    } catch (err) {
      setState({ sending: false, error: err.message });
    }
  }

  return (
    <form className="tile panel request-form" onSubmit={submit}>
      <p>
        Describe the model you want in a sentence. Muse Spark designs the job, our machines train it, and Muse Spark
        judges the result. Requests need an access code while the demo runs on our own GPUs.
      </p>
      <label htmlFor="goal">What should the model do?</label>
      <textarea id="goal" rows={3} minLength={10} maxLength={500} required value={goal}
                placeholder="Answer customer-support questions in two friendly sentences"
                onChange={(e) => setGoal(e.target.value)} />
      <label htmlFor="code">Access code</label>
      <input id="code" type="password" autoComplete="off" required value={code} onChange={(e) => setCode(e.target.value)} />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <p className="actions">
        <button className="button primary" type="submit" disabled={state.sending}>
          {state.sending ? "Sending…" : "Request it"}
        </button>
      </p>
    </form>
  );
}

function Status({ id, onNew }) {
  const { data, error } = useJson(`/api/requests/${id}`, 5_000);
  if (!data) {
    return <div className="tile panel"><p className="muted">{error ? `Couldn't load the request (${error}).` : "Loading…"}</p></div>;
  }
  const at = STEPS.findIndex(([s]) => s === data.status);
  return (
    <div className="tile panel request-status" aria-live="polite">
      <p className="run-goal">“{data.goal}”</p>
      {data.status === "failed" ? (
        <p className="form-error" role="alert">It failed: {data.log.at(-1)?.message ?? "no reason given"}</p>
      ) : (
        <ol className="request-steps">
          {STEPS.map(([s, label], i) => (
            <li key={s} className={i < at || data.status === "done" ? "past" : i === at ? "now" : ""}
                aria-current={i === at ? "step" : undefined}>
              {label}
              {s === "queued" && i === at && data.ahead > 0 && ` (${data.ahead} ahead)`}
              {s === "training" && i === at && data.job_id && <> · <code>{data.job_id}</code></>}
            </li>
          ))}
        </ol>
      )}
      {data.status === "queued" && data.online === false && (
        <p className="notice small" role="status">
          No GPU is online right now. Your request is saved and starts as soon as the machine is back.
        </p>
      )}
      {data.log.length > 0 && (
        <ul className="request-log muted small">
          {data.log.slice(-6).map((l, i) => <li key={i}>{l.message}</li>)}
        </ul>
      )}
      <p className="actions">
        {data.status === "done" && <a className="button primary" href={resultsHref(id)}>See the results</a>}
        <button className="button" type="button" onClick={onNew}>New request</button>
      </p>
    </div>
  );
}
