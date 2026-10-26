#!/usr/bin/env node
// Argv-logging stub for codex / agent / cursor-agent / agy / ngrok / cloudflared /
// tailscale. First argument is the name it stands in for. Every call appends
// {name, argv, pid} as a JSON line to STUB_LOG (default: stub-calls.jsonl in the cwd)
// and exits 0 with no side effects - EXCEPT the foreground routes the native
// supervisor owns (`codex remote-control --no-daemon`, `agent worker start`,
// `agy --remote-control`), which stay alive until killed, like the real ones.
// STUB_CODEX_THREADS: JSON array that `codex agents --json` prints.
// STUB_SLOW_DISABLE_MS: `app-server daemon disable-remote-control` blocks that long first.
import fs from "node:fs";
import path from "node:path";

const [name, ...argv] = process.argv.slice(2);
const log = process.env.STUB_LOG || path.join(process.cwd(), "stub-calls.jsonl");
try { fs.appendFileSync(log, JSON.stringify({ name, argv, pid: process.pid }) + "\n"); } catch { /* read-only cwd */ }
const has = (...xs) => xs.every((x) => argv.includes(x));
if (has("disable-remote-control") && process.env.STUB_SLOW_DISABLE_MS) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.STUB_SLOW_DISABLE_MS));
if (argv.includes("--version")) { console.log(`${name}-stub 0.0.0`); process.exit(0); }
const forever = () => setInterval(() => {}, 1000);
if (name === "codex") {
  if (has("agents")) { console.log(process.env.STUB_CODEX_THREADS || "[]"); process.exit(0); }
  if (has("remote-control", "--no-daemon")) { console.log(JSON.stringify({ status: "running", embedded: true })); forever(); }
  else if (has("remote-control", "pair")) { console.log(JSON.stringify({ manualPairingCode: "000000", expiresAt: null })); process.exit(0); }
  else process.exit(0);
} else if (name === "agent" || name === "cursor-agent") {
  if (has("worker", "start")) { console.log("worker: stub, connected (offline)"); forever(); } else process.exit(0);
} else if (name === "agy") {
  if (has("remote-control", "status")) { console.log("not registered"); process.exit(0); }
  if (has("--remote-control")) { console.log("agy stub session with remote control (offline)"); forever(); } else process.exit(0);
} else if (name === "pi") { forever(); // interactive pi stand-in for the attach selftest
} else process.exit(0); // ngrok / cloudflared / tailscale: log intent, do nothing
