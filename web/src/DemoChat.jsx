// The demo chat: pick one of the demo models (the untrained base model or a fine-tune the agents made) and talk
// to it. Each turn goes to the queue (worker.js) with the conversation so far, the dispatcher on our GPU answers
// as that model, and the reply joins the conversation. Each model's conversation is kept in this browser, so it's
// still there next visit; nobody else sees it.
import { useEffect, useRef, useState } from "react";
import { useJson } from "./lib/data.js";

const POLL_MS = 1500;
const GIVE_UP_MS = 3 * 60_000;
const KEY = "muse-demo-chat";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function save(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* no storage: the conversation lasts as long as the page */ }
}

export default function DemoChat() {
  const { data: models, error } = useJson("/api/models");
  const [picked, setPicked] = useState(null);
  const [all, setAll] = useState(load);  // model id -> [{role, content}]
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(null);  // {id, model, started, status, online} while a reply is coming
  const [problem, setProblem] = useState(null);
  const end = useRef(null);

  const model = models?.find((m) => m.id === picked) ?? models?.find((m) => !m.base) ?? models?.[0];
  const messages = (model && all[model.id]) ?? [];

  useEffect(() => save(all), [all]);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [messages.length, pending?.status]);

  // Follow the reply that's on its way, then add it to that model's conversation.
  useEffect(() => {
    if (!pending) return;
    let stop = false;
    (async () => {
      while (!stop) {
        try {
          const r = await fetch(`/api/talk/${pending.id}`);
          const d = await r.json();
          if (!r.ok) throw new Error(d.error ?? `the site answered ${r.status}`);
          if (d.status === "answered") {
            setAll((a) => ({ ...a, [pending.model]: [...(a[pending.model] ?? []), { role: "assistant", content: d.reply }] }));
            setPending(null);
            return;
          }
          if (d.status === "failed") throw new Error(d.error ?? "it couldn't answer");
          setPending((p) => p && { ...p, status: d.status, online: d.online });
          if (Date.now() - pending.started > GIVE_UP_MS) throw new Error("no answer yet; the GPU is busy. Try again in a few minutes.");
        } catch (err) {
          if (!stop) { setProblem(err.message); setPending(null); }
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    })();
    return () => { stop = true; };
  }, [pending?.id]);

  async function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || pending || !model) return;
    const conversation = [...messages, { role: "user", content: text }];
    setAll((a) => ({ ...a, [model.id]: conversation }));
    setDraft("");
    setProblem(null);
    try {
      const r = await fetch("/api/talk", { method: "POST", headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ model: model.id, messages: conversation }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `the site answered ${r.status}`);
      setPending({ id: d.id, model: model.id, started: Date.now(), status: "waiting" });
    } catch (err) {
      setProblem(err.message);
    }
  }

  function clear() {
    setAll((a) => ({ ...a, [model.id]: [] }));
    setProblem(null);
  }

  return (
    <section id="chat" aria-labelledby="chat-title">
      <h2 id="chat-title">Talk to the models</h2>
      <div className="tile panel demochat">
        {error && <p className="form-error">Couldn't load the models ({error}).</p>}
        {models && (
          <>
            <div className="model-picker" role="radiogroup" aria-label="Model">
              {models.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={m.id === model.id}
                        className={`model-chip${m.id === model.id ? " on" : ""}${m.base ? " base" : ""}`}
                        disabled={!!pending} onClick={() => { setPicked(m.id); setProblem(null); }}>
                  {m.title}
                  {m.score && <span className="small"> · {m.score}</span>}
                </button>
              ))}
            </div>
            <p className="small muted model-about">
              {model.base ? model.about
                : <>Fine-tuned from Qwen3 0.6B for: “{model.about}” The judge preferred it on {model.score} test prompts.</>}
            </p>
            <ol className="talk" aria-live="polite">
              {messages.length === 0 && !pending && (
                <li className="talk-empty muted small">
                  {model.base ? "Say something to see how the model answers before any fine-tuning."
                    : "Say anything. Then switch to the untrained model and ask the same thing."}
                </li>
              )}
              {messages.map((m, i) => (
                <li key={i} className={`bubble ${m.role}`}>
                  <span className="sr-only">{m.role === "user" ? "You: " : `${model.title}: `}</span>{m.content}
                </li>
              ))}
              {pending && pending.model === model.id && (
                <li className="bubble assistant waiting small muted" role="status">
                  <span className="typing" aria-hidden="true"><i /><i /><i /></span>{" "}
                  {pending.online === false ? "No GPU is online right now; it'll answer when the machine is back."
                    : pending.status === "answering" ? "Answering…" : "Waiting for the GPU (it may be training a request)…"}
                </li>
              )}
              <li ref={end} aria-hidden="true" />
            </ol>
            {problem && <p className="form-error small" role="alert">{problem}</p>}
            <form className="chat-form" onSubmit={send}>
              <label className="sr-only" htmlFor="demochat-input">Message {model.title}</label>
              <input id="demochat-input" value={draft} maxLength={1000} autoComplete="off"
                     placeholder={`Message ${model.title}…`} onChange={(e) => setDraft(e.target.value)} />
              <button className="button primary" type="submit" disabled={!!pending || !draft.trim()}>Send</button>
              {messages.length > 0 && (
                <button className="button" type="button" onClick={clear} disabled={!!pending}>Clear</button>
              )}
            </form>
          </>
        )}
      </div>
    </section>
  );
}
