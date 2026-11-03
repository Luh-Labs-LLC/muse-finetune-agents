// The glass sidebar: both sites' sections in one place, a search over them (⌘K or Ctrl K), night mode, and the team.
// On a desktop it folds down to a rail of icons; on a phone it's a drawer behind a menu button.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { ALL_ITEMS, NAV } from "./nav.js";
import { siteHref } from "./site.js";
import { useTheme } from "./lib/theme.js";
import { TEAM } from "./team.js";

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

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
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);
  const menuRef = useRef(null);
  const { theme, dark, setTheme } = useTheme();
  const active = useActiveSection(ALL_ITEMS.filter((i) => i.site === site).map((i) => i.id));
  const folded = collapsed && !drawerOpen; // the drawer always opens full width

  // ⌘K / Ctrl K opens the search from anywhere; Escape closes the drawer.
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCollapsed(false);
        if (matchMedia("(max-width: 860px)").matches) setDrawerOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key === "Escape" && drawerOpen) {
        setDrawerOpen(false);
        menuRef.current?.focus();
      }
    }
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [drawerOpen, setCollapsed]);

  // While the drawer is open, the page behind it can't be clicked or tabbed into.
  useEffect(() => {
    const content = document.getElementById("content");
    if (content) content.inert = drawerOpen;
    if (drawerOpen) requestAnimationFrame(() => searchRef.current?.focus());
  }, [drawerOpen]);

  const close = () => setDrawerOpen(false);
  const badges = {
    run: run?.judge
      ? <span className="badge">{run.judge.tuned_wins}/{run.judge.prompts}</span>
      : <span className="badge quiet">soon</span>,
  };
  const matches = query.trim()
    ? ALL_ITEMS.filter((i) => i.label.toLowerCase().includes(query.trim().toLowerCase()))
    : null;

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

      <aside id="sidebar" className={`sidebar${folded ? " folded" : ""}${drawerOpen ? " open" : ""}`} aria-label="Site">
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
          <button className="nav-link search-rail" data-tip="Search" aria-label="Search pages"
                  onClick={() => { setCollapsed(false); requestAnimationFrame(() => searchRef.current?.focus()); }}>
            <Icon name="search" />
          </button>
        ) : (
          <form className="search" role="search" onSubmit={(e) => {
            e.preventDefault();
            const first = matches?.[0];
            if (first) { location.href = first.href ?? siteHref(first.site, first.id); setQuery(""); close(); }
          }}>
            <Icon name="search" size={18} />
            <label className="sr-only" htmlFor="search-input">Search pages</label>
            <input id="search-input" ref={searchRef} type="search" placeholder="Search pages" value={query}
                   onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
            <kbd aria-hidden="true">{IS_MAC ? "⌘K" : "Ctrl K"}</kbd>
          </form>
        )}

        <nav id="sidebar-nav" className="sidebar-nav" aria-label="Sections">
          {matches ? (
            <>
              <p className="group-title" aria-live="polite">{matches.length ? `${matches.length} found` : "Nothing found"}</p>
              <ul>{matches.map((i) => <li key={(i.site ?? "") + (i.id ?? i.href)}>{link(i)}</li>)}</ul>
            </>
          ) : NAV.map((g) => (
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
          <div className="night">
            <Icon name="moon" />
            <span className="label" id="night-label">Night mode</span>
            <button role="switch" aria-checked={dark} aria-labelledby="night-label" className="switch" data-tip="Night mode"
                    onClick={() => setTheme(dark ? "light" : "dark")}><span /></button>
          </div>
          {!folded && theme !== "system" && (
            <button className="follow-system" onClick={() => setTheme("system")}>Follow my system's setting</button>
          )}
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
        <svg viewBox="0 0 3 4" width="12" height="16"><path fill="currentColor" d="M0 0h1v3H0zM2 0h1v3H2zM1 3h1v1H1z" /></svg>
      </span>
      <span className="label">
        Luh Labs
        {withSub && <small>Muse Spark agents</small>}
      </span>
    </a>
  );
}
