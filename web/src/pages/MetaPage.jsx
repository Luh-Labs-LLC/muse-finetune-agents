// agents.luhlabs.com: what the two Muse Spark agents do, the runs they've published, the request form, and the story.
import { agentName, useJson } from "../lib/data.js";
import { siteHref } from "../site.js";
import About from "../About.jsx";
import { openChat } from "../DemoChat.jsx";
import Request from "../Request.jsx";
import { Icon } from "../icons.jsx";
import { openCommandMenu } from "../CommandMenu.jsx";

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
    body: "Both models answer held-back prompts, prompts people wrote and prompts the judge writes itself. Code scores every reply on the rules; the judge picks the better reply blind, twice with the order swapped, and only a verdict both readings agree on counts. When neither reply does the goal, it says so. Then Muse Spark answers the same prompts itself, told the goal, and is judged against the fine-tune the same way." },
  { who: "Both agents", title: "If it isn’t good enough, they repair it",
    body: "Short of the bar (wins, rules passed, off-task messages declined), the Job Architect writes new chats aimed at what was marked down, the model retrains, and it’s judged again on new prompts. Up to four more rounds." },
];

// The row at the top of a page: what it is, and what you can do from here
export function Topbar({ eyebrow, title, sub, children }) {
  return (
    <header className="topbar">
      <div className="topbar-text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {sub && <p className="lede">{sub}</p>}
      </div>
      <div className="topbar-actions">
        <button type="button" className="round-button" onClick={openCommandMenu} aria-label="Search sections, runs and actions"
                aria-keyshortcuts="Meta+K Control+K"><Icon name="search" size={18} /></button>
        {children}
        <button type="button" className="button primary" onClick={openChat}><Icon name="chat" size={16} /> Talk to the models</button>
      </div>
    </header>
  );
}

export default function MetaPage({ run }) {
  const { data: runs } = useJson("/results/runs.json");
  const { data: status } = useJson("/api/status", 30_000);
  return (
    <>
      <section id="overview" aria-labelledby="hero-title">
        <Topbar eyebrow="Muse Spark fine-tune agents"
                title={<span id="hero-title">Plain English in. A judged fine-tune out.</span>}
                sub="Two Muse Spark agents sit on either side of a fine-tune. One turns a goal into a training job, the other checks whether the model actually got better, and says so when it didn’t.">
          <a className="button" href="#request">Request a fine-tune</a>
        </Topbar>
        <ol className="start" aria-label="Start here">
          <li className="tile">
            <button type="button" onClick={openChat}>
              <span className="start-icon"><Icon name="chat" size={20} /></span>
              <h3>Talk to a fine-tune</h3>
              <p>Chat with the models the agents made, and with the untrained one, to feel the difference yourself.</p>
              <span className="start-go">Open the chat</span>
            </button>
          </li>
          <li className="tile">
            <a href={siteHref("results")}>
              <span className="start-icon green"><Icon name="chart" size={20} /></span>
              <h3>See how one was judged</h3>
              <p>Every score, every reply and the judge’s reason, for a run that reached its bar and one that didn’t.</p>
              <span className="start-go">Open the results</span>
            </a>
          </li>
          <li className="tile">
            <a href="#request">
              <span className="start-icon amber"><Icon name="spark" size={20} /></span>
              <h3>Train your own</h3>
              <p>Describe a model in one sentence. The agents design, train, judge and repair it on our GPU.</p>
              <span className="start-go">Request a fine-tune</span>
            </a>
          </li>
        </ol>
        <div className="dash">
          <div className="tile panel">
            <h3 className="panel-title">Fine-tunes the agents have made</h3>
            <p className="small muted">Each one trained from a sentence, judged blind against the same model told the goal.</p>
            {runs?.length > 0 && <Board runs={runs} />}
          </div>
          <div className="tile panel live-tile">
            <h3 className="panel-title"><span className={`dot ${status?.online ? "ok" : status?.online === false ? "bad" : ""}`} aria-hidden="true" /> The GPU</h3>
            <p className="big-number">{status ? (status.running ?? 0) + (status.queued ?? 0) : "–"}<span> in the queue</span></p>
            <p className="small muted">
              {!status ? "Checking whether a machine is online…"
                : status.online === false ? "Offline right now: the machine that trains isn't checking in. A request is saved and starts when it's back."
                : !(status.running + status.queued) ? "A GPU is online and free: a request starts right away."
                : `${status.running} running, ${status.queued} waiting. Most take 10 to 40 minutes.`}
            </p>
            <p className="small muted">One RTX 4060 trains the requests and answers the chats, in turn.</p>
          </div>
        </div>
      </section>

      <section id="how" aria-labelledby="how-title">
        <h2 id="how-title">How a goal becomes a model</h2>
        <p className="muted">Six steps, two agents, one GPU. Code checks every step it can, and the judge grades the rest blind.</p>
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
        <p className="muted">The agents are short Python files. With a Meta Model API key and an NVIDIA GPU, one goal runs end to end.</p>
        <div className="tile panel">
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
// model told the goal. On the results page they're the tabs that swap the run in place.
export function Board({ runs, current, onPick, tabs = false }) {
  return (
    <ol className={tabs ? "tabs" : "board"} aria-label="Published fine-tunes">
      {runs.map((r) => (
        <li key={r.job}>
          <a href={runLink(r.job)} data-job={r.job} aria-current={r.job === current ? "page" : undefined}
             onClick={onPick ? (e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); onPick(r.job); } } : undefined}>
            <span className="board-title">{r.title}</span>
            <span className="board-score">{r.wins}/{r.prompts}</span>
            {!tabs && <span className="board-sub">preferred over the model {r.against}, on {r.prompts} unseen prompts · {r.date}</span>}
            {!tabs && <span className="board-go" aria-hidden="true"><Icon name="chevron" size={18} /></span>}
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
    <section id="verdict" aria-labelledby="judge-title">
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
