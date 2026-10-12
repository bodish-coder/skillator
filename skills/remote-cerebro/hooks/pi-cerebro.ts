// remote-cerebro pi extension: the gate (own and attach mode) and the attach channel.
//
// NEVER install this into .pi/extensions/ or ~/.pi/agent/extensions/: pi auto-loads
// those into every session. `cerebro arm pi` launches pi with
// `--no-extensions -e <this file>`; loaded any other way it blocks every tool and says so.
//
// Own mode  (CEREBRO_MODE=own, pi --mode rpc; set by the bridge): the gate's confirms become
//   extension_ui_request events, which the bridge sends to the phone.
// Attach mode (CEREBRO_MODE=attach, interactive pi): the gate asks the desk AND the
//   phone, first answer wins; phone prompts arrive through the bridge's IPC folder.
//
// Types are erasable-only so Node can import this file directly in the selftest.

import net from "node:net";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { attachAuthorize, gateDecide, lineSplitter, scrubEnv, secretRoots } from "./cerebro-core.mjs";

export default function cerebro(pi: any) {
  const self = fileURLToPath(import.meta.url);
  const taken = scrubEnv(process.env); // before any tool runs: `env` in bash cannot see CEREBRO_*
  const mode = taken.CEREBRO_MODE;
  const home = taken.CEREBRO_HOME || os.homedir();
  const say = (ctx: any, msg: string, level = "info") => { try { ctx?.ui?.notify(msg, level); } catch { /* no UI */ } };

  const auth = attachAuthorize({ home, env: taken, selfPath: self });
  if (auth.reason === "auto-discovery-dir" || (mode !== "own" && mode !== "attach")) {
    // Fail CLOSED. This file is only ever meant to be loaded by `cerebro arm`
    // (pi --no-extensions -e <this>), which always sets the mode. Loaded without one
    // (a lost env, a stray copy in an auto-discovery folder, a hand-run `pi -e`),
    // it blocks every tool instead of letting them run ungated.
    const why = auth.reason === "auto-discovery-dir" ? auth.notice : "cerebro: not armed (no CEREBRO_MODE); every tool is blocked. Launch pi through `cerebro arm pi`.";
    pi.on("session_start", (_e: any, ctx: any) => say(ctx, why, "warning"));
    pi.on("tool_call", async () => ({ block: true, reason: why }));
    return;
  }

  const cwd = taken.CEREBRO_CWD || process.cwd();
  const profile = taken.CEREBRO_PROFILE || "read";
  // Deny list from the real home too, so a CEREBRO_HOME override can only add paths.
  const roots = [...new Set([...secretRoots(home, process.env), ...secretRoots(os.homedir(), process.env)])];
  let channel: any = null;
  let lastCtx: any = null;
  let timer: any = null;

  if (mode === "attach") {
    if (auth.ok && taken.CEREBRO_IPC) channel = ipcChannel(taken.CEREBRO_IPC, taken.CEREBRO_ARM_NONCE);
    else pi.on("session_start", (_e: any, ctx: any) => say(ctx, auth.notice || "cerebro: not armed", "warning"));
  }

  async function askBoth(ctx: any, title: string, detail: string): Promise<boolean> {
    if (!channel) return !!(await ctx.ui.confirm(title, detail));
    const ac = new AbortController();
    const id = channel.ask(title, detail);
    // "unavailable" (channel error, unpaired, bridge gone): the phone did not answer,
    // so it never wins the race; the desk alone decides.
    const phone = channel.waitAnswer(id).then((d: string) => {
      if (d !== "unavailable") return { who: "phone", ok: d === "allow" };
      say(ctx, "cerebro: phone unavailable; answer here");
      return new Promise(() => {});
    });
    const desk = Promise.resolve(ctx.ui.confirm(title, detail, { signal: ac.signal })).then((ok: any) => ({ who: "desk", ok: !!ok }));
    const first: any = await Promise.race([phone, desk]);
    if (first.who === "phone") { ac.abort(); say(ctx, `cerebro: answered on the phone: ${first.ok ? "allowed once" : "denied"}`); }
    else { channel.localAnswer(id, first.ok ? "allow" : "deny"); channel.forget(id); }
    return first.ok;
  }

  pi.on("tool_call", async (event: any, ctx: any) => {
    const d = gateDecide(event.toolName, event.input, { cwd, home, env: process.env, profile, roots });
    if (d.action === "allow") return undefined;
    if (d.action === "block") return { block: true, reason: `cerebro: refused (${d.reason}) ${d.detail}` };
    const ok = await askBoth(ctx, "cerebro: allow once?", d.detail);
    return ok ? undefined : { block: true, reason: "cerebro: denied" };
  });

  if (!channel) return;

  pi.on("session_start", (_e: any, ctx: any) => {
    lastCtx = ctx;
    say(ctx, "cerebro: ARMED - this session is driven from your phone too. /kill there, or `cerebro stop` here.", "warning");
    timer = setInterval(() => {
      const a = attachAuthorize({ home, env: taken, selfPath: self });
      if (!a.ok) { say(lastCtx, `cerebro: ${a.reason}; channel closed`, "warning"); channel.close(); clearInterval(timer); channel = null; return; }
      for (const m of channel.drain()) {
        if (m.type === "prompt") {
          const idle = typeof lastCtx?.isIdle === "function" ? lastCtx.isIdle() : true;
          if (idle) pi.sendUserMessage(m.text); else pi.sendUserMessage(m.text, { deliverAs: "steer" });
        } else if (m.type === "abort") lastCtx?.abort?.();
        else if (m.type === "kill") { channel.close(); clearInterval(timer); channel = null; say(lastCtx, "cerebro: disarmed from the phone", "warning"); return; }
      }
    }, 300);
    timer.unref?.();
  });
  pi.on("agent_end", (event: any) => {
    if (!channel) return;
    const msgs = (event?.messages || []).filter((m: any) => m?.role === "assistant");
    const last = msgs[msgs.length - 1];
    const text = typeof last?.content === "string" ? last.content
      : (last?.content || []).filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n");
    channel.reply(text || "(no text)");
  });
  pi.on("session_shutdown", () => { if (timer) clearInterval(timer); if (channel) { channel.shutdown(); channel = null; } });
}

