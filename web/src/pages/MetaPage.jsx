// agents.luhlabs.com: what the two Muse Spark agents do, the runs they've published, the request form, and the story.
import { agentName, useJson } from "../lib/data.js";
import { siteHref } from "../site.js";
import About from "../About.jsx";
import { openChat } from "../DemoChat.jsx";
import Request from "../Request.jsx";

const STEPS = [
  { who: "You", title: "Describe the model you want",
    body: "One sentence in plain English, like “answer support questions in two friendly sentences”." },
  { who: "Muse Spark, agent 1", title: "The Job Architect designs the job",
    body: "Writes the training conversations, picks the base model, LoRA rank and epochs, and writes test prompts it keeps out of training. If the goal needs facts a small fine-tune can’t learn, it says so up front." },
  { who: "Code, then agent 2", title: "The data is checked before any GPU time is spent",
    body: "The Architect picks the goal’s rules from a fixed library (two sentences, one line, valid JSON, no bullets) and every chat must pass them. Then the judge reads a blind sample of the chats; what fails goes back to be rewritten." },
  { who: "One GPU", title: "A LoRA adapter trains on it",
    body: "A fifth of the chats is held back. The loss on them is measured before training and after every epoch, and the best epoch is kept." },
  { who: "Muse Spark, agent 2", title: "The Quality Judge grades the result",
    body: "Both models answer held-back prompts, prompts people wrote and prompts the judge writes itself. Code scores every reply on the rules; the judge picks the better reply blind, twice with the order swapped, and only a verdict both readings agree on counts. When neither reply does the goal, it says so, and the pair counts against the fine-tune. Then Muse Spark answers the same prompts itself, told the goal, and is judged against the fine-tune the same way." },
  { who: "Both agents", title: "If it isn’t good enough, they repair it",
    body: "Short of the bar (wins, rules passed, off-task messages declined), the Job Architect writes new chats aimed at what was marked down, the model retrains, and it’s judged again on new prompts. Up to four more rounds." },
];

export default function MetaPage({ run }) {
  const { data: runs } = useJson("/results/runs.json");
  return (
    <>
      <section id="overview" className="hero" aria-labelledby="hero-title">
        <div className="glow" aria-hidden="true" />
        <p className="eyebrow">Muse Spark fine-tune agents</p>
        <h1 id="hero-title">Plain English in.<br />A judged fine-tune out.</h1>
        <p className="lede">
          Two Muse Spark agents sit on either side of a fine-tune. One turns a goal into a training job, the other
          checks whether the model actually got better, and says so when it didn’t.
        </p>
        <p className="actions">
          <button className="button primary" type="button" onClick={openChat}>Talk to the models</button>
          <a className="button" href="#request">Request a fine-tune</a>
        </p>
        {runs?.length > 0 && <Board runs={runs} />}
      </section>

      <section id="how" className="band light" aria-labelledby="how-title">
        <h2 id="how-title">How a goal becomes a model</h2>
        <p className="center">Six steps, two agents, one GPU. Code checks every step it can, and the judge grades the rest blind.</p>
        <ol className="pipeline">
          {STEPS.map((s, i) => (
            <li key={i} className="tile">
              <span className="step-no" aria-hidden="true">{i + 1}</span>
              <p className="who">{s.who}</p>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <Request />

      <JudgeSummary run={run.data} />

      <section id="try" aria-labelledby="try-title">
        <h2 id="try-title">Run it yourself</h2>
        <p className="center">The agents are short Python files. With a Meta Model API key and an NVIDIA GPU, one goal runs end to end.</p>
        <div className="tile panel code">
          <pre tabIndex={0}><code>{`pip install -r requirements-train.txt
python agents/dispatcher.py --goal "answer support questions in two friendly sentences"`}</code></pre>
        </div>
      </section>

      <About />
    </>
  );
}

// A run's address: on the results site, ?run=<job> beside whatever else is in the address; from the agents site,
// the results site with that run.
function runLink(job) {
  const q = new URLSearchParams(location.search);
  q.set("run", job);
  if (location.hostname.startsWith("results.") || q.get("site") === "results") return `?${q}`;
  const base = siteHref("results", "");
  return base.includes("?") ? `${base}&run=${job}` : `${base}?run=${job}`;
}

// The runs the agents have published, each with its headline score: the honest comparison, against the same base
// model told the goal. Real numbers, on the first screen, as a row of pills.
export function Board({ runs, current, onPick }) {
  return (
    <ol className="board" aria-label="Published fine-tunes">
      {runs.map((r) => (
        <li key={r.job}>
          <a href={runLink(r.job)} data-job={r.job} aria-current={r.job === current ? "page" : undefined}
             onClick={onPick ? (e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); onPick(r.job); } } : undefined}>
            <span className="board-title">{r.title}</span>
            <span className="board-score">{r.wins}/{r.prompts}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

function JudgeSummary({ run: data }) {
  const j = data?.judge;
  if (!j) return null; // nothing to show until a judged run is published
  return (
    <section id="verdict" className="band light" aria-labelledby="judge-title">
      <h2 id="judge-title">The best verdict so far</h2>
      <div className="tile panel verdict">
        <p className="big-number">{(j.vs_prompted ?? j).tuned_wins}<span>/{j.prompts}</span></p>
        <p>
          {j.vs_prompted ? (
            <>{agentName(data.judge_model)} preferred the fine-tuned {data.base_title} over the same model told the goal
              on {j.vs_prompted.tuned_wins} of {j.prompts} unseen prompts, and over the untrained model on {j.tuned_wins}.{
              j.teacher ? ` Against Muse Spark itself, told the goal, the 0.6B fine-tune held its own on ${
                j.teacher.tuned_wins + j.teacher.ties} of ${j.teacher.prompts}.` : ""}</>
          ) : (
            <>{agentName(data.judge_model)} preferred the fine-tuned {data.base_title} over the untrained model on
              {" "}{j.tuned_wins} of {j.prompts} unseen prompts ({j.ties} ties).</>
          )}{" "}
          <a href={siteHref("results", "answers")}>Read every answer</a>
        </p>
      </div>
    </section>
  );
}
