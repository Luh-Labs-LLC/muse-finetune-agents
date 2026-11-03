// One-time setup for the request queue (worker.js), after `npx wrangler login`:
//
//   npm run setup-queue
//
// Creates the D1 database (or finds it), writes its id into wrangler.jsonc, creates the table, and sets the two
// secrets: ACCESS_CODE, which you choose and hand to whoever may use the form, and DISPATCH_TOKEN, made up here and
// printed once, which every dispatcher machine needs. Safe to run again: each step skips what's already done, except
// the secrets, which it replaces.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const DB = "muse-requests";
const CONFIG = new URL("./wrangler.jsonc", import.meta.url);

function wrangler(args, input) {
  return execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", shell: true, input,
                                                       stdio: [input ? "pipe" : "inherit", "pipe", "inherit"] });
}

function findDb() {
  const db = JSON.parse(wrangler(["d1", "list", "--json"])).find((d) => d.name === DB);
  return db && (db.uuid ?? db.database_id ?? db.id);
}

let id = findDb();
if (!id) {
  console.log(`creating the ${DB} database…`);
  wrangler(["d1", "create", DB]);
  id = findDb();
}
console.log(`database ${DB}: ${id}`);

const config = readFileSync(CONFIG, "utf8");
const patched = config.replace(/"database_id": "[^"]*"/, `"database_id": "${id}"`);
if (patched !== config) {
  writeFileSync(CONFIG, patched);
  console.log("wrote its id into wrangler.jsonc (commit that)");
}

wrangler(["d1", "execute", DB, "--remote", "--file", "schema.sql", "--yes"]);
console.log("table ready");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const code = (await rl.question("Access code for the form (what you'll give people): ")).trim();
rl.close();
if (code.length < 6) throw new Error("pick an access code of at least 6 characters");
wrangler(["secret", "put", "ACCESS_CODE"], code);
const token = randomBytes(24).toString("base64url");
wrangler(["secret", "put", "DISPATCH_TOKEN"], token);

console.log(`\nsecrets set. On each dispatcher machine, before running agents/dispatcher.py:\n
  $env:DISPATCH_TOKEN = "${token}"\n
Keep it like a password: anyone with it can take requests and post results.`);
