#!/usr/bin/env node
// Selftest only: a native supervisor in its own process, so the selftest can kill
// it, signal it, crash it or wedge it and then watch what happens to the route it
// armed. Started with child_process.fork (IPC). argv: <host> <home> <cwd> <ttlMs> [shared].
// The routes are stub-native.mjs; HOME/USERPROFILE/CODEX_HOME come from the env the
// selftest passes (a temp dir). Messages:
//   {emit: "SIGHUP"|"SIGTERM"}  process.emit(sig) - the handler path, on any OS
//   {signalSelf: "SIGTERM"}     a real signal (POSIX only)
//   {throw: true}               an uncaught exception on the next tick
//   {wedge: true}               a busy loop: alive, but no tick ever runs again
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const br = await import(pathToFileURL(path.join(here, "..", "cerebro-bridge.mjs")).href);
const [host, home, cwd, ttl, shared] = process.argv.slice(2);
const stubName = host === "cursor" ? "agent" : host;
const sup = new br.NativeSupervisor({
  host, home, cwd, ttlMs: Number(ttl), env: process.env, shared: shared === "shared",
  bin: { file: process.execPath, pre: [path.join(here, "stub-native.mjs"), stubName] },
  confirm: async () => true, log: () => {}, agyStdio: "ignore", elevated: false,
});
process.on("message", (m) => {
  if (m.emit) process.emit(m.emit, m.emit);
  else if (m.signalSelf) process.kill(process.pid, m.signalSelf);
  else if (m.throw) setImmediate(() => { throw new Error("selftest: injected crash"); });
  else if (m.wedge) setImmediate(() => { for (;;) { /* wedged */ } });
});
// The CLI's own loop when the bridge has it; otherwise exactly what `cerebro native`
// did before runNative existed (so a failing-first run measures the old code).
const run = br.runNative ?? (async (s, { home: h }) => {
  await s.start();
  const fs = await import("node:fs");
  process.once("SIGINT", () => fs.writeFileSync(path.join(h, ".skillator", "cerebro", "KILL"), "ctrl-c"));
  while (!(await s.tick())) await br.sleep(1000);
  return 0;
});
process.send?.({ up: true });
const code = await run(sup, { home, tickMs: 200 });
process.send?.({ done: code });
process.disconnect?.();
