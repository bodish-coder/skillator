#!/usr/bin/env node
// Stub ACP agent (gemini --acp / cursor agent acp) for the selftest. JSON-RPC 2.0 on
// stdio. "APPROVAL" raises an execute permission; "READ:<path>" raises a read
// permission for <path> (and, if allowed, "reads" it); "SLOW" holds the turn until
// session/cancel. A prompt naming a file path (the doctor's ACP proof) raises a read
// permission for that path, like a real agent's read_file would. STUB_PROOF=fail-after-other:
// the proof prompt asks for an unrelated path, then the turn fails; STUB_PROOF=upper: the
// outside path is sent upper-cased.
import fs from "node:fs";

const args = process.argv.slice(2);
if (args.includes("--version")) { console.log("stub-acp 1.0.0"); process.exit(0); }
if (process.env.STUB_ARGVFILE) fs.writeFileSync(process.env.STUB_ARGVFILE, JSON.stringify(args));
const out = (o) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...o }) + "\n");
let seq = 1000; const waiting = new Map(); let slow = null;
let buf = "";
process.stdin.on("data", (d) => {
  buf += d.toString("utf8"); let i;
  while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) handle(JSON.parse(line)); }
});
const chunk = (text) => out({ method: "session/update", params: { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } });
const OPTIONS = [
  { optionId: "allow-once", name: "Allow", kind: "allow_once" },
  { optionId: "allow-always", name: "Always allow", kind: "allow_always" },
  { optionId: "reject-once", name: "Reject", kind: "reject_once" },
];
function permission(toolCall, then) {
  const id = ++seq;
  out({ method: "session/update", params: { sessionId: "s1", update: { sessionUpdate: "tool_call", toolCallId: "t1", title: toolCall.title, kind: toolCall.kind } } });
  out({ id, method: "session/request_permission", params: { sessionId: "s1", toolCall: { toolCallId: "t1", ...toolCall }, options: OPTIONS } });
  waiting.set(id, then);
}
// STUB_HANG=<method>[#n]: never answer the nth call of <method> (default: every call).
// STUB_EXIT_ON=<method>[#n]: exit(3) on the nth call, leaving the request unanswered.
const calls = {};
const hit = (spec, method) => { if (!spec) return false; const [m, n] = spec.split("#"); return m === method && (!n || Number(n) === calls[method]); };
function handle(m) {
  if (m.method) calls[m.method] = (calls[m.method] || 0) + 1;
  if (m.method && hit(process.env.STUB_EXIT_ON, m.method)) process.exit(3);
  if (m.method && hit(process.env.STUB_HANG, m.method)) return;
  if (m.id != null && !m.method) { const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m.result); } return; }
  if (m.method === "initialize") return out({ id: m.id, result: { protocolVersion: 1, agentCapabilities: {} } });
  if (m.method === "session/new") return out({ id: m.id, result: { sessionId: "s1" } });
  if (m.method === "session/cancel") { if (slow) { chunk("cancelled"); out({ id: slow, result: { stopReason: "cancelled" } }); slow = null; } return; }
  if (m.method === "session/prompt") {
    const text = m.params.prompt.map((p) => p.text).join("");
    const picked = (r) => r?.outcome?.outcome === "selected" ? r.outcome.optionId : "cancelled";
    if (/APPROVAL/.test(text)) return permission({ title: "rm -rf build", kind: "execute", rawInput: { command: "rm -rf build" } }, (r) => { chunk(`permission: ${picked(r)}`); out({ id: m.id, result: { stopReason: "end_turn" } }); });
    const pm = /Read the file (\S+) and reply/.exec(text);
    if (pm && process.env.STUB_PROOF === "fail-after-other") return permission({ title: "read unrelated.txt", kind: "read", locations: [{ path: "unrelated.txt" }] }, () => out({ id: m.id, error: { code: -32000, message: "auth failed" } }));
    if (pm && process.env.STUB_PROOF === "upper") return permission({ title: "read", kind: "read", locations: [{ path: pm[1].toUpperCase() }] }, () => { chunk("read denied"); out({ id: m.id, result: { stopReason: "end_turn" } }); });
    const rm = /READ:(\S+)/.exec(text) || pm;
    if (rm) return permission({ title: `read ${rm[1]}`, kind: "read", locations: [{ path: rm[1] }], rawInput: { file_path: rm[1] } }, (r) => {
      const ok = picked(r) === "allow-once";
      let body = ""; if (ok) { try { body = fs.readFileSync(rm[1], "utf8").split(/\r?\n/)[0]; } catch { body = "(unreadable)"; } }
      chunk(ok ? `read allowed: ${body}` : `read denied (${picked(r)})`); out({ id: m.id, result: { stopReason: "end_turn" } });
    });
    if (/SLOW/.test(text)) { slow = m.id; return; }
    chunk(`echo: ${text}`);
    return out({ id: m.id, result: { stopReason: "end_turn" } });
  }
  if (m.id != null) out({ id: m.id, error: { code: -32601, message: "no such method" } });
}
