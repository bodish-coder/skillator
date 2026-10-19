// remote-cerebro core: the policy that every route shares. Pure functions plus a
// few small classes, no I/O beyond the filesystem reads a policy needs. The bridge
// (cerebro-bridge.mjs) and the pi extension (pi-cerebro.ts) both import this file,
// so the secret denylist, the gate and the redaction live in exactly one place.
//
// Node >= 20 built-ins only. No dependencies.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

export const IS_WIN = process.platform === "win32";
// Case-insensitive filesystems by default: NTFS and APFS/HFS+ (gemini's
// normalizePath makes the same call).
const FOLD_CASE = IS_WIN || process.platform === "darwin";
export const VERSION = "1.0.0";

// ---------------------------------------------------------------- locations --

export function stateDir(home) { return path.join(home, ".skillator", "cerebro"); }
export function credsPath(home) { return path.join(home, ".config", "skillator", "cerebro.env"); }
export function userDenyPath(home) { return path.join(home, ".config", "skillator", "cerebro-deny.txt"); }
export function codexHome(home, env) { return env.CODEX_HOME ? path.resolve(env.CODEX_HOME) : path.join(home, ".codex"); }

// ------------------------------------------------------------ path handling --

const canon = (p) => {
  let s = path.normalize(p);
  if (s.length > 1 && (s.endsWith("/") || s.endsWith("\\")) && !/^[A-Za-z]:\\$/.test(s)) s = s.slice(0, -1);
  return FOLD_CASE ? s.toLowerCase() : s;
};
export function isUnder(child, parent) {
  const c = canon(child), p = canon(parent);
  if (c === p) return true;
  const sep = IS_WIN ? "\\" : "/";
  return c.startsWith(p.endsWith(sep) ? p : p + sep);
}

/** Turn whatever an agent typed into an absolute path: ~, $HOME, %USERPROFILE%,
 *  \\?\ prefixes, Git-Bash /c/... and relative paths all land on one spelling.
 *  The primary interpretation only; the gate classifies every spelling a host
 *  could open (pathCandidates). Throws Unnormalizable for a device or UNC path. */
