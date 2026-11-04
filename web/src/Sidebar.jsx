// The glass sidebar: both sites' sections in one place, the command menu's button (⌘K or Ctrl K), and who built it.
// On a desktop it folds down to a rail of icons; on a phone it's a drawer behind a menu button, which the back
// gesture closes and a swipe to the left dismisses.
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { ALL_ITEMS, NAV } from "./nav.js";
import { siteHref } from "./site.js";
import { useBackClose, useSwipeDismiss } from "./lib/sheet.js";
import { MOD, openCommandMenu } from "./CommandMenu.jsx";
import { TEAM } from "./team.js";

function useStored(key, initial) {
  const [value, setValue] = useState(() => {
    try { const v = localStorage.getItem(key); return v === null ? initial : JSON.parse(v); } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage refused: fine */ } }, [key, value]);
  return [value, setValue];
}

// The section scrolled to: the last one whose top has passed a third of the way down the window.
function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join(" ");
  useEffect(() => {
    let frame = null;
    const update = () => {
      frame = null;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < innerHeight / 3) current = id;
      }
      setActive(current);
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    const late = setInterval(update, 2000); // sections that appear once their data loads
    return () => { removeEventListener("scroll", schedule); removeEventListener("resize", schedule); cancelAnimationFrame(frame); clearInterval(late); };
  }, [key]);
  return active;
}

export default function Sidebar({ site, run }) {
  const [collapsed, setCollapsed] = useStored("sidebar-collapsed", false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState({ "fine-tune": true });
  const menuRef = useRef(null);
  const asideRef = useRef(null);
  const active = useActiveSection(ALL_ITEMS.filter((i) => i.site === site).map((i) => i.id));
  const folded = collapsed && !drawerOpen; // the drawer always opens full width

  // Escape closes the drawer; so does the back gesture, and a swipe to the left.
  const close = useCallback(() => setDrawerOpen(false), []);
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && drawerOpen) { setDrawerOpen(false); menuRef.current?.focus(); }
    }
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [drawerOpen]);
  useBackClose(drawerOpen, close, "drawer");
  useSwipeDismiss(asideRef, { axis: "x", direction: -1, onDismiss: close, enabled: drawerOpen });

  // While the drawer is open, the page behind it can't be clicked or tabbed into.
  useEffect(() => {
    const content = document.getElementById("content");
    if (content) content.inert = drawerOpen;
    if (drawerOpen) requestAnimationFrame(() => asideRef.current?.querySelector(".nav-link")?.focus());
  }, [drawerOpen]);

  const badges = {
    run: run?.judge
      ? <span className="badge">{(run.judge.vs_prompted ?? run.judge).tuned_wins}/{run.judge.prompts}</span>
      : <span className="badge quiet">soon</span>,
  };
  const commands = () => { close(); openCommandMenu(); };

  function link(item, extra = {}) {
    const external = Boolean(item.href);
    const current = item.site === site && item.id === active;
    return (
      <a className="nav-link" href={item.href ?? siteHref(item.site, item.id)} data-tip={item.label}
         aria-current={current ? "location" : undefined} onClick={close}
         {...(external ? { target: "_blank", rel: "noreferrer" } : {})} {...extra}>
        {item.icon ? <Icon name={item.icon} /> : <span className="nav-dot" style={{ background: item.dot }} aria-hidden="true" />}
        <span className="label">{item.label}{external && <span className="sr-only"> (opens in a new tab)</span>}</span>
        {item.badge && badges[item.badge]}
        {external && <span className="ext" aria-hidden="true"><Icon name="external" size={14} /></span>}
      </a>
    );
  }

  return (
    <>
      <div className="mobilebar">
        <Brand />
        <button ref={menuRef} className="icon-button" aria-label="Open menu" aria-expanded={drawerOpen}
                aria-controls="sidebar" onClick={() => setDrawerOpen(true)}>
          <Icon name="menu" />
        </button>
      </div>
      {drawerOpen && <div className="scrim" onClick={close} aria-hidden="true" />}

      <aside id="sidebar" ref={asideRef} className={`sidebar${folded ? " folded" : ""}${drawerOpen ? " open" : ""}`} aria-label="Site">
        <div className="sidebar-head">
          <Brand withSub={!folded} />
          <button className="fold-button" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}
                  aria-controls="sidebar-nav" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <Icon name="chevron" size={16} />
          </button>
          <button className="icon-button drawer-close" onClick={() => { close(); menuRef.current?.focus(); }} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>

        {folded ? (
          <button className="nav-link search-rail" data-tip={`Search (${MOD} K)`} aria-label="Open the command menu"
                  aria-keyshortcuts="Meta+K Control+K" onClick={commands}>
            <Icon name="search" />
          </button>
        ) : (
          <button type="button" className="search" aria-label="Open the command menu: search sections, runs and actions"
                  aria-keyshortcuts="Meta+K Control+K" onClick={commands}>
            <Icon name="search" size={18} />
            <span className="search-text">Search…</span>
            <kbd aria-hidden="true">{MOD} K</kbd>
          </button>
        )}

        <nav id="sidebar-nav" className="sidebar-nav" aria-label="Sections">
          {NAV.map((g) => (
            <div key={g.group} className="group">
              <p className="group-title">{folded ? <span className="rule" aria-hidden="true" /> : g.group}</p>
              <ul>
                {g.items.map((i) => (
                  <li key={i.id ?? i.href}>
                    {i.children ? (
                      <>
                        <div className="nav-row">
                          {link(i)}
                          {!folded && (
                            <button className="disclose" aria-expanded={!!expanded[i.id]} aria-controls={`sub-${i.id}`}
                                    aria-label={`${expanded[i.id] ? "Hide" : "Show"} ${i.label} sections`}
                                    onClick={() => setExpanded({ ...expanded, [i.id]: !expanded[i.id] })}>
                              <Icon name="chevron" size={14} />
                            </button>
                          )}
                        </div>
                        {!folded && expanded[i.id] && (
                          <ul id={`sub-${i.id}`} className="sub">
                            {i.children.map((c) => <li key={c.id}>{link(c)}</li>)}
                          </ul>
                        )}
                      </>
                    ) : link(i)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <a className="team-chip" href={siteHref("meta", "about")} onClick={close} data-tip="The story">
            <span className="avatars" aria-hidden="true">
              {TEAM.map((p) => <span key={p.name} style={{ background: p.color }}>{p.name[0]}</span>)}
            </span>
            <span className="label">
              <strong>{TEAM.map((p) => p.name).join(" & ")}</strong>
              <small>Meta AI Hackathon 2026</small>
            </span>
          </a>
        </div>
      </aside>
    </>
  );
}

function Brand({ withSub }) {
  return (
    <a className="brand" href={siteHref("meta", "overview")}>
      <span className="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M5 4h14a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6.5L8 21v-4H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" /><path d="M8.2 10.6l2.6 2.6 5-5.4" fill="none" stroke="var(--ink, #15171c)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className="label">
        Luh Labs
        {withSub && <small>Muse Spark agents</small>}
      </span>
    </a>
  );
}
