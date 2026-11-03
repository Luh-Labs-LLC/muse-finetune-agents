# agents.luhlabs.com and results.luhlabs.com

One React app (Vite) that serves both subdomains. Which page shows comes from the address (`src/site.js`):
`results.luhlabs.com` shows the fine-tune run, anything else shows the agents page. Locally, `?site=results` switches.

```bash
cd web
npm install
npm run dev          # http://localhost:5173, and http://localhost:5173/?site=results
npm run build        # into dist/
```

## Where the numbers come from

- `public/results/run.json`: the published run, written by `agents/publish.py` (or `agents/dispatcher.py --goal`).
  Both pages use it once it exists: the plan, the held-back loss and accuracy after every epoch, and `judge`, the
  verdicts from `agents/judge.py grade`: `{prompts, tuned_wins, ties, base_wins, pairs: [{prompt, base, tuned,
  tuned_won, winner, reason}]}`.
- `/api/requests/<id>`: a request from the form, its progress and, once it's done, its run in the same shape
  (`worker.js`). The results page shows that run when its address has `?request=<id>`.

## Theme

Desktop first. A floating glass sidebar (`src/Sidebar.jsx`, its items in `src/nav.js`) lists both sites' sections,
searches them (⌘K or Ctrl K), highlights the one you're reading, folds to an icon rail, and becomes a drawer on
phones. Pages sit on a warm ambient backdrop, with Apple-like type and tiles. The About section (`src/About.jsx`) has
a bolder look of its own. The font is the system's (San Francisco on Apple devices) with Inter elsewhere, and Archivo
for the About section's wide capitals.

Colours are tokens at the top of `src/styles.css`, set once for light and again for dark; the night mode switch
overrides the system's setting, and "Follow my system's setting" hands it back. Glass turns solid when the system
asks for reduced transparency (Windows: Settings → Personalization → Colors → Transparency effects).

To add team photos, put them in `public/team/` and set `photo` in `src/team.js`.

## Deploying

The domain is one setting, `DOMAIN` in `src/site.js`. On Vercel (a Luh Labs team) or Cloudflare Pages:

1. Import this repo and set the root directory to `web`. Build command `npm run build`, output `dist` (both detect Vite).
2. Add the custom domains `agents.luhlabs.com` and `results.luhlabs.com` to the project.
3. In luhlabs.com's DNS, add a CNAME for `agents` and one for `results`, each pointing at the target the host shows.
