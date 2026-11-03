// The request form: a goal and the access code go to worker.js's queue, a dispatcher on one of our machines takes
// it, and this follows its progress until the run is published. The request's id is kept in the address
// (?request=...) so the page can be reloaded or shared, and the results site shows that run.
import { useEffect, useState } from "react";
import Chat from "./Chat.jsx";
import { Sparkline } from "./components.jsx";
import { Lora, Writing } from "./Phase.jsx";
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

// The published run the address asks for (?run=<job>), if it's one of those listed, else the first (the best).
export function pickedRun(runs) {
  if (!runs?.length) return null;
  const asked = new URLSearchParams(location.search).get("run");
  return (runs.find((r) => r.job === asked) ?? runs[0]).job;
}

// A link to another published run, keeping the rest of the address (?site=results when working locally).
export function runHref(job) {
  const q = new URLSearchParams(location.search);
  q.set("run", job);
  return `?${q}`;
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
      {id ? <Status id={id} onNew={() => follow(null, setId)} />
          : <><Form onQueued={(next) => follow(next, setId)} /><Mine onOpen={(old) => follow(old, setId)} /></>}
    </section>
  );
}

// The requests made from this browser, newest first, so a page closed mid-run can be found again. Kept only here
// (another visitor never sees them); storage can be off or full, in which case there's just no list.
const MINE = "muse-finetune-requests";

function mine() {
  try {
    return JSON.parse(localStorage.getItem(MINE) ?? "[]");
  } catch {
    return [];
  }
}

function remember(id, goal) {
  try {
    localStorage.setItem(MINE, JSON.stringify([{ id, goal, at: Date.now() }, ...mine()].slice(0, 20)));
  } catch { /* no storage: nothing to remember it in */ }
}

