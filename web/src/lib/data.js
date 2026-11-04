// Where the pages' numbers come from, and how they're written: JSON from public/results/ (agents/publish.py) and from
// the request queue's /api/ (worker.js).
import { useEffect, useState } from "react";

// Fetch JSON once, or every `everyMs` if given. Keeps the last good answer when a refresh fails. A null url waits.
export function useJson(url, everyMs) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    if (!url) return;
    let live = true;
    const ctrl = new AbortController();
    async function load() {
      try {
        const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
        if (!r.ok) throw new Error(r.status === 404 ? "not published yet" : `HTTP ${r.status}`);
        const data = await r.json();
        if (live) setState({ data, error: null, loading: false });
      } catch (e) {
        if (live && e.name !== "AbortError") setState((s) => ({ ...s, error: e.message, loading: false }));
      }
    }
    load();
    const timer = everyMs ? setInterval(load, everyMs) : null;
    return () => { live = false; ctrl.abort(); clearInterval(timer); };
  }, [url, everyMs]);
  return state;
}

export const num = (n, digits = 0) => n.toLocaleString(undefined, { maximumFractionDigits: digits });
// Who an agent was: Muse Spark, unless the run says another model stood in (a test run without Meta credits).
export const agentName = (model) => (!model || /^muse[-_ ]?spark/i.test(model) ? "Muse Spark" : model);
export const pct = (x) => `${(x * 100).toFixed(1)}%`;

// A judge's score with its 95% range: "19 of 20 (76–99%)". With 20 test prompts a score is an estimate, not a fact.
export function range(interval) {
  return interval ? `${Math.round(interval[0] * 100)}–${Math.round(interval[1] * 100)}%` : null;
}

// The chance a coin would score this well (judge.chance), in words: "1 in 50,000 by luck", or that it could be luck.
export function luck(p) {
  if (p == null) return null;
  if (p >= 0.05) return `could be luck (p = ${p.toFixed(2)})`;
  const n = Math.round(1 / p);
  return `1 in ${n >= 1000 ? Math.round(n / 1000) * 1000 : n} by luck`;
}
