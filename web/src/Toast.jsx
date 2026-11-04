// Short notices at the bottom of the screen, each with a way back: instead of asking "are you sure?" before clearing
// something, the site clears it and offers Undo for a few seconds. toast({text, undo}) from anywhere; <Toasts /> once.
import { useEffect, useState } from "react";

const EVENT = "muse-toast";
const SHOW_MS = 6000;

export function toast({ text, undo = null, undoLabel = "Undo" }) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: Date.now() + Math.random(), text, undo, undoLabel } }));
}

export default function Toasts() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const add = (e) => setList((l) => [...l.slice(-2), { ...e.detail, at: Date.now() }]);
    window.addEventListener(EVENT, add);
    return () => window.removeEventListener(EVENT, add);
  }, []);
  const drop = (id) => setList((l) => l.filter((t) => t.id !== id));
  if (!list.length) return null;
  return (
    <div className="toasts" role="region" aria-label="Notices">
      {list.map((t) => <Toast key={t.id} toast={t} onDone={() => drop(t.id)} />)}
    </div>
  );
}

function Toast({ toast: t, onDone }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {  // the clock stops while the pointer or focus is on it, so Undo can't slip away mid-reach
    if (paused) return;
    const timer = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(timer);
  }, [paused, onDone]);
  return (
    <div className="toast tile" role="status" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
         onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <span className="toast-text">{t.text}</span>
      {t.undo && (
        <button type="button" className="toast-undo" onClick={() => { t.undo(); onDone(); }}>
          {t.undoLabel}
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={onDone}>×</button>
      {!paused && <span className="toast-clock" aria-hidden="true" style={{ animationDuration: `${SHOW_MS}ms` }} />}
    </div>
  );
}
