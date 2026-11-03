# Muse Spark Fine-Tune Agents

Plain English in, a judged fine-tune out. Two agents built on **Muse Spark** (through the Meta Model API) sit on
either side of a LoRA fine-tune:

1. **The Job Architect** (`agents/architect.py`) turns a one-sentence goal into a fine-tuning job. It first screens
   the goal and turns down models meant to cause harm. Then it writes the training conversations, picks the base
   model, LoRA rank and epochs, writes test prompts it keeps out of training, and warns up front when a goal needs
   facts a small fine-tune can't learn. Code checks every value before any GPU time is spent, and sends the errors
   back to the model to fix.
2. **The Quality Judge** (`agents/judge.py`) answers the question loss can't: did the model get better at the goal?
   On 20 unseen prompts it compares the fine-tune, blind, with the base model as it comes and with the base model
   *told the goal*, reading each pair twice with the order swapped.

If the judge isn't convinced, they **repair** it: the Job Architect writes new chats aimed at what the judge marked
down, the model retrains, and it's judged again on new prompts, for up to two more rounds.

Between them, `agents/train_local.py` trains the adapter on one GPU. The website (`web/`) takes requests, shows
each one live (the loss falling epoch by epoch, the judge's verdicts arriving one by one), and has a chat in the
corner of every page for talking to the fine-tunes.

## Keeping the scores honest

A fine-tune that beats an untrained model on its own goal proves little: that model was never told what to do. So:

- The headline score is against **the same model told the goal** in its instructions. Beating that means training
  added something prompting didn't.
- Each pair is judged **twice, in both orders**, and only counts when both readings agree.
- The judge won't let style beat a correct answer, and it **flags false or unhelpful replies**; the count is shown.
- Every score comes with its **95% range**: 19 of 20 means about 76–99%, not 95%.
- With repairs, the **last** round is reported, not the best of them, and every round's score is shown.
- The results page says plainly that Muse Spark wrote the training chats and also judges, which may favour the
  fine-tune, and shows every answer so you can judge for yourself.

## Built during the hackathon

Everything in this repository was written for the Meta Global AI Developer Hackathon (Oct 26 – Nov 4, 2026) by
Caleb Luh for Luh Labs LLC.

| Part | What it does |
|---|---|
| `agents/llm_call.py` | The Meta Model API client both agents share |
| `agents/architect.py` | Agent 1: goal screen, then goal → training data, settings and test prompts, every value checked; repair chats from the judge's verdicts |
| `agents/train_local.py` | A LoRA trainer that holds back a fifth of the chats, reports loss and accuracy each epoch, and keeps the best epoch |
| `agents/judge.py` | Agent 2: blind pairwise judging against the untrained and the prompted base model, two readings each |
| `agents/publish.py` | A finished job's plan, training numbers and verdicts, as a run on the results page (`web/public/results/<job>.json`) |
| `agents/dispatcher.py` | Takes requests and chat messages from the site and runs them on this machine's GPU |
| `dispatch.ps1` | Keeps the dispatcher running (restarting it if it stops) and the PC awake |
| `web/` | The site: the agents page with the request form and live view, the results page, and the corner chat |

## Run it

Python 3.10+, an NVIDIA GPU, and PyTorch's CUDA build (from pytorch.org), then:

```bash
pip install -r requirements-train.txt
```

The agents need a Meta Model API key. Put it in `.env.local` at the top of the repository (git ignores it) or in the
environment; the URL and model default to `https://api.meta.ai/v1` and `muse-spark-1.3`:

```bash
MODEL_API_KEY=...
LLM_MODEL=muse-spark-1.2-contributor        # optional: another model your key can use
```

`python agents/llm_call.py` checks the settings with one short call. Then, one goal end to end:

```bash
python agents/dispatcher.py --goal "answer support questions in two friendly sentences"
```

It plans the job, trains it, judges it (repairing it if needed) and writes `web/public/results/<job>.json` for the
results page. The steps also run one at a time:

```bash
python agents/architect.py "answer support questions in two friendly sentences" --post   # plan, then train
python agents/judge.py answer agent-jobs/<job>.eval.json agent-jobs/adapters/<job>
python agents/judge.py grade agent-jobs/<job>.eval.answers.json
python agents/publish.py <job>
```

The adapter lands in `agent-jobs/adapters/<job>/`, with a `train_report.json` holding the held-back loss and accuracy
after every epoch.

The site: `cd web && npm install && npm run dev` (details in [web/README.md](web/README.md)).

## Requests and chat from the site

The agents page has a form. A request (a goal and an access code) waits in a queue on the site (`web/worker.js`,
a Cloudflare D1 database) until a dispatcher takes it, runs it end to end and sends the run back. Chat messages go
through the same queue and the same dispatcher, which answers them between requests.

Once, from `web/`: `npx wrangler login`, then `npm run setup-queue` (it creates the database, asks for the access
code and prints the dispatch token). Commit the database id it writes into `wrangler.jsonc` and push. After pulling
changes to `web/schema.sql`, run `npx wrangler d1 execute muse-requests --remote --file schema.sql` (it only adds
what's missing).

Then, on the GPU machine, with `DISPATCH_TOKEN` added to `.env.local`:

```powershell
powershell -ExecutionPolicy Bypass -File dispatch.ps1     # or: python agents/dispatcher.py
```

## Security

[SECURITY.md](SECURITY.md) goes through the OWASP Top 10 for LLM and for agentic applications: the goal screen,
prompt-injection handling, checked agent output, rate limits, what's kept private, and what's still a limit.

## Licence

MIT. See [LICENSE](LICENSE).
