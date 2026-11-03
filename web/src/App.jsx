import { useEffect } from "react";
import { Footer } from "./components.jsx";
import DemoChat from "./DemoChat.jsx";
import Sidebar from "./Sidebar.jsx";
import { SITES, currentSite } from "./site.js";
import { useJson } from "./lib/data.js";
import MetaPage from "./pages/MetaPage.jsx";
import { requestId } from "./Request.jsx";
import ResultsPage from "./pages/ResultsPage.jsx";

export default function App() {
  const site = currentSite();
  // the published fine-tune, or, with ?request=<id>, the run that request produced (once it has one)
  const id = requestId();
  const fetched = useJson(id ? `/api/requests/${id}` : "/results/run.json");
  const run = id ? { ...fetched, data: fetched.data?.run ?? null } : fetched;
  useEffect(() => { document.title = SITES[site].title; }, [site]);
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <div className="backdrop" aria-hidden="true"><span /><span /><span /></div>
      <div className="shell">
        <Sidebar site={site} run={run.data} />
        <div id="content" className="content">
          <main id="main" tabIndex={-1}>
            {site === "results" ? <ResultsPage run={run} /> : <MetaPage run={run} />}
          </main>
          <Footer />
        </div>
      </div>
      <DemoChat />
    </>
  );
}
