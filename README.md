# Muse Spark Fine-Tune Agents

Plain English in, a judged fine-tune out. Two agents built on **Muse Spark** (through the Meta Model API) sit on
either side of a LoRA fine-tune, **Muse Wonder** reads every verdict again as a second judge, and **Muse Voice
Transcribe** lets you say the goal, or talk to the finished model, instead of typing:

1. **The Job Architect** (`agents/architect.py`) turns a one-sentence goal into a fine-tuning job. It first screens
   the goal and turns down models meant to cause harm. Then it writes the training conversations, picks the base
   model, LoRA rank and epochs, writes test prompts it keeps out of training, and warns up front when a goal needs
   facts a small fine-tune can't learn. The chats cover how people really write, from "what time is it" to a
   five-part brief with a table, and code checks that mix and every other value before any GPU time is spent,
   sending the errors back to the model to fix.
2. **The Quality Judge** (`agents/judge.py`) answers the question loss can't: did the model get better at the goal?
   It compares the fine-tune, blind, with the base model as it comes and with the base model *told the goal*,
   reading each pair twice with the order swapped.

If the run isn't up to the bar the requester chose, they **repair** it: the Job Architect writes new chats aimed at
what the judge marked down, the model retrains, and it's judged again on new prompts. The form offers three levels:

| Level | Repair rounds | Done when |
|---|---|---|
| Quick | none | after one round, whatever the score |
| Standard | up to 2 | it beats the base model told the goal on 80% of its test prompts |
| Strict | up to 4 | that, and it wins 2 of 3 long, demanding check prompts the same way |

Repairs also stop when a round does no better than the one before. Every level reports every score, and says
whether it reached its bar.

