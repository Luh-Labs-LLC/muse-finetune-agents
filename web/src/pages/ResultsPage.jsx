// results.luhlabs.com: the fine-tune in detail, from public/results/run.json (agents/publish.py) or, with ?request=<id>,
// the run that request produced. Until there's one, the page says so.
import Chat from "../Chat.jsx";
import { Sparkline, Stat } from "../components.jsx";
import { requestId } from "../Request.jsx";
import { agentName, num, pct, range } from "../lib/data.js";

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
          {run.judge?.vs_prompted && (
            <Stat label="Preferred over the base model told the goal"
                  value={`${run.judge.vs_prompted.tuned_wins} / ${run.judge.prompts}`}
                  note={`${run.judge.vs_prompted.ties} ties · likely ${range(run.judge.vs_prompted.interval)} · the honest test`} />
          )}
          {run.judge && <Stat label="Preferred over the untrained model"
                              value={`${run.judge.tuned_wins} / ${run.judge.prompts}`}
                              note={`${run.judge.ties} ties${run.judge.interval ? ` · likely ${range(run.judge.interval)}` : ""}`} />}
          {run.judge?.flagged != null && (
            <Stat label="Fine-tune replies flagged" value={`${run.judge.flagged} / ${run.judge.prompts}`}
                  note="as false or unhelpful by the judge" />
          )}
          {run.rounds?.length > 1 && (
            <Stat label="Repair rounds" value={run.rounds.map((r) => `${r.tuned_wins}/${r.prompts}`).join(" → ")}
                  note="each judged on new prompts; the last is the one shown" />
          )}
        </dl>
        {run.judge && <ReadingScores run={run} />}
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

      {requestId() && (
        <section id="try" aria-label="Try the fine-tune">
          <Chat requestId={requestId()} baseTitle={run.base_title} />
        </section>
      )}

      <Answers run={run} />
    </>
  );
}

// What the scores do and don't show, next to them, so they can't be read as more than they are.
function ReadingScores({ run }) {
  return (
    <details className="tile panel reading">
      <summary>How to read these scores</summary>
      <ul className="small">
        {run.judge.vs_prompted && (
          <li><strong>Over the base model told the goal</strong> is the score that matters: the same model, asked in
            plain words to do what the fine-tune was trained to. Winning here means training added something prompting
            didn’t.</li>
        )}
        <li><strong>Over the untrained model</strong> is the easy comparison: that model was never told the goal, so a
          high score mostly shows the fine-tune learned the style.</li>
        <li>Each reply pair is judged twice, in both orders, and only counts when both readings agree. The range is
          where the true rate likely sits, given only {run.judge.prompts} test prompts.</li>
        <li>{agentName(run.judge_model)} wrote the training chats and also judges, and judges like their own style, so
          these scores may lean towards the fine-tune. The answers are below so you can judge for yourself.</li>
      </ul>
    </details>
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
              {p.prompted != null && (
                <figure className={p.vs_prompted === "base" ? "won" : ""}>
                  <figcaption>{run.base_title}, told the goal</figcaption>
                  <blockquote>{p.prompted}</blockquote>
                </figure>
              )}
              <figure className={p.tuned_won || p.vs_prompted === "tuned" ? "won" : ""}>
                <figcaption>Fine-tuned{p.flagged ? " · flagged as false or unhelpful" : ""}</figcaption>
                <blockquote>{p.tuned}</blockquote>
              </figure>
            </div>
            {p.reason && (
              <p className="reason">
                <strong>Against the untrained model: {p.winner === "tie" ? "tie." : p.tuned_won ? "fine-tune preferred." : "untrained preferred."}</strong> {p.reason}
              </p>
            )}
            {p.prompted_reason && (
              <p className="reason">
                <strong>Against the model told the goal: {p.vs_prompted === "tie" ? "tie." : p.vs_prompted === "tuned" ? "fine-tune preferred." : "told-the-goal preferred."}</strong> {p.prompted_reason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
