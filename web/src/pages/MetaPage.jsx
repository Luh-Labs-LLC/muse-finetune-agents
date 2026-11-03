// agents.luhlabs.com: what the two Muse Spark agents do, the request form, and the latest verdict.
import { agentName } from "../lib/data.js";
import { siteHref } from "../site.js";
import About from "../About.jsx";
import DemoChat from "../DemoChat.jsx";
import Request from "../Request.jsx";

const STEPS = [
  { who: "You", title: "Describe the model you want",
    body: "One sentence in plain English, like “answer support questions in two friendly sentences”." },
  { who: "Muse Spark · Agent 1", title: "The Job Architect designs the job",
    body: "Writes the training conversations, picks the base model, LoRA rank and epochs, and writes test prompts it keeps out of training. If the goal needs facts a small fine-tune can’t learn, it says so up front." },
  { who: "Code", title: "Every value is checked before any GPU time is spent",
    body: "Only approved models and settings, enough examples. If a check fails, the errors go back to the model to fix." },
  { who: "One GPU", title: "A LoRA adapter trains on it",
    body: "A fifth of the chats is held back. The loss on them is measured before training and after every epoch, and the best epoch is kept." },
  { who: "Muse Spark · Agent 2", title: "The Quality Judge grades the result",
    body: "The base and fine-tuned models answer the held-back prompts. The judge picks the better reply without knowing which is which, twice with the order swapped, and only a verdict both readings agree on counts." },
  { who: "Muse Spark · Agents 1 and 2", title: "If it isn’t good enough, they repair it",
    body: "Below 80%, the Job Architect writes new chats aimed at what the judge marked down, the model retrains, and it’s judged again on new prompts. Up to two more rounds." },
];

export default function MetaPage({ run }) {
  return (
    <>
      <section id="overview" className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">Muse Spark agents</p>
        <h1 id="hero-title">Plain English in.<br />A judged fine-tune out.</h1>
        <p className="lede">
          Two Muse Spark agents sit on either side of a fine-tune. One turns a goal into a training job, the other
          checks whether the model actually got better.
        </p>
        <p className="actions">
          <a className="button primary" href="#chat">Talk to the models</a>
          <a className="button" href="#request">Request a fine-tune</a>
          <a className="button" href={siteHref("results")}>See the results</a>
          <a className="button" href="#how">How it works</a>
        </p>
      </section>

      <DemoChat />

      <section id="how" aria-labelledby="how-title">
        <h2 id="how-title">How a goal becomes a model</h2>
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
        <div className="tile panel">
          <p>The agents are short Python files in <code>agents/</code>. With a Meta Model API key and an NVIDIA GPU:</p>
          <pre tabIndex={0}><code>{`pip install -r requirements-train.txt
python agents/dispatcher.py --goal "answer support questions in two friendly sentences"`}</code></pre>
        </div>
      </section>

      <About />
    </>
  );
}

function JudgeSummary({ run: data }) {
  const j = data?.judge;
  if (!j) return null; // nothing to show until a judged run is published
  return (
    <section id="verdict" aria-labelledby="judge-title">
      <h2 id="judge-title">Latest verdict</h2>
      <div className="tile panel verdict">
        <p className="big-number">{j.tuned_wins}<span>/{j.prompts}</span></p>
        <p>
          {agentName(data.judge_model)} preferred the fine-tuned {data.base_title} on {j.tuned_wins} of {j.prompts} unseen
          prompts ({j.ties} ties, {j.base_wins} for the base model). <a href={siteHref("results", "answers")}>Read every answer</a>
        </p>
      </div>
    </section>
  );
}