Between them, `agents/train_local.py` trains the adapter on one GPU. The website (`web/`) takes requests, shows
each one live (the loss falling epoch by epoch, the judge's verdicts arriving one by one), and has a chat in the
corner of every page for talking to the fine-tunes.

## What it measured

Three goals, each typed into the site's form and run end to end on one RTX 4060 (8 GB), Qwen3 0.6B as the base.
The headline is wins against the same base model told the goal; each run's every answer is on the results page.

The base model is deliberately tiny so a whole run, repairs included, fits on a gaming GPU in under an hour; Meta's
models are the agents, the judges and the auditor, not the student. The base is one line in `agents/models.py`;
Muse Glimmer (30B, Apache 2.0) is the next student, with QLoRA on a 24 GB card.

| Goal | Level | Rounds, wins over the model told the goal | Rules passed, **checked by code** | Off-task messages declined | Held its own against **Muse Spark itself** |
|---|---|---|---|---|---|
| Support tickets → one line of JSON (category, urgency, sentiment, summary) | Standard | 18/20 → **16/20** (likely 58–92%; about 1 in 170 by luck) | one line, the four keys, allowed values: fine-tune **91%**, told the goal 3%, untrained 0% (32 prompts) | 7 of 10 → **10 of 10**; told the goal 1 of 10 | 7 of 20 (1 win, 6 even, 13 lost); Muse Spark passed every rule and declined 10 of 10 |
| Plain-English request → one Excel formula, nothing else | Standard | 11/20 → 10/18 → **10/19, 9 ties, no losses** (short of the bar) | starts with `=`, one line, balanced brackets: **94%**, told the goal 55%, untrained 0% (31 prompts) | **4 of 4**; told the goal 3 of 4 | 9 of 19 (9 even, 10 lost) |
| Answer like Mark Twain, reason like Plato | Strict | 11/20 → 11/17 → **8/18** | — | — | 0 of 18 |

The last column is the frontier test, beside the bar rather than part of it: Muse Spark, the model that wrote the
training chats, answers the same prompts itself, told the goal, and the same blind judge compares it with the
0.6B fine-tune. The small model matched it on the pairs where the task is the format (identical formulas, the same
JSON, every decline) and lost where judgment is needed (a tricky formula, a sentiment call, anything Twain). Code
scores the big model on the same rules and declines, so the page shows where the gap is, not just that there is one.

- The JSON run shows the repair loop and the "last round, not the best" rule at once: round 1 won 18 of 20 but
  declined only 7 of 10 off-task messages and passed every rule on 81% of replies, both under their bars; the
  Architect wrote 23 chats aimed at those misses, and round 2 declined 10 of 10 and passed 91%, with 16 wins.
  Round 2 is what's published.
- The Excel run is published short of its bar on purpose: the bar counts wins, and a 0.6B model told the goal
  writes the same `=SUMIFS(…)` for a short request, so nine pairs tied. The fine-tune's edge is on the long briefs
  (every win), the rules and the off-task messages, and it never lost a pair. The Twain run fell short too; the
  repairs didn't help, so it stopped.
- A narrow goal declines what isn't its job: asked for the weather or a poem, both the JSON and the Excel fine-tunes
  answer with the one decline sentence the Architect wrote, and code counts how often each model does. The model
  told the goal is told that sentence too, so the comparison is fair.
- The fine-tune doesn't need the goal sent with every message: the JSON model used **88 prompt tokens a message
  against 195** for the model told the goal (55% fewer), and replied in 1.4 s against 1.9 s on the same GPU; the
  Excel model 99 against 197, in 2.8 s against 7.3 s.
- A second judge, a newer Muse Spark on the cheaper Contributor tier, read every pair again and agreed on 20 of 20
  (JSON, Cohen's κ 1.0) and 17 of 19 (Excel, κ 0.79). It's the same model family, so it checks consistency, not
  independence.
- Visitors can vote too: the chat shows the fine-tune and the model told the goal as A and B in random order, and
  the tally sits beside the judges' scores.

What didn't work, kept because it's the honest edge of the method: a 0.6B model can learn a format (JSON, one
formula, two sentences) far better than prompting gets it, but not a voice that needs reasoning (the Twain/Plato
run), and not wordplay: asked to open every answer with a pun on a capital city, it learned to say "Lima!" and
then answer, with no pun. The Job Architect now warns about wordplay goals before any GPU time is spent. An early
two-sentence run also scored well by saying "For example, …" in every reply, even to "hi"; the chats are now
checked for stock phrases and the judge marks down forced replies.

## Keeping the scores honest

A fine-tune that beats an untrained model on its own goal proves little: that model was never told what to do. So:

- The headline score is against **the same model told the goal** in its instructions. Beating that means training
  added something prompting didn't.
- The Job Architect writes the test prompts as well as the chats, so a model could be built to pass its own exam.
  Every run is also tested, and scored apart, on prompts it never had a hand in:
  - **hard prompts** (`agents/hard_prompts.txt`): long, demanding requests people wrote, which nothing is trained,
    repaired or chosen by;
  - **check prompts** (`agents/check_prompts.txt`): the same kind, which Strict stops on, so they're never the
    published hard score;
  - **the judge's own prompts**: two casual, two everyday and two demanding, written fresh after each round's
    training and never shown to the Job Architect.
- Each pair is judged **twice, in both orders**, and only counts when both readings agree.
- The judge won't let style beat a correct answer, and it **flags false or unhelpful replies**; the count is shown.
- Every score comes with its **95% range**: 19 of 20 means about 76–99%, not 95%.
- **Code scores what code can.** The Job Architect picks each goal's rules from a fixed library
  (`agents/checks.py`: `exact_sentences 2`, `no_bullets`, `starts_with "="`, `one_line`, `balanced_brackets`,
  `json_keys [...]`, `line_prefixes [...]`, and so on; it can't invent one). Its training chats must pass them before
  any GPU time is spent; afterwards every reply from all three models is scored on every rule, the results page
  shows each rule's pass rate, a reply that breaks one is named in the repair loop, and Standard and Strict require
  the fine-tune to pass every rule on 80% of its on-task test prompts. The judge is left with what code can't
  measure: whether the reply is true, helpful and natural.
- **A narrow task has to know what isn't its job.** An early Excel-formula model answered "what's the weather" with
  a formula. For a goal that's a task on a kind of input (extract, convert, classify), the Job Architect now states
  the one sentence the model says to anything else, trains it on off-task messages answered with that sentence, and
  writes off-task test prompts; code measures how many the fine-tune declined, the judge is told the scope, and
  Standard and Strict require 75% declined before a run is published.
- No test prompt may be a training chat in disguise: code compares them with case, punctuation and spacing removed.
- Every score also says what **luck** would do: the exact chance a coin flip would win at least that many of the
  decided pairs. 19 of 20 is 1 in 50,000; 10 of 16 could be luck (p = 0.23), and the page says so.
- A **second judge, Muse Wonder**, a different model, reads every pair, and the agreement is shown as a count and as
  Cohen's κ; so are **blind votes from people**.
- Each run has a **receipt**: trained and frozen weight counts, settings, peak GPU memory, and SHA-256 fingerprints
  of the training chats and the adapter.
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
| `agents/checks.py` | The library of rules code can score (sentence counts, one line, valid JSON with set keys, line prefixes, balanced brackets, …): the Job Architect picks from it, never writes its own |
| `agents/judge.py` | Agent 2: blind pairwise judging against the untrained and the prompted base model, two readings each, on its own test prompts, fixed hard and check prompts, and prompts it writes each round; Muse Wonder re-reads every pair as the second judge |
| `agents/teacher.py` | The frontier test: Muse Spark answers the same prompts itself, told the goal, and is judged against the fine-tune the same way; code scores it on the rules and declines too |
| `web/src/Dictate.jsx` | Voice input: a clip recorded in the browser, turned into 16 kHz WAV there, transcribed by Muse Voice Transcribe through the Worker, into the goal field or the chat |
| `agents/publish.py` | A finished job's plan, training numbers and verdicts, as a run on the results page (`web/public/results/<job>.json`) |
| `agents/dispatcher.py` | Takes requests and chat messages from the site and runs them on this machine's GPU, repairing each run until it reaches the level asked for |
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
python agents/dispatcher.py --goal "answer support questions in two friendly sentences" --rigor strict
```

It plans the job, trains it, judges it (repairing it until it reaches the level: `quick`, `standard` or `strict`) and writes `web/public/results/<job>.json` for the
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
