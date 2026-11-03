import { useEffect } from "react";
import { Footer } from "./components.jsx";
import DemoChat from "./DemoChat.jsx";
import Sidebar from "./Sidebar.jsx";
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
  const job = id ? null : pickedRun(runs.data);
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
            {site === "results" ? <ResultsPage run={run} runs={id ? null : runs.data} /> : <MetaPage run={run} />}
          </main>
          <Footer />
        </div>
      </div>
      <DemoChat />
    </>
  );
}
