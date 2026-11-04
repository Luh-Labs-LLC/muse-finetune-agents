// The floating pill at the top of every page: the brand, the four places to go, the command menu and the chat.
// On a phone the links fold into the command menu, which lists every section.
import { useEffect, useState } from "react";
import { Icon } from "./icons.jsx";
import { siteHref } from "./site.js";
import { openChat } from "./DemoChat.jsx";
import { MOD, openCommandMenu } from "./CommandMenu.jsx";

const LINKS = [
  { site: "meta", id: "how", label: "How it works", watch: ["how"] },
  { site: "results", id: "fine-tune", label: "Results", watch: ["fine-tune", "run", "details", "rules", "repairs", "rounds", "try", "answers"] },
  { site: "meta", id: "request", label: "Request", watch: ["request", "verdict", "try"] },
  { site: "meta", id: "about", label: "Story", watch: ["about"] },
];

// The section on screen: the last one whose top has passed a third of the way down the window.
function useActiveSection() {
  const [active, setActive] = useState(null);
  useEffect(() => {
    let frame = null;
    const update = () => {
      frame = null;
      let current = null;
      for (const el of document.querySelectorAll("main > section[id]")) {
        if (el.getBoundingClientRect().top < innerHeight / 3) current = el.id;
      }
      setActive(current);
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    const late = setInterval(update, 2000);  // sections that appear once their data loads
    return () => { removeEventListener("scroll", schedule); removeEventListener("resize", schedule); cancelAnimationFrame(frame); clearInterval(late); };
  }, []);
  return active;
}

export default function Nav({ site, run }) {
  const active = useActiveSection();
  const score = run?.judge ? `${(run.judge.vs_prompted ?? run.judge).tuned_wins}/${run.judge.prompts}` : null;
  return (
    <div className="navwrap">
      <nav className="pillnav" aria-label="Site">
        <a className="brand" href={siteHref("meta", "overview")}><span className="logo" aria-hidden="true" />Luh Labs</a>
        <div className="pillnav-links">
          {LINKS.map((l) => (
            <a key={l.id} href={siteHref(l.site, l.id)}
               aria-current={l.site === site && l.watch.includes(active) ? "location" : undefined}>
              {l.label}{l.id === "fine-tune" && score && <span className="pillnav-score">{score}</span>}
            </a>
          ))}
        </div>
        <button type="button" className="pillnav-icon" onClick={openCommandMenu} aria-keyshortcuts="Meta+K Control+K"
                aria-label="Search sections, runs and actions">
          <Icon name="search" size={16} /><kbd aria-hidden="true">{MOD} K</kbd><span className="pillnav-menu">Menu</span>
        </button>
        <button type="button" className="pillnav-cta" onClick={openChat}>Talk to the models</button>
      </nav>
    </div>
  );
}
