// The chat is the page. Pick a model at the top (the untrained base model, a fine-tune the agents made, or one you
// trained), talk to it, and when it isn't good enough at something, teach it: one sentence becomes a training job,
// a card in the chat follows the run, and when it's done the chat switches to the new model.
//
// Conversations are kept per model in this browser (the same store the corner chat on the results page uses).
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { Busy } from "./Chat.jsx";
import Dictate from "./Dictate.jsx";
import Sheet from "./Sheet.jsx";
import { toast } from "./Toast.jsx";
import { Avatar, FALLBACK, ModelMenu, STARTERS, load, save } from "./DemoChat.jsx";
import { Form, mine, resultsHref } from "./Request.jsx";
import { idempotencyKey, useJson } from "./lib/data.js";

const POLL_MS = 1500;
const GIVE_UP_MS = 3 * 60_000;
const MAX_TURN = 6000;
const STEPS = { queued: "Waiting for the GPU", planning: "The Job Architect is writing the training chats", training: "Training",
                judging: "The Quality Judge is grading it", done: "Done", failed: "It failed" };

// A request this browser made, as a model the chat can talk to once it's done
function asModel(id, data) {
  const goal = data.goal ?? "";
  const title = goal.length > 44 ? `${goal.slice(0, 42).trimEnd()}…` : goal || "Your model";
  const j = data.run?.judge, h = j ? (j.vs_prompted ?? j) : null;
  return { id: `req:${id}`, title, job: data.run?.job ?? data.job_id ?? null, mineId: id, status: data.status,
           about: goal, score: h ? `${h.tuned_wins} of ${j.prompts}` : null, base: false, trained: true };
}

