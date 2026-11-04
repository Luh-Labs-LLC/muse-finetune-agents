// Where the pages' numbers come from, and how they're written: JSON from public/results/ (agents/publish.py) and from
// the request queue's /api/ (worker.js).
//
// Loading is stale-while-revalidate: the last good answer for an address is kept in memory and, for the results
// files, in this browser's sessionStorage, so a page that was open before paints at once with what it showed last
// and refreshes quietly behind. index.html also starts fetching the results files before this code has loaded
// (window.__early), and the run picker prefetches a run when the pointer rests on it, so switching is instant.
import { useEffect, useState } from "react";

const memory = new Map();            // url -> parsed JSON, the last good answer this page load
const inflight = new Map();          // url -> the fetch on its way, so two readers share one request
const STORE = "muse-json:";          // sessionStorage prefix; only the static results files are kept there
const keep = (url) => url.startsWith("/results/");

function stored(url) {
  if (memory.has(url)) return memory.get(url);
  if (!keep(url)) return undefined;
  try {
    const raw = sessionStorage.getItem(STORE + url);
    if (raw == null) return undefined;
    const data = JSON.parse(raw);
    memory.set(url, data);
    return data;
  } catch {
    return undefined;
  }
}

function remember(url, data) {
  memory.set(url, data);
  if (!keep(url)) return;
  try { sessionStorage.setItem(STORE + url, JSON.stringify(data)); } catch { /* full or refused: memory still has it */ }
}

// Fetch and parse one address, once at a time per address. A fetch index.html started early is used up first.
export function load(url, signal) {
  if (inflight.has(url)) return inflight.get(url);
  const early = typeof window !== "undefined" && window.__early?.[url];
  const p = (async () => {
    try {
      const r = early ? await early : await fetch(url, { cache: "no-cache", signal });
      if (!r.ok) throw new Error(r.status === 404 ? "not published yet" : `HTTP ${r.status}`);
      const data = await r.json();
      remember(url, data);
      return data;
    } finally {
      inflight.delete(url);
      if (early) delete window.__early[url];
    }
  })();
  inflight.set(url, p);
  return p;
}

// Warm the cache for an address the visitor is about to open (the run picker does this on hover and focus).
export function prefetch(url) {
  if (!url || memory.has(url) || inflight.has(url)) return;
  load(url).catch(() => {});
}

// Fetch JSON once, or every `everyMs` if given. Shows the last good answer first, if there is one (`stale` says so
// until the fresh one lands), and keeps it when a refresh fails. A null url waits.
export function useJson(url, everyMs) {
  const [state, setState] = useState(() => {
    const data = url ? stored(url) : undefined;
    return data !== undefined ? { data, error: null, loading: false, stale: true } : { data: null, error: null, loading: true, stale: false };
  });
  useEffect(() => {
    if (!url) return;
    let live = true;
    const ctrl = new AbortController();
    const cached = stored(url);
    setState(cached !== undefined ? { data: cached, error: null, loading: false, stale: true }
                                  : { data: null, error: null, loading: true, stale: false });
    async function refresh() {
      try {
        const data = await load(url, ctrl.signal);
        if (live) setState({ data, error: null, loading: false, stale: false });
      } catch (e) {
        if (live && e.name !== "AbortError") setState((s) => ({ ...s, error: e.message, loading: false, stale: false }));
      }
    }
    refresh();
    const timer = everyMs ? setInterval(refresh, everyMs) : null;
    return () => { live = false; ctrl.abort(); clearInterval(timer); };
  }, [url, everyMs]);
  return state;
}

// A key for a POST that must happen once even if it's sent twice (a double tap, a retry after the network blinked):
// the Worker answers a repeated key with the first answer instead of doing it again. Make one per attempt and keep it
// until that attempt has succeeded.
export const idempotencyKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

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
  if (p <= 1e-6) return "under 1 in a million by luck";
  const n = Math.round(1 / p);
  return `1 in ${num(n >= 1000 ? Math.round(n / 1000) * 1000 : n)} by luck`;
}
