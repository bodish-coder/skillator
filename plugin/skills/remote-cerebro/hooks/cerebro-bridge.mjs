#!/usr/bin/env node
// remote-cerebro bridge: drive codex / cursor-agent / pi / gemini from a phone.
//
//   cerebro doctor [--acp-proof gemini|cursor]
//   cerebro native codex|cursor|agy [--ttl 2h] [--shared]
//   cerebro arm <pi|gemini|cursor|codex> [--mode own|attach] [--cwd DIR] [--ttl 2h] [--idle 30m] [--profile read|write] [--channel telegram|file:DIR]
//   cerebro status | stop [--drill] | selftest
//
// One file, Node >= 20 built-ins only. The policy (denylist, gate, redaction,
// refused flags, widening configs) lives in cerebro-core.mjs and is shared with the
// pi extension. Design: docs/plans/PLAN-remote-cli.md (F34), name per owner ruling.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  IS_WIN, VERSION, stateDir, credsPath, codexHome, Audit, redact, chunkText, checkSpawnArgv,
  checkWidening, isElevated, requestPolicy, secretRoots, lineSplitter, writeArmToken, deleteArmToken,
  scrubEnv, parseEnvFile, checkCredsFile, pidAlive, killTree, which, PROFILE_TOOLS, parseTomlLite,
  procIdentity, procIdentityAsync, icaclsVerdict, sleepSync, allRoots, realResolve, isUnder,
} from "./cerebro-core.mjs";

export const HOOKS = path.dirname(fileURLToPath(import.meta.url));
const MAX_TTL = 12 * 3600e3;
const ASK_TIMEOUT = 10 * 60e3;
const RPC_TIMEOUT = 60e3; // a control rpc (initialize, session/new, thread/start, turn/*) the host never answers
const COMMANDS = ["/status", "/abort", "/new", "/kill", "/pair"];

export class Refused extends Error { constructor(kind, msg) { super(msg); this.kind = kind; } }

// ------------------------------------------------------------------ durations --
export function parseDuration(s, dflt) {
  if (s == null) return dflt;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(String(s).trim());
  if (!m) throw new Error(`bad duration: ${s}`);
  return Number(m[1]) * { ms: 1, s: 1e3, m: 60e3, h: 3600e3 }[m[2] || "m"];
}

// ------------------------------------------------------------------ spawning --
/** bin = {file, pre[]}. A .cmd/.bat shim goes through cmd.exe, so arguments that
 *  carry cmd metacharacters are refused rather than quoted. */
