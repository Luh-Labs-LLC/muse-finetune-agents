// The demo chat, in the corner of every page: a button that opens a chat panel, where you pick one of the demo
// models (the untrained base model or a fine-tune the agents made) from a menu at the top and talk to it. Each turn
// goes to the queue (worker.js) with the conversation so far, the dispatcher on our GPU answers as that model, and
// the reply joins the conversation. Each model's conversation is kept in this browser, so it's still there next
// visit; nobody else sees it. The panel stays mounted while closed, so a reply on its way still arrives.
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { Busy } from "./Chat.jsx";
import Dictate from "./Dictate.jsx";
import { toast } from "./Toast.jsx";
import { idempotencyKey, useJson } from "./lib/data.js";
import { useBackClose, useSwipeDismiss } from "./lib/sheet.js";

const POLL_MS = 1500;
const GIVE_UP_MS = 3 * 60_000;
export const KEY = "muse-demo-chat";
const OPEN = "muse-open-chat";  // the event openChat() sends, for buttons elsewhere on the page
const BASE = "qwen3-0.6b";
const MAX_TURN = 6000;  // characters of one message: the queue (worker.js) keeps no more

// Things to try first, per model: chosen to show off what the fine-tune learned.
export const STARTERS = {
  [BASE]: ["Tell me a joke", "What's the capital of France?", "How do I stay focused?"],
  "ticket-json": ["I was charged twice this month and nobody has answered my emails!!",
                  "Hi, how do I change the email on my account? No rush.",
                  "The app crashes every time I open the camera. Please fix, it's for work.",
                  "Write me a poem about the ocean"],
  excel: ["Sum column C where column A says \"North\"", "Look up the price for the product in A2 on the Prices sheet",
          "Count the rows where the due date in B is before today", "what's the weather in san diego?"],
  "twain-plato": ["Is it better to be rich or wise?", "What is justice?", "Should I learn the piano?"],
};
export const FALLBACK = ["Hello! Who are you?", "Tell me a joke", "What's the capital of France?"];

export function openChat() {
  window.dispatchEvent(new Event(OPEN));
}

export function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function save(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* no storage: the conversation lasts as long as the page */ }
}

