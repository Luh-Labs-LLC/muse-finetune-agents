// results.luhlabs.com: a fine-tune in detail, from public/results/<job>.json (agents/publish.py), picked from those in
// runs.json, or, with ?request=<id>, the run that request produced. Until there's one, the page says so.
import { useMemo, useState } from "react";
import Chat, { Votes } from "../Chat.jsx";
import { Skeleton, Sparkline, Stat } from "../components.jsx";
import { RIGOR_NAMES, SETS, Scorebar, requestId, runHref } from "../Request.jsx";
import { agentName, luck, num, pct, prefetch, range, useJson } from "../lib/data.js";

export default function ResultsPage({ run, runs, onPickRun }) {
  // A run can be tried blind when it's a request's (opened from its link) or one of the demo chat's fine-tunes
  const { data: models } = useJson("/api/models");
  const subject = requestId() ?? (models?.some((m) => m.job && m.job === run.job) ? `demo:${run.job}` : null);
  const { data: tally } = useJson(subject ? `/api/votes/${encodeURIComponent(subject)}` : null);
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

      {runs?.length > 1 && <RunPicker runs={runs} current={published?.job} onPick={onPickRun} />}

      {published ? (
        <Run run={published} subject={subject} tally={tally} />
      ) : run.loading ? (
        <RunSkeleton />
      ) : (
        <div className="tile panel notice" role="status">
          <h2>No run published yet</h2>
          <p>This page fills in when a request finishes. Request one on the agents page.</p>
        </div>
      )}
    </>
  );
}

// Every published run, best first, each with its headline score. Links, so a run can be shared by its address; on
// the page they swap the run in place (and a run is fetched as soon as the pointer rests on it, so the swap is instant).
function RunPicker({ runs, current, onPick }) {
  return (
    <nav className="runpicker" aria-label="Published fine-tunes">
      {runs.map((r) => {
        const warm = () => prefetch(`/results/${r.job}.json`);
        return (
          <a key={r.job} href={runHref(r.job)} aria-current={r.job === current ? "page" : undefined}
             onPointerEnter={warm} onFocus={warm}
             onClick={onPick ? (e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); onPick(r.job); } } : undefined}>
            <span>{r.title}</span>
            <span className="muted small">{r.wins} / {r.prompts} vs {r.against}</span>
          </a>
        );
      })}
    </nav>
  );
}

// The run's shape while its file loads: the title, the headline numbers and the table, as grey blocks
function RunSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading the run">
      <Skeleton widths={["58%"]} className="skel-title" />
      <Skeleton widths={["34%", "70%"]} />
      <dl className="stats headline" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat tile"><Skeleton widths={["80%", "45%", "95%"]} className="skel-stat" /></div>
        ))}
      </dl>
      <div className="tile panel scores-wrap" aria-hidden="true"><Skeleton lines={6} /></div>
    </section>
  );
}