/** The extension end of the attach channel: a local socket (a named pipe on Windows,
 *  a Unix socket in a 0700 folder elsewhere) the bridge listens on. The first line is
 *  {type:"hello", nonce} with the arm token; the bridge sends nothing before it. No
 *  prompt, ask or reply body is ever written to a file. When the socket goes away,
 *  every pending ask is answered "unavailable": the desk's own confirm decides. */
export function ipcChannel(addr: string, nonce: string) {
  let seq = 0; let open = true; let connected = false;
  const answers = new Map<string, string>(); const waiters = new Map<string, (d: string) => void>();
  const inbox: any[] = []; const outq: string[] = [];
  // The bridge is gone: no phone answer will come. "unavailable", not "deny": the desk decides.
  const denyAll = () => { for (const [id, w] of waiters) { waiters.delete(id); w("unavailable"); } };
  const sock = net.createConnection(addr);
  sock.on("connect", () => { sock.write(JSON.stringify({ type: "hello", nonce }) + "\n"); connected = true; for (const l of outq.splice(0)) sock.write(l); });
  sock.on("error", () => { open = false; denyAll(); });
  sock.on("close", () => { open = false; denyAll(); });
  sock.on("data", lineSplitter((l: string) => {
    let m: any; try { m = JSON.parse(l); } catch { return; }
    if (m.type === "answer") { const w = waiters.get(m.id); if (w) { waiters.delete(m.id); w(m.decision); } else answers.set(m.id, m.decision); }
    else inbox.push(m);
  }));
  const put = (o: any) => {
    if (!open) return;
    const line = JSON.stringify(o) + "\n";
    if (connected) sock.write(line); else outq.push(line);
  };
  return {
    ask(title: string, detail: string) { const id = `ask-${process.pid}-${Date.now()}-${++seq}`; put({ type: "ask", id, title, detail }); return id; },
    waitAnswer(id: string) {
      return new Promise<string>((resolve) => {
        if (answers.has(id)) { const d = answers.get(id) as string; answers.delete(id); return resolve(d); }
        if (!open) return resolve("unavailable");
        waiters.set(id, resolve);
      });
    },
    forget(id: string) { waiters.delete(id); },
    localAnswer(id: string, decision: string) { put({ type: "local-answer", id, decision }); },
    reply(text: string) { put({ type: "reply", text }); },
    drain() { return inbox.splice(0); },
    close() { open = false; denyAll(); sock.destroy(); },
    shutdown() { put({ type: "shutdown" }); open = false; sock.end(); },
  };
}