// A model's round badge: its first letter on its own colour.
export function Avatar({ model, size = 28 }) {
  return (
    <span className={`mav m-${model.id}`} style={{ width: size, height: size, fontSize: size * 0.46 }} aria-hidden="true">
      {model.title[0]}
    </span>
  );
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
  const end = useRef(null), input = useRef(null), launcher = useRef(null), panel = useRef(null);
  const once = useRef(idempotencyKey());  // one turn, however many times Send is hit before the site answers
  const isOpen = useRef(open);  // for the reply poller, which outlives the render that started it
  isOpen.current = open;

  const model = models?.find((m) => m.id === picked) ?? models?.find((m) => !m.base) ?? models?.[0];
  const messages = (model && all[model.id]) ?? [];
  const base = models?.find((m) => m.base);

  // Effect bodies in braces: an effect may only return a cleanup function, and newer browsers make scrollIntoView
  // return a promise, which React then tries to call.
  useEffect(() => { save(all); }, [all]);
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
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); },
            [messages.length, pending?.status, open, model?.id]);
  useEffect(() => {  // the box grows with what's typed, up to five lines
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [draft]);

  const close = useCallback(() => {
    setOpen(false);
    launcher.current?.focus();
  }, []);
  // The back gesture closes the panel instead of leaving the site; on a phone, so does dragging its header down.
  useBackClose(open, close, "chat");
  useSwipeDismiss(panel, { axis: "y", direction: 1, onDismiss: close, enabled: open, handle: ".chatpanel-head" });

  // Clearing a conversation asks nothing first: it clears, and Undo brings it back for a few seconds.
  function clear() {
    const was = all[model.id] ?? [];
    setAll((a) => ({ ...a, [model.id]: [] }));
    setProblem(null);
    toast({ text: `Chat with ${model.title} cleared`, undo: () => setAll((a) => ({ ...a, [model.id]: was })) });
  }

  function pick(id) {
    setPicked(id);
    setProblem(null);
    setTimeout(() => input.current?.focus(), 0);
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

  async function send(text, to = model) {
    text = text.trim();
    if (!text || pending || !to) return;
    const conversation = [...(all[to.id] ?? []), { role: "user", content: text }];
    setAll((a) => ({ ...a, [to.id]: conversation }));
    if (to === model) setDraft("");
    setProblem(null);
    try {
      const r = await fetch("/api/talk", { method: "POST",
                                          headers: { "Content-Type": "application/json", "Idempotency-Key": once.current },
                                          body: JSON.stringify({ model: to.id, messages: conversation }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `the site answered ${r.status}`);
      once.current = idempotencyKey();
      setPending({ id: d.id, model: to.id, started: Date.now(), status: "waiting" });
    } catch (err) {
      setProblem(err.message);
    }
  }

  // The same question, to the untrained model: the quickest way to see what fine-tuning changed.
  const lastAsked = [...messages].reverse().find((m) => m.role === "user")?.content;
  const canCompare = model && !model.base && base && lastAsked && messages.at(-1)?.role === "assistant" && !pending;
  function compare() {
    pick(base.id);
    send(lastAsked, base);
  }

  return (
    <div className={`chatdock${open ? " open" : ""}`}
         onKeyDown={(e) => { if (e.key === "Escape" && open && !e.defaultPrevented) close(); }}>
      <div id="demochat" ref={panel} className="chatpanel" role="dialog" aria-label="Talk to the models" aria-hidden={!open}
           inert={open ? undefined : ""}>
        <header className="chatpanel-head">
          {models ? <ModelMenu models={models} model={model} onPick={pick} pending={pending} />
                  : <p className="chatpanel-title">Talk to the models</p>}
          <div className="chatpanel-tools">
            {messages.length > 0 && (
              <button type="button" className="chatpanel-icon" disabled={!!pending} title="New chat"
                      aria-label="New chat" onClick={clear}>
                <Icon name="compose" size={18} />
              </button>
            )}
            <button type="button" className="chatpanel-icon" aria-label="Close the chat" title="Close (Esc)" aria-keyshortcuts="Escape" onClick={close}>
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>
        {error && <p className="form-error small chatpanel-pad">Couldn't load the models ({error}).</p>}
        {models && (
          <>
            <ol className="talk" aria-live="polite" key={model.id}>
              {messages.length === 0 && !pending ? (
                <li className="talk-hello">
                  <Avatar model={model} size={52} />
                  <p className="talk-hello-name">{model.title}</p>
                  <p className="small muted">
                    {model.base ? model.about
                      : <>Fine-tuned from Qwen3 0.6B to “{model.about}” The judge preferred it over the same model
                        just told to do that on {model.score} unseen prompts.{model.note && <> {model.note}</>}</>}
                  </p>
                  <div className="starters">
                    {(STARTERS[model.id] ?? FALLBACK).map((s, i) => (
                      <button key={s} type="button" style={{ "--i": i }} disabled={!!pending} onClick={() => send(s)}>{s}</button>
                    ))}
                  </div>
                </li>
              ) : messages.map((m, i) => (
                <li key={i} className={`msg ${m.role}`}>
                  {m.role === "assistant" && <Avatar model={model} size={26} />}
                  <div className="bubble">
                    <span className="sr-only">{m.role === "user" ? "You: " : `${model.title}: `}</span>{m.content}
                  </div>
                </li>
              ))}
              {pending && pending.model === model.id && (
                <li className="msg assistant" role="status">
                  <Avatar model={model} size={26} />
                  <div className="bubble waiting">
                    <span className="typing" aria-hidden="true"><i /><i /><i /></span>
                    <span className="small muted">
                      {pending.online === false ? "No GPU is online right now; it'll answer when the machine is back."
                        : pending.status === "answering" ? "Thinking…" : "Waiting for the GPU…"}
                    </span>
                  </div>
                </li>
              )}
              {canCompare && (
                <li className="talk-compare">
                  <button type="button" onClick={compare}>
                    <Icon name="swap" size={15} /> Ask the untrained model the same thing
                  </button>
                </li>
              )}
              <li ref={end} aria-hidden="true" />
            </ol>
            {open && <Busy className="chatpanel-pad" />}
            {problem && <p className="form-error small chatpanel-pad" role="alert">{problem}</p>}
            {draft.length > MAX_TURN * 0.9 && (
              <p className={`small chatpanel-pad ${draft.length >= MAX_TURN ? "form-error" : "muted"}`} aria-live="polite">
                {draft.length >= MAX_TURN ? `That's the limit: ${MAX_TURN} characters, so the end of a long paste is cut off.`
                  : `${MAX_TURN - draft.length} characters left`}
              </p>
            )}
            <form className="composer" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
              <label className="sr-only" htmlFor="demochat-input">Message {model.title}</label>
              <textarea id="demochat-input" ref={input} rows={1} value={draft} maxLength={MAX_TURN} autoComplete="off"
                        placeholder={`Message ${model.title}`} onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft); }
                        }} />
              <Dictate label="Speak" disabled={!!pending}
                       onText={(t) => { setDraft((d) => (d ? `${d} ${t}` : t).slice(0, MAX_TURN)); input.current?.focus(); }} />
              <button className="composer-send" type="submit" aria-label="Send" disabled={!!pending || !draft.trim()}>
                <Icon name="up" size={18} />
              </button>
            </form>
            <p className="chatpanel-note">
              <span className="key-hints" aria-hidden="true"><kbd>↵</kbd> send · <kbd>⇧↵</kbd> new line · <kbd>esc</kbd> close</span>
              Small models, AI-generated replies: they can be wrong. Don't share personal details; messages are kept for 7 days.
            </p>
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

// The model picker: the current model's name as a button, and a menu of every model under it, fine-tunes first,
// each with what it does and its score. Arrow keys move, Enter picks, Escape closes it (and only it).
export function ModelMenu({ models, model, onPick, pending }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const button = useRef(null), menu = useRef(null);
  // the models you trained first, then the agents' fine-tunes, then the base model as it comes
  const order = [...models.filter((m) => m.trained), ...models.filter((m) => !m.base && !m.trained), ...models.filter((m) => m.base)];
  const group = (m) => (m.trained ? "Trained by you" : m.base ? "Base model" : "Fine-tuned by the agents");

  useEffect(() => {
    if (!open) return;
    setAt(Math.max(0, order.findIndex((m) => m.id === model.id)));
    const away = (e) => { if (!menu.current?.contains(e.target) && !button.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => { if (open) menu.current?.querySelectorAll("[role=option]")[at]?.focus(); }, [open, at]);

  function choose(m) {
    setOpen(false);
    onPick(m.id);
  }

  function keys(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => (i + 1) % order.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => (i - 1 + order.length) % order.length); }
    else if (e.key === "Home") { e.preventDefault(); setAt(0); }
    else if (e.key === "End") { e.preventDefault(); setAt(order.length - 1); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); button.current?.focus(); }
    else if (e.key === "Tab") setOpen(false);
  }

  return (
    <div className="mpick">
      <button ref={button} type="button" className="mpick-button" aria-haspopup="listbox" aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}>
        <Avatar model={model} size={30} />
        <span className="mpick-label">
          <span className="mpick-name">{model.title}</span>
          <span className="mpick-sub">{model.base ? "Base model · no fine-tuning" : model.trained ? `Trained by you${model.score ? ` · won ${model.score}` : ""}` : `Fine-tune · won ${model.score}`}</span>
        </span>
        <Icon name="down" size={16} />
      </button>
      <div ref={menu} className={`mpick-menu${open ? " open" : ""}`} role="listbox" aria-label="Choose a model"
           onKeyDown={keys} inert={open ? undefined : ""} aria-hidden={!open}>
        {order.map((m, i) => (
          <div key={m.id}>
            {(i === 0 || group(m) !== group(order[i - 1])) && (
              <p className="mpick-group" aria-hidden="true">{group(m)}</p>
            )}
            <button type="button" role="option" aria-selected={m.id === model.id} tabIndex={i === at ? 0 : -1}
                    className="mpick-option" onClick={() => choose(m)} onMouseEnter={() => setAt(i)}>
              <Avatar model={m} size={34} />
              <span className="mpick-label">
                <span className="mpick-name">
                  {m.title}
                  {m.score && <span className="mpick-score">{m.score}</span>}
                  {pending?.model === m.id && <span className="typing" aria-label="replying"><i /><i /><i /></span>}
                </span>
                <span className="mpick-about">{m.about}</span>
              </span>
              <span className="mpick-check">{m.id === model.id && <Icon name="check" size={18} />}</span>
            </button>
          </div>
        ))}
        <p className="mpick-foot">Scores: how often the judge preferred the fine-tune over the base model told the same goal, on 20 unseen prompts.</p>
      </div>
    </div>
  );
}
