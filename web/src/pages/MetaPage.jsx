// agents.luhlabs.com: a chat you can teach. The chat fills the first screen; how teaching works, how to run it
// yourself and the story follow below. With ?request=<id> in the address, the page follows that request instead.
import { useJson } from "../lib/data.js";
import { siteHref } from "../site.js";
import About from "../About.jsx";
import ChatPage from "../ChatPage.jsx";
import Request, { requestId } from "../Request.jsx";
import { Icon } from "../icons.jsx";
import { openCommandMenu } from "../CommandMenu.jsx";

const STEPS = [
  { who: "You", title: "Say what it should do",
    body: "One sentence in plain English, like “turn a spreadsheet request into a single Excel formula”." },
  { who: "Muse Spark, agent 1", title: "The Job Architect designs the job",
    body: "Writes the training conversations, picks the base model, LoRA rank and epochs, and writes test prompts it keeps out of training. If the goal needs facts a small fine-tune can’t learn, it says so up front." },
  { who: "Code, then agent 2", title: "The data is checked before any GPU time is spent",
    body: "The Architect picks the goal’s rules from a fixed library (two sentences, one line, valid JSON, no bullets) and every chat must pass them. Then the judge reads a blind sample of the chats; what fails goes back to be rewritten." },
  { who: "One GPU", title: "A LoRA adapter trains on it",
    body: "A fifth of the chats is held back. The loss on them is measured before training and after every epoch, and the best epoch is kept." },
  { who: "Muse Spark, agent 2", title: "The Quality Judge grades the result",
    body: "Both models answer held-back prompts, prompts people wrote and prompts the judge writes itself. Code scores every reply on the rules; the judge picks the better reply blind, twice with the order swapped, and only a verdict both readings agree on counts. When neither reply does the goal, it says so. Then Muse Spark answers the same prompts itself, told the goal, and is judged against the fine-tune the same way." },
  { who: "Both agents", title: "If it isn’t good enough, they repair it",
    body: "Short of the bar (wins, rules passed, off-task messages declined), the Job Architect writes new chats aimed at what was marked down, the model retrains, and it’s judged again on new prompts. Up to four more rounds. Then the chat switches to the new model." },
];

// The row at the top of a page: what it is, and what you can do from here (the results page uses it)
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
      </div>
    </header>
  );
}

export default function MetaPage() {
  const following = requestId();
  return (
    <>
      <section id="chat" className="lead" aria-label="Chat">
        {following ? <Request /> : <ChatPage />}
      </section>

      <section id="how" aria-labelledby="how-title">
        <h2 id="how-title">How teaching it works</h2>
        <p className="muted">Six steps, two Muse Spark agents, one GPU. Code checks every step it can, and a blind judge grades the rest. The results site shows every score and every reply.</p>
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
        <p className="actions"><a className="button" href={siteHref("results")}><Icon name="chart" size={16} /> See a judged run in detail</a></p>
      </section>

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

// The runs as tabs on the results page: each with its headline score, the current one underlined.
export function Board({ runs, current, onPick }) {
  return (
    <ol className="tabs" aria-label="Published fine-tunes">
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

// kept for anything that still imports it
export { useJson };
