#!/usr/bin/env node
// Stub `codex app-server --listen stdio://` (v2 protocol, no "jsonrpc" field) for the
// selftest. "APPROVAL" raises item/commandExecution/requestApproval; "SECRET" raises
// one whose command reads ~/.ssh/id_ed25519; "SLOW" holds the turn for turn/steer
// or turn/interrupt. STUB_ARGVFILE records argv, so the selftest can check flags.
// STUB_TURN_FAIL_FIRST=<ms>: the first turn/start is rejected after <ms>.
import fs from "node:fs";

const args = process.argv.slice(2);
if (args.includes("--version")) { console.log("codex-cli 0.0.0-stub"); process.exit(0); }
if (process.env.STUB_ARGVFILE) fs.writeFileSync(process.env.STUB_ARGVFILE, JSON.stringify(args));
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
let failedOnce = false;
let seq = 5000, turnN = 0; const waiting = new Map(); let slow = null; let threadReq = null;
let buf = "";
process.stdin.on("data", (d) => {
  buf += d.toString("utf8"); let i;
  while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) handle(JSON.parse(line)); }
});
function complete(turnId, text) {
  out({ method: "item/agentMessage/delta", params: { threadId: "t1", turnId, itemId: "m1", delta: text } });
  out({ method: "item/completed", params: { threadId: "t1", turnId, item: { type: "agentMessage", id: "m1", text } } });
  out({ method: "turn/completed", params: { threadId: "t1", turn: { id: turnId, items: [], status: "completed" } } });
}
function approval(turnId, command, then) {
  const id = ++seq;
  out({ method: "item/started", params: { threadId: "t1", turnId, item: { type: "commandExecution", id: "c1", command } } });
  out({ id, method: "item/commandExecution/requestApproval", params: { threadId: "t1", turnId, itemId: "c1", startedAtMs: Date.now(), command, commandActions: [] } });
  waiting.set(id, then);
}
function handle(m) {
  if (m.id != null && !m.method) { const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m.result); } return; }
  if (m.method === "initialize") return out({ id: m.id, result: { userAgent: "stub" } });
  if (m.method === "initialized") return;
  if (m.method === "thread/start") { threadReq = m.params; if (process.env.STUB_THREADFILE) fs.writeFileSync(process.env.STUB_THREADFILE, JSON.stringify(m.params)); return out({ id: m.id, result: { thread: { id: "t1" }, approvalPolicy: m.params.approvalPolicy, sandbox: m.params.sandbox, cwd: m.params.cwd } }); }
  if (m.method === "turn/start" && process.env.STUB_TURN_FAIL_FIRST && !failedOnce) {
    failedOnce = true; setTimeout(() => out({ id: m.id, error: { code: -32000, message: "turn rejected" } }), Number(process.env.STUB_TURN_FAIL_FIRST) || 0); return;
  }
  if (m.method === "turn/start") {
    const turnId = `turn-${++turnN}`; const text = m.params.input.map((i) => i.text).join("");
    out({ id: m.id, result: { turn: { id: turnId, items: [], status: "inProgress" } } });
    if (/APPROVAL/.test(text)) return approval(turnId, "rm -rf build", (r) => complete(turnId, `decision: ${r.decision}`));
    if (/GRANT/.test(text)) { // a file change that also asks for a session-wide write root (STUB_GRANT_ROOT)
      const id = ++seq; const file = `${threadReq?.cwd || "."}/index.js`;
      out({ method: "item/started", params: { threadId: "t1", turnId, item: { type: "fileChange", id: "f1", changes: [{ path: file, kind: "update" }] } } });
      out({ id, method: "item/fileChange/requestApproval", params: { threadId: "t1", turnId, itemId: "f1", reason: "edit index.js", grantRoot: process.env.STUB_GRANT_ROOT || null } });
      waiting.set(id, (r) => complete(turnId, `decision: ${r.decision}`)); return;
    }
    if (/PERMS/.test(text)) { // extra permissions: a folder read grant plus a network grant
      const id = ++seq; const dir = `${threadReq?.cwd || "."}/sub`;
      out({ id, method: "item/permissions/requestApproval", params: { threadId: "t1", turnId, itemId: "p1", reason: "need a look", permissions: { fileSystem: { read: [dir] }, network: { enabled: true } } } });
      waiting.set(id, (r) => complete(turnId, `perms: ${JSON.stringify(r)}`)); return;
    }
    if (/SECRET/.test(text)) return approval(turnId, "cat ~/.ssh/id_ed25519", (r) => complete(turnId, `decision: ${r.decision}`));
    if (/SLOW/.test(text)) { slow = { turnId, text, steers: [] }; return; }
    return complete(turnId, `echo: ${text}`);
  }
  if (m.method === "turn/steer") {
    out({ id: m.id, result: { turnId: m.params.expectedTurnId } });
    if (slow && slow.turnId === m.params.expectedTurnId) { const s = slow; slow = null; complete(s.turnId, `steered: ${s.text} + ${m.params.input.map((i) => i.text).join("")}`); }
    return;
  }
  if (m.method === "turn/interrupt") { out({ id: m.id, result: {} }); if (slow) { const s = slow; slow = null; complete(s.turnId, "interrupted"); } return; }
  if (m.id != null) out({ id: m.id, error: { code: -32601, message: "no such method" } });
}