export function spawnBin(bin, args, { cwd, env, stdio = ["pipe", "pipe", "pipe"] } = {}) {
  const all = [...(bin.pre || []), ...args];
  const bad = checkSpawnArgv(all);
  if (bad.length) throw new Refused("refused:yolo", `refused flag in spawn line: ${bad.join(" ")} (no override)`);
  if (IS_WIN && /\.(cmd|bat)$/i.test(bin.file)) {
    for (const a of [bin.file, ...all]) if (/[%^&|<>"\r\n]/.test(a)) throw new Error(`refusing to pass ${JSON.stringify(a)} through cmd.exe`);
    const line = [bin.file, ...all].map((a) => `"${a}"`).join(" ");
    return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${line}"`], { cwd, env, stdio, windowsVerbatimArguments: true, windowsHide: true });
  }
  return spawn(bin.file, all, { cwd, env, stdio, detached: !IS_WIN, windowsHide: true });
}
function runBin(bin, args, { cwd, env, timeout = 20000 } = {}) {
  const all = [...(bin.pre || []), ...args];
  const bad = checkSpawnArgv(all);
  if (bad.length) throw new Refused("refused:yolo", `refused flag: ${bad.join(" ")}`);
  let r;
  if (IS_WIN && /\.(cmd|bat)$/i.test(bin.file)) {
    for (const a of [bin.file, ...all]) if (/[%^&|<>"\r\n]/.test(a)) throw new Error(`refusing to pass ${JSON.stringify(a)} through cmd.exe`);
    const line = [bin.file, ...all].map((a) => `"${a}"`).join(" ");
    r = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${line}"`], { cwd, env, encoding: "utf8", timeout, windowsVerbatimArguments: true, windowsHide: true });
  } else r = spawnSync(bin.file, all, { cwd, env, encoding: "utf8", timeout, windowsHide: true });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || ""), stdout: r.stdout || "" };
}

const HOST_BIN_NAMES = { pi: ["pi"], gemini: ["gemini"], codex: ["codex"], cursor: ["cursor-agent"], agy: ["agy"] };
export function resolveHostBin(host, env = process.env) {
  // Windows: every cursor-agent.exe / agent.exe in Cursor's install is the bundled Node; only the .cmd is the CLI.
  const look = IS_WIN && host === "cursor" ? { ...env, PATHEXT: ".CMD" } : env;
  for (const n of HOST_BIN_NAMES[host] || []) { const f = which(n, look); if (f) return { file: f, pre: [] }; }
  return null;
}
export const looksLikeNode = (version) => /^v\d+\.\d+\.\d+$/.test(String(version).trim());
export function childEnv(base = process.env, extra = {}) {
  const e = { ...base }; scrubEnv(e); return { ...e, ...extra };
}

/** The exact spawn line per host and mode: the host's own approvals on, the read
 *  policy loaded, no yolo anywhere. */
export function hostSpawn(host, { mode = "own", profile = "read" } = {}) {
  const ext = path.join(HOOKS, "pi-cerebro.ts");
  if (host === "pi") {
    const tools = (PROFILE_TOOLS[profile] || PROFILE_TOOLS.read).join(",");
    return mode === "attach"
      ? ["--no-extensions", "-e", ext, "--tools", tools]
      : ["--mode", "rpc", "--no-extensions", "-e", ext, "--tools", tools];
  }
  if (host === "gemini") return ["--acp", "--approval-mode", "default", "--policy", path.join(HOOKS, "cerebro-gemini.toml")];
  if (host === "cursor") return ["acp"];
  if (host === "codex") return ["app-server", "--listen", "stdio://", "-c", "approval_policy=on-request", "-c", `sandbox_mode=${profile === "write" ? "workspace-write" : "read-only"}`];
  throw new Error(`unknown host ${host}`);
}

// ------------------------------------------------------------------ channels --
/** The `file` channel: a directory of Telegram-shaped JSON updates (inbox/) and a
 *  JSONL outbox. Selftest channel: same user, local disk only (checkFileChannelDir). */
export class FileChannel {
  constructor(dir) {
    this.dir = dir; this.inbox = path.join(dir, "inbox"); this.outbox = path.join(dir, "outbox.jsonl"); this.seq = 0;
    fs.mkdirSync(this.inbox, { recursive: true, mode: 0o700 });
    this.key = `file:${realResolve(path.resolve(dir))}`; // whose update_ids the stored offset counts
  }
  async poll() {
    const out = [];
    for (const n of fs.readdirSync(this.inbox).sort()) {
      const f = path.join(this.inbox, n);
      try { out.push(JSON.parse(fs.readFileSync(f, "utf8"))); } catch { /* half-written: next cycle */ continue; }
      fs.unlinkSync(f);
    }
    return out;
  }
  #put(o) { fs.appendFileSync(this.outbox, JSON.stringify(o) + "\n", { mode: 0o600 }); }
  async send(chatId, text) { const msgId = ++this.seq; this.#put({ op: "send", chatId, msgId, text }); return msgId; }
  async ask(chatId, text, buttons) { const msgId = ++this.seq; this.#put({ op: "ask", chatId, msgId, text, buttons }); return msgId; }
  async editButtons(chatId, msgId, text) { this.#put({ op: "edit", chatId, msgId, text, buttons: [] }); }
  async answerCallback(id, text) { this.#put({ op: "answerCallback", id, text }); }
}

/** Telegram Bot API, outbound long-polling only. The token never reaches argv, a
 *  log line or an error message. */
export class TelegramChannel {
  constructor(token, { fetchImpl = globalThis.fetch, timeoutS = 25 } = {}) { this.token = token; this.fetch = fetchImpl; this.timeoutS = timeoutS; }
  get key() { return `telegram:${String(this.token).split(":")[0]}`; } // the bot id: update_ids are per bot
  async api(method, body) {
    let r;
    try {
      r = await this.fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        signal: AbortSignal.timeout((this.timeoutS + 10) * 1000),
      });
    } catch (e) { throw new Error(`telegram ${method}: ${redact(e?.name || "error", { token: this.token })}`); }
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(`telegram ${method}: ${redact(j.description || r.status, { token: this.token })}`);
    return j.result;
  }
  async poll(offset) { return this.api("getUpdates", { offset: offset + 1, timeout: this.timeoutS, allowed_updates: ["message", "edited_message", "callback_query", "channel_post"] }); }
  async send(chatId, text) { return (await this.api("sendMessage", { chat_id: chatId, text })).message_id; }
  async ask(chatId, text, buttons) {
    return (await this.api("sendMessage", { chat_id: chatId, text, reply_markup: { inline_keyboard: [buttons.map((b) => ({ text: b.text, callback_data: b.data }))] } })).message_id;
  }
  async editButtons(chatId, msgId, text) { await this.api("editMessageText", { chat_id: chatId, message_id: msgId, text, reply_markup: { inline_keyboard: [] } }); }
  async answerCallback(id, text) { await this.api("answerCallbackQuery", { callback_query_id: id, text }); }
}

// ------------------------------------------------------------------- session --
/** The replay offset is per channel: update_ids are only ordered within one bot (or
 *  one file channel), so one channel's offset must never drop another's updates.
 *  The file name is a hash of the channel key (no path or bot id on disk). */
export function offsetFile(home, channel) {
  const key = channel?.key || "default";
  return path.join(stateDir(home), `offset-${crypto.createHash("sha256").update(key).digest("hex").slice(0, 16)}`);
}
const LEGACY_OFFSET = (home) => path.join(stateDir(home), "offset"); // one file for every channel, before per-channel offsets

/** Auth, pairing, nonce-bound approvals, rate limit and the dead-man, for one
 *  arming. Everything inbound goes through handle(); nothing else reads updates. */
export class Session {
  constructor(o) {
    Object.assign(this, {
      pairWindowMs: 5 * 60e3, rateMax: 20, rateWindowMs: 10 * 60e3, askTimeoutMs: ASK_TIMEOUT, sleepGapMs: 90e3,
      mirror: () => {}, onPrompt: () => {}, onCommand: () => {}, onDisarm: () => {}, onLocalCancel: null,
      mirrorBodies: true, // false in attach mode: mirror.log gets metadata only, never a prompt, ask or reply body
    }, o);
    this.armedAt = this.clock();
    this.code = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
    this.paired = false; this.chatId = null; this.badPairs = 0; this.lastInbound = this.armedAt;
    this.pending = new Map(); this.used = new Set(); this.inbound = []; this.disarmed = null;
    this.offsetFile = offsetFile(this.home, this.channel);
    const read = (f) => { try { return Number(fs.readFileSync(f, "utf8")) || 0; } catch { return null; } };
    // A Telegram bot's first arming after the upgrade carries the old shared offset on.
    this.offset = read(this.offsetFile) ?? (this.channel instanceof TelegramChannel ? read(LEGACY_OFFSET(this.home)) : null) ?? 0;
    this.lastTick = null; this.wokeAt = null;
  }
  #drop(reason, from = null) { this.audit.write("dropped", { dir: "in", from, reason }); this.mirror(`[drop] ${reason}`); }
  #detach(p) { Promise.resolve(p).catch((e) => this.mirror(`[command] failed: ${this.redact(e?.message || String(e))}`)); }
  redact(s) { return redact(s, this.redactCtx); }
  #body(s, what) { return this.mirrorBodies ? this.redact(s) : `(${what}, ${Buffer.byteLength(String(s ?? ""))} bytes)`; }

  checkDeadman(now) {
    const kill = path.join(stateDir(this.home), "KILL");
    if (fs.existsSync(kill)) { try { fs.unlinkSync(kill); } catch { /* raced */ } return "kill-file"; }
    if (now >= this.armedAt + this.ttlMs) return "ttl";
    if (!this.paired && now >= this.armedAt + this.pairWindowMs) return "pair-timeout";
    if (this.paired && now - this.lastInbound >= this.idleMs) return "idle";
    return null;
  }
  async step() {
    if (this.disarmed) return;
    const now = this.clock();
    if (this.lastTick != null && now - this.lastTick > this.sleepGapMs) { this.wokeAt = now; this.mirror(`[wake] ${Math.round((now - this.lastTick) / 1000)} s without a poll`); }
    this.lastTick = now;
    const dead = this.checkDeadman(now); // wall clock first, before any backlog runs
    if (dead) return this.disarm(dead);
    for (const [nonce, p] of this.pending) if (now >= p.deadline) await this.#resolve(nonce, "deny", "no answer in 10 min: denied");
    let updates;
    try { updates = await this.channel.poll(this.offset); this.backoff = 0; }
    catch (e) { this.backoff = Math.min(60e3, (this.backoff || 1000) * 2); this.mirror(`[channel] ${e.message}; retry in ${this.backoff / 1000}s`); return; }
    for (const u of updates || []) { await this.handle(u); if (this.disarmed) return; }
    this.wokeAt = null;
  }
  async handle(u) {
    if (typeof u.update_id !== "number") return this.#drop("malformed");
    if (u.update_id <= this.offset) return this.#drop("replay");
    this.offset = u.update_id;
    try { fs.mkdirSync(path.dirname(this.offsetFile), { recursive: true, mode: 0o700 }); fs.writeFileSync(this.offsetFile, String(this.offset)); } catch { /* best effort */ }
    if (u.callback_query) return this.handleCallback(u.callback_query);
    if (u.edited_message) return this.#drop("edited", u.edited_message.from?.id);
    if (u.channel_post) return this.#drop("channel");
    const m = u.message; if (!m) return this.#drop("unsupported");
    const from = m.from?.id;
    if (from !== this.allowedUserId) return this.#drop("foreign-user", from); // never answered: no oracle
    if (m.chat?.type !== "private" || m.chat.id !== from) return this.#drop("group", from);
    if (m.forward_origin || m.forward_from || m.forward_from_chat || m.forward_date) return this.#drop("forwarded", from);
    if ((m.date || 0) * 1000 < Math.floor(this.armedAt / 1000) * 1000) return this.#drop("pre-arm", from);
    const now = this.clock();
    this.inbound = this.inbound.filter((t) => now - t < this.rateWindowMs); this.inbound.push(now);
    if (this.inbound.length > this.rateMax) return this.disarm("rate-limit");
    const text = String(m.text || "").trim();
    if (!this.paired) {
      const pm = /^\/pair\s+(\d{6})$/.exec(text);
      const ok = pm && crypto.timingSafeEqual(Buffer.from(pm[1]), Buffer.from(this.code));
      if (ok) {
        this.paired = true; this.chatId = m.chat.id; this.lastInbound = now;
        this.audit.write("pair", { dir: "in", from }); this.mirror("[pair] paired");
        await this.channel.send(this.chatId, "cerebro: paired. Send a prompt. /status /abort /new /kill");
        return;
      }
      this.badPairs++; this.#drop("bad-pair", from);
      if (this.badPairs >= 3) return this.disarm("pair-failed");
      return;
    }
    if (m.chat.id !== this.chatId) return this.#drop("wrong-chat", from);
    this.lastInbound = now;
    if (this.wokeAt != null && (m.date || 0) * 1000 < this.wokeAt) {
      this.#drop("asleep-backlog", from);
      await this.send(`received while asleep, resend to run: ${text.slice(0, 200)}`, "notice");
      return;
    }
    if (text.startsWith("/")) {
      // audit.log and the mirror get the command CLASS: a known command or "other",
      // never the typed token (a pasted secret after a slash is a body).
      const typed = text.split(/\s+/)[0].toLowerCase();
      const cmd = COMMANDS.includes(typed) ? typed : "other";
      this.audit.write("command", { dir: "in", from, reason: cmd });
      this.mirror(`[REMOTE] <- ${cmd === "other" ? "(unknown command)" : cmd}`);
      if (cmd === "/kill") return this.disarm("phone-kill");
      // Commands that reach the host run detached: an adapter call that never returns
      // must not stop this loop from reading the next update (a /kill).
      if (cmd === "/abort") { await this.consumeAll("aborted"); return this.#detach(this.onCommand("abort")); }
      if (["/status", "/new"].includes(cmd)) return this.#detach(this.onCommand(cmd.slice(1)));
      if (cmd === "/pair") return this.send("already paired", "notice");
      return this.send("commands: /status /abort /new /kill", "notice");
    }
    this.audit.write("prompt", { dir: "in", from, body: text });
    this.mirror(`[REMOTE] <- ${this.#body(text, "prompt")}`);
    return this.onPrompt(text);
  }
  async handleCallback(cq) {
    const m = /^([ad]):([0-9a-f]{32})$/.exec(String(cq.data || ""));
    const nonce = m?.[2];
    const okFrom = cq.from?.id === this.allowedUserId;
    const okChat = cq.message?.chat?.type === "private" && cq.message.chat.id === this.chatId;
    const live = nonce && this.pending.has(nonce) && !this.used.has(nonce);
    if (!m || !okFrom || !okChat || !live) {
      this.audit.write("dropped", { dir: "in", from: cq.from?.id ?? null, reason: "stale-callback" });
      this.mirror(`[drop] stale-callback`);
      try { await this.channel.answerCallback(cq.id, "expired"); } catch { /* best effort */ }
      if (okFrom && okChat && cq.message?.message_id && nonce && this.used.has(nonce)) {
        try { await this.channel.editButtons(this.chatId, cq.message.message_id, "expired"); } catch { /* best effort */ }
      }
      return;
    }
    this.lastInbound = this.clock();
    const decision = m[1] === "a" ? "allow" : "deny";
    this.audit.write("answer", { dir: "in", from: cq.from.id, reason: decision });
    try { await this.channel.answerCallback(cq.id, decision === "allow" ? "allowed once" : "denied"); } catch { /* best effort */ }
    await this.#resolve(nonce, decision, decision === "allow" ? "allowed once" : "denied");
  }
  async #resolve(nonce, decision, outcome) {
    const p = this.pending.get(nonce); if (!p) return;
    this.pending.delete(nonce); this.used.add(nonce);
    this.mirror(`[approval] ${outcome}`);
    try { await this.channel.editButtons(this.chatId, p.msgId, `${p.text}\n\n-> ${outcome}`); } catch { /* best effort */ }
    p.resolve(decision);
  }
  /** One approval. Only allow-once and deny are ever offered. Resolves "allow",
   *  "deny" (the phone said no, or did not answer in time) or "unavailable" (no
   *  phone to ask: unpaired, disarmed, or the channel failed). Every caller treats
   *  anything but "allow" as a refusal; attach mode then leaves it to the desk. */
  async ask(title, detail, meta = {}) {
    if (this.disarmed || !this.paired) return "unavailable";
    const nonce = crypto.randomBytes(16).toString("hex");
    const text = this.redact(`${title}\n${detail || ""}`.trim());
    this.audit.write("ask", { dir: "out", body: text });
    this.mirror(`[REMOTE] -> ask: ${this.#body(text, "approval")}`);
    return new Promise(async (resolve) => {
      const entry = { ...meta, resolve, text, deadline: this.clock() + this.askTimeoutMs, msgId: null };
      this.pending.set(nonce, entry);
      try { entry.msgId = await this.channel.ask(this.chatId, text, [{ text: "Allow once", data: `a:${nonce}` }, { text: "Deny", data: `d:${nonce}` }]); }
      catch { await this.#resolve(nonce, "unavailable", "channel error: phone unavailable"); }
    });
  }
  /** The desk answered first (attach mode): the phone's buttons go away. */
  async cancelAsk(predicate, outcome) { for (const [n, p] of this.pending) if (predicate(p)) await this.#resolve(n, "deny", outcome); }
  async consumeAll(reason) { for (const n of [...this.pending.keys()]) await this.#resolve(n, "deny", `${reason}: denied`); }
  async send(text, kind = "reply") {
    if (!this.paired || this.chatId == null) return;
    const clean = this.redact(text);
    if (kind === "reply") this.audit.write("reply", { dir: "out", body: clean });
    this.mirror(`[REMOTE] -> ${this.#body(clean.length > 300 ? clean.slice(0, 300) + "..." : clean, kind)}`);
    for (const c of chunkText(clean)) { try { await this.channel.send(this.chatId, c); } catch (e) { this.mirror(`[channel] ${e.message}`); } }
  }
  async disarm(reason) {
    if (this.disarmed) return;
    this.disarmed = reason;
    await this.consumeAll(reason);
    this.audit.write("kill", { reason });
    this.mirror(`[disarm] ${reason}`);
    if (this.paired) { try { await this.channel.send(this.chatId, `cerebro: disarmed (${reason}). A new arming needs a new code at the desk.`); } catch { /* best effort */ } }
    this.paired = false;
    deleteArmToken(this.home);
    this.audit.discardKey();
    await this.onDisarm(reason);
  }
}

// ------------------------------------------------------------------ adapters --
class ProcAdapter extends EventEmitter {
  constructor(o) { super(); Object.assign(this, { rpcTimeoutMs: RPC_TIMEOUT }, o); this.busy = false; this.seq = 0; this.rpc = new Map(); }
  spawnChild(args) {
    this.child = spawnBin(this.bin, args, { cwd: this.cwd, env: this.env });
    // Redact the WHOLE line first, then cut it: a secret straddling the cut would
    // otherwise lose the tail the patterns need and leak its head.
    this.child.stdout.on("data", lineSplitter((l) => { let m; try { m = JSON.parse(l); } catch { return this.emit("status", `[non-json] ${redact(l, this.redactCtx || { env: this.env }).slice(0, 120)}`); } this.onMsg(m); }));
    this.child.stderr.on("data", (d) => this.emit("stderr", d.toString()));
    this.child.on("exit", (code) => { this.exited = true; this.failAll(`host exited (${code})`); this.emit("exit", code); });
    this.child.on("error", (e) => { this.exited = true; this.failAll(`spawn error ${e.code || e.message}`); this.emit("exit", `spawn error ${e.code || e.message}`); });
    this.child.stdin.on("error", () => {});
  }
  /** Every pending rpc rejects: nothing waits on a host that is gone. */
  failAll(why) { const ps = [...this.rpc.values()]; this.rpc.clear(); for (const p of ps) p.reject(new Error(why)); }
  write(o) { if (!this.exited) this.child.stdin.write(JSON.stringify(o) + "\n"); }
  /** timeoutMs 0 = none (a whole ACP turn is one session/prompt call); it still
   *  rejects when the child exits. */
  request(method, params, jsonrpc = true, { timeoutMs = this.rpcTimeoutMs } = {}) {
    if (this.exited) return Promise.reject(new Error(`${method}: host has exited`));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = timeoutMs > 0 ? setTimeout(() => { if (this.rpc.delete(id)) reject(new Error(`${method} timed out after ${timeoutMs} ms`)); }, timeoutMs) : null;
      timer?.unref?.();
      const fin = (f) => (v) => { if (timer) clearTimeout(timer); f(v); };
      this.rpc.set(id, { resolve: fin(resolve), reject: fin(reject) });
      this.write(jsonrpc ? { jsonrpc: "2.0", id, method, params } : { id, method, params });
    });
  }
  notify(method, params, jsonrpc = true) { this.write(jsonrpc ? { jsonrpc: "2.0", method, params } : { method, params }); }
  respond(id, result, jsonrpc = true) { this.write(jsonrpc ? { jsonrpc: "2.0", id, result } : { id, result }); }
  respondError(id, message, jsonrpc = true) { this.write(jsonrpc ? { jsonrpc: "2.0", id, error: { code: -32601, message } } : { id, error: { code: -32601, message } }); }
  settle(m) {
    if (m.id == null || m.method || !this.rpc.has(m.id)) return false;
    const p = this.rpc.get(m.id); this.rpc.delete(m.id);
    m.error ? p.reject(new Error(m.error.message || "rpc error")) : p.resolve(m.result);
    return true;
  }
  /** Abort the running turn first (the host stops and reaps what it started), then
   *  the tree: killTree SIGTERMs, waits, and only then SIGKILLs every descendant. */
  kill() {
    if (!this.exited && this.ready) { try { this.abort(); } catch { /* host gone */ } }
    this.failAll("host killed");
    if (this.child?.pid) killTree(this.child.pid, { detached: true });
  }
}

/** The CEREBRO_* keys pi-cerebro.ts reads (own and attach mode). */
export function gateEnv({ mode = "own", cwd, profile, home }) {
  return { CEREBRO_MODE: mode, CEREBRO_CWD: cwd, CEREBRO_PROFILE: profile, CEREBRO_HOME: home };
}

/** pi --mode rpc: strict JSONL, extension dialogs as extension_ui_request. */
export class PiRpcAdapter extends ProcAdapter {
  async start() {
    // childEnv() removed every CEREBRO_* key; the gate needs these four back or
    // pi-cerebro.ts has no mode and (now) blocks every tool. The extension deletes
    // them from process.env before any tool runs. Never the bot token.
    this.env = { ...this.env, ...gateEnv(this) };
    this.spawnChild(hostSpawn("pi", { mode: "own", profile: this.profile })); this.ready = true;
  }
  prompt(text) {
    if (this.busy) { this.write({ type: "steer", message: text }); this.emit("status", "steered into the running turn"); return; }
    this.busy = true; this.write({ type: "prompt", message: text });
  }
  abort() { this.write({ type: "abort" }); }
  newSession() { this.write({ type: "new_session" }); }
  onMsg(m) {
    if (m.type === "agent_start") this.busy = true;
    else if (m.type === "agent_end") { this.busy = false; this.write({ id: `last-${++this.seq}`, type: "get_last_assistant_text" }); }
    else if (m.type === "response" && m.command === "get_last_assistant_text") this.emit("reply", m.data?.text ?? "(no text)");
    // A rejected prompt starts no turn (no agent_start/agent_end follows): not busy, or
    // every later phone prompt would be a steer into a turn that does not exist.
    else if (m.type === "response" && m.success === false && m.command === "prompt") { this.busy = false; this.emit("reply", `(prompt failed: ${m.error || "rejected by pi"})`); }
    else if (m.type === "response" && m.success === false) this.emit("status", `pi: ${m.command} failed: ${m.error || ""}`);
    else if (m.type === "tool_execution_start") this.emit("status", `tool: ${m.toolName}`);
    else if (m.type === "extension_ui_request") {
      if (m.method === "confirm") this.emit("request", { kind: "dialog", title: m.title, detail: m.message }, (d) => this.write({ type: "extension_ui_response", id: m.id, confirmed: d === "allow" }));
      else if (m.method === "select") {
        const allowOpt = (m.options || []).find((o) => /^(allow|yes|approve)/i.test(String(o)));
        this.emit("request", { kind: "dialog", title: m.title, detail: (m.options || []).join(" / ") }, (d) => this.write(d === "allow" && allowOpt ? { type: "extension_ui_response", id: m.id, value: allowOpt } : { type: "extension_ui_response", id: m.id, cancelled: true }));
      } else if (m.method === "input" || m.method === "editor") { this.write({ type: "extension_ui_response", id: m.id, cancelled: true }); this.emit("status", `pi asked for free text (${m.title}); not supported from the phone, cancelled`); }
      else if (m.method === "notify") this.emit("status", `pi: ${m.message}`);
    }
  }
}

/** ACP (gemini --acp, cursor agent acp): JSON-RPC 2.0, session/request_permission. */
export class AcpAdapter extends ProcAdapter {
  async start() {
    this.queue = [];
    this.spawnChild(hostSpawn(this.host));
    await this.request("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
    this.sessionId = (await this.request("session/new", { cwd: this.cwd, mcpServers: [] })).sessionId; this.ready = true;
  }
  prompt(text) {
    if (this.busy) { this.queue.push(text); this.emit("status", "queued: ACP has no mid-turn steer; runs when this turn ends"); return; }
    this.busy = true; this.text = "";
    this.request("session/prompt", { sessionId: this.sessionId, prompt: [{ type: "text", text }] }, true, { timeoutMs: 0 }).then(
      (r) => this.#turnEnd(this.text || `(turn ended: ${r?.stopReason})`, r?.stopReason === "end_turn"),
      (e) => this.#turnEnd(`(turn failed: ${e.message})`, false));
  }
  #turnEnd(text, ok) { this.emit("turn-end", ok); this.emit("reply", text); this.busy = false; const n = this.queue.shift(); if (n) this.prompt(n); }
  abort() { this.queue = []; this.notify("session/cancel", { sessionId: this.sessionId }); }
  async newSession() { this.sessionId = (await this.request("session/new", { cwd: this.cwd, mcpServers: [] })).sessionId; this.emit("status", "new session"); }
  onMsg(m) {
    if (this.settle(m)) return;
    if (m.method === "session/update") {
      const u = m.params?.update || {};
      if (u.sessionUpdate === "agent_message_chunk" && u.content?.type === "text") this.text += u.content.text;
      else if (u.sessionUpdate === "tool_call") this.emit("status", `tool: ${u.title || u.kind || "?"}`);
      return;
    }
    if (m.method === "session/request_permission" && m.id != null) {
      const tc = m.params?.toolCall || {}; const ri = tc.rawInput || {};
      const paths = [...(tc.locations || []).map((l) => l.path), ri.file_path, ri.dir_path, ri.path, ri.absolute_path].filter(Boolean);
      const opts = m.params?.options || [];
      this.emit("request", { kind: tc.kind || "other", title: tc.title || "permission", paths, command: ri.command }, (d) => {
        const opt = opts.find((o) => o.kind === (d === "allow" ? "allow_once" : "reject_once")); // never allow_always
        this.respond(m.id, opt ? { outcome: { outcome: "selected", optionId: opt.optionId } } : { outcome: { outcome: "cancelled" } });
      });
      return;
    }
    if (m.id != null && m.method) this.respondError(m.id, `cerebro does not serve ${m.method}`);
  }
}

/** codex app-server over stdio (v2 protocol, no "jsonrpc" field). */
export class CodexAppAdapter extends ProcAdapter {
  async start() {
    this.files = {}; this.held = [];
    this.spawnChild(hostSpawn("codex", { profile: this.profile }));
    await this.request("initialize", { clientInfo: { name: "remote-cerebro", title: "remote-cerebro", version: VERSION } }, false);
    this.notify("initialized", undefined, false);
    await this.#thread(); this.ready = true;
  }
  async #thread() {
    const r = await this.request("thread/start", { cwd: this.cwd, approvalPolicy: "on-request", sandbox: this.profile === "write" ? "workspace-write" : "read-only" }, false);
    this.threadId = r.thread.id;
  }
  prompt(text) {
    const input = [{ type: "text", text, text_elements: [] }];
    // turn/start sent, its id not back yet: hold the prompt and steer it in once the id
    // arrives. A second turn/start on the thread would race the first one.
    if (this.busy && !this.turnId) { this.held.push(text); this.emit("status", "held until the turn starts, then steered in"); return; }
    if (this.busy) { this.request("turn/steer", { threadId: this.threadId, expectedTurnId: this.turnId, input }, false).catch(() => {}); this.emit("status", "steered into the running turn"); return; }
    this.busy = true; this.acc = ""; this.last = null; this.turnId = null; this.abortPending = false;
    this.request("turn/start", { threadId: this.threadId, input }, false).then((r) => {
      if (this.busy) this.turnId = r?.turn?.id ?? null; // turn/completed may already have been read
      if (this.abortPending) { this.abortPending = false; this.held = []; if (this.turnId) this.abort(); return; }
      for (const t of this.held.splice(0)) this.prompt(t);
    }, (e) => {
      // No turn: nothing to interrupt later, so a pending /abort dies with it.
      const aborted = this.abortPending; this.busy = false; this.turnId = null; this.abortPending = false;
      const held = this.held.splice(0);
      this.emit("reply", `(turn failed: ${e.message})`);
      if (!aborted) { for (const t of held) this.prompt(t); }
    });
  }
  abort() {
    if (this.turnId) this.request("turn/interrupt", { threadId: this.threadId, turnId: this.turnId }, false).catch(() => {});
    else if (this.busy) { this.abortPending = true; this.held = []; } // turn/start not answered yet: interrupt as soon as the id arrives
  }
  async newSession() { await this.#thread(); this.emit("status", "new thread"); }
  onMsg(m) {
    if (this.settle(m)) return;
    const p = m.params || {};
    if (m.method && m.id == null) {
      if (m.method === "item/agentMessage/delta") this.acc += p.delta || "";
      else if (m.method === "item/started" && p.item?.type === "commandExecution") this.emit("status", `command: ${p.item.command}`);
      else if (m.method === "item/started" && p.item?.type === "fileChange") { this.files[p.item.id] = (p.item.changes || []).map((c) => c.path).filter(Boolean); this.emit("status", `file change: ${this.files[p.item.id].join(", ")}`); }
      else if (m.method === "item/completed" && p.item?.type === "agentMessage") this.last = p.item.text;
      else if (m.method === "turn/completed") { this.busy = false; this.turnId = null; this.emit("reply", this.last ?? (this.acc || "(no text)")); }
      return;
    }
    if (m.id == null) return;
    const yesNo = (d) => ({ decision: d === "allow" ? "accept" : "decline" }); // never acceptForSession
    if (m.method === "item/commandExecution/requestApproval")
      this.emit("request", { kind: "command", title: `command: ${p.command || "?"}`, command: p.command, paths: (p.commandActions || []).map((a) => a.path).filter(Boolean) }, (d) => this.respond(m.id, yesNo(d), false));
    else if (m.method === "item/fileChange/requestApproval") {
      // grantRoot asks for writes under that root for the rest of the session: it is
      // shown, and checked as a grant (denied if it is, or holds, a secret root).
      const files = this.files[p.itemId] || []; const root = typeof p.grantRoot === "string" && p.grantRoot ? [p.grantRoot] : [];
      if (p.grantRoot != null && !root.length) return this.respond(m.id, yesNo("deny"), false);
      const detail = [...files.map((f) => `change: ${f}`), ...root.map((r) => `AND write access to everything under ${r} for the rest of the session`), p.reason ? `reason (model-written): ${p.reason}` : null].filter(Boolean).join("\n");
      this.emit("request", { kind: "edit", title: `file change${root.length ? " + session write grant" : ""}: ${files.join(", ") || "?"}`, detail, paths: [...files, ...root], grantPaths: root }, (d) => this.respond(m.id, yesNo(d), false));
    } else if (m.method === "item/permissions/requestApproval") {
      const g = renderGrant(p.permissions);
      if (!g) { this.emit("status", "codex asked for a permission grant cerebro cannot read in full; declined"); return this.respond(m.id, { permissions: {} }, false); }
      const detail = [...g.lines, p.reason ? `reason (model-written): ${p.reason}` : null].filter(Boolean).join("\n");
      // Allow returns exactly the grant that was shown, every field of it.
      this.emit("request", { kind: "permissions", title: "extra permissions (the whole grant is below)", detail, paths: g.paths, grantPaths: g.paths }, (d) => this.respond(m.id, d === "allow" ? { permissions: p.permissions, scope: "turn" } : { permissions: {} }, false));
    } else if (m.method === "mcpServer/elicitation/request") this.respond(m.id, { action: "decline" }, false);
    else if (m.method === "execCommandApproval" || m.method === "applyPatchApproval") this.respond(m.id, { decision: "denied" }, false);
    else this.respondError(m.id, `cerebro does not serve ${m.method}`, false);
  }
}

/** A codex permissions grant as lines the phone shows, plus every path it names (each
 *  checked as a grant). Every field is rendered: fileSystem read/write/entries and any
 *  other key (network, ...) as JSON. null when a path cannot be read as a string. */
export function renderGrant(perms) {
  if (perms == null || typeof perms !== "object") return null;
  const lines = [], paths = [];
  for (const [k, v] of Object.entries(perms)) {
    if (k !== "fileSystem") { lines.push(`${k}: ${JSON.stringify(v)}`); continue; }
    if (v == null || typeof v !== "object") { lines.push(`fileSystem: ${JSON.stringify(v)}`); continue; }
    for (const [fk, fv] of Object.entries(v)) {
      if ((fk === "read" || fk === "write") && Array.isArray(fv)) {
        for (const x of fv) { if (typeof x !== "string") return null; lines.push(`${fk}: ${x}`); paths.push(x); }
      } else if (fk === "entries" && Array.isArray(fv)) {
        for (const e of fv) { const x = e?.path?.path ?? e?.path; if (typeof x !== "string") return null; lines.push(`entry: ${JSON.stringify(e)}`); paths.push(x); }
      } else lines.push(`fileSystem.${fk}: ${JSON.stringify(fv)}`);
    }
  }
  if (!lines.length) lines.push("(empty grant)");
  return { lines, paths };
}

/** Attach mode, bridge side: the interactive pi runs in this terminal and the
 *  extension talks to us through a private IPC directory. */
/** The legacy ipc folder (plaintext body files in older versions, a socket dir now). */
export const ipcDirOf = (home) => path.join(stateDir(home), "ipc");
export function clearIpcDir(home) { try { fs.rmSync(ipcDirOf(home), { recursive: true, force: true }); } catch { /* best effort */ } }

/** Where the attach channel listens. Windows: a named pipe with a random name (no
 *  file at all). POSIX: a Unix socket inside a 0700 folder (the socket file 0600). */
export function ipcAddress(home) {
  const id = crypto.randomBytes(16).toString("hex");
  if (IS_WIN) return { addr: `\\\\.\\pipe\\cerebro-${id}`, dir: null };
  let dir = ipcDirOf(home);
  if (dir.length > 80) dir = fs.mkdtempSync(path.join(os.tmpdir(), "cerebro-ipc-")); // sun_path is ~104 bytes
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700);
  return { addr: path.join(dir, `${id.slice(0, 12)}.sock`), dir };
}

/** Attach mode, bridge side, over a local socket. No body ever touches the disk:
 *  messages live in memory until the extension connects. The extension must send
 *  {type:"hello", nonce} with the arm token first; nothing is sent to a connection
 *  before that, and only one authenticated connection is ever accepted. */
export class AttachIpcAdapter extends EventEmitter {
  constructor(o) { super(); Object.assign(this, o); this.sock = null; this.outq = []; }
  async start() {
    clearIpcDir(this.home); // leftovers of an older version or a crash
    const { addr, dir } = ipcAddress(this.home); this.ipc = addr; this.ipcDir = dir;
    this.server = net.createServer((s) => this.#accept(s));
    await new Promise((res, rej) => { this.server.once("error", rej); this.server.listen(addr, () => { this.server.off("error", rej); res(); }); });
    this.server.unref?.();
    if (dir) { try { fs.chmodSync(addr, 0o600); } catch { /* the 0700 folder is the guard */ } }
    const env = { ...this.env, ...gateEnv({ ...this, mode: "attach" }), CEREBRO_ARM_NONCE: this.armToken, CEREBRO_IPC: this.ipc };
    this.child = spawnBin(this.bin, hostSpawn("pi", { mode: "attach", profile: this.profile }), { cwd: this.cwd, env, stdio: this.stdio || "inherit" });
    this.child.on("exit", (code) => { this.exited = true; this.emit("exit", code); });
    this.child.on("error", (e) => { this.exited = true; this.emit("exit", `spawn error ${e.code}`); });
  }
  #accept(sock) {
    sock.on("error", () => {});
    if (this.sock || this.closed) return sock.destroy();
    let authed = false;
    const t = setTimeout(() => { if (!authed) sock.destroy(); }, 5000); t.unref?.();
    sock.on("data", lineSplitter((l) => {
      if (sock.destroyed) return;
      let m; try { m = JSON.parse(l); } catch { return sock.destroy(); }
      if (!authed) {
        const a = Buffer.from(String(m?.nonce ?? "")), b = Buffer.from(String(this.armToken));
        if (m?.type !== "hello" || a.length !== b.length || !crypto.timingSafeEqual(a, b) || this.sock) return sock.destroy();
        authed = true; clearTimeout(t); this.sock = sock;
        sock.on("close", () => { if (this.sock === sock) this.sock = null; });
        for (const o of this.outq.splice(0)) sock.write(JSON.stringify(o) + "\n");
        return;
      }
      this.#dispatch(m);
    }));
  }
  #dispatch(m) {
    if (m.type === "reply") this.emit("reply", m.text);
    else if (m.type === "status") this.emit("status", m.text);
    else if (m.type === "ask") this.emit("request", { kind: "dialog", title: m.title, detail: m.detail, askId: m.id }, (d) => this.#put({ type: "answer", id: m.id, decision: d }));
    else if (m.type === "local-answer") this.emit("local-answer", m.id, m.decision);
    else if (m.type === "shutdown") this.emit("exit", "pi session ended");
  }
  #put(o) { if (this.sock && !this.sock.destroyed) this.sock.write(JSON.stringify(o) + "\n"); else if (!this.closed) this.outq.push(o); }
  prompt(text) { this.#put({ type: "prompt", text }); }
  abort() { this.#put({ type: "abort" }); }
  newSession() { this.emit("status", "/new is not available in attach mode; start a new session at the desk"); }
  kill() {
    try { this.#put({ type: "kill" }); } catch { /* channel gone */ }
    this.closed = true; this.outq = [];
    try { this.sock?.end(); } catch { /* gone */ }
    try { this.server?.close(); } catch { /* gone */ }
    if (this.child?.pid) killTree(this.child.pid, { detached: true });
    if (this.ipcDir) { try { fs.rmSync(this.ipcDir, { recursive: true, force: true }); } catch { /* gone */ } }
    clearIpcDir(this.home);
  }
}

// --------------------------------------------------------------- lock & state --
const lockFile = (home) => path.join(stateDir(home), "lock");
const stateFile = (home) => path.join(stateDir(home), "state.json");
const readJsonFile = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
/** The state folder, user-only on POSIX (an older 0755 one is tightened). On Windows
 *  it inherits the profile's ACL (the user, SYSTEM, Administrators). */
export function ensureStateDir(home) {
  const d = stateDir(home); fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  if (!IS_WIN) { try { fs.chmodSync(d, 0o700); } catch { /* not ours: checkCreds-style refusal is the caller's */ } }
  return d;
}
export function writeState(home, s) { ensureStateDir(home); fs.writeFileSync(stateFile(home), JSON.stringify(s, null, 2), { mode: 0o600 }); }
export function readState(home) { return readJsonFile(stateFile(home)); }

const readRaw = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
const ageMs = (f) => { try { return Date.now() - fs.statSync(f).mtimeMs; } catch { return Infinity; } };
/** Take the lock atomically. A new lock is published whole (hard link of a written
 *  temp file; O_EXCL where links are unsupported), so a reader never sees it empty.
 *  A STALE lock is replaced only by the holder of the takeover mutex (an exclusive
 *  mkdir), and only while the lock file still holds the exact bytes judged stale: a
 *  lock somebody else just created is never deleted, and only one arming runs the
 *  orphan cleanup (requirements restore, child kill) for the dead one. */
export function acquireLock(home, info, { afterStaleRead = null } = {}) {
  ensureStateDir(home);
  const lf = lockFile(home), mutex = lf + ".takeover";
  const body = JSON.stringify({ ...info, pid: process.pid, ident: procIdentity(process.pid), at: new Date().toISOString() });
  const create = () => {
    const tmp = `${lf}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, body, { mode: 0o600 });
    try { fs.linkSync(tmp, lf); }
    catch (e) {
      if (e.code === "EEXIST" || !["EPERM", "ENOTSUP", "ENOSYS", "EXDEV", "EINVAL"].includes(e.code)) throw e;
      const fd = fs.openSync(lf, "wx", 0o600); try { fs.writeSync(fd, body); } finally { fs.closeSync(fd); }
    } finally { try { fs.unlinkSync(tmp); } catch { /* gone */ } }
  };
  for (let attempt = 0; attempt < 200; attempt++) {
    try { create(); return; } catch (e) { if (e.code !== "EEXIST") throw e; }
    const raw = readRaw(lf); if (raw === null) continue; // removed meanwhile: try again
    let cur = null; try { cur = JSON.parse(raw); } catch { if (ageMs(lf) < 5000) { sleepSync(20); continue; } } // being written by an old-style O_EXCL creator
    if (lockHolderAlive(cur)) throw new Refused("refused:lock", `already armed (pid ${cur.pid}, ${cur.kind} ${cur.host}); run \`cerebro stop\` first`);
    afterStaleRead?.();
    try { fs.mkdirSync(mutex); }
    catch (e) {
      if (e.code !== "EEXIST") throw e;
      if (ageMs(mutex) > 120e3) { try { fs.rmdirSync(mutex); } catch { /* raced */ } } // its holder died mid-takeover
      sleepSync(20 + crypto.randomInt(30)); continue;
    }
    try {
      if (readRaw(lf) !== raw) continue; // replaced since we judged it: judge again
      if (!orphanCleanup(home)) { sleepSync(200); continue; } // a watchdog is tearing the dead arming down: let it finish
      if (readRaw(lf) !== raw) continue;
      fs.unlinkSync(lf);
      try { create(); return; } catch (e) { if (e.code !== "EEXIST") throw e; } // a fresh arming won the gap: judge it
    } finally { try { fs.rmdirSync(mutex); } catch { /* gone */ } }
  }
  throw new Refused("refused:lock", "could not take the lock");
}
export function releaseLock(home) {
  const cur = readJsonFile(lockFile(home));
  if (!cur || cur.pid === process.pid) { try { fs.unlinkSync(lockFile(home)); } catch { /* gone */ } }
}
/** Is the process that holds the lock still THAT process? A lock written before
 *  identities were recorded, or whose pid now names another process, is stale. */
export function lockHolderAlive(lk) {
  if (!lk || !pidAlive(lk.pid)) return false;
  if (lk.pid === process.pid) return true;
  return !!lk.ident && procIdentity(lk.pid) === lk.ident;
}
/** Teardown has ONE owner at a time (the supervisor, its watchdog, `cerebro stop`, a
 *  stale-lock takeover). The owner holds a marker file created O_EXCL and beats it
 *  (mtime) while it works; anyone else backs off while the holder is still that
 *  process and its beat is younger than staleMs. staleMs outlives one blocking
 *  runBin (20 s timeout) with room to spare; a holder that stops beating for that
 *  long is presumed dead or wedged and loses the marker. Re-entrant within one
 *  process. Returns {beat(), release()} or null when someone else owns it. */
export const TEARDOWN_STALE_MS = 90e3;
const teardownFile = (home) => path.join(stateDir(home), "teardown.json");
export function teardownClaim(home, owner, { staleMs = TEARDOWN_STALE_MS } = {}) {
  ensureStateDir(home);
  const f = teardownFile(home);
  const mine = { owner, pid: process.pid, ident: procIdentity(process.pid), at: new Date().toISOString() };
  const handle = (own) => ({
    beat() { if (!own) return; const t = new Date(); try { fs.utimesSync(f, t, t); } catch { /* gone: release() is a no-op then */ } },
    release() { if (!own) return; const cur = readJsonFile(f); if (cur?.pid === process.pid && cur.owner === owner) { try { fs.unlinkSync(f); } catch { /* gone */ } } },
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    try { const fd = fs.openSync(f, "wx", 0o600); try { fs.writeSync(fd, JSON.stringify(mine)); } finally { fs.closeSync(fd); } return handle(true); }
    catch (e) { if (e.code !== "EEXIST") throw e; }
    const raw = readRaw(f); if (raw === null) continue; // released meanwhile
    let cur = null; try { cur = JSON.parse(raw); } catch { if (ageMs(f) < 5000) return null; } // being written
    if (cur?.pid === process.pid) return handle(false); // this process already owns it
    if (cur && ageMs(f) < staleMs && lockHolderAlive(cur)) return null;
    if (readRaw(f) === raw) { try { fs.unlinkSync(f); } catch { /* raced */ } } // dead or stale holder
  }
  return null;
}

/** A bridge or supervisor that died without teardown leaves a child, an arm token
 *  and maybe a codex requirements file (or an enabled shared daemon) behind. The
 *  child is killed ONLY while the state still says armed AND the pid still has the
 *  start time recorded when cerebro spawned it: a pid that was reused since (a
 *  reboot, days of uptime) belongs to someone else and is never touched. */
export function orphanCleanup(home, log = () => {}, { reason = "orphan-cleanup" } = {}) {
  const claim = teardownClaim(home, "cleanup");
  if (!claim) { log("another cerebro process is tearing this arming down; left to it"); return false; }
  try { orphanCleanupOwned(home, log, reason, claim); } finally { claim.release(); }
  return true;
}
function orphanCleanupOwned(home, log, reason, claim) {
  const s = readState(home);
  if (s?.armed && s.childPid && pidAlive(s.childPid)) {
    const now = s.childIdent ? procIdentity(s.childPid) : null;
    if (s.childIdent && now === s.childIdent) { killTree(s.childPid, { detached: true }); log(`killed orphan child pid ${s.childPid}`); }
    else log(`NOT killing pid ${s.childPid}: ${s.childIdent ? "it is no longer the process cerebro started (pid reused)" : "its start time was never recorded, so it cannot be told from a reused pid"}; check it by hand`);
  }
  if (s?.armed && s.bin && (s.route === "codex-shared" || s.route === "agy-session")) {
    const args = s.route === "codex-shared" ? ["app-server", "daemon", "disable-remote-control"] : ["remote-control", "stop"];
    claim.beat();
    try { runBin(s.bin, args, { env: childEnv(process.env) }); log(`ran ${args.join(" ")}`); } catch (e) { log(`${args.join(" ")} failed: ${e.message}`); }
    claim.beat();
  }
  if (fs.existsSync(reqBackupFile(home))) { const r = requirementsRestore(home); log(`restored codex requirements: ${r}`); }
  deleteArmToken(home);
  clearIpcDir(home); // attach-mode socket folder (and any plaintext body files an older version left)
  if (s) writeState(home, { ...s, armed: false, childPid: null, childIdent: null, ...(s.armed ? { disarmedAt: new Date().toISOString(), reason } : {}) });
}

// ------------------------------------------------- codex requirements.toml --
// Owner ruling: the limits exist ONLY while a native codex route is armed, and
// teardown restores the user's file byte for byte, including "it did not exist".
const reqBackupFile = (home) => path.join(stateDir(home), "requirements.backup.json");
export const REQ_KEYS = { allowed_approval_policies: ["untrusted", "on-request"], allowed_sandbox_modes: ["read-only", "workspace-write"] };
export function requirementsPath(home, env = {}) { return path.join(codexHome(home, env), "requirements.toml"); }

export function requirementsArm(home, env = {}) {
  const file = requirementsPath(home, env);
  if (fs.existsSync(reqBackupFile(home))) requirementsRestore(home); // an earlier arming never tore down
  const existed = fs.existsSync(file);
  const bytes = existed ? fs.readFileSync(file) : Buffer.alloc(0);
  let body = "";
  // Only ever NARROW: each key becomes the user's own list intersected with cerebro's
  // limit (the user's order kept). A key the file does not set gets cerebro's limit.
  // A value the user's file did not allow is never added; an empty intersection means
  // nothing safe is left to arm with, and arming is refused with the file untouched.
  const want = { ...REQ_KEYS };
  if (existed) {
    const text = bytes.toString("utf8").replace(/^﻿/, "");
    let parsed; try { parsed = parseTomlLite(text); } catch (e) { throw new Refused("refused:requirements", `cannot parse ${file} safely (${e.message}); not touching it`); }
    let same = true;
    for (const [k, ours] of Object.entries(REQ_KEYS)) {
      const theirs = parsed[k];
      if (theirs === undefined) { same = false; continue; }
      if (!Array.isArray(theirs) || !theirs.every((x) => typeof x === "string")) throw new Refused("refused:requirements", `${file}: ${k} is not a list of strings; not touching it`);
      want[k] = theirs.filter((x, i) => ours.includes(x) && theirs.indexOf(x) === i);
      if (!want[k].length) throw new Refused("refused:requirements", `${file} sets ${k} = [${theirs.join(", ")}], and none of those is inside cerebro's limit [${ours.join(", ")}]. cerebro only ever narrows this file, so there is nothing left to arm with. Not armed; the file is untouched.`);
      if (want[k].length !== theirs.length) same = false;
    }
    if (same) { ensureStateDir(home); fs.writeFileSync(reqBackupFile(home), JSON.stringify({ file, existed, unchanged: true, sha256: sha(bytes), b64: bytes.toString("base64") })); return "already-limited"; }
    let inTable = false;
    body = text.split(/\r?\n/).map((l) => { if (/^\s*\[/.test(l)) inTable = true; return !inTable && /^\s*(["']?)(allowed_approval_policies|allowed_sandbox_modes)\1\s*=/.test(l) ? `# (cerebro, while armed) ${l}` : l; }).join("\n");
  }
  const head = ["# remote-cerebro: added while a native codex route is armed; removed at teardown.",
    ...Object.entries(want).map(([k, v]) => `${k} = [${v.map((x) => `"${x}"`).join(", ")}]`), ""].join("\n");
  ensureStateDir(home);
  const bk = reqBackupFile(home);
  fs.writeFileSync(bk, JSON.stringify({ file, existed, sha256: sha(bytes), b64: bytes.toString("base64") }));
  const fd = fs.openSync(bk, "r+"); fs.fsyncSync(fd); fs.closeSync(fd); // backup on disk before the change
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, head + (existed ? "\n" + body : ""));
  return existed ? "merged" : "created";
}
/** Idempotent: restoring twice, or after another process finished the same restore
 *  (the backup gone under it), is not an error. */
export function requirementsRestore(home) {
  const bk = reqBackupFile(home);
  const b = readJsonFile(bk); if (!b) return "no-backup";
  const dropBackup = () => { try { fs.unlinkSync(bk); } catch (e) { if (e.code !== "ENOENT") throw e; } };
  if (b.unchanged) { dropBackup(); return "unchanged"; }
  if (b.existed) {
    const bytes = Buffer.from(b.b64, "base64");
    fs.writeFileSync(b.file, bytes);
    if (sha(fs.readFileSync(b.file)) !== b.sha256) throw new Error(`restore of ${b.file} did not verify; backup kept at ${bk}`);
  } else { try { fs.unlinkSync(b.file); } catch (e) { if (e.code !== "ENOENT") throw e; } }
  dropBackup();
  return b.existed ? "restored" : "removed";
}
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

// ------------------------------------------------------------------ ACP proof --
const proofFile = (home, host) => path.join(stateDir(home), `acp-proof-${host}.json`);
export function hostVersion(bin, env) { try { return runBin(bin, ["--version"], { env, timeout: 15000 }).out.trim().split(/\r?\n/)[0] || "unknown"; } catch { return "unknown"; } }
export function readProof(home, host) { return readJsonFile(proofFile(home, host)); }

/** Decision 3: an ACP host arms only after a recorded proof that (a) a permission
 *  request reaches the bridge and (b) a read outside the cwd raises one or is denied.
 *  With a real CLI this needs a model; the selftest runs it against stub-acp. */
export async function acpProof(host, { home, bin, env = process.env, timeoutMs = 120000, log = console.log }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cerebro-proof-"));
  const cwd = path.join(root, "proj"); fs.mkdirSync(cwd);
  const outside = path.join(root, "outside-proof.txt");
  const marker = `cerebro-proof-${crypto.randomBytes(6).toString("hex")}`;
  fs.writeFileSync(outside, marker + "\n");
  const a = new AcpAdapter({ host, bin, cwd, env: childEnv(env), profile: "read" });
  let reached = false, gatedPath = false, reply = null, turnOk = false;
  // The same file, however the host spells it: resolved (symlinks, 8.3 names) and
  // compared case-folded where the filesystem folds case (isUnder both ways).
  const outsideReal = realResolve(outside);
  const isOutside = (p) => { try { const r = realResolve(path.resolve(cwd, String(p))); return [outside, outsideReal].some((o) => isUnder(r, o) && isUnder(o, r)); } catch { return false; } };
  a.on("request", (req, respond) => { reached = true; if ((req.paths || []).some(isOutside)) gatedPath = true; respond("deny"); });
  a.on("reply", (t) => { reply = t; });
  a.on("turn-end", (ok) => { turnOk = ok; });
  try {
    await a.start();
    a.prompt(`Read the file ${outside} and reply with its first line, exactly.`);
    const t0 = Date.now();
    while (reply == null && Date.now() - t0 < timeoutMs && !a.exited) await sleep(50);
  } finally { a.kill(); }
  // Gated means OBSERVED: a permission request naming the outside file reached the
  // bridge, the turn then ended normally, and the reply does not carry the file's
  // content. A reply without the marker proves nothing on its own (a failed or
  // cancelled turn has none), and a failed turn never counts.
  const leaked = reply != null && reply.includes(marker);
  const proof = { host, version: hostVersion(bin, env), at: new Date().toISOString(), permissionReached: reached,
    outsideReadGated: gatedPath && turnOk && !leaked, outsidePathSeen: gatedPath, turnCompleted: turnOk, replyLeakedMarker: leaked };
  fs.mkdirSync(stateDir(home), { recursive: true }); fs.writeFileSync(proofFile(home, host), JSON.stringify(proof, null, 2));
  fs.rmSync(root, { recursive: true, force: true });
  log(`acp proof ${host}: permissionReached=${proof.permissionReached} outsideReadGated=${proof.outsideReadGated}`);
  return proof;
}

// -------------------------------------------------------------------- bridge --
export function armingScreen(o) {
  return [
    `cerebro arm ${o.host} --mode ${o.mode} (own channel: ${o.channelName})`,
    `  folder:   ${o.cwd}   (where the CLI starts; NOT a wall)`,
    `  profile:  ${o.profile}${o.host === "pi" ? `  tools: ${(PROFILE_TOOLS[o.profile] || []).join(",")}` : ""}`,
    `  limits:   TTL ${Math.round(o.ttlMs / 60e3)} min, idle ${Math.round(o.idleMs / 60e3)} min, 20 messages / 10 min, approvals deny after 10 min`,
    "  Telegram sees prompts and replies in plaintext.",
    `  Files the agent reads may be sent to Telegram; reads outside ${o.cwd} will ask you first; secret paths are refused.`,
    "  Residual risk: a shell command can read a secret by a route the filter misses" + (o.host === "codex" ? ", and codex's sandbox can read without asking." : "."),
    "  Kill: Ctrl-C here, `cerebro stop`, the KILL file, /kill from the phone. Phone lost: BotFather /revoke.",
  ].join("\n");
}

export class Bridge {
  constructor(o) {
    Object.assign(this, { mode: "own", profile: "read", ttlMs: 2 * 3600e3, idleMs: 30 * 60e3, env: process.env, clock: Date.now, mirror: (s) => console.log(s), pollMs: 1000, channelName: "telegram" }, o);
    this.cwd = path.resolve(this.cwd);
  }
  async arm() {
    const { host, mode, home } = this;
    if (!["pi", "gemini", "cursor", "codex"].includes(host)) throw new Refused("refused:host", `unknown host ${host}`);
    if (mode === "attach" && host !== "pi") throw new Refused("refused:mode", "attach mode is pi-only in v1 (gemini attach and cursor attach are v2)");
    if (!["read", "write"].includes(this.profile)) throw new Refused("refused:profile", `profile must be read or write`);
    if (this.ttlMs > MAX_TTL) throw new Refused("refused:ttl", "TTL is at most 12 h");
    if (this.elevated ?? isElevated()) throw new Refused("refused:elevated", "this terminal runs as Administrator/root (or elevation could not be checked); arm from an ordinary, non-elevated terminal");
    const bad = checkSpawnArgv(hostSpawn(host, { mode, profile: this.profile }));
    if (bad.length) throw new Refused("refused:yolo", `refused flag ${bad.join(" ")}`);
    const wid = checkWidening(host, { home, cwd: this.cwd, env: this.env });
    if (wid.length) throw new Refused("refused:widening", `a config widens auto-approval (no override):\n  ${wid.join("\n  ")}`);
    this.bin ||= resolveHostBin(host, this.env);
    if (!this.bin) throw new Refused("refused:missing", `${host} is not on PATH`);
    if (host === "gemini" || host === "cursor") {
      const p = readProof(home, host); const v = hostVersion(this.bin, this.env);
      if (host === "cursor" && looksLikeNode(v)) throw new Refused("refused:wrong-bin", `${this.bin.file} is Cursor's bundled Node (${v}), not the CLI; cursor-agent.cmd is`);
      if (!p || !p.permissionReached || !p.outsideReadGated || p.version !== v)
        throw new Refused("refused:acp-proof", `${host} ACP does not arm until \`cerebro doctor --acp-proof ${host}\` records that permission requests reach the bridge and outside reads are gated (version ${v}${p ? `, proof was for ${p.version}` : ", no proof"})`);
    }
    const screen = armingScreen(this);
    if (!(await this.confirm(screen))) throw new Refused("refused:not-confirmed", "not armed: the person at the desk did not confirm");
    acquireLock(home, { kind: "bridge", host });
    try { fs.unlinkSync(path.join(stateDir(home), "KILL")); } catch { /* none */ }
    // Once per arming, not per approval or per message: the deny roots (a listing of
    // both homes, the deny file, ~40 realpaths) and one redaction context, whose
    // secret spellings redact() builds on first use and then reuses.
    this.roots = allRoots(home, this.env);
    this.redactCtx = { env: this.env, token: this.token };
    this.audit = new Audit(path.join(stateDir(home), "audit.log"));
    this.audit.write("arm", { reason: `${host}/${mode}/${this.profile}` });
    let mirror = this.mirror;
    if (mode === "attach" && this.attachLog) {
      // The desk's live view while pi owns the terminal: metadata only (mirrorBodies
      // false), created user-only, removed at disarm. Never a prompt or ask body.
      try { fs.unlinkSync(this.attachLog); } catch { /* none */ }
      fs.mkdirSync(path.dirname(this.attachLog), { recursive: true });
      fs.writeFileSync(this.attachLog, "", { mode: 0o600 });
      mirror = (s) => { try { fs.appendFileSync(this.attachLog, s + "\n", { mode: 0o600 }); } catch { /* removed at disarm */ } };
    }
    this.session = new Session({
      channel: this.channel, audit: this.audit, clock: this.clock, home, allowedUserId: this.allowedUserId,
      ttlMs: this.ttlMs, idleMs: this.idleMs, mirror, mirrorBodies: mode !== "attach", redactCtx: this.redactCtx,
      ...(this.sessionOpts || {}),
      onPrompt: (t) => { if (this.adapter?.ready) this.adapter.prompt(t); else this.queued.push(t); }, // held in memory until the host is up
      onCommand: (c) => this.#command(c),
      onDisarm: (r) => this.teardown(r),
    });
    this.queued = [];
    // The dead-man runs on its own timer, not inside the poll loop: a host rpc or a
    // channel call that never returns cannot hold off the TTL, idle, KILL file or pairing window.
    this.deadTimer = setInterval(() => {
      const s = this.session; if (!s || s.disarmed) return;
      let d = null; try { d = s.checkDeadman(this.clock()); } catch { /* state dir gone: next tick */ }
      if (d) s.disarm(d).catch((e) => this.mirror(`[disarm] ${e.message}`));
    }, this.deadmanMs ?? 250);
    this.deadTimer.unref?.();
    writeState(home, { armed: true, kind: "bridge", host, mode, route: mode === "attach" ? "attach" : host === "codex" ? "codex-app" : host === "pi" ? "pi-rpc" : "acp", pid: process.pid, cwd: this.cwd, profile: this.profile, armedAt: new Date(this.clock()).toISOString(), expiresAt: new Date(this.clock() + this.ttlMs).toISOString(), userId: this.allowedUserId });
    if (process.stdout.isTTY) process.stdout.write("\x1b]0;[REMOTE] cerebro\x07");
    this.mirror(`[REMOTE] pairing code (send "/pair <code>" from your phone within 5 min): ${this.session.code}`);
    return { code: this.session.code };
  }
  async #command(c) {
    if (c === "abort") { this.queued = []; if (this.adapter?.ready) this.adapter.abort(); return this.session.send("aborted", "notice"); }
    if (c === "new") {
      if (!this.adapter?.ready) return this.session.send(`${this.host} is still starting`, "notice");
      try { await this.adapter.newSession(); } catch (e) { return this.session.send(`/new failed: ${e.message}`, "notice"); }
      return this.session.send("new session", "notice");
    }
    if (c === "status") {
      const left = (ms) => `${Math.max(0, Math.round(ms / 60e3))} min`;
      const now = this.clock();
      return this.session.send(`armed: ${this.host} (${this.mode}, ${this.profile}) in ${path.basename(this.cwd)}; ttl ${left(this.session.armedAt + this.ttlMs - now)}, idle ${left(this.idleMs - (now - this.session.lastInbound))}; ${this.adapter?.busy ? "turn running" : "idle"}; pending approvals ${this.session.pending.size}`, "notice");
    }
  }
  async startChild() {
    const env = childEnv(this.env);
    const base = { host: this.host, bin: this.bin, cwd: this.cwd, env, profile: this.profile, home: this.home, redactCtx: this.redactCtx, ...(this.rpcTimeoutMs ? { rpcTimeoutMs: this.rpcTimeoutMs } : {}) };
    if (this.mode === "attach") this.adapter = new AttachIpcAdapter({ ...base, armToken: writeArmToken(this.home, this.ttlMs, this.clock()), stdio: this.attachStdio });
    else {
      writeArmToken(this.home, this.ttlMs, this.clock()); // dies at disarm, like attach
      this.adapter = this.host === "pi" ? new PiRpcAdapter(base) : this.host === "codex" ? new CodexAppAdapter(base) : new AcpAdapter(base);
    }
    const s = this.session;
    this.adapter.on("reply", (t) => s.send(t, "reply"));
    this.adapter.on("status", (t) => s.send(t, "status"));
    this.adapter.on("stderr", (t) => this.mirror(`[${this.host} stderr] ${redact(t, this.redactCtx).trim().slice(0, 300)}`));
    this.adapter.on("request", (req, respond) => this.#request(req, respond));
    this.adapter.on("local-answer", (id, d) => s.cancelAsk((p) => p.askId === id, `answered at the desk (${d})`));
    this.adapter.on("exit", async (code) => { if (s.disarmed) return; await s.send(`${this.host} exited (${code})`, "notice"); await s.disarm("child-exit"); });
    try { await this.adapter.start(); }
    catch (e) { if (s.disarmed) return; await s.send(`${this.host} failed to start: ${e.message}`, "notice"); return s.disarm("child-start-failed"); }
    if (s.disarmed) return;
    this.adapter.ready = true;
    for (const t of this.queued.splice(0)) this.adapter.prompt(t);
    const pid = this.adapter.child?.pid;
    const st = readState(this.home); writeState(this.home, { ...st, childPid: pid, childIdent: null });
    // The start time is read in the background (a second on Windows); `cerebro stop`
    // kills an orphan only once it is recorded. pi/acp/codex-app children also exit
    // on stdin EOF when the bridge dies, so the window is not the only line.
    if (pid) procIdentityAsync(pid).then((id) => { const now = readState(this.home); if (id && now?.armed && now.childPid === pid) writeState(this.home, { ...now, childIdent: id }); });
    await s.send(`${this.host} is up (${this.mode}, profile ${this.profile}).`, "notice");
  }
  async #request(req, respond) {
    const s = this.session;
    let d;
    if (req.kind === "dialog") d = { action: "ask" }; // the pi gate already applied the policy
    else d = requestPolicy(req, { cwd: this.cwd, home: this.home, env: this.env, profile: this.profile, roots: this.roots });
    if (d.action === "deny") {
      this.audit.write("refused", { reason: d.reason });
      await s.send(`refused (${d.reason}): ${req.title}`, "notice");
      return respond("deny");
    }
    if (d.action === "allow") { this.mirror(`[auto-allow] ${req.title} (${d.reason})`); return respond("allow"); }
    const ans = await s.ask(`${this.host} asks: ${req.title}`, [req.detail || (req.paths || []).join("\n"), req.command].filter(Boolean).join("\n"), { askId: req.askId });
    respond(ans);
  }
  async step() {
    const s = this.session;
    if (!s || s.disarmed) return;
    await s.step();
    // Started in the background: a host that hangs in initialize / session/new must
    // not stop the loop from reading a /kill. Prompts wait in this.queued meanwhile.
    if (s.paired && !this.adapter && !s.disarmed) this.starting = this.startChild().catch((e) => this.mirror(`[start] ${e.message}`));
  }
  async teardown(reason) {
    if (this.tornDown) return; this.tornDown = reason;
    if (this.deadTimer) clearInterval(this.deadTimer);
    this.queued = [];
    if (this.adapter) this.adapter.kill();
    deleteArmToken(this.home);
    clearIpcDir(this.home);
    const st = readState(this.home) || {};
    writeState(this.home, { ...st, armed: false, childPid: null, childIdent: null, disarmedAt: new Date(this.clock()).toISOString(), reason });
    releaseLock(this.home);
    if (this.mode === "attach" && this.attachLog) { try { fs.unlinkSync(this.attachLog); } catch { /* gone */ } }
    this.mirror(`[REMOTE] disarmed (${reason})`);
  }
  async run() {
    const off = installDeadman((why) => this.session.disarm(why), { onInt: () => this.session.disarm("ctrl-c") });
    try { while (!this.session.disarmed) { await this.step(); await sleep(Math.max(this.session.backoff || 0, this.channel instanceof TelegramChannel ? 50 : this.pollMs)); } }
    finally { off(); }
  }
}

// --------------------------------------------------------- native supervisor --
const NATIVE_REFUSED_CURSOR = ["--computer-use", "--share-desktop", "--connect-workspace", "--sync-dashboard-secrets", "--mint-github-token"];
export class NativeSupervisor {
  constructor(o) { Object.assign(this, { env: process.env, clock: Date.now, log: (s) => console.log(s), ttlMs: 2 * 3600e3, shared: false }, o); }
  async listThreads() {
    const r = runBin(this.bin, ["agents", "--json"], { env: this.env });
    try { const j = JSON.parse(r.stdout); return Array.isArray(j) ? j : j.threads || []; }
    catch { return r.stdout.split(/\r?\n/).filter((l) => l.trim() && !/^(id|thread)\b/i.test(l)); } // format guessed until risk 1
  }
  async start() {
    const { host, home } = this;
    if (!["codex", "cursor", "agy"].includes(host)) throw new Refused("refused:host", `no native route for ${host}`);
    if (this.ttlMs > MAX_TTL) throw new Refused("refused:ttl", "TTL is at most 12 h");
    if (this.elevated ?? isElevated()) throw new Refused("refused:elevated", "this terminal runs as Administrator/root (or elevation could not be checked); arm from an ordinary, non-elevated terminal");
    const wid = host === "agy" ? [] : checkWidening(host, { home, cwd: this.cwd, env: this.env });
    if (wid.length) throw new Refused("refused:widening", `a config widens auto-approval (no override):\n  ${wid.join("\n  ")}`);
    this.bin ||= resolveHostBin(host, this.env);
    if (!this.bin) throw new Refused("refused:missing", `${host} is not on PATH`);
    if (host === "cursor") { const v = hostVersion(this.bin, this.env); if (looksLikeNode(v)) throw new Refused("refused:wrong-bin", `${this.bin.file} is Cursor's bundled Node (${v}), not the CLI; cursor-agent.cmd is`); }
    const warn = [];
    if (host === "codex") {
      this.threads = await this.listThreads();
      if (this.shared && this.threads.length) warn.push(`${this.threads.length} thread(s) on the shared daemon become visible to the phone, and stopping the shared route ends them.`);
    }
    const screen = [
      `cerebro native ${host}${host === "codex" ? (this.shared ? " (shared daemon)" : " (embedded --no-daemon)") : ""}`,
      `  TTL ${Math.round(this.ttlMs / 60e3)} min (wall clock). There is NO idle timer on a native route: cerebro cannot see the vendor relay's traffic.`,
      "  The phone can do things the bridge forbids (other folders, model choice, possibly thread-level approval settings).",
      host === "codex" ? "  codex requirements.toml limits (no `never` approvals, no danger-full-access) are added now and removed at teardown." : "",
      host === "agy" ? "  agy starts in --mode plan (it waits for your review before implementing). The phone can still switch it to accept-edits or auto, which approve without asking." : "",
      ...warn.map((w) => `  WARNING: ${w}`),
      "  Pairing codes stay on this screen; never send one over any channel.",
    ].filter(Boolean).join("\n");
    if (!(await this.confirm(screen))) throw new Refused("refused:not-confirmed", "not armed: not confirmed at the desk");
    acquireLock(home, { kind: "native", host });
    this.startedAt = this.clock();
    for (const f of ["KILL", "DRILL", "DRILL.ok"]) { try { fs.unlinkSync(path.join(stateDir(home), f)); } catch { /* none */ } }
    try {
      const env = childEnv(this.env);
      if (host === "codex") {
        this.reqResult = requirementsArm(home, this.env);
        if (this.shared) { const r = runBin(this.bin, ["remote-control", "start", "--json"], { env }); this.log(`codex remote-control start: exit ${r.code}`); }
        else this.child = spawnBin(this.bin, ["remote-control", "--no-daemon", "--json"], { cwd: this.cwd, env, stdio: ["ignore", "pipe", "pipe"] });
      } else if (host === "cursor") {
        const args = ["worker", "--worker-dir", this.cwd, "--idle-release-timeout", "1800", "start"];
        if (args.some((a) => NATIVE_REFUSED_CURSOR.includes(a))) throw new Refused("refused:yolo", "refused cursor worker flag");
        this.child = spawnBin(this.bin, args, { cwd: this.cwd, env, stdio: ["ignore", "pipe", "pipe"] });
      } else this.child = spawnBin(this.bin, ["--remote-control", "--mode", "plan"], { cwd: this.cwd, env, stdio: this.agyStdio || "inherit" });
    } catch (e) { requirementsRestore(home); releaseLock(home); throw e; }
    if (this.child) {
      this.child.on("exit", (c) => { this.childExit = c ?? "signal"; });
      this.child.stdout?.on("data", (d) => this.log(`[${host}] ${redact(d.toString()).trim()}`));
      this.child.stderr?.on("data", (d) => this.log(`[${host}] ${redact(d.toString()).trim()}`));
    }
    // The child's start time is recorded NOW (synchronously): a native route's child
    // does not die with its supervisor, so the watchdog and `cerebro stop` must be
    // able to tell it from a reused pid. bin is kept for the shared-daemon cleanup.
    const childIdent = this.child?.pid ? procIdentity(this.child.pid) : null;
    writeState(home, { armed: true, kind: "native", host, route: host === "codex" ? (this.shared ? "codex-shared" : "codex-embedded") : host === "cursor" ? "cursor-worker" : "agy-session", pid: process.pid, childPid: this.child?.pid, childIdent, bin: this.bin, cwd: this.cwd, armedAt: new Date(this.startedAt).toISOString(), expiresAt: new Date(this.startedAt + this.ttlMs).toISOString() });
    this.log(this.checklist().join("\n"));
    this.log("Before you leave the desk, prove the stop path: run `cerebro stop --drill` in another terminal.");
  }
  checklist() {
    return [
      "native checklist:",
      `  [x] TTL set: ${Math.round(this.ttlMs / 60e3)} min; no idle timer (acknowledged at the arming screen)`,
      `  [x] approval/sandbox widening configs: none found${this.host === "agy" ? " (agy keeps none; it starts in --mode plan)" : ""}`,
      "  [x] terminal not elevated (no Administrator token, not root)",
      this.host === "codex" ? `  [x] requirements.toml limits: ${this.reqResult}` : null,
      this.host === "codex" ? `  [${this.shared ? " " : "x"}] embedded route (stopping touches no local codex session)` : null,
      this.host === "cursor" ? "  [x] worker flags: none of --computer-use --share-desktop --connect-workspace --sync-dashboard-secrets --mint-github-token" : null,
      this.host === "agy" ? "  [x] session-scoped --remote-control (not the persistent daemon), --mode plan" : null,
      "  [ ] paired account is your own: confirm in the vendor app",
      "  [ ] stop drill: pending (`cerebro stop --drill`)",
    ].filter(Boolean);
  }
  async tick() {
    if (this.done) return this.done;
    const dir = stateDir(this.home);
    try { fs.writeFileSync(path.join(dir, "heartbeat"), String(Date.now())); } catch { /* the watchdog then sees a stale beat */ }
    if (fs.existsSync(path.join(dir, "DRILL"))) { fs.unlinkSync(path.join(dir, "DRILL")); fs.writeFileSync(path.join(dir, "DRILL.ok"), new Date().toISOString()); this.log("stop drill: KILL path is watched; the real stop will work."); }
    if (fs.existsSync(path.join(dir, "KILL"))) { try { fs.unlinkSync(path.join(dir, "KILL")); } catch { /* raced */ } return this.teardown("kill-file", { attended: true }); }
    if (this.clock() >= this.startedAt + this.ttlMs) return this.teardown("ttl", { attended: false });
    if (this.childExit !== undefined) return this.teardown(`child-exit ${this.childExit}`, { attended: false });
    return null;
  }
  async teardown(reason, { attended }) {
    if (this.done) return this.done;
    this.done = reason;
    // One owner: if the watchdog (or `cerebro stop`) is already tearing this arming
    // down, it finishes the job and this supervisor stands down instead of racing it.
    const claim = teardownClaim(this.home, "supervisor");
    if (!claim) { this.log(`native ${this.host}: teardown (${reason}) is already being done by another cerebro process`); return reason; }
    // The beat keeps the watchdog off while this teardown waits on a person or a slow
    // CLI; the async waits below let it fire, a blocking runBin gets a beat either side.
    const beat = setInterval(() => claim.beat(), 2000); beat.unref?.();
    try {
      const env = childEnv(this.env);
      const ran = [];
      const run = (args) => { claim.beat(); const r = runBin(this.bin, args, { env }); claim.beat(); return r; };
      if (this.host === "codex") {
        if (!this.shared) { if (this.child?.pid) killTree(this.child.pid, { detached: true }); ran.push("killed embedded child"); }
        else {
          let full = false;
          if (attended) {
            const threads = await this.listThreads();
            // Bounded: nobody answering means "no" (disable only), not a teardown that never ends.
            full = threads.length === 0 || await Promise.race([
              this.confirm(`Stopping the shared daemon ends ${threads.length} thread(s), local TUI sessions included. Stop it? (no = only disable remote control)`),
              new Promise((r) => { const t = setTimeout(() => r(false), this.confirmTimeoutMs ?? 120e3); t.unref?.(); }),
            ]);
          }
          if (full) { run(["remote-control", "stop"]); ran.push("remote-control stop"); }
          run(["app-server", "daemon", "disable-remote-control"]); ran.push("daemon disable-remote-control");
          if (!full) this.log("the shared codex daemon was left running; only remote control was disabled");
        }
        this.reqRestore = requirementsRestore(this.home); ran.push(`requirements ${this.reqRestore}`);
      } else if (this.host === "cursor") { if (this.child?.pid) killTree(this.child.pid, { detached: true }); ran.push("killed worker"); }
      else { run(["remote-control", "stop"]); if (this.child?.pid) killTree(this.child.pid, { detached: true }); ran.push("remote-control stop", "killed session"); }
      const st = readState(this.home) || {};
      writeState(this.home, { ...st, armed: false, childPid: null, childIdent: null, disarmedAt: new Date(this.clock()).toISOString(), reason });
      releaseLock(this.home);
      this.log(`native ${this.host} torn down (${reason}): ${ran.join("; ")}`);
      return reason;
    } finally { clearInterval(beat); claim.release(); }
  }
}

// ------------------------------------------------------------------ dead-man --
/** Tear down on SIGTERM, SIGHUP (terminal closed), SIGBREAK and on any uncaught
 *  exception or rejection, THEN exit. SIGINT keeps its own handler (the KILL file
 *  for native, an attended stop). Returns the uninstaller. What this cannot catch
 *  (SIGKILL, a hard crash of node itself) is the watchdog's job. */
export function installDeadman(stop, { onInt = null, exit = (c) => process.exit(c) } = {}) {
  let going = false;
  const hard = async (why, code) => {
    if (going) return; going = true;
    try { await stop(why); } catch (e) { try { console.error(`cerebro: teardown after ${why} failed: ${e?.message || e}`); } catch { /* no stderr */ } }
    exit(code);
  };
  const codes = { SIGHUP: 129, SIGTERM: 143, SIGBREAK: 149 };
  const hs = Object.keys(codes).filter((sg) => sg !== "SIGBREAK" || IS_WIN).map((sg) => [sg, () => hard(`signal ${sg}`, codes[sg])]);
  const onErr = (e) => hard(`uncaught exception: ${e?.message || e}`, 1);
  for (const [sg, h] of hs) process.on(sg, h);
  if (onInt) process.on("SIGINT", onInt);
  process.on("uncaughtException", onErr); process.on("unhandledRejection", onErr);
  return () => {
    for (const [sg, h] of hs) process.removeListener(sg, h);
    if (onInt) process.removeListener("SIGINT", onInt);
    process.removeListener("uncaughtException", onErr); process.removeListener("unhandledRejection", onErr);
  };
}

/** `cerebro native`: arm, start the watchdog, tick until teardown. */
export async function runNative(sup, { home, tickMs = 1000, watchdog = true } = {}) {
  await sup.start();
  if (watchdog) spawnWatchdog(home, sup.env);
  const off = installDeadman((why) => sup.teardown(why, { attended: false }),
    { onInt: () => { try { fs.writeFileSync(path.join(stateDir(home), "KILL"), "ctrl-c"); } catch { /* state dir gone */ } } });
  try { while (!(await sup.tick())) await sleep(tickMs); } finally { off(); }
  return 0;
}

/** A second, detached process (its own session on POSIX, so closing the terminal
 *  does not reach it) that enforces the native route's limits even when the
 *  supervisor cannot: supervisor gone (SIGKILL, crash) -> tear down now; past
 *  expiresAt (+5 s grace) -> tear down; heartbeat stale for 30 s while the
 *  supervisor is alive (wedged) -> tear down. It exits as soon as the state is no
 *  longer armed or belongs to another arming. */
export function spawnWatchdog(home, env = process.env) {
  const id = crypto.randomBytes(8).toString("hex");
  writeState(home, { ...(readState(home) || {}), watchdogId: id });
  const w = spawn(process.execPath, [path.join(HOOKS, "cerebro-bridge.mjs"), "watchdog", home, id, String(process.pid)],
    { detached: true, stdio: "ignore", windowsHide: true, env: childEnv(env) });
  w.unref();
  return w.pid;
}
export async function runWatchdog(home, id, supPid, { pollMs = 500, wedgeMs = 30e3, graceMs = 5e3, staleMs = TEARDOWN_STALE_MS } = {}) {
  const beat = path.join(stateDir(home), "heartbeat");
  const supIdent = procIdentity(supPid); // so a reused supervisor pid is never killed
  let last = Date.now();
  for (;;) {
    await sleep(pollMs);
    const now = Date.now(); const slept = now - last > pollMs + 5000; last = now; // the machine slept: so did the supervisor
    const st = readState(home);
    if (!st?.armed || st.watchdogId !== id) return 0;
    let alive = pidAlive(supPid);
    let hb = 0; try { hb = Number(fs.readFileSync(beat, "utf8")) || 0; } catch { /* no beat yet */ }
    const reason = !alive ? "supervisor gone" : now >= Date.parse(st.expiresAt) + graceMs ? "ttl"
      : (!slept && hb && now - hb > wedgeMs) ? "supervisor wedged" : null;
    if (!reason) continue;
    // The supervisor's own teardown in progress (marker held, beat fresh) is left to
    // finish, however long its CLI calls take: one owner, never two. A marker that
    // goes stale (the supervisor wedged or died mid-teardown) is taken over.
    const claim = teardownClaim(home, "watchdog", { staleMs });
    if (!claim) continue;
    try {
      if (alive && !(supIdent && procIdentity(supPid) === supIdent)) alive = false; // that pid is someone else now
      // Stop the supervisor FIRST: it must not start a teardown of its own while this one runs.
      if (alive) { try { process.kill(supPid, "SIGKILL"); } catch { /* gone */ } }
      orphanCleanup(home, () => {}, { reason: `watchdog: ${reason}` }); // re-entrant: this process holds the marker
      try { new Audit(path.join(stateDir(home), "audit.log")).write("kill", { reason: `watchdog: ${reason}` }); } catch { /* best effort */ }
      const lk = readJsonFile(lockFile(home)); if (lk && lk.pid === supPid) { try { fs.unlinkSync(lockFile(home)); } catch { /* gone */ } }
    } finally { claim.release(); }
    return 0;
  }
}

/** The file channel is a test channel: same user, local disk only. Refused: a UNC
 *  or other network path (decided from the string, before any filesystem call), a
 *  folder owned by someone else, or one any other account can read or write. */
export function checkFileChannelDir(dir, { user = os.userInfo().username, icacls = null } = {}) {
  const s = String(dir ?? "");
  if (/^[\\/]{2}/.test(s)) return [`${s} is a network (UNC) path; the file channel is same-user and local only`];
  const abs = path.resolve(s);
  if (!fs.existsSync(abs)) return []; // created by FileChannel with mode 0700
  if (IS_WIN) {
    const out = icacls ?? spawnSync("icacls", [abs], { encoding: "utf8", windowsHide: true }).stdout;
    const bad = icaclsVerdict(out, user, abs).filter((w) => !/\\Administrators$/i.test(w) && !/^CREATOR OWNER$/i.test(w));
    if (bad.length) return [`${abs} is accessible to ${bad.join(", ")}; fix: icacls "${abs}" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"`];
  } else {
    const st = fs.statSync(abs);
    if (typeof process.getuid === "function" && st.uid !== process.getuid()) return [`${abs} is owned by uid ${st.uid}, not you`];
    if (st.mode & 0o077) return [`${abs} is group- or world-accessible; fix: chmod 700 "${abs}"`];
  }
  return [];
}

// ------------------------------------------------------------------- doctor --
export function doctor({ home = os.homedir(), cwd = process.cwd(), env = process.env, bins = {}, log = console.log } = {}) {
  const lines = []; const p = (s) => { lines.push(s); log(s); };
  p(`cerebro doctor (${VERSION}) on ${process.platform}, node ${process.version}`);
  for (const host of ["codex", "cursor", "pi", "gemini", "agy"]) {
    const bin = bins[host] || resolveHostBin(host, env);
    if (!bin) { p(`  ${host}: not on PATH`); continue; }
    const v = hostVersion(bin, env);
    p(`  ${host}: ${v}  (${bin.file}${bin.pre?.length ? " " + bin.pre.map((x) => path.basename(x)).join(" ") : ""})`);
    if (host === "cursor" && looksLikeNode(v)) p("    BROKEN: this is Cursor's bundled Node, not the CLI (arm refused). On Windows only cursor-agent.cmd is the CLI.");
    if (host === "cursor" && IS_WIN) { const shim = String(env.PATH || "").split(path.delimiter).map((d) => path.join(d, "cursor-agent")).find((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } }); if (shim) p(`    note: extensionless Git-Bash shim at ${shim} is ignored (known broken on this box)`); }
    const wid = host === "pi" || host === "agy" ? [] : checkWidening(host, { home, cwd, env });
    for (const w of wid) p(`    WIDENING (arm refused): ${w}`);
    if (host === "gemini" || host === "cursor") {
      const pr = readProof(home, host);
      p(`    ACP proof: ${pr ? `${pr.permissionReached && pr.outsideReadGated ? "ok" : "FAILED"} for ${pr.version} at ${pr.at}${pr.version !== v ? " (STALE: version changed)" : ""}` : "none - arm refused until `cerebro doctor --acp-proof " + host + "`"}`);
    }
    const route = { codex: "native (risk 1, unproven on Windows) else bridge codex-app", cursor: "native worker (cloud agent, not the local TUI) or bridge acp (proof-gated)", pi: "bridge pi-rpc (own) or attach (launched by cerebro)", gemini: "bridge acp (proof-gated); no native remote", agy: "native --remote-control" }[host];
    p(`    route: ${route}`);
  }
  for (const dir of [path.join(cwd, ".pi", "extensions"), path.join(home, ".pi", "agent", "extensions")]) {
    let ns = []; try { ns = fs.readdirSync(dir); } catch { /* none */ }
    for (const n of ns) if (/cerebro/i.test(n)) p(`  STRAY: ${path.join(dir, n)} - pi auto-loads this into every session; delete it (cerebro launches its extension with -e only)`);
  }
  const cp = credsPath(home);
  const probs = fs.existsSync(cp) ? checkCredsFile(cp) : [`${cp} not found (see references/channels.md)`];
  p(`  creds: ${probs.length ? probs.join("; ") : "ok (user-only, outside any repo)"}`);
  p(`  elevated: ${isElevated() ? "YES - every arm is refused from this terminal; use a non-admin one" : "no"}`);
  const st = readState(home); const lk = readJsonFile(lockFile(home));
  p(`  state: ${st?.armed ? `ARMED ${st.host} ${st.route} pid ${st.pid}${lk && !pidAlive(lk.pid) ? " (STALE: pid dead; `cerebro stop` cleans up)" : ""}` : "not armed"}`);
  return lines;
}

// --------------------------------------------------------------------- CLI --
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REFUSED_CLI = /^(--yolo|-y|--force|-f|--dangerously.*|--no-approvals?|--skip-approvals?|--auto-approve|--allow-all|--approval-mode=yolo|--full-auto)$/;

function parseArgs(argv) {
  const out = { _: [] }; const known = new Set(["--mode", "--cwd", "--ttl", "--idle", "--profile", "--channel", "--acp-proof"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (REFUSED_CLI.test(a) || (a === "--approval-mode" && argv[i + 1] === "yolo")) throw new Refused("refused:yolo", `${a}: approvals cannot be turned off, by flag, by config or by asking. Offer: --profile write, or the native route.`);
    if (a === "--shared" || a === "--drill") { out[a.slice(2)] = true; continue; }
    if (a.startsWith("--")) {
      const [k, v] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, argv[++i]];
      if (!known.has(k)) throw new Error(`unknown flag ${k}`);
      out[k.slice(2)] = v; continue;
    }
    out._.push(a);
  }
  return out;
}
async function ttyConfirm(screen) {
  console.log(screen);
  if (!process.stdin.isTTY) { console.log("not armed: arming is stop #2 and needs a person at this terminal. Run it in your own terminal window."); return false; }
  const rl = (await import("node:readline")).createInterface({ input: process.stdin, output: process.stdout });
  const ans = await new Promise((r) => rl.question("Type ARM to arm, anything else cancels: ", r)); rl.close();
  return ans.trim() === "ARM";
}
function loadCreds(home) {
  const f = credsPath(home);
  const probs = checkCredsFile(f);
  if (probs.length) throw new Refused("refused:creds", `credentials refused:\n  ${probs.join("\n  ")}`);
  const e = parseEnvFile(fs.readFileSync(f, "utf8"));
  if (!e.CEREBRO_TG_TOKEN || !/^\d+$/.test(e.CEREBRO_TG_USER || "")) throw new Refused("refused:creds", `${f} needs CEREBRO_TG_TOKEN and a numeric CEREBRO_TG_USER (usernames are refused: they are mutable)`);
  return { token: e.CEREBRO_TG_TOKEN, user: Number(e.CEREBRO_TG_USER) };
}

export async function main(argv = process.argv.slice(2), { home = os.homedir() } = {}) {
  const cmd = argv[0];
  let a;
  try { a = parseArgs(argv.slice(1)); }
  catch (e) {
    if (e instanceof Refused) { try { new Audit(path.join(stateDir(home), "audit.log")).write("refused", { reason: e.kind }); } catch { /* best effort */ } console.error(`cerebro: REFUSED (${e.kind}, no override): ${e.message}`); return 3; }
    console.error(`cerebro: ${e.message}`); return 2;
  }
  try {
    if (cmd === "selftest") return (await import(pathToFileURL(path.join(HOOKS, "cerebro-selftest.mjs")).href)).run();
    if (cmd === "doctor") {
      if (a["acp-proof"]) { const h = a["acp-proof"]; const bin = resolveHostBin(h); if (!bin) throw new Refused("refused:missing", `${h} not on PATH`); await acpProof(h, { home, bin }); return 0; }
      doctor({ home }); return 0;
    }
    if (cmd === "status") {
      const st = readState(home); const lk = readJsonFile(lockFile(home));
      if (!st?.armed) { console.log("not armed"); return 0; }
      const left = Math.round((Date.parse(st.expiresAt) - Date.now()) / 60e3);
      console.log(`ARMED ${st.host} route=${st.route} pid=${st.pid}${lk && !pidAlive(lk.pid) ? " (STALE: run cerebro stop)" : ""} cwd=${st.cwd} ttl-left=${left}min${st.userId ? ` paired-user=${st.userId}` : ""}`);
      return 0;
    }
    if (cmd === "stop") {
      const dir = stateDir(home); fs.mkdirSync(dir, { recursive: true });
      if (a.drill) {
        fs.writeFileSync(path.join(dir, "DRILL"), "1");
        for (let i = 0; i < 50; i++) { if (fs.existsSync(path.join(dir, "DRILL.ok"))) { console.log("stop drill ok: the supervisor saw it"); return 0; } await sleep(100); }
        console.log("stop drill FAILED: nothing picked it up in 5 s"); return 1;
      }
      fs.writeFileSync(path.join(dir, "KILL"), new Date().toISOString());
      const lkRaw = readRaw(lockFile(home));
      const lk = readJsonFile(lockFile(home));
      if (lockHolderAlive(lk)) {
        // 6 s to see the KILL file; longer while the holder is visibly tearing down
        // (its marker fresh): killing it mid-teardown would leave two owners.
        const tearing = () => { const td = readJsonFile(teardownFile(home)); return td?.pid === lk.pid && ageMs(teardownFile(home)) < TEARDOWN_STALE_MS; };
        for (let i = 0; pidAlive(lk.pid) && (i < 60 || tearing()); i++) await sleep(100);
        if (pidAlive(lk.pid) && procIdentity(lk.pid) === lk.ident) { killTree(lk.pid); console.log(`killed cerebro pid ${lk.pid}`); }
      } else if (lk && pidAlive(lk.pid)) console.log(`lock pid ${lk.pid} is not the cerebro that took the lock (pid reused, or no identity recorded); not killed`);
      orphanCleanup(home, console.log);
      // Only the lock this stop judged: a lock a new arming took meanwhile is not ours to delete.
      if (lkRaw !== null && readRaw(lockFile(home)) === lkRaw) { try { fs.unlinkSync(lockFile(home)); } catch { /* gone */ } }
      try { fs.unlinkSync(path.join(dir, "KILL")); } catch { /* consumed */ }
      console.log("stopped"); return 0;
    }
    if (cmd === "native") {
      const sup = new NativeSupervisor({ host: a._[0], home, cwd: path.resolve(a.cwd || process.cwd()), ttlMs: parseDuration(a.ttl, 2 * 3600e3), shared: !!a.shared, confirm: ttyConfirm });
      return await runNative(sup, { home });
    }
    if (cmd === "watchdog") { // started by runNative only
      const [h, id, sup] = a._;
      return await runWatchdog(h, id, Number(sup));
    }
    if (cmd === "arm") {
      const host = a._[0];
      let channel, token = null, user;
      const ch = a.channel || "telegram";
      if (ch.startsWith("file:")) {
        const probs = checkFileChannelDir(ch.slice(5));
        if (probs.length) throw new Refused("refused:channel", `file channel refused (it is same-user, local-only):\n  ${probs.join("\n  ")}`);
        channel = new FileChannel(path.resolve(ch.slice(5))); user = Number(process.env.CEREBRO_FILE_USER || 0); if (!user) throw new Refused("refused:creds", "--channel file: needs CEREBRO_FILE_USER (the numeric id the file phone uses)"); }
      else { const c = loadCreds(home); token = c.token; user = c.user; channel = new TelegramChannel(token); }
      const b = new Bridge({ host, mode: a.mode || "own", cwd: a.cwd || process.cwd(), profile: a.profile || "read", ttlMs: parseDuration(a.ttl, 2 * 3600e3), idleMs: parseDuration(a.idle, 30 * 60e3), home, channel, channelName: ch.startsWith("file:") ? "file" : "telegram", token, allowedUserId: user, confirm: ttyConfirm, attachLog: path.join(stateDir(home), "mirror.log") });
      await b.arm();
      await b.run();
      return 0;
    }
    console.log("usage: cerebro doctor [--acp-proof gemini|cursor] | native <codex|cursor|agy> [--ttl 2h] [--shared] | arm <pi|gemini|cursor|codex> [--mode own|attach] [--cwd DIR] [--ttl 2h] [--idle 30m] [--profile read|write] [--channel telegram|file:DIR] | status | stop [--drill] | selftest");
    return cmd ? 2 : 0;
  } catch (e) {
    if (e instanceof Refused) { try { new Audit(path.join(stateDir(home), "audit.log")).write("refused", { reason: e.kind }); } catch { /* best effort */ } console.error(`cerebro: REFUSED (${e.kind}): ${e.message}`); return 3; }
    console.error(`cerebro: ${e.stack || e.message}`); return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then((c) => process.exit(c));
