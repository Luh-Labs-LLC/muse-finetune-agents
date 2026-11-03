# Muse Spark Fine-Tune Agents

Plain English in, a judged fine-tune out. Two agents built on **Muse Spark** (through the Meta Model API) sit on
either side of a LoRA fine-tune:

1. **The Job Architect** (`agents/architect.py`) turns a one-sentence goal into a fine-tuning job: it writes the
   training conversations, picks the base model, LoRA rank and epochs, and writes test prompts it keeps out of
   training. Code checks every value before any GPU time is spent, and sends the errors back to the model to fix.
2. **The Quality Judge** (`agents/judge.py`) answers the question loss can't: did the model get better at the goal?
   The base and fine-tuned models answer the held-back prompts, and Muse Spark picks the better reply blind, with the
   order shuffled so position can't bias it.

Between them, `agents/train_local.py` trains the adapter on one GPU. The website (`web/`) takes requests through a
form, follows each one as it runs, and shows the judged results.

## Built during the hackathon

Everything in this repository was written for the Meta Global AI Developer Hackathon (Oct 26 – Nov 4, 2026) by
Caleb Luh for Luh Labs LLC. The commit history carries the dates.

| Part | What it does |
|---|---|
| `agents/llm_call.py` | The Meta Model API client both agents share |
| `agents/architect.py` | Agent 1: goal → training data, settings and test prompts, with every value checked |
| `agents/train_local.py` | A LoRA trainer that holds back a fifth of the chats, reports loss and accuracy each epoch, and keeps the best epoch |
| `agents/judge.py` | Agent 2: blind, order-shuffled pairwise judging of base vs fine-tuned answers |
| `agents/publish.py` | A finished job's plan, training numbers and verdicts, as the results page's run.json |
| `agents/dispatcher.py` | Takes requests from the site's form and runs each one end to end |
| `web/` | The site: the agents page with the request form, and the results page |

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

It plans the job, trains it, judges it and writes `web/public/results/run.json` for the results page. The steps also
run one at a time:

```bash
python agents/architect.py "answer support questions in two friendly sentences" --post   # plan, then train
python agents/judge.py answer agent-jobs/<job>.eval.json agent-jobs/adapters/<job>
python agents/judge.py grade agent-jobs/<job>.eval.answers.json
python agents/publish.py <job>
```

The adapter lands in `agent-jobs/adapters/<job>/`, with a `train_report.json` holding the held-back loss and accuracy
after every epoch.

The site: `cd web && npm install && npm run dev` (details in [web/README.md](web/README.md)).

## Requests from the site

The agents page has a form. A request (a goal and an access code) waits in a queue on the site (`web/worker.js`,
a Cloudflare D1 database) until a dispatcher takes it, runs it end to end and sends the run back.

Once, from `web/`: `npx wrangler login`, then `npm run setup-queue` (it creates the database, asks for the access
code and prints the dispatch token). Commit the database id it writes into `wrangler.jsonc` and push.

Then, on the GPU machine, with `DISPATCH_TOKEN` added to `.env.local`:

```bash
python agents/dispatcher.py
```

## Licence

MIT. See [LICENSE](LICENSE).
