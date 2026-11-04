// The command menu (⌘K or Ctrl K): type to jump to a section of either site, open a published run, or do something,
// such as switching night mode or opening the chat. Arrow keys move, Enter goes, Escape (or the back gesture) closes.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { NAV } from "./nav.js";
import { siteHref } from "./site.js";
import { runHref } from "./Request.jsx";
import { openChat } from "./DemoChat.jsx";
import { useBackClose } from "./lib/sheet.js";

const OPEN = "muse-open-commands";
const THEME = "muse-toggle-theme";  // the sidebar owns the theme; this asks it to flip
export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = IS_MAC ? "⌘" : "Ctrl";

export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN));
}

export function onToggleTheme(fn) {
  window.addEventListener(THEME, fn);
  return () => window.removeEventListener(THEME, fn);
}

export default function CommandMenu({ runs, currentJob, onPickRun }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef(null), list = useRef(null), opener = useRef(null);
  const close = () => { setOpen(false); opener.current?.focus?.(); };
  useBackClose(open, () => setOpen(false), "commands");

  useEffect(() => {
    const show = () => { opener.current = document.activeElement; setQuery(""); setAt(0); setOpen(true); };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); open ? close() : show(); }
    };
    window.addEventListener(OPEN, show);
    addEventListener("keydown", onKey);
    return () => { window.removeEventListener(OPEN, show); removeEventListener("keydown", onKey); };
  }, [open]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => input.current?.focus());
    const content = document.querySelector(".shell");
    if (content) content.inert = true;
    return () => { if (content) content.inert = false; };
  }, [open]);

  const commands = useMemo(() => {
    const go = (href) => () => { location.href = href; };
    const items = [
      ...NAV.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])]).map((i) => ({
        group: g.group, label: i.label, icon: i.icon ?? "arrow",
        run: i.href ? () => window.open(i.href, "_blank", "noreferrer") : go(siteHref(i.site, i.id)),
      }))),
      ...(runs ?? []).map((r) => ({
        group: "Open a run", label: r.title, hint: `${r.wins} / ${r.prompts}`, icon: "spark",
        run: () => (onPickRun ? onPickRun(r.job) : (location.href = runHref(r.job))), current: r.job === currentJob,
      })),
      { group: "Do", label: "Talk to the models", icon: "chat", run: openChat },
      { group: "Do", label: "Switch night mode", icon: "moon", run: () => window.dispatchEvent(new Event(THEME)) },
      { group: "Do", label: "Copy a link to this page", icon: "external",
        run: () => navigator.clipboard?.writeText(location.href).catch(() => {}) },
      { group: "Do", label: "Request a fine-tune", icon: "compose", run: go(siteHref("meta", "request")) },
    ];
    return items;
  }, [runs, currentJob, onPickRun]);

  const q = query.trim().toLowerCase();
  const shown = q ? commands.filter((c) => `${c.group} ${c.label}`.toLowerCase().includes(q)) : commands;
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at, shown.length]);

  function pick(c) {
    setOpen(false);
    c.run();
  }
  function keys(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => (shown.length ? (i + 1) % shown.length : 0)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => (shown.length ? (i - 1 + shown.length) % shown.length : 0)); }
    else if (e.key === "Home") { e.preventDefault(); setAt(0); }
    else if (e.key === "End") { e.preventDefault(); setAt(Math.max(0, shown.length - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[at]) pick(shown[at]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  }

  if (!open) return null;
  return (
    <div className="cmd-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="cmd tile" role="dialog" aria-modal="true" aria-label="Command menu" onKeyDown={keys}>
        <div className="cmd-search">
          <Icon name="search" size={18} />
          <label className="sr-only" htmlFor="cmd-input">Search sections, runs and actions</label>
          <input id="cmd-input" ref={input} type="text" value={query} placeholder="Jump to a section, open a run, or do something…"
                 autoComplete="off" spellCheck={false} role="combobox" aria-expanded="true" aria-controls="cmd-list"
                 aria-activedescendant={shown[at] ? `cmd-${at}` : undefined} onChange={(e) => setQuery(e.target.value)} />
          <kbd aria-hidden="true">esc</kbd>
        </div>
        <ul id="cmd-list" ref={list} className="cmd-list" role="listbox" aria-label="Results">
          {shown.length === 0 && <li className="cmd-empty" aria-live="polite">Nothing matches “{query}”.</li>}
          {shown.map((c, i) => (
            <li key={`${c.group}:${c.label}`}>
              {(i === 0 || shown[i - 1].group !== c.group) && <p className="cmd-group" aria-hidden="true">{c.group}</p>}
              <button type="button" id={`cmd-${i}`} data-i={i} role="option" aria-selected={i === at} tabIndex={-1}
                      className="cmd-item" onClick={() => pick(c)} onPointerMove={() => setAt(i)}>
                <Icon name={c.icon} size={18} />
                <span className="cmd-label">{c.label}{c.current && <span className="muted"> · showing</span>}</span>
                {c.hint && <span className="cmd-hint">{c.hint}</span>}
                {i === at && <kbd aria-hidden="true">↵</kbd>}
              </button>
            </li>
          ))}
        </ul>
        <p className="cmd-foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span>
          <span><kbd>{MOD}</kbd><kbd>K</kbd> from anywhere</span>
        </p>
      </div>
    </div>
  );
}