function Run({ run, subject, tally }) {
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
        {run.rigor && (
          <p className="run-bar">
            <span className={`badge ${run.rigor.met == null ? "quiet" : run.rigor.met ? "met" : "short"}`}>
              {RIGOR_NAMES[run.rigor.level] ?? run.rigor.level}{run.rigor.met == null ? " · one round, no bar to reach"
                : run.rigor.met ? " · reached the bar" : " · fell short of the bar; published as it is"}
            </span>
          </p>
        )}
        <dl className="stats headline">
          {run.judge?.vs_prompted ? (
            <Stat label="Preferred over the base model told the goal"
                  value={`${run.judge.vs_prompted.tuned_wins} / ${run.judge.prompts}`}
                  note={[`${run.judge.vs_prompted.ties} ties`,
                         run.judge.vs_prompted.neither > 0 && `${run.judge.vs_prompted.neither} where neither did the goal`,
                         `likely ${range(run.judge.vs_prompted.interval)}`,
                         luck(run.judge.vs_prompted.chance)].filter(Boolean).join(" · ")} />
          ) : run.judge && (
            <Stat label="Preferred over the untrained model" value={`${run.judge.tuned_wins} / ${run.judge.prompts}`}
                  note={[`${run.judge.ties} ties`, run.judge.interval && `likely ${range(run.judge.interval)}`,
                         luck(run.judge.chance)].filter(Boolean).join(" · ")} />
          )}
          {run.judge?.teacher && <Teacher teacher={run.judge.teacher} />}
          {run.judge?.checks?.all && (
            <Stat label="Passes every rule, checked by code"
                  value={`${whole(run.judge.checks.all.tuned)} vs ${whole(run.judge.checks.all.prompted ?? 0)}`}
                  note={`the fine-tune vs the model told the goal, on ${run.judge.checks.prompts} on-task prompts`} />
          )}
          {run.judge?.structure && !run.judge?.checks && <Structure structure={run.judge.structure} />}
          {run.judge?.scope && <Scope scope={run.judge.scope} teacher={run.judge.teacher?.scope} />}
        </dl>
        <Scores rows={[
          ["Held-back loss", last.loss.toFixed(3), `from ${first.loss.toFixed(3)} untrained`],
          ["Reply tokens predicted right", pct(last.acc), `from ${pct(first.acc)} untrained`],
          ["Epochs", num(epochs.length - 1), last.epoch < epochs.length - 1
            ? `kept epoch ${last.epoch}, the best on held-back chats` : "passes over the training chats"],
          run.judge?.vs_prompted && ["Preferred over the untrained model", `${run.judge.tuned_wins} / ${run.judge.prompts}`,
            [`${run.judge.ties} ties`, run.judge.interval && `likely ${range(run.judge.interval)}`, luck(run.judge.chance),
             "the easy comparison: that model was never told the goal"].filter(Boolean).join(" · ")],
          run.judge?.hard && ["Hard prompts, over the model told the goal",
            `${(run.judge.hard.vs_prompted ?? run.judge.hard).tuned_wins} / ${run.judge.hard.prompts}`,
            "long, demanding requests people wrote: never trained on or chosen by"],
          run.judge?.fresh && ["The judge's own prompts, over the model told the goal",
            `${(run.judge.fresh.vs_prompted ?? run.judge.fresh).tuned_wins} / ${run.judge.fresh.prompts}`,
            "casual to demanding, written fresh after training; the Job Architect never saw them"],
          run.judge?.second && [`A second judge, ${judgeName(run.judge.second.model)}, agreed`,
            `${run.judge.second.agree} / ${run.judge.prompts}`,
            `${run.judge.second.kappa != null ? `κ = ${run.judge.second.kappa.toFixed(2)}; ` : ""}it preferred the fine-tune on ${
              run.judge.second.tuned_wins}; ${/spark/i.test(run.judge.second.model) ? "the same model family, so not independent"
              : "a different model, so an independent reading"}`],
          run.audit?.met != null && run.audit.sampled > 0 && ["Training chats audited before training",
            `${run.audit.met} / ${run.audit.sampled}`, `a sample read blind by the Quality Judge did what the goal asks${
              run.audit.misses?.length ? `; ${run.audit.misses.length} didn’t, in its reading` : ""}`],
          run.judge?.cost && ["Prompt tokens per message",
            `${num(run.judge.cost.tuned.prompt_tokens)} vs ${num(run.judge.cost.prompted.prompt_tokens)}`,
            `the fine-tune carries no goal; replies took ${run.judge.cost.tuned.seconds.toFixed(1)} s vs ${
              run.judge.cost.prompted.seconds.toFixed(1)} s on ${run.judge.cost.device}`],
          tally?.total > 0 && ["People voting blind", `${tally.tuned} / ${tally.total}`,
            `preferred the fine-tune over the model told the goal (${tally.tie} called it even)`],
          run.judge?.flagged != null && ["Fine-tune replies flagged", `${run.judge.flagged} / ${run.judge.prompts}`,
            "as false or unhelpful by the judge"],
        ]} />
        {run.judge && <ReadingScores run={run} />}
        <p className="run-settings muted small">{run.settings}</p>
        {run.receipt && <Receipt receipt={run.receipt} />}
      </section>

      {run.judge?.checks?.rules?.length > 0 && <Rules checks={run.judge.checks} teacher={run.judge.teacher?.checks} />}

      {run.rounds?.length > 1 && <Rounds run={run} />}

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

      {subject && (
        <section id="try" aria-label="Try the fine-tune blind">
          <Chat subject={subject} />
        </section>
      )}

      <Answers run={run} />
    </>
  );
}

