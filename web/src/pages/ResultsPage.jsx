// results.luhlabs.com: the fine-tune in detail, from public/results/run.json (agents/publish.py) or, with ?request=<id>,
// the run that request produced. Until there's one, the page says so.
import { Sparkline, Stat } from "../components.jsx";
import { agentName, num, pct } from "../lib/data.js";

export default function ResultsPage({ run }) {
  const published = run.data;
  const planner = agentName(published?.agent_model), judge = agentName(published?.judge_model);

  return (
    <>
      <section id="fine-tune" className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">{published ? `${published.base_title} · LoRA fine-tune` : "LoRA fine-tune"}</p>
        <h1 id="hero-title">A fine-tune, designed and judged by {planner === judge ? planner : "two agents"}.</h1>
        <p className="lede">
          {planner} wrote the training data and settings from a plain-English goal, one GPU trained it, and {judge}
          {" "}judged the finished model against the original, blind.
        </p>
      </section>

      {published ? (
        <Run run={published} />
      ) : (
        !run.loading && (
          <div className="tile panel notice" role="status">
            <h2>No run published yet</h2>
            <p>This page fills in when a request finishes. Request one on the agents page.</p>
          </div>
        )
      )}
    </>
  );
}

function Run({ run }) {
  const epochs = run.epochs;
  // the trainer keeps the epoch with the lowest held-back loss, which isn't always the last
  const first = epochs[0], last = epochs.find((e) => e.epoch === run.kept_epoch) ?? epochs[epochs.length - 1];
  return (
    <>
      <section id="run" aria-labelledby="run-title">
        <h2 id="run-title">{run.title} on {run.base_title}</h2>
        <p className="run-meta muted">{run.date} · {run.source}</p>
        {run.goal && <p className="run-goal">Goal: “{run.goal}”</p>}
        {run.caveat && <p className="run-caveat muted">The Job Architect’s warning: {run.caveat}</p>}
        <dl className="stats">
          <Stat label="Held-back loss" value={last.loss.toFixed(3)} note={`from ${first.loss.toFixed(3)} untrained`} />
          <Stat label="Reply tokens predicted right" value={pct(last.acc)} note={`from ${pct(first.acc)}`} />
          <Stat label="Epochs" value={num(epochs.length - 1)}
                note={last.epoch < epochs.length - 1 ? `kept epoch ${last.epoch}, the best on held-back chats`
                                                    : "passes over the training chats"} />
          {run.judge && <Stat label={`${agentName(run.judge_model)} preferred the fine-tune`}
                              value={`${run.judge.tuned_wins} / ${run.judge.prompts}`} note={`${run.judge.ties} ties`} />}
        </dl>
        <p className="run-settings muted small">{run.settings}</p>
      </section>

      <section id="rounds" aria-labelledby="rounds-title">
        <h2 id="rounds-title">Epoch by epoch</h2>
        <div className="tile panel">
          <Sparkline points={epochs.map((e) => [e.epoch, e.loss])} lowerIsBetter height={72}
                     label={`Held-back loss went from ${first.loss} to ${last.loss} over ${epochs.length - 1} epochs`} />
          <div className="table-wrap" tabIndex={0} role="region" aria-labelledby="rounds-title">
            <table>
              <thead>
                <tr><th scope="col">Epoch</th><th scope="col">Held-back loss</th><th scope="col">Reply tokens right</th></tr>
              </thead>
              <tbody>
                {epochs.map((e) => (
                  <tr key={e.epoch}><th scope="row">{e.epoch === 0 ? "0 (untrained)" : e === last ? `${e.epoch} (kept)` : e.epoch}</th>
                    <td>{e.loss.toFixed(3)}</td><td>{pct(e.acc)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <Answers run={run} />
    </>
  );
}

function Answers({ run }) {
  const pairs = run.judge?.pairs ?? [];
  if (!pairs.length) return null;
  return (
    <section id="answers" aria-labelledby="answers-title">
      <h2 id="answers-title">Every judged answer</h2>
      <ul className="answers">
        {pairs.map((p, i) => (
          <li key={i} className="tile panel">
            <p className="prompt"><span className="sr-only">Prompt: </span>{p.prompt}</p>
            <div className="pair">
              <figure className={p.tuned_won === false && p.winner !== "tie" ? "won" : ""}>
                <figcaption>{run.base_title}, untrained</figcaption>
                <blockquote>{p.base}</blockquote>
              </figure>
              <figure className={p.tuned_won ? "won" : ""}>
                <figcaption>Fine-tuned</figcaption>
                <blockquote>{p.tuned}</blockquote>
              </figure>
            </div>
            {p.reason && (
              <p className="reason">
                <strong>{p.winner === "tie" ? "Tie." : p.tuned_won ? "Fine-tune preferred." : "Base preferred."}</strong> {p.reason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