export default function ChatPage() {
  const { data: demo, error } = useJson("/api/models");
  const [own, setOwn] = useState([]);  // models this browser trained, done ones first
  const [picked, setPicked] = useState(null);
  const [all, setAll] = useState(load);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(null);
  const [problem, setProblem] = useState(null);
  const [teaching, setTeaching] = useState(false);
  const [training, setTraining] = useState(null);  // {id} the request being followed in the chat
  const input = useRef(null), end = useRef(null);
  const once = useRef(idempotencyKey());

  const models = [...(demo ?? []), ...own.filter((m) => m.status === "done")];
  // a first visit starts with the untrained model, so the first thing to do is ask it something and teach it
  const model = models.find((m) => m.id === picked) ?? demo?.find((m) => m.base) ?? demo?.[0];
  const messages = (model && all[model.id]) ?? [];

  // the requests this browser made: fetch each one's state so finished ones become models
  useEffect(() => {
    let live = true;
    (async () => {
      const found = [];
      for (const r of mine().slice(0, 12)) {
        try {
          const res = await fetch(`/api/requests/${r.id}`);
          if (res.ok) found.push(asModel(r.id, await res.json()));
        } catch { /* skip it */ }
      }
      if (live) setOwn(found);
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => { save(all); }, [all]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [messages.length, pending?.status, model?.id]);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

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

  // Follow a request this chat started: when it's done, the new model joins the picker and the chat switches to it.
  useEffect(() => {
    if (!training) return;
    let stop = false;
    (async () => {
      while (!stop) {
        try {
          const r = await fetch(`/api/requests/${training.id}`);
          const d = await r.json();
          if (!r.ok) throw new Error(d.error ?? `the site answered ${r.status}`);
          setTraining((t) => t && { ...t, status: d.status, ahead: d.ahead, online: d.online, last: d.log?.filter((l) => l.detail?.kind !== "verdict").at(-1)?.message });
          if (d.status === "done" || d.status === "failed") {
            const m = asModel(training.id, d);
            setOwn((o) => [m, ...o.filter((x) => x.id !== m.id)]);
            if (d.status === "done") {
              setPicked(m.id);
              toast({ text: `Your model is ready: ${m.title}. The chat is talking to it now.` });
            }
            return;
          }
        } catch (err) {
          setTraining((t) => t && { ...t, error: err.message });
          return;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    })();
    return () => { stop = true; };
  }, [training?.id]);

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

  const pick = useCallback((id) => { setPicked(id); setProblem(null); setTimeout(() => input.current?.focus(), 0); }, []);
  function clear() {
    if (!model) return;
    const was = all[model.id] ?? [];
    setAll((a) => ({ ...a, [model.id]: [] }));
    toast({ text: `Chat with ${model.title} cleared`, undo: () => setAll((a) => ({ ...a, [model.id]: was })) });
  }
  const lastAsked = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const empty = messages.length === 0 && !pending && !training;

  return (
    <div className={`chatpage${empty ? " empty" : ""}`}>
      <div className="chatpage-top">
        {demo ? <ModelMenu models={models} model={model} onPick={pick} pending={pending} /> : <span className="muted small">Loading the models…</span>}
        <div className="chatpage-tools">
          {messages.length > 0 && (
            <button type="button" className="button" disabled={!!pending} onClick={clear}><Icon name="compose" size={16} /> New chat</button>
          )}
          <button type="button" className="button primary" onClick={() => setTeaching(true)}><Icon name="spark" size={16} /> Teach it something</button>
        </div>
      </div>

      {error && <p className="form-error small" role="alert">Couldn't load the models ({error}).</p>}

      {empty && model && (
        <div className="chatpage-hello">
          <Avatar model={model} size={56} />
          <h1>{model.base ? "Where should we begin?" : model.trained ? "Your model is ready." : `${model.title}.`}</h1>
          <p className="muted">
            {model.base ? "This is the untrained 0.6B model, as it comes. Ask it anything, then teach it the thing it got wrong."
              : model.trained ? `Trained from “${model.about}”.${model.score ? ` The judge preferred it over the same model told the goal on ${model.score} unseen prompts.` : ""}`
              : <>Fine-tuned from Qwen3 0.6B to “{model.about}” The judge preferred it over the same model just told to do that on {model.score} unseen prompts.{model.note && <> {model.note}</>}</>}
          </p>
        </div>
      )}

      {!empty && (
        <ol className="talk talk-page" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={`msg ${m.role}`}>
              {m.role === "assistant" && <Avatar model={model} size={26} />}
              <div className="bubble"><span className="sr-only">{m.role === "user" ? "You: " : `${model.title}: `}</span>{m.content}</div>
            </li>
          ))}
          {pending && pending.model === model?.id && (
            <li className="msg assistant" role="status">
              <Avatar model={model} size={26} />
              <div className="bubble waiting">
                <span className="typing" aria-hidden="true"><i /><i /><i /></span>
                <span className="small muted">{pending.online === false ? "No GPU is online right now; it'll answer when the machine is back."
                  : pending.status === "answering" ? "Thinking…" : "Waiting for the GPU…"}</span>
              </div>
            </li>
          )}
          {training && <li><TrainingCard t={training} onDismiss={() => setTraining(null)} /></li>}
          <li ref={end} aria-hidden="true" />
        </ol>
      )}

      <div className="chatpage-composer">
        <Busy />
        {problem && <p className="form-error small" role="alert">{problem}</p>}
        <form className="composer big" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <label className="sr-only" htmlFor="chatpage-input">Message {model?.title ?? "the model"}</label>
          <textarea id="chatpage-input" ref={input} rows={1} value={draft} maxLength={MAX_TURN} autoComplete="off"
                    placeholder="Ask anything…" onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft); } }} />
          <Dictate label="Speak" disabled={!!pending} onText={(t) => { setDraft((d) => (d ? `${d} ${t}` : t).slice(0, MAX_TURN)); input.current?.focus(); }} />
          <button className="composer-send" type="submit" aria-label="Send" disabled={!!pending || !draft.trim() || !model}><Icon name="up" size={18} /></button>
        </form>
        {empty && model && (
          <div className="chatpage-starters">
            {(STARTERS[model.id] ?? FALLBACK).map((s) => (
              <button key={s} type="button" className="chip" disabled={!!pending} onClick={() => send(s)}>{s}</button>
            ))}
            <button type="button" className="chip chip-teach" onClick={() => setTeaching(true)}>Teach it something new</button>
          </div>
        )}
        <p className="chatpage-note small muted">Small models, AI-generated replies: they can be wrong. Don't share personal details; messages are kept for 7 days.</p>
      </div>

      <Sheet open={teaching} onClose={() => setTeaching(false)} title="Teach it something">
        <Form initialGoal={lastAsked && lastAsked.length <= 200 ? "" : ""} onQueued={(id) => {
          setTeaching(false);
          setTraining({ id, status: "queued" });
        }} />
      </Sheet>
    </div>
  );
}

// The request this chat started, as a card that follows it until the model is ready
function TrainingCard({ t, onDismiss }) {
  const order = ["queued", "planning", "training", "judging", "done"];
  const at = order.indexOf(t.status);
  return (
    <div className="tile panel training-card" role="status" aria-live="polite">
      <div className="training-head">
        <h3>{t.status === "done" ? "Your model is ready" : t.status === "failed" ? "The training failed" : "Training your model"}</h3>
        <a className="small" href={`?request=${t.id}`}>Watch in detail</a>
      </div>
      <ol className="request-steps">
        {order.map((s, i) => (
          <li key={s} className={i < at || t.status === "done" ? "past" : i === at ? "now" : ""} aria-current={i === at ? "step" : undefined}>
            {STEPS[s]}{s === "queued" && i === at && t.ahead > 0 && ` (${t.ahead} ahead)`}
          </li>
        ))}
      </ol>
      {t.status === "queued" && t.online === false && <p className="small muted">The GPU is offline right now; it starts as soon as the machine is back.</p>}
      {t.last && t.status !== "done" && <p className="small muted">{t.last}</p>}
      {t.error && <p className="form-error small">{t.error}</p>}
      {t.status === "done" && (
        <p className="actions">
          <a className="button" href={resultsHref(t.id)}>See how it was judged</a>
          <button type="button" className="button" onClick={onDismiss}>Done</button>
        </p>
      )}
      {t.status === "failed" && <p className="actions"><button type="button" className="button" onClick={onDismiss}>Dismiss</button></p>}
    </div>
  );
}