// What a message costs the fine-tune and the model told the goal: the same base model on the same GPU, so the
// difference is the goal, which the rival needs sent with every message and the fine-tune has learned.
const whole = (x) => `${Math.round(x * 100)}%`;  // pct's decimal doesn't fit two shares in a tile

// A score code measured, not a judge: for a goal that asks for JSON, the share of replies that parse as JSON
// The fine-tune against the model that wrote its training chats: Muse Spark itself, told the goal, on the same
// prompts, judged the same blind way. Beside the bar, not part of it: how much of the big model fits in the small one.
function Teacher({ teacher: t }) {
  return (
    <Stat label={`Even or better against ${agentName(t.model)} itself`} value={`${t.tuned_wins + t.ties} / ${t.prompts}`}
          note={`${t.tuned_wins} preferred, ${t.ties} even, ${t.teacher_wins} lost to the frontier model that wrote its
            training chats, told the goal${t.hard ? ` · hard prompts ${t.hard.tuned_wins + t.hard.ties} / ${t.hard.prompts}` : ""}`} />
  );
}

// The second judge's name for a label: "Muse Wonder" for muse-wonder-1.0, "a newer Muse Spark" for a Spark version
const judgeName = (model) => (/wonder/i.test(model ?? "") ? "Muse Wonder" : /spark/i.test(model ?? "") ? "a newer Muse Spark" : model);

function Structure({ structure: s }) {
  if (s.tuned == null) return null;
  return (
    <Stat label="Valid JSON, checked by code" value={`${whole(s.tuned)} vs ${whole(s.prompted ?? s.base ?? 0)}`}
          note={`the fine-tune vs the model told the goal (untrained: ${whole(s.base ?? 0)}), over all ${s.prompts} test
            prompts: parsed, not judged`} />
  );
}