export function normalizeInput(raw, { cwd, home, env = {} }) {
  const r = toAbs(String(raw ?? "").trim().replace(/^["']|["']$/g, ""), { cwd, home, env });
  if (r.unsafe) throw new Unnormalizable(r.unsafe, String(raw));
  return r.abs[0];
}
export class Unnormalizable extends Error { constructor(kind, raw) { super(`${kind}: ${raw}`); this.kind = kind; } }

function expandVars(p, home, env) {
  const vars = {
    HOME: home, USERPROFILE: env.USERPROFILE || home,
    APPDATA: env.APPDATA || path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: env.LOCALAPPDATA || path.join(home, "AppData", "Local"),
    CODEX_HOME: codexHome(home, env),
  };
  p = p.replace(/\$\{(\w+)\}|\$env:(\w+)|\$(\w+)|%(\w+)%/gi, (m, a, b, c, d) => vars[(a || b || c || d || "").toUpperCase()] ?? m);
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(home, p.slice(2));
  return p;
}

/** One typed spelling -> {abs: [absolute paths it can mean]} or {unsafe: kind}.
 *  Windows: \\?\X:\ and \\.\X:\ lose their prefix, \\?\UNC\ becomes UNC; every
 *  other device-namespace path (\\?\GLOBALROOT, \\?\Volume{..}, \\.\pipe, \??\)
 *  and EVERY UNC path (\\host\share, //host/share: admin shares, loopback, this
 *  machine's name) cannot be mapped onto the denylist and is refused outright. */
function toAbs(typed, { cwd, home, env }) {
  let p = expandVars(typed === "" ? "." : typed, home, env);
  const out = [];
  if (IS_WIN) {
    let q = p.replace(/\//g, "\\");
    if (/^\\\\[?.]\\/.test(q)) {
      const rest = q.slice(4);
      if (/^[A-Za-z]:(\\|$)/.test(rest)) q = rest;
      else if (/^UNC\\/i.test(rest)) q = "\\\\" + rest.slice(4);
      else return { unsafe: "device-path" };
    } else if (/^\\\?\?\\/.test(q)) return { unsafe: "device-path" };
    if (/^\\\\/.test(q)) return { unsafe: "unc-path" };
    const m = /^\\([a-zA-Z])(\\.*)?$/.exec(q); // Git-Bash /c/... (Node itself would read C:\c\...)
    if (m) out.push(`${m[1].toUpperCase()}:${m[2] || "\\"}`);
    p = q;
  }
  out.push(path.resolve(cwd, p));
  return { abs: out };
}

// pi-coding-agent 0.74.2 dist/core/tools/path-utils.js: expandPath strips ONE
// leading '@' (normalizeAtPrefix), maps Unicode spaces to ' ' (normalizeUnicodeSpaces),
// expands '~' and '~/' with os.homedir(); resolveReadPath then also tries the
// macOS AM/PM, NFD and curly-quote variants of a path that does not exist.
const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
// gemini-cli 0.57.0: NULs are stripped, resolveDefensiveToolPath strips '@' and
// then leading slashes from a relative path, resolveToRealPath turns file:// URLs
// into paths and percent-decodes (decodeURIComponent) before resolving.
function typedVariants(s) {
  const out = new Set([s]); let bad = null;
  const add = (x) => { if (typeof x === "string") out.add(x); };
  for (let round = 0; round < 3; round++) {
    for (const v of [...out]) {
      add(v.replace(/\0/g, ""));
      if (v.startsWith("@")) { add(v.slice(1)); add(v.slice(1).replace(/^[\\/]+/, "")); }
      add(v.replace(UNICODE_SPACES, " "));
      if (/^file:/i.test(v)) { try { add(fileURLToPath(v)); } catch { bad = "file-url"; } }
      if (v.includes("%")) { try { add(decodeURIComponent(v)); } catch { /* not percent-encoded */ } }
    }
  }
  return { list: [...out].filter((x) => !/^file:/i.test(x)), bad };
}
// What the filesystem may open for one absolute path: Win32 drops an NTFS stream
// suffix (name::$DATA) and, for non-\\?\ callers, trailing dots and spaces;
// pi's read tries the AM/PM, NFD and curly-quote variants; NFC for macOS input.
function fsVariants(abs) {
  const out = new Set([abs]); let bad = null;
  if (IS_WIN) {
    const root = path.parse(abs).root; const parts = abs.slice(root.length).split("\\");
    const fixed = parts.map((c) => {
      if (c === "." || c === ".." || c === "") return c;
      const s = c.replace(/:.*$/, "").replace(/[. ]+$/, "");
      if (s === "") bad = "dots-only-component";
      return s;
    });
    out.add(root + fixed.join("\\"));
  }
  for (const v of [...out]) {
    out.add(v.replace(/ (AM|PM)\./gi, "\u202F$1.")); out.add(v.normalize("NFD")); out.add(v.normalize("NFC"));
    out.add(v.replace(/'/g, "\u2019")); out.add(v.normalize("NFD").replace(/'/g, "\u2019"));
  }
  return { list: [...out], bad };
}
/** Every absolute path a host could open for what the agent typed, under both
 *  the armed home and this process's own home (pi expands '~' with os.homedir()).
 *  {cands: [...], unsafe: kind|null}; unsafe means deny, whatever else is true. */
export function pathCandidates(raw, { cwd, home, env = {} }) {
  const typed = String(raw ?? "").trim().replace(/^["']|["']$/g, "");
  const { list, bad } = typedVariants(typed);
  const homes = [...new Set([home, os.homedir()].filter(Boolean))];
  const cands = new Set(); let unsafe = bad;
  for (const t of list) for (const h of homes) {
    const r = toAbs(t, { cwd, home: h, env });
    if (r.unsafe) { unsafe ||= r.unsafe; continue; }
    for (const a of r.abs) { const f = fsVariants(a); if (f.bad) unsafe ||= f.bad; for (const x of f.list) cands.add(x); }
  }
  return { cands: [...cands], unsafe };
}

/** Resolve symlinks, junctions and 8.3 short names through the longest existing
 *  prefix; the not-yet-existing remainder is appended as is. */
export function realResolve(abs) {
  let cur = abs; const rest = [];
  for (;;) {
    try {
      const r = fs.realpathSync.native(cur);
      return rest.length ? path.join(r, ...rest.reverse()) : r;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return abs;
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
}

// ------------------------------------------------------- secret-path denylist --

/** Directories and files under the user's home that are never readable from the
 *  phone. references/security.md mirrors this list; this constant is the truth. */
export const SECRET_HOME_PATHS = [
  ".ssh", ".gnupg", ".aws", ".azure", ".config/gcloud", ".kube",
  ".docker/config.json", ".npmrc", ".netrc", ".git-credentials", ".config/gh",
  ".config/skillator", ".skillator/cerebro",
  ".cursor/cli-config.json",
  ".gemini/oauth_creds.json", ".gemini/google_accounts.json", ".gemini/settings.json", ".gemini/.env",
  ".pi/agent/auth.json",
  ".claude.json",
  // browser profiles
  "AppData/Local/Google/Chrome/User Data", "AppData/Local/Microsoft/Edge/User Data",
  "AppData/Local/BraveSoftware", "AppData/Roaming/Mozilla/Firefox/Profiles",
  "Library/Application Support/Google/Chrome", "Library/Application Support/Firefox",
  ".config/google-chrome", ".config/chromium", ".config/BraveSoftware", ".mozilla",
];
// Secret-shaped file names, anywhere (inside the armed folder too).
const SECRET_FILE_NAMES = new Set([".npmrc", ".netrc", "_netrc", ".pgpass", ".git-credentials", ".pypirc", ".htpasswd", ".dockercfg",
  "credentials", "credentials.json", "credentials.yml", "credentials.yaml", "kubeconfig", "terraform.tfvars", "terraform.tfstate"]);
const SECRET_BASENAME = (name) => {
  const n = FOLD_CASE ? name.toLowerCase() : name;
  return n === ".env" || n.startsWith(".env.") || /\.(pem|key|p12|pfx|jks|keystore|ppk|kdbx|tfstate)$/i.test(n) || /^id_/i.test(n)
    || SECRET_FILE_NAMES.has(n.toLowerCase()) || /^secrets?\.(ya?ml|json|toml|env|ini)$/i.test(n) || /^service[-_]?account.*\.json$/i.test(n);
};
// A path through one of these folder names is secret wherever it sits (a copied
// ~/.ssh inside a repo, a backup of ~/.aws).
const SECRET_DIR_NAMES = new Set([".ssh", ".gnupg", ".aws", ".azure", ".kube", ".password-store"]);

export function secretRoots(home, env = {}) {
  const roots = SECRET_HOME_PATHS.map((r) => path.join(home, ...r.split("/")));
  roots.push(path.join(codexHome(home, env), "auth.json"));
  // every ~/.codex*/auth.json and ~/.claude*/.credentials.json (profiles like ~/.codex-bodish)
  try {
    for (const d of fs.readdirSync(home)) {
      if (/^\.codex/i.test(d)) roots.push(path.join(home, d, "auth.json"));
      if (/^\.claude/i.test(d)) roots.push(path.join(home, d, ".credentials.json"));
    }
  } catch { /* home unreadable: the fixed list still applies */ }
  try {
    for (const line of fs.readFileSync(userDenyPath(home), "utf8").split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      try { roots.push(normalizeInput(s, { cwd: home, home, env })); } catch { /* a UNC/device entry: those are refused anyway */ }
    }
  } catch { /* no local additions */ }
  const all = new Set();
  for (const r of roots) { all.add(r); all.add(realResolve(r)); }
  return [...all];
}

export function isSecretPath(abs, roots) {
  for (const r of roots) if (isUnder(abs, r)) return true;
  const parts = abs.split(/[\\/]+/).filter(Boolean).map((c) => (FOLD_CASE ? c.toLowerCase() : c));
  if (parts.slice(0, -1).some((c) => SECRET_DIR_NAMES.has(c)) || SECRET_DIR_NAMES.has(parts[parts.length - 1])) return true;
  return path.basename(abs) !== "" && SECRET_BASENAME(path.basename(abs));
}
/** The deny roots for the armed home AND this process's own home. */
export function allRoots(home, env = {}) {
  return [...new Set([...secretRoots(home, env), ...(os.homedir() && os.homedir() !== home ? secretRoots(os.homedir(), env) : [])])];
}

/** One answer per path: where it really is, whether it is secret, whether it is
 *  inside the armed cwd. Every spelling a host could open (pathCandidates) is
 *  checked, typed AND resolved: secret if ANY is secret, inside only if ALL are
 *  inside. A spelling that cannot be normalised (device or UNC path) is unsafe. */
export function classifyPath(raw, ctx) {
  const { cands, unsafe } = pathCandidates(raw, ctx);
  const roots = ctx.roots || allRoots(ctx.home, ctx.env);
  const realCwd = realResolve(path.resolve(ctx.cwd));
  let secretAt = null, inside = cands.length > 0, real = null; const reals = new Set();
  for (const c of cands) {
    const r = realResolve(c); real ??= r; reals.add(r);
    if (!secretAt && (isSecretPath(c, roots) || isSecretPath(r, roots))) secretAt = c;
    // Inside means the RESOLVED path is under the resolved cwd: a symlink or junction
    // inside the folder that points out of it is outside.
    if (!isUnder(r, realCwd)) inside = false;
  }
  const abs = secretAt || cands[0] || String(raw);
  return { abs, real: real || abs, reals: [...reals], secret: !!secretAt, inside: inside && !unsafe, unsafe };
}

const SECRET_WORDS = /(^|[\\/\s"'=])(\.ssh|\.gnupg|\.aws|\.azure|\.kube|\.netrc|\.npmrc|\.git-credentials|cerebro\.env|arm\.token|auth\.json|cli-config\.json|oauth_creds\.json|google_accounts\.json|\.credentials\.json|\.claude\.json|id_(rsa|ed25519|ecdsa|dsa)[\w.]*|\.env(\.[\w.-]+)?|[\w.-]+\.pem|[\w.-]+\.key)(?=$|[\\/\s"';|&)<>])/i;

/** Best-effort literal scan of a shell command for a secret path. An obfuscated
 *  command still goes to the phone for approval; this only hard-blocks the plain ones. */
export function commandSecretHit(command, ctx) {
  const cmd = String(command ?? "");
  const w = SECRET_WORDS.exec(cmd);
  if (w) return w[2];
  const roots = ctx.roots || allRoots(ctx.home, ctx.env);
  for (const tok of cmd.split(/[\s"'`|;&<>()=,]+/)) {
    if (!tok || !/[\\/~$%.@]/.test(tok)) continue;
    if (/^-/.test(tok) || /^[a-z][a-z0-9+.-]+:\/\//i.test(tok) && !/^file:/i.test(tok)) continue;
    const c = classifyPath(tok, { ...ctx, roots });
    if (c.secret || c.unsafe) return tok;
  }
  return null;
}

/** Could a recursive search of `dir` read a secret? Deny by default: a tree too
 *  big or too deep to scan counts as "possibly secret", like a hit. */
export function dirHasSecrets(dir, { limit = 3000, maxDepth = 8 } = {}) {
  let seen = 0; const stack = [[dir, 0]];
  while (stack.length) {
    const [d, depth] = stack.pop();
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (++seen > limit) return true;
      if (!e.isDirectory() && SECRET_BASENAME(e.name)) return true;
      if (e.isDirectory() && SECRET_DIR_NAMES.has(FOLD_CASE ? e.name.toLowerCase() : e.name)) return true;
      if (e.isDirectory() && e.name !== ".git") { if (depth >= maxDepth) return true; stack.push([path.join(d, e.name), depth + 1]); }
    }
  }
  return false;
}
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

// ------------------------------------------------------------------- the gate --

export const PROFILE_TOOLS = {
  read: ["read", "grep", "find", "ls"],
  write: ["read", "grep", "find", "ls", "bash", "edit", "write"],
};

/** The pi gate, deny by default. Returns {action: allow|ask|block, reason, detail}. */
export function gateDecide(toolName, input, ctx) {
  const tools = PROFILE_TOOLS[ctx.profile || "read"] || PROFILE_TOOLS.read;
  const roots = ctx.roots || allRoots(ctx.home, ctx.env);
  const c2 = { ...ctx, roots };
  const block = (reason, detail = "") => ({ action: "block", reason, detail });
  if (!tools.includes(toolName)) return block(PROFILE_TOOLS.write.includes(toolName) ? "tool-not-in-profile" : "unknown-tool", toolName);
  if (["read", "grep", "find", "ls"].includes(toolName)) {
    const c = classifyPath(input?.path ?? ".", c2);
    if (c.unsafe) return block("unnormalizable-path", `${c.unsafe}: ${input?.path}`);
    if (c.secret) return block("secret-path", c.abs);
    if (toolName === "grep" && input?.glob && SECRET_WORDS.test(" " + input.glob)) return block("secret-path", input.glob);
    if (!c.inside) return { action: "ask", reason: "outside-cwd", detail: `${toolName} outside the armed folder: ${c.abs}` };
    if (toolName === "grep" && c.reals.some((r) => isDir(r) && dirHasSecrets(r)))
      return { action: "ask", reason: "dir-has-secrets", detail: `grep over ${c.abs}, which holds (or may hold) secret files (.env, keys); approving can send their contents to the phone` };
    return { action: "allow", reason: "inside-cwd", detail: c.abs };
  }
  if (toolName === "bash") {
    const hit = commandSecretHit(input?.command, c2);
    if (hit) return block("secret-path", hit);
    return { action: "ask", reason: "bash", detail: `bash: ${String(input?.command ?? "")}` };
  }
  // edit / write
  const c = classifyPath(input?.path ?? "", c2);
  if (c.unsafe) return block("unnormalizable-path", `${c.unsafe}: ${input?.path}`);
  if (c.secret) return block("secret-path", c.abs);
  return { action: "ask", reason: toolName, detail: `${toolName}: ${c.abs}` };
}

/** The policy for a structured approval request from an ACP or codex-app host.
 *  req = {kind: read|search|edit|execute|other|command|file|permissions, paths[], command}.
 *  Profile read is read-only on every host: a codex command approval (a command
 *  asking to leave the read-only sandbox) is denied like an ACP execute. */
export function requestPolicy(req, ctx) {
  const roots = ctx.roots || allRoots(ctx.home, ctx.env);
  const c2 = { ...ctx, roots };
  const paths = (req.paths || []).filter(Boolean).map((p) => classifyPath(p, c2));
  // grantPaths: folders a grant covers as a whole (codex permissions, a fileChange
  // grantRoot). A grant over a folder that CONTAINS a secret root is a grant over the secret.
  const grants = (req.grantPaths || []).filter(Boolean).map((p) => classifyPath(p, c2));
  const uns = [...paths, ...grants].find((c) => c.unsafe);
  if (uns) return { action: "deny", reason: "unnormalizable-path", detail: `${uns.unsafe}: ${uns.abs}` };
  const sec = [...paths, ...grants].find((c) => c.secret);
  if (sec) return { action: "deny", reason: "secret-path", detail: sec.abs };
  for (const g of grants) {
    const inner = roots.find((r) => [g.abs, ...g.reals].some((x) => isUnder(r, x)));
    if (inner) return { action: "deny", reason: "grant-contains-secret", detail: `${g.abs} holds ${inner}` };
  }
  if (req.command) { const hit = commandSecretHit(req.command, c2); if (hit) return { action: "deny", reason: "secret-path", detail: hit }; }
  // A request that carries a command runs that command, whatever kind the host put on
  // it (ACP kinds are agent-supplied hints): it is treated as execute, never auto-allowed.
  const readish = ["read", "search", "fetch-local", "list"].includes(req.kind) && !req.command;
  if (ctx.profile === "read" && !readish) return { action: "deny", reason: "profile-read", detail: req.kind };
  if (readish && paths.length && paths.every((c) => c.inside)) {
    if (req.kind === "search" && paths.some((c) => c.reals.some((r) => isDir(r) && dirHasSecrets(r))))
      return { action: "ask", reason: "dir-has-secrets" };
    return { action: "allow", reason: "inside-cwd" };
  }
  return { action: "ask", reason: readish ? "outside-cwd" : req.kind };
}

// -------------------------------------------------------------- refused flags --

export function checkSpawnArgv(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]); const next = String(argv[i + 1] ?? "");
    const val = (flag) => (a === flag ? next : a.startsWith(flag + "=") ? a.slice(flag.length + 1) : null);
    if (a === "--yolo" || a === "-y") out.push(a);
    else if (a === "--force" || a === "-f") out.push(a);
    else if (/^--dangerously/.test(a)) out.push(a);
    else if (/^--(allowed-tools|computer-use|share-desktop|connect-workspace|sync-dashboard-secrets|mint-github-token|full-auto)\b/.test(a)) out.push(a);
    else if (val("--approval-mode") === "yolo") out.push("--approval-mode yolo");
    else if (val("-a") === "never" || val("--ask-for-approval") === "never") out.push("-a never");
    else if (val("-s") === "danger-full-access" || val("--sandbox") === "danger-full-access") out.push("-s danger-full-access");
    else if ((val("-c") ?? val("--config")) !== null) {
      const v = val("-c") ?? val("--config");
      if (/approval_policy\s*=\s*["']?never/.test(v) || /sandbox_mode\s*=\s*["']?danger-full-access/.test(v)) out.push(`-c ${v}`);
    } else if (val("--listen") !== null && /0\.0\.0\.0|\[::\]/.test(val("--listen"))) out.push(`--listen ${val("--listen")}`);
  }
  return out;
}

// ---------------------------------------------------------- widening configs --

/** Tiny TOML subset: [table], [[array-table]], key = "str" | 'str' | num | bool | [str,...] | {inline}. */
export function parseTomlLite(text) {
  const root = {}; let cur = root;
  for (const raw of String(text).replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    let m;
    if ((m = /^\[\[([^\]]+)\]\]$/.exec(line))) { const k = m[1].trim(); (root[k] ||= []).push(cur = {}); continue; }
    if ((m = /^\[([^\]]+)\]$/.exec(line))) {
      cur = root; for (const part of m[1].split(".").map((s) => s.trim().replace(/^"|"$/g, ""))) cur = (cur[part] ||= {});
      continue;
    }
    if ((m = /^([A-Za-z0-9_."-]+)\s*=\s*(.+)$/.exec(line))) cur[m[1].replace(/^"|"$/g, "")] = tomlValue(m[2].trim());
    else throw new Error(`toml: cannot parse line: ${raw}`);
  }
  return root;
}
function tomlValue(v) {
  if (/^".*"$/.test(v)) return JSON.parse(v);
  if (/^'.*'$/.test(v)) return v.slice(1, -1);
  if (/^(true|false)$/.test(v)) return v === "true";
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^\[.*\]$/.test(v)) { const inner = v.slice(1, -1).trim(); return inner ? splitTop(inner).map((x) => tomlValue(x.trim())) : []; }
  if (/^\{.*\}$/.test(v)) { const o = {}; for (const kv of splitTop(v.slice(1, -1))) { const [k, ...r] = kv.split("="); if (k.trim()) o[k.trim()] = tomlValue(r.join("=").trim()); } return o; }
  throw new Error(`toml: unsupported value ${v}`);
}
function splitTop(s) {
  const out = []; let depth = 0, q = null, buf = "";
  for (const ch of s) {
    if (q) { buf += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; buf += ch; continue; }
    if (ch === "[" || ch === "{") depth++;
    if (ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) { out.push(buf); buf = ""; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out;
}
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "")); } catch { return null; } };
const readText = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };

const CURSOR_SAFE_APPROVAL = new Set(["default", "ask", "manual", "prompt", "request"]);
const CURSOR_UNSAFE_SANDBOX = new Set(["disabled", "off", "none", "danger-full-access", "false"]);

/** gemini policy rules with decision "allow" that may stay in a user or workspace
 *  policy while armed. Deny by default: an allow rule auto-approves past the bridge
 *  (no session/request_permission, so the phone is never asked), whatever the tool -
 *  shell, edit, web_fetch, the read tools, MCP. PLAN-remote-cli.md failure mode 7
 *  permits none, so this list is empty; an entry is a predicate over the parsed rule. */
export const GEMINI_PERMITTED_ALLOW_RULES = [];

/** An admin token or root reaches the phone along with the shell. Unknown counts
 *  as elevated: the arm refuses rather than guess. */
export function whoamiElevated(status, stdout) {
  return status !== 0 || /S-1-16-(12288|16384)\b/.test(stdout || "");
}
export function isElevated() {
  if (!IS_WIN) return typeof process.geteuid === "function" && process.geteuid() === 0;
  const exe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "whoami.exe");
  const r = spawnSync(exe, ["/groups"], { encoding: "utf8", windowsHide: true, timeout: 10000 });
  return whoamiElevated(r.status, r.stdout);
}

/** Failure mode 7: refuse to arm when a host config widens auto-approval. No override. */
export function checkWidening(host, { home, cwd, env = {} }) {
  const out = [];
  if (host === "gemini") {
    for (const f of [path.join(home, ".gemini", "settings.json"), path.join(cwd, ".gemini", "settings.json")]) {
      const j = readJson(f); if (!j) continue;
      const mode = j.general?.defaultApprovalMode ?? j.defaultApprovalMode;
      if (mode !== undefined && mode !== "default") out.push(`${f}: general.defaultApprovalMode = ${mode}`);
      const allowed = j.tools?.allowed ?? j.allowedTools;
      if (Array.isArray(allowed) && allowed.length) out.push(`${f}: tools.allowed is not empty`);
    }
    for (const dir of [path.join(home, ".gemini", "policies"), path.join(cwd, ".gemini", "policies")]) {
      let files = []; try { files = fs.readdirSync(dir).filter((n) => n.endsWith(".toml")); } catch { continue; }
      for (const n of files) {
        let t; try { t = parseTomlLite(readText(path.join(dir, n))); } catch { out.push(`${path.join(dir, n)}: unreadable policy`); continue; }
        for (const r of [].concat(t.rule || [])) {
          if (String(r?.decision ?? "").trim().toLowerCase() !== "allow") continue;
          if (GEMINI_PERMITTED_ALLOW_RULES.some((ok) => ok(r))) continue;
          const names = [].concat(r.toolName ?? []);
          out.push(`${path.join(dir, n)}: allow rule for ${[r.mcpName ? `mcp ${r.mcpName}` : null, names.join(",") || null, r.commandPrefix || r.commandRegex ? "shell commands" : null].filter(Boolean).join(" ") || "every tool"}`);
        }
      }
    }
  }
  if (host === "codex") {
    const f = path.join(codexHome(home, env), "config.toml");
    const t = readText(f);
    if (t) {
      for (const line of t.split(/\r?\n/)) {
        if (/^\s*approval_policy\s*=\s*["']?never/.test(line)) out.push(`${f}: approval_policy = never`);
        if (/^\s*sandbox_mode\s*=\s*["']?danger-full-access/.test(line)) out.push(`${f}: sandbox_mode = danger-full-access`);
      }
    }
  }
  if (host === "cursor") {
    const f = path.join(home, ".cursor", "cli-config.json");
    const j = readJson(f);
    if (j) {
      for (const e of [].concat(j.permissions?.allow ?? [])) if (/^(\*|[A-Za-z]+\(\*{1,2}\))$/.test(String(e).trim())) out.push(`${f}: permissions.allow has blanket entry ${e}`);
      if (j.approvalMode !== undefined && !CURSOR_SAFE_APPROVAL.has(String(j.approvalMode).toLowerCase())) out.push(`${f}: approvalMode = ${j.approvalMode}`);
      const sb = typeof j.sandbox === "object" && j.sandbox !== null ? (j.sandbox.mode ?? j.sandbox.enabled) : j.sandbox;
      if (sb !== undefined && CURSOR_UNSAFE_SANDBOX.has(String(sb).toLowerCase())) out.push(`${f}: sandbox = ${sb}`);
    }
  }
  return out;
}

// ------------------------------------------------------------------ redaction --

const PATTERNS = [
  ["bot-token", /\b\d{6,12}(?::|%3[aA])[A-Za-z0-9_-]{30,}\b/g],
  // PEM and PGP: "-----BEGIN ... KEY-----" and "-----BEGIN PGP PRIVATE KEY BLOCK-----"
  ["private-key", /-----BEGIN [A-Z0-9 ]*KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*KEY(?: BLOCK)?-----|$)/g],
  ["private-key-b64", /\bLS0tLS1CRUdJTi[A-Za-z0-9+/=\r\n]*/g], // base64 of "-----BEGIN"
  // Distinctive prefixes match even glued to other word characters (xxxghp_...): a tool
  // line, a URL or a cut buffer has no word boundary to offer. sk- keeps its \b ("disk-").
  ["stripe-key", /[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g],
  ["openai-key", /\bsk-[A-Za-z0-9_-]{8,}/g],
  ["github-token", /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ["gitlab-token", /glpat-[A-Za-z0-9_-]{20,}/g],
  ["npm-token", /npm_[A-Za-z0-9]{30,}/g],
  ["huggingface-token", /\bhf_[A-Za-z0-9]{30,}/g],
  ["google-api-key", /AIza[0-9A-Za-z_-]{30,}/g],
  ["aws-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["slack-token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/g],
  ["jwt", /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g],
  ["bearer", /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi],
];
// scheme://user:PASSWORD@host - the password goes (it may hold '/'), the rest stays
// readable. host:PORT/path@x is not a password: a run of digits then '/' is skipped.
const URL_CREDS = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)(?!\d+\/)([^\s@]+)@/gi;
const SECRET_NAME = String.raw`[A-Za-z0-9_.-]*(?:secret|passw(?:or)?d|passphrase|token|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_.-]*`;
// name = "a quoted value, spaces and all"
const QUOTED_ASSIGNED = new RegExp(String.raw`\b(${SECRET_NAME}["']?\s*[:=]\s*)(["'])(?!\[redacted)([^"'\n]{6,}?)\2`, "gi");
// name = value / name: value where the name says secret (aws_secret_access_key=...,
// password: ..., api_key=...). The value goes; the name stays.
const ASSIGNED = new RegExp(String.raw`\b(${SECRET_NAME}["']?\s*[:=]\s*["']?)(?!\[redacted)([^\s"',;]{6,})`, "gi");
// CLI flags: --password hunter2, --token=x (the = form is ASSIGNED's).
const FLAG = /(^|\s)(--(?:password|passwd|passphrase|token|secret|api-key|apikey|access-token|auth-token|client-secret)\s+)(?!\[redacted|-)(\S{4,})/gi;
const BASIC_AUTH = /\b(Authorization:\s*Basic\s+)[A-Za-z0-9+/]{6,}=*/gi;
const XML_SECRET = /<((?=[A-Za-z_])[\w:.-]*(?:passw(?:or)?d|secret|token|api[_-]?key|passphrase|credential)[\w:.-]*)(\s[^>]*)?>([^<]+)<\/\1>/gi;
const YAML_BLOCK_KEY = new RegExp(String.raw`^([ \t]*)(?:- )?${SECRET_NAME}\s*:\s*[|>][-+0-9]*\s*$`, "i");
/** `password: |` and the more-indented lines under it. */
function redactYamlBlocks(s) {
  if (!/[|>]/.test(s)) return s;
  const lines = s.split("\n"); let under = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]; const ind = /^[ \t]*/.exec(l)[0].length;
    if (under >= 0) { if (!l.trim()) continue; if (ind > under) { lines[i] = l.slice(0, ind) + "[redacted:yaml-block]"; continue; } under = -1; }
    const m = YAML_BLOCK_KEY.exec(l.replace(/\r$/, "")); if (m) under = m[1].length;
  }
  return lines.join("\n");
}
// base64 of a secret inside a longer base64 run: the characters that depend only on
// the secret's bytes, for each of the three byte alignments it can sit at.
function b64Cores(buf) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    const s = Buffer.concat([Buffer.alloc(k), buf]).toString("base64").replace(/=+$/, "");
    const core = s.slice([0, 2, 3][k], s.length - ((k + buf.length) % 3 ? 1 : 0));
    if (core.length >= 8) out.push(core, core.replace(/\+/g, "-").replace(/\//g, "_"));
  }
  return out;
}
/** The spellings a literal secret takes when a tool prints it: as is, JSON-escaped,
 *  URL-encoded (upper/lower hex, '+' for space), base64 / base64url. Longest first. */
export function secretSpellings(v) {
  const s = String(v); const out = new Set([s, JSON.stringify(s).slice(1, -1)]);
  const u = encodeURIComponent(s);
  for (const x of [u, u.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase()), u.replace(/%20/g, "+"), encodeURI(s)]) out.add(x);
  for (const x of b64Cores(Buffer.from(s))) out.add(x);
  return [...out].filter((x) => x.length >= 6).sort((a, b) => b.length - a.length);
}
const ENV_SECRET_NAME = /KEY|TOKEN|SECRET|PASSW|PASSPHRASE|CREDENTIAL|PRIVATE|COOKIE|DSN|_PAT$/i;
/** [spelling, label] for the bot token and every secret-named env value, built once
 *  per redaction context object (one per arming) instead of on every message. */
const SPELLINGS = new WeakMap();
function literalSpellings(ctx) {
  const hit = ctx && typeof ctx === "object" ? SPELLINGS.get(ctx) : null; if (hit) return hit;
  const { env = {}, token = null } = ctx || {}; const out = [];
  if (token) for (const v of secretSpellings(token)) out.push([v, "[redacted:bot-token]"]);
  for (const [k, v] of Object.entries(env)) {
    if (!v || String(v).length < 6 || /^(OLD)?PWD$/i.test(k)) continue;
    if (ENV_SECRET_NAME.test(k)) for (const x of secretSpellings(v)) out.push([x, `[redacted:env:${k}]`]);
  }
  if (ctx && typeof ctx === "object") SPELLINGS.set(ctx, out);
  return out;
}
export function redact(text, ctx = {}) {
  let s = String(text ?? "");
  for (const [x, label] of literalSpellings(ctx)) if (s.includes(x)) s = s.split(x).join(label);
  for (const [kind, re] of PATTERNS) s = s.replace(re, `[redacted:${kind}]`);
  s = s.replace(URL_CREDS, "$1[redacted:url-password]@");
  s = s.replace(BASIC_AUTH, "$1[redacted:basic-auth]");
  s = s.replace(XML_SECRET, "<$1$2>[redacted:xml-secret]</$1>");
  s = redactYamlBlocks(s);
  s = s.replace(QUOTED_ASSIGNED, "$1$2[redacted:assigned-secret]$2");
  s = s.replace(ASSIGNED, "$1[redacted:assigned-secret]");
  s = s.replace(FLAG, "$1$2[redacted:flag-secret]");
  return s;
}

/** Telegram caps a message at 4096 characters; a turn is capped at 20 chunks. */
export function chunkText(text, size = 4096, cap = 20) {
  const chars = Array.from(String(text ?? ""));
  const out = [];
  for (let i = 0; i < chars.length; i += size) out.push(chars.slice(i, i + size).join(""));
  if (out.length > cap) { out.length = cap; out[cap - 1] = "[truncated, see desk]"; }
  return out.length ? out : [""];
}

// ---------------------------------------------------------------------- audit --

/** Metadata only. prompt/reply get a short HMAC keyed per arming (discarded at
 *  disarm) so lines correlate within one arming; everything else gets no hash. */
export class Audit {
  constructor(file) { this.file = file; this.key = crypto.randomBytes(32); fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); }
  write(kind, { dir = "-", from = null, body = null, reason = null } = {}) {
    const line = { t: new Date().toISOString(), dir, kind, from, len: body == null ? 0 : Buffer.byteLength(String(body)) };
    if ((kind === "prompt" || kind === "reply") && body != null && this.key) line.h = crypto.createHmac("sha256", this.key).update(String(body)).digest("hex").slice(0, 16);
    if (reason) line.reason = reason;
    fs.appendFileSync(this.file, JSON.stringify(line) + "\n", { mode: 0o600 });
  }
  discardKey() { this.key = null; }
}

// ------------------------------------------------------------ attach (pi v1) --

export function armTokenPath(home) { return path.join(stateDir(home), "arm.token"); }

export function writeArmToken(home, ttlMs, now = Date.now()) {
  const token = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(stateDir(home), { recursive: true, mode: 0o700 });
  fs.writeFileSync(armTokenPath(home), JSON.stringify({ token, armedAt: now, expiresAt: now + ttlMs }), { mode: 0o600 });
  return token;
}
export function deleteArmToken(home) { try { fs.unlinkSync(armTokenPath(home)); } catch { /* gone */ } }

/** Does this pi extension instance get a channel? Only when `cerebro arm` launched
 *  it: a fresh token on disk that matches the nonce in its own environment. */
export function attachAuthorize({ home, env, now = Date.now(), selfPath = "" }) {
  const sp = canon(selfPath || "");
  if (/[\\/]\.pi[\\/](agent[\\/])?extensions([\\/]|$)/i.test(sp)) return { ok: false, reason: "auto-discovery-dir", notice: "cerebro: loaded from a pi auto-discovery folder; remove it from there. Not armed, no channel." };
  const nonce = env.CEREBRO_ARM_NONCE;
  if (!nonce) return { ok: false, reason: "no-nonce", notice: "cerebro: not armed" };
  let tok; try { tok = JSON.parse(fs.readFileSync(armTokenPath(home), "utf8")); } catch { return { ok: false, reason: "no-token", notice: "cerebro: not armed" }; }
  if (!tok?.token || now >= tok.expiresAt) return { ok: false, reason: "expired", notice: "cerebro: arm token expired, not armed" };
  const a = Buffer.from(String(tok.token)), b = Buffer.from(String(nonce));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "mismatch", notice: "cerebro: not armed" };
  return { ok: true, reason: "armed", expiresAt: tok.expiresAt };
}

/** Remove CEREBRO_* from an environment object (in place) and return what was there. */
export function scrubEnv(env) {
  const taken = {};
  for (const k of Object.keys(env)) if (/^CEREBRO_/i.test(k)) { taken[k] = env[k]; delete env[k]; }
  return taken;
}

// ---------------------------------------------------------- creds and ACLs --

export function parseEnvFile(text) {
  const o = {};
  for (const line of String(text).replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return o;
}
export function insideGitWorktree(p) {
  let d = path.dirname(path.resolve(p));
  for (;;) {
    if (fs.existsSync(path.join(d, ".git"))) return d;
    const up = path.dirname(d); if (up === d) return null; d = up;
  }
}
/** Parse `icacls <file>` output. User-only: the user and SYSTEM, nothing else. */
export function icaclsVerdict(output, user, file = "") {
  const bad = [];
  const lines = String(output).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (/^Successfully processed/i.test(l)) continue;
    if (i === 0 && file && l.toLowerCase().startsWith(String(file).toLowerCase())) l = l.slice(String(file).length).trim();
    const m = /^(.+?):\(/.exec(l); if (!m) continue;
    const who = m[1].trim(); const short = who.split("\\").pop().toLowerCase();
    if (short === String(user).toLowerCase() || short === "system") continue;
    bad.push(who);
  }
  return bad;
}
export function checkCredsFile(file, { user = os.userInfo().username, icacls = null } = {}) {
  const problems = [];
  if (!fs.existsSync(file)) return [`${file} does not exist`];
  const wt = insideGitWorktree(file); if (wt) problems.push(`${file} is inside a git worktree (${wt})`);
  if (IS_WIN) {
    const out = icacls ?? spawnSync("icacls", [file], { encoding: "utf8" }).stdout;
    const bad = icaclsVerdict(out, user, file);
    if (bad.length) problems.push(`${file} is readable by ${bad.join(", ")}; fix: icacls "${file}" /inheritance:r /grant:r "%USERNAME%:F"`);
  } else {
    const mode = fs.statSync(file).mode & 0o077;
    if (mode) problems.push(`${file} is group- or world-accessible; fix: chmod 600 "${file}"`);
  }
  return problems;
}

// ------------------------------------------------------------------- framing --

/** JSONL on \n only (pi rpc.md: readline is non-compliant, it splits on U+2028). */
export function lineSplitter(onLine) {
  let buf = "";
  return (chunk) => {
    buf += chunk.toString("utf8");
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      let line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.trim()) onLine(line);
    }
  };
}

// --------------------------------------------------------------- the gemini policy --

const ci = (s) => s.replace(/[a-z]/gi, (ch) => `[${ch.toLowerCase()}${ch.toUpperCase()}]`).replace(/\./g, "\\.");
/** argsPattern runs on the tool's stable-JSON args, so Windows separators appear as
 *  \\\\ in the JSON. JS RegExp has no inline (?i): case folding is spelled out. */
export function geminiSecretPattern() {
  const SEP = String.raw`(?:\\\\|/)`;
  const names = [".ssh", ".gnupg", ".aws", ".azure", ".kube", ".netrc", ".npmrc", ".git-credentials", "cerebro.env", "arm.token",
    "auth.json", "cli-config.json", "oauth_creds.json", "google_accounts.json", ".credentials.json", ".claude.json"];
  const dirs = names.map(ci).join("|");
  const parts = [
    `${SEP}(?:${dirs})(?:${SEP}|")`,
    `${SEP}${ci(".config")}${SEP}(?:${ci("gcloud")}|${ci("gh")}|${ci("skillator")})(?:${SEP}|")`,
    `${SEP}${ci(".skillator")}${SEP}${ci("cerebro")}(?:${SEP}|")`,
    `${SEP}${ci(".env")}(?:\\.[^"\\\\/]*)?"`,
    `${SEP}[iI][dD]_[^"\\\\/]*"`,
    `\\.(?:${ci("pem")}|${ci("key")})"`,
    `"(?:${ci(".env")}(?:\\.[^"\\\\/]*)?|[iI][dD]_[^"\\\\/]*|[^"\\\\/]*\\.(?:${ci("pem")}|${ci("key")}))"`,
  ];
  return parts.join("|");
}
export const GEMINI_READ_TOOLS = ["read_file", "read_many_files", "glob", "grep_search", "list_directory"];
export const GEMINI_WRITE_TOOLS = ["run_shell_command", "write_file", "replace", "web_fetch"];
export function geminiPolicyToml() {
  const q = (s) => `'${s}'`;
  const arr = (a) => `[${a.map((x) => `"${x}"`).join(", ")}]`;
  return [
    "# remote-cerebro gemini policy - GENERATED by geminiPolicyToml() in cerebro-core.mjs.",
    "# Do not edit by hand; `cerebro selftest` fails if this file and the generator differ.",
    "# Loaded only by `cerebro arm gemini` (gemini --acp --approval-mode default --policy <this>).",
    "",
    "# 1. Secret paths: hard deny, no prompt, every file and shell tool.",
    "[[rule]]",
    `toolName = ${arr([...GEMINI_READ_TOOLS, ...GEMINI_WRITE_TOOLS])}`,
    `argsPattern = ${q(geminiSecretPattern())}`,
    'decision = "deny"',
    "priority = 999",
    "",
    "# 2. Reads ask, so the bridge can auto-allow in-cwd reads and send the rest to the phone.",
    "[[rule]]",
    `toolName = ${arr(GEMINI_READ_TOOLS)}`,
    'decision = "ask_user"',
    "priority = 900",
    "",
    "# 3. Shell, edit, write and fetch always ask.",
    "[[rule]]",
    `toolName = ${arr(GEMINI_WRITE_TOOLS)}`,
    'decision = "ask_user"',
    "priority = 900",
    "",
    "# 4. Every MCP tool asks.",
    "[[rule]]",
    'toolName = "*"',
    'mcpName = "*"',
    'decision = "ask_user"',
    "priority = 800",
    "",
  ].join("\n");
}

// ------------------------------------------------------------- process helpers --

export function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}
/** Who a pid IS, not just that it is alive: its start time (Linux: boot id +
 *  /proc starttime; macOS/BSD: `ps -o lstart`; Windows: Process.StartTime ticks).
 *  Recorded when cerebro starts a process and compared before it kills one, so a
 *  reused pid is never killed. null when it cannot be read: callers then do not kill. */
const identCmd = (pid) => IS_WIN
  ? ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `[System.Diagnostics.Process]::GetProcessById(${Number(pid)}).StartTime.ToUniversalTime().Ticks`]]
  : ["ps", ["-o", "lstart=", "-p", String(Number(pid))]];
const identOf = (out) => { const s = String(out || "").trim(); return s ? `${IS_WIN ? "win" : "ps"}:${s}` : null; };
function linuxIdent(pid) {
  const st = fs.readFileSync(`/proc/${Number(pid)}/stat`, "utf8");
  const f = st.slice(st.lastIndexOf(")") + 2).split(" "); // field 3 (state) is f[0]; field 22 (starttime) is f[19]
  let boot = ""; try { boot = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim(); } catch { /* old kernel */ }
  return `linux:${boot}:${f[19]}`;
}
let selfIdent;
export function procIdentity(pid) {
  if (!pid || !pidAlive(pid)) return null;
  if (pid === process.pid && selfIdent !== undefined) return selfIdent;
  let id = null;
  try {
    if (process.platform === "linux") id = linuxIdent(pid);
    else { const [cmd, args] = identCmd(pid); const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 15000, windowsHide: true }); id = r.status === 0 ? identOf(r.stdout) : null; }
  } catch { id = null; }
  if (pid === process.pid) selfIdent = id;
  return id;
}
export function procIdentityAsync(pid) {
  if (!pid) return Promise.resolve(null);
  if (process.platform === "linux") { try { return Promise.resolve(linuxIdent(pid)); } catch { return Promise.resolve(null); } }
  const [cmd, args] = identCmd(pid);
  return new Promise((resolve) => execFile(cmd, args, { encoding: "utf8", timeout: 15000, windowsHide: true }, (e, out) => resolve(e ? null : identOf(out))));
}

/** Kill a process TREE: taskkill /T /F on Windows (it follows the parent-pid chain);
 *  on POSIX killTreePosix, because the hosts start every shell command in a NEW
 *  process group or session (pi bash.js detached:true, gemini detached + setsid), so
 *  killing the host's own group misses exactly the commands the phone approved. */
export function killTree(pid, opts) {
  if (!pid) return [];
  if (IS_WIN) { spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); return []; }
  return killTreePosix(pid, opts);
}

const SLEEP_CELL = new Int32Array(new SharedArrayBuffer(4));
export function sleepSync(ms) { Atomics.wait(SLEEP_CELL, 0, 0, ms); }
/** One /proc/<pid>/stat line -> {pid, ppid, pgid, sid}. comm may hold spaces and ')'. */
export function parseProcStat(line) {
  const s = String(line); const r = s.lastIndexOf(")");
  const f = s.slice(r + 2).trim().split(/\s+/); // f[0] state, f[1] ppid, f[2] pgrp, f[3] session
  return { pid: Number(s.slice(0, s.indexOf(" "))), ppid: Number(f[1]), pgid: Number(f[2]), sid: Number(f[3]), state: f[0] };
}
/** `ps -o pid=,ppid=,pgid=[,sid=]` text -> [{pid, ppid, pgid, sid|null}]. */
export function parseProcTable(text) {
  const out = [];
  for (const l of String(text).split(/\r?\n/)) {
    const n = l.trim().split(/\s+/).map(Number);
    if (n.length >= 3 && n.slice(0, 3).every(Number.isInteger)) out.push({ pid: n[0], ppid: n[1], pgid: n[2], sid: Number.isInteger(n[3]) ? n[3] : null });
  }
  return out;
}
/** The whole process table. Linux: /proc (pid, ppid, pgrp, session). Elsewhere
 *  (macOS, BSD): ps, which has no portable session-id column, so sid is null there and
 *  only the parent chain and process groups are followed. */
export function readProcTable() {
  if (process.platform === "linux") {
    const out = [];
    for (const d of fs.readdirSync("/proc")) { if (!/^\d+$/.test(d)) continue; try { out.push(parseProcStat(fs.readFileSync(`/proc/${d}/stat`, "utf8"))); } catch { /* exited */ } }
    return out;
  }
  const r = spawnSync("ps", ["-A", "-o", "pid=", "-o", "ppid=", "-o", "pgid="], { encoding: "utf8", timeout: 10000 });
  return r.status === 0 ? parseProcTable(r.stdout) : [];
}
function selfProc() {
  const me = { pid: process.pid, pgid: null, sid: null };
  try {
    if (process.platform === "linux") { const s = parseProcStat(fs.readFileSync("/proc/self/stat", "utf8")); me.pgid = s.pgid; me.sid = s.sid; }
    else { const r = spawnSync("ps", ["-o", "pgid=", "-p", String(process.pid)], { encoding: "utf8", timeout: 10000 }); me.pgid = Number(String(r.stdout).trim()) || null; }
  } catch { /* unknown: only pid 0/1 and ourselves are protected */ }
  return me;
}
// A zombie (exited, not yet reaped: our own child while this thread blocks) is gone.
function liveNotZombie(pid) {
  if (!pidAlive(pid)) return false;
  if (process.platform !== "linux") return true;
  try { return parseProcStat(fs.readFileSync(`/proc/${pid}/stat`, "utf8")).state !== "Z"; } catch { return false; }
}
export function descendantsOf(pid, procs) {
  const kids = new Map();
  for (const r of procs) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r.pid); }
  const out = new Set([pid]); const q = [pid];
  while (q.length) { for (const c of kids.get(q.pop()) || []) if (!out.has(c)) { out.add(c); q.push(c); } }
  return out;
}
/** POSIX tree kill. 1) Snapshot every descendant of the host (before it dies and its
 *  children are reparented to init). 2) SIGTERM the host and give it graceMs to reap
 *  what it tracks itself. 3) SIGKILL every process group and session any descendant
 *  was in (this reaches double-forked, reparented commands), every descendant, then
 *  the host. A group or session is signalled ONLY when its leader (pgid / sid) is a
 *  descendant of the target, or is the target itself and `detached` says cerebro
 *  spawned it detached (so it leads a group/session cerebro created). A group or
 *  session inherited from above the target (a foreground bridge in the user's
 *  terminal: its group/session is the shell's) is never signalled. Never signals pid
 *  0/1, this process, or this process's group or session.
 *  Everything is injectable so the logic is tested off-POSIX. Returns the victims. */
