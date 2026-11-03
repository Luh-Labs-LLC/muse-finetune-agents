// One app, two sites. Which one shows comes from the address: results.<DOMAIN> is the fine-tune run, anything else
// (agents.<DOMAIN>, a preview deployment, localhost) is the agents page. ?site=results overrides it, for local work.

export const DOMAIN = "luhlabs.com";

export const SITES = {
  meta: { title: "Muse Spark Fine-Tune Agents", host: `agents.${DOMAIN}` },
  results: { title: "Fine-tune results · Muse Spark agents", host: `results.${DOMAIN}` },
};

export function currentSite() {
  const asked = new URLSearchParams(location.search).get("site");
  if (asked in SITES) return asked;
  return location.hostname.startsWith("results.") ? "results" : "meta";
}

// A link to a section of either site. On the same site it's just the #section; on the real domain another site's
// sections are on the other subdomain; anywhere else (localhost, previews) it's ?site= on this host.
export function siteHref(site, hash = "") {
  if (site === currentSite()) return hash ? `#${hash}` : location.pathname + location.search;
  const base = location.hostname.endsWith(DOMAIN) ? `https://${SITES[site].host}/` : `?site=${site}`;
  return base + (hash ? `#${hash}` : "");
}
