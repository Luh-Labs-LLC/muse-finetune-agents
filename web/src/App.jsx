import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Footer } from "./components.jsx";
import CommandMenu from "./CommandMenu.jsx";
import DemoChat from "./DemoChat.jsx";
import Sidebar from "./Sidebar.jsx";
import Toasts from "./Toast.jsx";
import { SITES, currentSite } from "./site.js";
import { useJson } from "./lib/data.js";
import MetaPage from "./pages/MetaPage.jsx";
import { pickedRun, requestId } from "./Request.jsx";
import ResultsPage from "./pages/ResultsPage.jsx";

export default function App() {
  const site = currentSite();
  // a published fine-tune (?run=<job>, or the best one), or, with ?request=<id>, the run that request produced
  const id = requestId();
  const runs = useJson(id ? null : "/results/runs.json");
  const [job, pickJob] = useJob(id ? null : runs.data);
  const fetched = useJson(id ? `/api/requests/${id}` : job && `/results/${job}.json`);
  const run = id ? { ...fetched, data: fetched.data?.run ?? null }
    : job ? fetched : { data: null, error: runs.error, loading: runs.loading };
  useEffect(() => { document.title = SITES[site].title; }, [site]);
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <div className="backdrop" aria-hidden="true"><span /><span /><span /></div>
      <div className="shell">
        <Sidebar site={site} run={run.data} />
        <div id="content" className="content">
          <main id="main" tabIndex={-1}>
            {site === "results" ? <ResultsPage run={run} runs={id ? null : runs.data} onPickRun={pickJob} />
                                : <MetaPage run={run} />}
          </main>
          <Footer />
        </div>
      </div>
      <DemoChat />
      <CommandMenu runs={id ? null : runs.data} currentJob={job} onPickRun={site === "results" ? pickJob : null} />
      <Toasts />
    </>
  );
}

// Which published run shows: from ?run= in the address, kept in step with it when a run is picked on the page (the
// address changes without a reload, and the back button walks back through runs). The swap is a view transition
// where the browser has them: the headline numbers cross-fade instead of blinking.
function useJob(runs) {
  const [asked, setAsked] = useState(() => new URLSearchParams(location.search).get("run"));
  useEffect(() => {
    const onPop = () => setAsked(new URLSearchParams(location.search).get("run"));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const pick = useCallback((job) => {
    const url = new URL(location.href);
    url.searchParams.set("run", job);
    history.pushState(history.state, "", url);
    const swap = () => flushSync(() => setAsked(job));
    if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(swap);
    else swap();
  }, []);
  return [pickedRun(runs, asked), pick];
}