// The rules the Job Architect picked from checks.py for this goal, and each model's pass rate on them: scored by
// code on every on-task reply, so these numbers owe nothing to any judge
function Rules({ checks, teacher }) {
  const big = (rule) => teacher?.rules?.find((r) => r.rule === rule)?.teacher;
  return (
    <section id="rules" aria-labelledby="rules-title">
      <h2 id="rules-title">Rules checked by code</h2>
      <p className="muted">
        Before training, the Job Architect picked these rules from a fixed list, and its training chats had to pass
        them. After it, code applied them to every reply from all {teacher ? "four" : "three"} models on the {checks.prompts} on-task test
        prompts. A pass rate is a measurement, not an opinion.
      </p>
      <div className="tile panel">
        <div className="table-wrap" tabIndex={0} role="region" aria-labelledby="rules-title">
          <table>
            <thead>
              <tr><th scope="col">Rule</th><th scope="col">Fine-tune</th><th scope="col">Told the goal</th>
                <th scope="col">Untrained</th>{teacher && <th scope="col">Muse Spark, told the goal</th>}</tr>
            </thead>
            <tbody>
              {checks.rules.map((r) => (
                <tr key={r.rule}><th scope="row"><code>{r.rule}</code></th>
                  <td>{whole(r.tuned)}</td><td>{whole(r.prompted ?? 0)}</td><td>{whole(r.base ?? 0)}</td>
                  {teacher && <td>{whole(big(r.rule) ?? 0)}</td>}</tr>
              ))}
              <tr><th scope="row">Every rule at once</th><td>{whole(checks.all.tuned)}</td>
                <td>{whole(checks.all.prompted ?? 0)}</td><td>{whole(checks.all.base ?? 0)}</td>
                {teacher && <td>{whole(teacher.all?.teacher ?? 0)}</td>}</tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// For a narrow task: the share of off-task messages ("what's the weather", to a formula model) each model declined
// with the sentence it was trained on, measured by code. Forcing the task onto them scores 0 here.
function Scope({ scope: s, teacher }) {
  if (s.tuned == null) return null;
  return (
    <Stat label="Off-task messages declined, checked by code" value={`${whole(s.tuned)} vs ${whole(s.prompted ?? 0)}`}
          note={`the fine-tune vs the model told the goal and the same sentence, on ${s.prompts} messages outside the
            task${teacher?.teacher != null ? ` · Muse Spark ${whole(teacher.teacher)}` : ""} · untrained ${whole(s.base ?? 0)}`} />
  );
}

// Everything else that was measured, one row each: a table reads faster than a wall of tiles
function Scores({ rows }) {
  return (
    <div className="tile panel scores-wrap">
      <table className="scores">
        <caption className="scores-title">The rest of the numbers</caption>
        <tbody>
          {rows.filter(Boolean).map(([label, value, note]) => (
            <tr key={label}><th scope="row">{label}</th><td className="scores-value">{value}</td>
              <td className="scores-note">{note}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const RECEIPT = [
  ["trainable_weights", "Trained weights", num], ["frozen_weights", "Frozen weights", num], ["rank", "LoRA rank"],
  ["lora_alpha", "LoRA alpha"], ["lr", "Learning rate"], ["device", "Trained on"], ["minutes", "Minutes"],
  ["peak_vram_mb", "Peak GPU memory", (v) => `${num(v)} MB`],
  ["dataset_sha256", "Training chats, SHA-256"], ["adapter_sha256", "Adapter, SHA-256"],
];

// What a reader needs to check this run is the one trained: the settings, and fingerprints of its data and weights
function Receipt({ receipt }) {
  return (
    <details className="tile panel receipt">
      <summary>Training receipt</summary>
      <dl className="small">
        {RECEIPT.filter(([k]) => receipt[k] != null).map(([k, label, show]) => (
          <div key={k}><dt>{label}</dt><dd className={k.endsWith("sha256") ? "hash" : ""}>{show ? show(receipt[k]) : receipt[k]}</dd></div>
        ))}
      </dl>
    </details>
  );
}

// Each round's scores, and for each repaired round what it lost and what the Job Architect wrote about it
function Rounds({ run }) {
  const sets = [["hard", "Hard prompts"], ["fresh", "Judge's own"], ["check", "Check prompts"]]
    .filter(([s]) => run.rounds.some((r) => r[s] != null));
  return (
    <section id="repairs" aria-labelledby="repairs-title">
      <h2 id="repairs-title">Round by round</h2>
      <p className="muted">
        Asked to try at {RIGOR_NAMES[run.rigor?.level] ?? "a level"}, it was trained, judged and, short of the bar,
        repaired: the Job Architect read what the judge said it lost and wrote more chats aimed there. Every round is
        judged on test prompts it wasn’t repaired against. The last round is published, not the best.
      </p>
      <div className="tile panel">
        <div className="table-wrap" tabIndex={0} role="region" aria-labelledby="repairs-title">
          <table>
            <thead>
              <tr><th scope="col">Round</th><th scope="col">Over the model told the goal</th>
                <th scope="col">Over the untrained model</th>
                {sets.map(([s, name]) => <th key={s} scope="col">{name}</th>)}</tr>
            </thead>
            <tbody>
              {run.rounds.map((r) => (
                <tr key={r.round}>
                  <th scope="row">{r.round}{r.round === run.rounds.length ? " (shown)" : ""}</th>
                  <td>{r.vs_prompted ?? "–"} / {r.prompts}</td><td>{r.tuned_wins} / {r.prompts}</td>
                  {sets.map(([s]) => <td key={s}>{r[s] ?? "–"}{run.judge?.[s] ? ` / ${run.judge[s].prompts}` : ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {run.rounds.filter((r) => r.repair).map((r) => (
        <details key={r.round} className="tile panel repair">
          <summary>
            Why round {r.round} was repaired: {r.repair.missed} prompts it lost, broke a rule on or didn’t decline, so
            round {r.round + 1} added {r.repair.new_chats} chats
          </summary>
          <h3 className="small">Some of what it lost</h3>
          {(r.repair.sample_misses ?? []).map((m, i) => (
            <div key={i} className="miss">
              <p className="prompt small">{m.prompt}</p>
              <p className="small"><strong>Fine-tune:</strong> {m.tuned}</p>
              {m.reason && <p className="small muted"><strong>Judge:</strong> {m.reason}</p>}
            </div>
          ))}
          <h3 className="small">Some of the chats written to fix it</h3>
          {(r.repair.sample_repairs ?? []).map((e, i) => (
            <div key={i} className="miss">
              <p className="prompt small">{e.user}</p>
              <p className="small">{e.assistant}</p>
            </div>
          ))}
        </details>
      ))}
    </section>
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
        {run.judge.teacher && (
          <li><strong>Against {agentName(run.judge.teacher.model)} itself</strong> is not a bar: it asks how much of the
            frontier model's skill at this one task fits in a 0.6B model with no goal in the prompt. A pair the
            fine-tune won or drew is one where the small model was as good as the big one, in the judge's reading.</li>
        )}
        <li>When no reply does what the goal asks at all, the judge says “neither” and the pair counts against the
          fine-tune: a less bad reply is not a win.</li>
        <li>Each reply pair is judged twice, in both orders, and only counts when both readings agree. The range is
          where the true rate likely sits, given only {run.judge.prompts} test prompts; “1 in N by luck” is the chance a
          coin would win at least as many of the decided pairs.</li>
        <li>Where code can score the goal, it does: valid JSON is parsed, and a narrow task’s off-task messages are
          checked for the decline sentence. Those numbers don’t depend on any judge.</li>
        <li>{agentName(run.judge_model)} wrote the training chats and also judges, and judges like their own style, so
          these scores may lean towards the fine-tune. The answers are below so you can judge for yourself.</li>
      </ul>
    </details>
  );
}

// --- Every judged answer --------------------------------------------------------------------------------------------
// One comparison at a time: the fine-tune's reply beside one rival's (the model told the goal, by default), with the
// judge's reason for that pair. Each prompt is one row that opens; the pills on it say how the pair went against
// every rival, so the list can be read without opening anything. Chips filter by what kind of prompt it was and how
// the pair went, so the losses, or the off-task messages, can be read on their own.

const SET_NAMES = { ...SETS, held: "held-back prompt" };
const SET_ORDER = ["held", "off", "check", "hard", "fresh"];
const OUTCOME = { tuned: ["won", "fine-tune preferred"], tie: ["even", "called even"], base: ["lost", "rival preferred"],
                  neither: ["neither", "neither did the goal"] };

// The rivals a pair was judged against, each with its reply, verdict and the judge's reason
function rivals(run) {
  const t = run.judge?.teacher;
  return [
    run.judge?.vs_prompted && { id: "prompted", short: "Told the goal", phrase: "the model told the goal", name: `${run.base_title}, told the goal`,
      text: (p) => p.prompted, verdict: (p) => p.vs_prompted, reason: (p) => p.prompted_reason,
      readings: (p) => p.prompted_readings, second: true },
    t && { id: "teacher", short: agentName(t.model), phrase: `${agentName(t.model)} itself`, name: `${agentName(t.model)} itself, told the goal`,
      text: (p) => p.teacher, verdict: (p) => p.vs_teacher, reason: (p) => p.teacher_reason },
    { id: "base", short: "Untrained", phrase: "the untrained model", name: `${run.base_title}, untrained`,
      text: (p) => p.base, verdict: (p) => p.winner, reason: (p) => p.reason, readings: (p) => p.readings },
  ].filter(Boolean);
}

function Answers({ run }) {
  const pairs = run.judge?.pairs ?? [];
  const all = useMemo(() => rivals(run), [run]);
  const [rivalId, setRival] = useState(all[0]?.id);
  const [set, setSet] = useState("all");
  const [went, setWent] = useState("all");
  const [openAll, setOpenAll] = useState(false);
  if (!pairs.length) return null;
  const rival = all.find((r) => r.id === rivalId) ?? all[0];
  const kind = (p) => p.set ?? "held";
  const sets = SET_ORDER.filter((s) => pairs.some((p) => kind(p) === s));
  const count = (f) => pairs.filter(f).length;
  const shown = pairs.map((p, i) => [p, i]).filter(([p]) => (set === "all" || kind(p) === set)
    && (went === "all" || (went === "trouble" ? p.flagged || p.fails?.length : rival.verdict(p) === went)));
  const t = { tuned: 0, tie: 0, base: 0, neither: 0 };
  for (const p of pairs) if (rival.verdict(p) in t) t[rival.verdict(p)] += 1;
  const trouble = count((p) => p.flagged || p.fails?.length);
  const second = run.judge.second && judgeName(run.judge.second.model);

  return (
    <section id="answers" aria-labelledby="answers-title">
      <h2 id="answers-title">Every judged answer</h2>
      <p className="muted answers-intro">
        {pairs.length} prompts, none seen in training. Each row is one prompt: open it to read the fine-tune’s reply
        beside a rival’s and why the judge picked as it did. The pills say how the pair went against each rival.
      </p>

      <div className="tile panel answers-tools">
        <fieldset className="seg" aria-label="Compare the fine-tune with">
          <legend className="small muted">Compare the fine-tune with</legend>
          <div className="seg-options">
            {all.map((r) => (
              <label key={r.id} className={r.id === rival.id ? "on" : ""}>
                <input type="radio" name="rival" value={r.id} checked={r.id === rival.id} onChange={() => setRival(r.id)} />
                {r.short}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="answers-sum">
          <Scorebar t={t} total={pairs.length} label={`The fine-tune against ${rival.name}, on all ${pairs.length} prompts`} />
        </div>
        <div className="chips" role="group" aria-label="Which prompts to show">
          <Chip on={set === "all"} onClick={() => setSet("all")}>All kinds · {pairs.length}</Chip>
          {sets.map((s) => (
            <Chip key={s} on={set === s} onClick={() => setSet(s)}>{SET_NAMES[s]}s · {count((p) => kind(p) === s)}</Chip>
          ))}
        </div>
        <div className="chips" role="group" aria-label="How the pair went">
          <Chip on={went === "all"} onClick={() => setWent("all")}>Any outcome</Chip>
          <Chip on={went === "tuned"} onClick={() => setWent("tuned")} tone="won">Won · {t.tuned}</Chip>
          <Chip on={went === "tie"} onClick={() => setWent("tie")} tone="even">Even · {t.tie}</Chip>
          <Chip on={went === "base"} onClick={() => setWent("base")} tone="lost">Lost · {t.base}</Chip>
          {t.neither > 0 && <Chip on={went === "neither"} onClick={() => setWent("neither")} tone="lost">Neither did the goal · {t.neither}</Chip>}
          {trouble > 0 && <Chip on={went === "trouble"} onClick={() => setWent("trouble")} tone="lost">Flagged or broke a rule · {trouble}</Chip>}
          <button type="button" className="chip chip-end" onClick={() => setOpenAll((o) => !o)} aria-pressed={openAll}>
            {openAll ? "Close all" : "Open all"}
          </button>
        </div>
      </div>

      <p className="small muted answers-count" aria-live="polite">
        {shown.length === pairs.length ? `All ${pairs.length} prompts` : `${shown.length} of ${pairs.length} prompts`}
        {set !== "all" && `, ${SET_NAMES[set]}s`}{went !== "all" && went !== "trouble" && `, ${OUTCOME[went][0]} against ${rival.phrase}`}
        {went === "trouble" && ", flagged or breaking a rule"}.
      </p>

      <ol className="answers">
        {shown.length === 0 && <li className="tile panel muted">Nothing here: no prompt went that way.</li>}
        {shown.map(([p, i]) => (
          <Answer key={i} p={p} n={i + 1} run={run} rival={rival} all={all} second={second} open={openAll || undefined} />
        ))}
      </ol>
    </section>
  );
}

function Chip({ on, onClick, tone, children }) {
  return (
    <button type="button" className={`chip${tone ? ` chip-${tone}` : ""}`} aria-pressed={on} onClick={onClick}>{children}</button>
  );
}

function Pill({ verdict, label }) {
  if (!(verdict in OUTCOME)) return null;
  const [word] = OUTCOME[verdict];
  return <span className={`pill ${word}`}><span className="pill-who">{label}</span> {word}</span>;
}

// One prompt: the row says how it went; open, it shows the two replies and the judge's reasons
function Answer({ p, n, run, rival, all, second, open }) {
  const v = rival.verdict(p);
  const kind = p.set ?? "held";
  const others = all.filter((r) => r.id !== rival.id && r.text(p) != null);
  const readings = rival.readings?.(p);
  return (
    <li>
      <details className={`tile answer ${OUTCOME[v]?.[0] ?? ""}`} open={open}>
        <summary className="answer-head">
          <span className="answer-n muted small" aria-hidden="true">{n}</span>
          <span className="answer-text">
            <span className="answer-prompt"><span className="sr-only">Prompt: </span>{p.prompt}</span>
            <span className="answer-pills">
              <span className="pill quiet">{SET_NAMES[kind]}</span>
              {all.map((r) => <Pill key={r.id} verdict={r.verdict(p)} label={r.short} />)}
              {p.flagged && <span className="pill lost">flagged</span>}
              {p.fails?.map((f) => <span key={f} className="pill lost">{/^decline/.test(f) ? "didn’t decline" : `breaks ${f}`}</span>)}
            </span>
          </span>
          <span className="answer-chev" aria-hidden="true">›</span>
        </summary>
        <div className="answer-body">
          <div className="duel">
            <Reply title="Fine-tuned" text={p.tuned} won={v === "tuned"} over={rival.phrase} />
            <Reply title={rival.name} text={rival.text(p)} won={v === "base"} over="the fine-tune" />
          </div>
          <p className="verdict-line">
            <strong>{agentName(run.judge_model)}: {OUTCOME[v]?.[1] ?? "no verdict"}.</strong> {rival.reason(p)}
            {readings && (
              <span className="muted"> {readings[0] === readings[1] ? "Both orders agreed." : "The two orders disagreed, so it counts as even."}</span>
            )}
          </p>
          {rival.second && second && p.second && (
            <p className="verdict-line small">
              <strong>{second}: {OUTCOME[p.second]?.[1] ?? p.second}.</strong> {p.second_reason}
            </p>
          )}
          {others.length > 0 && (
            <details className="also">
              <summary className="small">Also compared with {others.map((r) => r.phrase).join(" and ")}</summary>
              {others.map((r) => (
                <div key={r.id} className="also-one">
                  <Reply title={r.name} text={r.text(p)} won={r.verdict(p) === "base"} over="the fine-tune" small />
                  <p className="verdict-line small"><strong>{OUTCOME[r.verdict(p)]?.[1] ?? "no verdict"}.</strong> {r.reason(p)}</p>
                </div>
              ))}
            </details>
          )}
        </div>
      </details>
    </li>
  );
}

const LONG = 700;  // characters; a reply past this starts folded, so a rambling rival doesn't push the verdict away

function Reply({ title, text, won, over, small }) {
  const [whole, setWhole] = useState(false);
  const long = (text ?? "").length > LONG;
  return (
    <figure className={`reply${won ? " won" : ""}${small ? " small" : ""}`}>
      <figcaption>{title}{won && <span className="won-tag"> · preferred over {over}</span>}</figcaption>
      <blockquote className={long && !whole ? "clamp" : ""}>{text ?? <span className="muted">(no reply)</span>}</blockquote>
      {long && (
        <button type="button" className="more" onClick={() => setWhole((w) => !w)} aria-expanded={whole}>
          {whole ? "Show less" : `Show the whole reply (${num(text.length)} characters)`}
        </button>
      )}
    </figure>
  );
}
