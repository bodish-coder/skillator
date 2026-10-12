#!/usr/bin/env node
// Stub `pi --mode rpc` that loads the REAL extension named by `-e`, with whatever
// environment the bridge spawned it with, and routes tool calls through it the way
// pi does: every `tool_call` handler runs first; {block:true} stops the tool. The
// extension's ctx.ui.confirm / notify become extension_ui_request lines, as in pi's
// RPC mode. Nothing here fakes an approval: a gate that never registered lets the
// tool "run". Selftest only.
//
//   prompt "TOOL <name> <json input>"  -> reply "ran <name>" or "blocked: <reason>"
//   any other prompt                   -> reply "echo: <prompt>"
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
if (args.includes("--version")) { console.log("stub-pi-ext 0.0.1"); process.exit(0); }
const ext = args[args.indexOf("-e") + 1];
const tools = (args[args.indexOf("--tools") + 1] || "").split(",").filter(Boolean);
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const handlers = {};
const pi = { on: (ev, fn) => { (handlers[ev] ||= []).push(fn); }, sendUserMessage: () => {} };
let uiSeq = 0; const waiting = new Map(); let last = null;
const ctx = {
  ui: {
    confirm: (title, message) => new Promise((resolve) => { const id = `ui-${++uiSeq}`; waiting.set(id, (r) => resolve(!!r.confirmed)); out({ type: "extension_ui_request", id, method: "confirm", title, message }); }),
    notify: (message, level) => out({ type: "extension_ui_request", id: `ui-${++uiSeq}`, method: "notify", message, notifyType: level }),
  },
  isIdle: () => true,
};
await (await import(pathToFileURL(ext).href)).default(pi);
for (const fn of handlers.session_start || []) await fn({}, ctx);

async function runTool(name, input) {
  if (!tools.includes(name)) return `tool not available: ${name}`;
  for (const fn of handlers.tool_call || []) {
    const r = await fn({ toolName: name, toolCallId: `c${uiSeq}`, input }, ctx);
    if (r && r.block) return `blocked: ${r.reason || ""}`;
  }
  return `ran ${name}`;
}
const finish = (text) => { last = text; out({ type: "agent_end", messages: [] }); };
let buf = "";
process.stdin.on("data", (d) => {
  buf += d.toString("utf8"); let i;
  while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) handle(JSON.parse(line)); }
});
async function handle(m) {
  if (m.type === "prompt") {
    out({ type: "response", id: m.id, command: "prompt", success: true });
    out({ type: "agent_start" });
    const t = /^TOOL (\S+) (.*)$/s.exec(m.message);
    if (!t) return finish(`echo: ${m.message}`);
    out({ type: "tool_execution_start", toolCallId: "c1", toolName: t[1], args: JSON.parse(t[2]) });
    finish(await runTool(t[1], JSON.parse(t[2])));
  } else if (m.type === "extension_ui_response") { const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m); } }
  else if (m.type === "get_last_assistant_text") out({ type: "response", id: m.id, command: "get_last_assistant_text", success: true, data: { text: last } });
  else if (m.type === "abort" || m.type === "steer" || m.type === "new_session") out({ type: "response", command: m.type, success: true });
}
