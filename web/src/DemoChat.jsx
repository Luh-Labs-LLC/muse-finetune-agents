// The demo chat, in the corner of every page: a button that opens a chat panel, where you pick one of the demo
// models (the untrained base model or a fine-tune the agents made) and talk to it. Each turn goes to the queue
// (worker.js) with the conversation so far, the dispatcher on our GPU answers as that model, and the reply joins
// the conversation. Each model's conversation is kept in this browser, so it's still there next visit; nobody
// else sees it. The panel stays mounted while closed, so a reply on its way still arrives.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { useJson } from "./lib/data.js";

const POLL_MS = 1500;
const GIVE_UP_MS = 3 * 60_000;
const KEY = "muse-demo-chat";
const OPEN = "muse-open-chat";  // the event openChat() sends, for buttons elsewhere on the page

export function openChat() {
  window.dispatchEvent(new Event(OPEN));
}

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
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(true);  // false when a reply arrived while the panel was closed
  const { data: models, error } = useJson("/api/models");
  const [picked, setPicked] = useState(null);
  const [all, setAll] = useState(load);  // model id -> [{role, content}]
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(null);  // {id, model, started, status, online} while a reply is coming
  const [problem, setProblem] = useState(null);
  const end = useRef(null), input = useRef(null), launcher = useRef(null);
  const isOpen = useRef(open);  // for the reply poller, which outlives the render that started it
  isOpen.current = open;

  const model = models?.find((m) => m.id === picked) ?? models?.find((m) => !m.base) ?? models?.[0];
  const messages = (model && all[model.id]) ?? [];

  useEffect(() => save(all), [all]);
  useEffect(() => {
    const show = () => setOpen(true);
    const fromLink = () => { if (location.hash === "#chat") show(); };  // a link to …/#chat opens it
    fromLink();
    window.addEventListener(OPEN, show);
    window.addEventListener("hashchange", fromLink);
    return () => { window.removeEventListener(OPEN, show); window.removeEventListener("hashchange", fromLink); };
  }, []);
  useEffect(() => {
    if (!open) return;
    setSeen(true);
    const t = setTimeout(() => input.current?.focus(), 180);  // once the panel has grown in
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open]);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [messages.length, pending?.status, open, model?.id]);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

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
            if (!isOpen.current) setSeen(false);
            return;
          }
          if (d.status === "failed") throw new Error(d.error ?? "it couldn't answer");
          setPending((p) => p && { ...p, status: d.status, online: d.online });
          if (Date.now() - pending.started > GIVE_UP_MS) throw new Error("No answer yet; the GPU is busy. Try again in a few minutes.");
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

  return (
    <div className={`chatdock${open ? " open" : ""}`}>
      <div id="demochat" className="chatpanel" role="dialog" aria-label="Talk to the models" aria-hidden={!open}
           inert={open ? undefined : ""}>
        <header className="chatpanel-head">
          <div>
            <p className="chatpanel-title">Talk to the models</p>
            <p className="small muted">Fine-tuned by the Muse Spark agents, running on our GPU</p>
          </div>
          <div className="chatpanel-tools">
            {messages.length > 0 && (
              <button type="button" className="chatpanel-clear small" disabled={!!pending}
                      onClick={() => { setAll((a) => ({ ...a, [model.id]: [] })); setProblem(null); }}>Clear</button>
            )}
            <button type="button" className="chatpanel-close" aria-label="Close the chat" onClick={close}>
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>
        {error && <p className="form-error small chatpanel-pad">Couldn't load the models ({error}).</p>}
        {models && (
          <>
            <div className="model-picker" role="radiogroup" aria-label="Model">
              {models.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={m.id === model.id}
                        className={`model-chip${m.id === model.id ? " on" : ""}`}
                        disabled={!!pending} onClick={() => { setPicked(m.id); setProblem(null); }}>
                  {m.title}
                  {m.score && <span className="small"> · {m.score}</span>}
                </button>
              ))}
            </div>
            <ol className="talk" aria-live="polite">
              <li className="talk-about small muted">
                {model.base ? model.about
                  : <>Fine-tuned from Qwen3 0.6B for “{model.about}” The judge preferred it on {model.score} test prompts.</>}
              </li>
              {messages.length === 0 && !pending && (
                <li className="talk-empty muted small">
                  {model.base ? "Say something to see how it answers before any fine-tuning."
                    : "Say anything, then switch to the untrained model and ask the same thing."}
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
            {problem && <p className="form-error small chatpanel-pad" role="alert">{problem}</p>}
            <p className="chatpanel-note">Replies are AI-generated by small models and can be wrong. Don't share personal details; messages are kept for 7 days.</p>
            <form className="chatpanel-form" onSubmit={send}>
              <label className="sr-only" htmlFor="demochat-input">Message {model.title}</label>
              <input id="demochat-input" ref={input} value={draft} maxLength={1000} autoComplete="off"
                     placeholder={`Message ${model.title}…`} onChange={(e) => setDraft(e.target.value)} />
              <button className="chatpanel-send" type="submit" aria-label="Send" disabled={!!pending || !draft.trim()}>
                <Icon name="arrow" size={18} />
              </button>
            </form>
          </>
        )}
      </div>
      <button ref={launcher} type="button" className="chatlauncher" aria-expanded={open} aria-controls="demochat"
              aria-label={open ? "Close the chat" : "Talk to the models"} onClick={() => (open ? close() : setOpen(true))}>
        <span className="chatlauncher-icon chat"><Icon name="chat" size={24} /></span>
        <span className="chatlauncher-icon close"><Icon name="close" size={22} /></span>
        {!seen && <span className="chatlauncher-dot" aria-hidden="true" />}
      </button>
    </div>
  );
}