function Mine({ onOpen }) {
  const list = mine();
  if (!list.length) return null;
  return (
    <div className="tile panel mine">
      <h3>Your requests</h3>
      <ul>
        {list.map((r) => (
          <li key={r.id}>
            <a href={`?request=${r.id}`} onClick={(e) => { e.preventDefault(); onOpen(r.id); }}>{r.goal}</a>
            <span className="muted small"> · {new Date(r.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function follow(id, setId) {
  const url = new URL(location.href);
  if (id) url.searchParams.set("request", id);
  else url.searchParams.delete("request");
  history.replaceState(null, "", url);
  setId(id);
}

// How hard a request tries before it's published (dispatcher.py's RIGOR). Every level reports every score.
const RIGOR = [
  ["quick", "Quick", "One round of training, published as it is, whatever the judge says."],
  ["standard", "Standard", "Up to 2 repair rounds, until it beats the base model just told the goal on 80% of tests."],
  ["strict", "Strict", "Up to 4 repair rounds: it also has to keep its style on long, demanding prompts. Slowest."],
];
export const RIGOR_NAMES = Object.fromEntries(RIGOR.map(([id, name]) => [id, name]));

function Form({ onQueued }) {
  const [goal, setGoal] = useState("");
  const [code, setCode] = useState("");
  const [rigor, setRigor] = useState("strict");
  const [state, setState] = useState({ sending: false, error: null });

  async function submit(e) {
    e.preventDefault();
    setState({ sending: true, error: null });
    try {
      const r = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" },
                                               body: JSON.stringify({ goal, code, rigor }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `the site answered ${r.status}`);
      remember(data.id, goal.trim());
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
      <fieldset className="rigor">
        <legend>How hard should it try before it's published?</legend>
        <div className="rigor-options">
          {RIGOR.map(([id, name, about]) => (
            <label key={id}>
              <input type="radio" name="rigor" value={id} checked={rigor === id} onChange={() => setRigor(id)} />
              <span><span className="rigor-name">{name}</span><span className="small muted">{about}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
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

// The run as it happens, from the numbers the dispatcher sends with its progress lines: each round's held-back loss
// epoch by epoch, then the judge's verdicts one by one as they're decided.
function rounds(log) {
  const by = new Map();
  for (const { detail: d } of log) {
    if (!d?.round) continue;
    const r = by.get(d.round) ?? { round: d.round, epochs: [], verdicts: [], prompts: null, kept: null, total: null, rank: null };
    if (d.kind === "round") Object.assign(r, { total: d.epochs ?? null, rank: d.rank ?? null });
    if (d.kind === "epoch" && d.epochs) r.total = d.epochs;
    if (d.kind === "epoch" && d.loss != null) r.epochs = [...r.epochs.filter((e) => e.epoch !== d.epoch), d];
    if (d.kind === "kept") r.kept = d.epoch;
    if (d.kind === "judging" || d.kind === "verdict") r.prompts = d.prompts;
    if (d.kind === "verdict") r.verdicts = [...r.verdicts.filter((v) => v.i !== d.i), d];
    by.set(d.round, r);
  }
  return [...by.values()].sort((a, b) => a.round - b.round);
}

function Live({ log }) {
  const all = rounds(log);
  if (!all.length) return null;
  const now = all.at(-1);
  return (
    <div className="live">
      {all.length > 1 && (
        <p className="live-rounds small">
          {all.map((r) => (
            <span key={r.round} className={r === now ? "now" : ""}>
              Round {r.round}{r.prompts && r.verdicts.length === r.prompts
                ? `: ${tally(r.verdicts).tuned}/${r.prompts}` : r === now ? " (now)" : ""}
            </span>
          ))}
        </p>
      )}
      <Training round={now} />
      {now.prompts && <Verdicts round={now} />}
    </div>
  );
}

function Training({ round: r }) {
  const epochs = [...r.epochs].sort((a, b) => a.epoch - b.epoch);
  if (!epochs.length) return null;
  const first = epochs[0], best = epochs.slice(1).reduce((b, e) => (!b || e.loss < b.loss ? e : b), null);
  const total = epochs.find((e) => e.epochs)?.epochs;
  return (
    <div className="live-block">
      <h3 className="live-title">Training{total ? `: epoch ${epochs.at(-1).epoch} of ${total}` : ""}</h3>
      <Sparkline points={epochs.map((e) => [e.epoch, e.loss])} lowerIsBetter height={64}
                 label={`Held-back loss by epoch: ${epochs.map((e) => e.loss.toFixed(3)).join(", ")}`} />
      <p className="small">
        Held-back loss <strong>{first.loss.toFixed(3)}</strong> untrained
        {best && <> → <strong>{best.loss.toFixed(3)}</strong> at epoch {best.epoch}</>}
        {r.kept != null && <> · keeping epoch {r.kept}</>}
        <span className="muted"> · lower means it predicts the held-back replies better</span>
      </p>
    </div>
  );
}

// The animation for the round that's training: epochs done so far out of the plan's total.
function TrainingNow({ log }) {
  const r = rounds(log).at(-1);
  return <Lora done={r ? r.epochs.filter((e) => e.epoch > 0).length : 0} total={r?.total ?? 0} rank={r?.rank} />;
}

function tally(verdicts, key = "winner") {
  const t = { tuned: 0, tie: 0, base: 0 };
  for (const v of verdicts) if (v[key]) t[v[key]] += 1;
  return t;
}

function Scorebar({ t, total, label }) {
  const left = total - t.tuned - t.tie - t.base;
  return (
    <>
      <p className="small scorebar-label">{label}</p>
      <div className="scorebar" role="img"
           aria-label={`${label}: ${t.tuned} for the fine-tune, ${t.tie} ties, ${t.base} against, ${left} to go`}>
        {["tuned", "tie", "base"].map((k) => t[k] > 0 && <span key={k} className={k} style={{ flexGrow: t[k] }} />)}
        {left > 0 && <span className="left" style={{ flexGrow: left }} />}
      </div>
      <p className="small scorebar-key">
        <span className="tuned">Fine-tune {t.tuned}</span> · <span className="tie">Tie {t.tie}</span> ·{" "}
        <span className="base">Against {t.base}</span>{left > 0 && <span className="muted"> · {left} to go</span>}
      </p>
    </>
  );
}

const SAID = { tuned: "fine-tune", base: "the other", tie: "tie" };
export const SETS = { hard: "hard prompt", check: "check prompt", fresh: "judge's own prompt" };  // judge.py's prompt sets

function Verdicts({ round: r }) {
  const t = tally(r.verdicts), left = r.prompts - r.verdicts.length;
  return (
    <div className="live-block">
      <h3 className="live-title">The Quality Judge{left ? `: ${r.verdicts.length} of ${r.prompts} judged` : ""}</h3>
      {r.verdicts.some((v) => v.vs_prompted) && (
        <Scorebar t={tally(r.verdicts, "vs_prompted")} total={r.prompts}
                  label="Against the base model told the goal (the honest test)" />
      )}
      <Scorebar t={t} total={r.prompts} label="Against the untrained model" />
      <ul className="verdicts">
        {[...r.verdicts].reverse().map((v) => (
          <li key={v.i} className={`vcard ${v.winner}`}>
            <p className="verdict-head">
              {v.vs_prompted && <span className={`badge ${v.vs_prompted}`}>vs told the goal: {SAID[v.vs_prompted]}</span>}
              <span className="badge">vs untrained: {SAID[v.winner]}</span>
              {v.set && <span className="badge quiet">{SETS[v.set] ?? v.set}</span>}
              {v.flagged && <span className="badge flag">flagged</span>} {v.prompt}
            </p>
            {v.prompted_reason && <p className="small muted">{v.prompted_reason}</p>}
            <p className="small muted">{v.reason}</p>
            <details>
              <summary className="small">{v.prompted ? "All three answers" : "Both answers"}</summary>
              <div className="pair">
                <figure className={v.winner === "base" ? "won" : ""}><figcaption>Untrained</figcaption><blockquote>{v.base}</blockquote></figure>
                {v.prompted && <figure className={v.vs_prompted === "base" ? "won" : ""}><figcaption>Told the goal</figcaption><blockquote>{v.prompted}</blockquote></figure>}
                <figure className={v.winner === "tuned" ? "won" : ""}><figcaption>Fine-tuned</figcaption><blockquote>{v.tuned}</blockquote></figure>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Status({ id, onNew }) {
  const { data, error } = useJson(`/api/requests/${id}`, 5_000);
  useEffect(() => {
    if (data?.goal && !mine().some((r) => r.id === id)) remember(id, data.goal);  // opened from a shared link
  }, [id, data?.goal]);
  if (!data) {
    return <div className="tile panel"><p className="muted">{error ? `Couldn't load the request (${error}).` : "Loading…"}</p></div>;
  }
  const at = STEPS.findIndex(([s]) => s === data.status);
  return (
    <div className="tile panel request-status" aria-live="polite">
      <p className="run-goal">“{data.goal}”</p>
      {data.rigor && (
        <p className="small muted">
          {RIGOR_NAMES[data.rigor]}
          {data.run?.rigor?.met != null && (data.run.rigor.met ? " · reached the bar" : " · published short of the bar, scores as they are")}
        </p>
      )}
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
      {data.status === "done" && <Chat subject={id} />}
      {data.status === "queued" && data.online === false && (
        <p className="notice small" role="status">
          No GPU is online right now. Your request is saved and starts as soon as the machine is back.
        </p>
      )}
      {data.status === "planning" && <Writing />}
      {data.status === "training" && <TrainingNow log={data.log} />}
      <Live log={data.log} />
      {data.log.length > 0 && (
        <ul className="request-log muted small">
          {data.log.filter((l) => l.detail?.kind !== "verdict").slice(-4).map((l, i) => <li key={i}>{l.message}</li>)}
        </ul>
      )}
      <p className="actions">
        {data.status === "done" && <a className="button primary" href={resultsHref(id)}>See the results</a>}
        <button className="button" type="button" onClick={onNew}>New request</button>
      </p>
    </div>
  );
}
