#!/usr/bin/env node
// Stub `pi --mode rpc` for the selftest. Echoes prompts; "APPROVAL" raises one
// extension_ui_request confirm; "SLOW" keeps the turn streaming until steer/abort;
// "PROMPTFAIL" answers the prompt command with success:false (no turn starts).
// STUB_PIDFILE: write "<own pid> <grandchild pid>" after spawning a grandchild,
// so the selftest can prove /kill takes the whole tree. STUB_ENVFILE: dump env keys.
import fs from "node:fs";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
if (args.includes("--version")) { console.log("stub-pi 0.0.1"); process.exit(0); }
if (process.env.STUB_ARGVFILE) fs.writeFileSync(process.env.STUB_ARGVFILE, JSON.stringify(args));
if (process.env.STUB_ENVFILE) fs.writeFileSync(process.env.STUB_ENVFILE, JSON.stringify(Object.keys(process.env)));
if (process.env.STUB_PIDFILE) {
  const g = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  fs.writeFileSync(process.env.STUB_PIDFILE, `${process.pid} ${g.pid}`);
}
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
let last = null, streaming = null, uiSeq = 0; const waiting = new Map();
let buf = "";
process.stdin.on("data", (d) => {
  buf += d.toString("utf8"); let i;
  while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) handle(JSON.parse(line)); }
});
function finish(text) { last = text; streaming = null; out({ type: "agent_end", messages: [] }); }
function handle(m) {
  if (m.type === "prompt") {
    if (/PROMPTFAIL/.test(m.message)) return out({ type: "response", id: m.id, command: "prompt", success: false, error: "model not available" });
    out({ type: "response", id: m.id, command: "prompt", success: true });
    out({ type: "agent_start" });
    if (/APPROVAL/.test(m.message)) {
      const id = `ui-${++uiSeq}`;
      out({ type: "tool_execution_start", toolCallId: "c1", toolName: "bash", args: { command: "rm -rf build" } });
      out({ type: "extension_ui_request", id, method: "confirm", title: "cerebro: allow once?", message: "bash: rm -rf build" });
      waiting.set(id, (r) => finish(r.confirmed ? "approved: ran rm -rf build" : "denied: did not run"));
      return;
    }
    if (/NONJSON/.test(m.message)) { // a non-JSON stdout line whose secret straddles column 120
      process.stdout.write("x".repeat(100) + "ghp_abcdefghijklmnopqrstuvwxyz0123456789" + String.fromCharCode(10));
      if (process.env.DEPLOY_TOKEN) process.stdout.write("y".repeat(85) + process.env.DEPLOY_TOKEN + String.fromCharCode(10));
    }
    if (/SLOW/.test(m.message)) { streaming = { text: m.message, steers: [] }; return; }
    finish(`echo: ${m.message}`);
  } else if (m.type === "steer") {
    out({ type: "response", command: "steer", success: true });
    if (streaming) { streaming.steers.push(m.message); finish(`steered: ${streaming.text} + ${streaming.steers.join(",")}`); }
  } else if (m.type === "abort") {
    out({ type: "response", command: "abort", success: true });
    if (streaming) finish("aborted by rpc");
  } else if (m.type === "new_session") out({ type: "response", command: "new_session", success: true, data: { cancelled: false } });
  else if (m.type === "get_last_assistant_text") out({ type: "response", id: m.id, command: "get_last_assistant_text", success: true, data: { text: last } });
  else if (m.type === "extension_ui_response") { const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m); } }
}