export function killTreePosix(pid, { listProcs = readProcTable, kill = (p, s) => process.kill(p, s), alive = liveNotZombie, sleep = sleepSync, graceMs = 1500, self = selfProc(), detached = false } = {}) {
  const snap = () => { try { return listProcs() || []; } catch { return []; } };
  const sig = (p, s) => { try { kill(p, s); return true; } catch { return false; } };
  const guarded = (x) => x == null || !Number.isInteger(x) || x <= 1 || x === self.pid || x === self.pgid || x === self.sid;
  const before = snap();
  const tree = descendantsOf(pid, before);
  if (!sig(pid, "SIGTERM") && detached && !guarded(pid)) sig(-pid, "SIGTERM");
  for (let waited = 0; waited < graceMs && alive(pid); waited += 50) sleep(50);
  const now = snap();
  for (const p of descendantsOf(pid, now)) tree.add(p);
  // A leader we may signal: a descendant, or the target itself when cerebro made it a leader.
  const ours = (lead) => !guarded(lead) && (lead === pid ? detached : tree.has(lead));
  const groups = new Set(), sessions = new Set();
  if (detached && !guarded(pid)) groups.add(pid); // spawned detached: the host leads its own group
  for (const r of [...before, ...now]) if (tree.has(r.pid)) { if (ours(r.pgid)) groups.add(r.pgid); if (ours(r.sid)) sessions.add(r.sid); }
  const victims = new Set([...tree]);
  for (const r of now) if (groups.has(r.pgid) || (r.sid != null && sessions.has(r.sid))) victims.add(r.pid);
  for (const v of [...victims]) if (v <= 1 || v === self.pid) victims.delete(v);
  for (const g of groups) sig(-g, "SIGKILL");
  for (const v of victims) sig(v, "SIGKILL");
  return [...victims];
}

/** PATH lookup. On Windows only PATHEXT names count: an extensionless file on PATH
 *  is a Git-Bash shim, which CreateProcess cannot run (the cursor-agent defect). */
export function which(name, env = process.env) {
  const dirs = String(env.PATH || env.Path || "").split(path.delimiter).filter(Boolean);
  const exts = IS_WIN ? String(env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").map((e) => e.toLowerCase()) : [""];
  for (const d of dirs) for (const e of exts) {
    const f = path.join(d, name + e);
    try { if (fs.statSync(f).isFile()) return f; } catch { /* next */ }
  }
  return null;
}
