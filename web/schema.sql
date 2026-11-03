-- The fine-tune request queue (worker.js). Create it once:
--   npx wrangler d1 execute muse-requests --remote --file schema.sql
CREATE TABLE IF NOT EXISTS requests (
  id      TEXT PRIMARY KEY,   -- a random UUID: whoever has it can follow the request
  goal    TEXT NOT NULL,      -- the plain-English goal from the form
  status  TEXT NOT NULL,      -- queued, planning, training, judging, done, failed
  job_id  TEXT,               -- the Job Architect's job, once planned
  machine TEXT,               -- which dispatcher took it
  log     TEXT,               -- JSON list of {at, status, message}, the last 50
  run     TEXT,               -- the finished run, the same JSON as public/results/run.json
  created INTEGER NOT NULL,   -- ms since 1970
  updated INTEGER
);
CREATE INDEX IF NOT EXISTS queued ON requests (status, created);

-- The dispatchers, and when each last checked in: the form says so when none is online.
CREATE TABLE IF NOT EXISTS machines (
  name TEXT PRIMARY KEY,      -- the computer's name (platform.node())
  seen INTEGER NOT NULL       -- ms since 1970
);
