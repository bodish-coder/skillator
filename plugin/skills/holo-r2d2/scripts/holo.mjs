#!/usr/bin/env node
// holo-r2d2: draw a relay run file (and, optionally, a design file) as one page.
//
//   node holo.mjs [RUN-n | n | <run file>] [--design <file>] [--out <path>]
//        -> an Artifact-shaped page (no doctype/html/head/body) for the
//           Artifact tool; default .skillator/holo/<RUN-n>.artifact.html
//   node holo.mjs [run] [--design <file>] --html [--out <path>]
//        -> a standalone page with its own doctype, for hosts without the
//           Artifact tool; default .skillator/holo/<RUN-n>.html
//   node holo.mjs [run] [--design <file>] --md [--out <path>]
//        -> Markdown with a Mermaid stage graph; default .skillator/holo/<RUN-n>.md
//   node holo.mjs [run] [--design <file>] --svg [--out <path>]
//        -> one standalone SVG of the same content; default .skillator/holo/<RUN-n>.svg
//   node holo.mjs [run] [--design <file>] --ascii      -> the same, for a terminal
//   node holo.mjs --design <file> [--html|--ascii]     -> design components only
//   node holo.mjs [run] --anatomy [--html]             -> + the run as a bench machine (F83),
//           its decision levers opening <RUN-n>.wizard.html, written beside the page
//   node holo.mjs [run] --wizard [--out <path>]        -> the decision wizard (F42): one
//           open decision per step, offline; default .skillator/holo/<RUN-n>.wizard.html
//   node holo.mjs --decisions <set.json> [--out <path>] -> the same wizard for a
//           holo-decisions/1 set (decisions that are not a relay run's)
//   node holo.mjs --answers <final.json>               -> the finalized export as
//           `relay-morpheus.sh answer` lines (printed, never run)
//   node holo.mjs [run] --batch                        -> the end batch's drawing in one call:
//           the Artifact page, the standalone page, the wizard (open decisions), then the
//           ASCII and every path on stdout - the block to paste above the questions
//   node holo.mjs --fixture <DIR>                      -> the RED/GREEN fixture repo
//   node holo.mjs --selftest
//
// The page is generated from the run file and nothing else: every row of
// `## Stages`, every `### CODE - stage n` block of `## Chain` (tickets, files,
// after), every `### Qk` of `## Decisions`. It decides nothing and asks
// nothing; it never writes the run file (answers go through
// `relay-morpheus.sh answer`, run by the session).
//
// No npm dependencies. Inline SVG only - no CDN, so the page draws offline.

import { readFile, writeFile, mkdir, readdir, cp, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { setFromRun, checkSet, wizardPage, answersToCommands, nextWizardSet, normalizeDiagram } from "./wizard.mjs";
import { anatomyFigure, ANATOMY_CSS, ANATOMY_SCRIPT } from "./anatomy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// --------------------------------------------------------------- model ----
const STATE = { "": "pending", "~": "inflight", "x": "landed", "!": "failed", "?": "parked", ">": "replanned" };
const LABEL = {
  pending: "pending", inflight: "in flight", landed: "landed", failed: "failed",
  parked: "parked", replanned: "replanned", unknown: "unknown",
};
const GLYPH = {
  pending: "[ ]", inflight: "[~]", landed: "[x]", failed: "[!]",
  parked: "[?]", replanned: "[>]", unknown: "[*]",
};
const ORDER = ["landed", "inflight", "parked", "failed", "replanned", "pending", "unknown"];
// A decision holds its work while open, asked, answered or ruled; it lets go
// only at replanned or moot (references/marathon.md). Cards are drawn for the
// ones still waiting on the user: open and asked.
const HOLDING = new Set(["open", "asked", "answered", "ruled"]);
const ASKABLE = new Set(["open", "asked"]);
const FINAL_STAGE = /^verify review bump commit push\b/i;

const ids = (s) => (s || "").match(/\b[A-Z]{1,3}\d+[a-z]?\b/g) || [];
const nums = (s) => ((s || "").match(/\d+/g) || []).map(Number);
const list = (s) => (s || "").split(",").map((x) => x.trim()).filter((x) => x && x !== "-");
const normPath = (p) => p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
const meets = (a, b) => {
  a = normPath(a); b = normPath(b);
  return a === b || b.startsWith(a + "/") || a.startsWith(b + "/");
};

export function parseRun(md, holds = null) {
  const run = {
    id: "", title: "", plan: "", started: "", updated: "",
    stages: [], chain: null, asks: "", qs: [], inflight: {}, rulings: [],
  };
  let sec = "", cur = null, q = null, inPrompt = false, inOpts = false;
  for (const l of md.replace(/\r/g, "").split("\n")) {
    let m;
    if (!run.id && (m = /^# (RUN-\d+)\s*(?:-|\u2014|\u2013)\s*(.*)$/.exec(l))) {
      run.id = m[1]; run.title = m[2].trim(); continue;
    }
    if (l.startsWith("## ")) { sec = l.slice(3).trim(); cur = null; q = null; inPrompt = false; continue; }
    if (sec === "") {
      if ((m = /^plan:\s*(.*)$/.exec(l))) run.plan = m[1].trim();
      if ((m = /started:\s*(\S+)/.exec(l))) run.started = m[1];
      if ((m = /updated:\s*(\S+)/.exec(l))) run.updated = m[1];
      continue;
    }
    // A prompt body is indented two spaces (or blank); it ends at the first
    // line that is neither. Nothing inside it is a field.
    if (inPrompt) {
      if (l === "" || l.startsWith("  ")) continue;
      inPrompt = false;
    }
    if (sec === "Stages") {
      if (!/^\|\s*\d+\s*\|/.test(l)) continue;
      const c = l.split("|").slice(1);
      if (c.length && c[c.length - 1].trim() === "") c.pop();
      const [n, name, st, owner, hb, landed] = c.map((x) => (x ?? "").trim());
      run.stages.push({
        n: Number(n), raw: name, name, code: "", st,
        state: STATE[st] ?? "unknown", owner: owner || "-", heartbeat: hb || "-", landed: landed || "-",
        tickets: [], files: [], after: [], indep: [], implicit: [], waits: [], replacedBy: null,
      });
    } else if (sec === "Chain") {
      if (!run.chain) run.chain = { driver: "-", hold: "-", mode: "-", blocks: {} };
      if ((m = /^driver: (.*?)\s{2,}hold: (.*?)\s{2,}mode: (.*)$/.exec(l))) {
        Object.assign(run.chain, { driver: m[1].trim(), hold: m[2].trim(), mode: m[3].trim() });
      } else if ((m = /^### (\S+) - stage (\d+) - (.*)$/.exec(l))) {
        cur = { code: m[1], n: Number(m[2]), name: m[3], tickets: "", files: [], after: [], indep: [] };
        run.chain.blocks[cur.n] = cur;
      } else if (cur) {
        if (/^prompt:/.test(l)) inPrompt = true;
        else if ((m = /^tickets: (.*)$/.exec(l))) cur.tickets = m[1];
        else if ((m = /^files: (.*)$/.exec(l))) cur.files.push(...list(m[1]));
        else if ((m = /^after: (.*)$/.exec(l))) cur.after.push(...nums(m[1]));
        else if ((m = /^independent-of: (.*)$/.exec(l))) cur.indep.push(...(m[1].match(/Q\d+/g) || []));
      }
    } else if (sec === "Decisions") {
      if ((m = /^asks: (.*)$/.exec(l))) { run.asks = m[1].trim(); continue; }
      if ((m = /^### Q(\d+) (\S+)(?: (\S+))?\s*$/.exec(l))) {
        q = { k: Number(m[1]), id: "Q" + m[1], state: m[2], ts: m[3] || "", f: {}, options: [] };
        run.qs.push(q); inOpts = false; continue;
      }
      if (/^### /.test(l)) { q = null; inOpts = false; continue; } // unreadable header: never merge into the Q above
      if (!q) continue;
      if (inOpts && (m = /^ {2}- (.*)$/.exec(l))) {
        const [label = "", does = "", hurts = "", explain = ""] = m[1].split("|").map((x) => x.trim());
        const rec = /\s*\(Recommended\)$/.test(label);
        q.options.push({ label: label.replace(/\s*\(Recommended\)$/, ""), does, hurts, pros: does, cons: hurts, explain, rec });
        continue;
      }
      inOpts = false;
      if (/^options:\s*$/.test(l)) { inOpts = true; continue; }
      if ((m = /^([a-z][a-z -]*): ?(.*)$/.exec(l))) q.f[m[1]] = m[2];
    } else if (sec === "In flight") {
      if ((m = /^### stage (\d+) - (.*)$/.exec(l))) {
        cur = { n: Number(m[1]), head: m[2].trim(), parked: [], files: [], lastSeen: "" };
        run.inflight[cur.n] = cur;
      } else if (cur) {
        if (/^prompt:/.test(l)) inPrompt = true;
        else if ((m = /^parked: (.*)$/.exec(l))) cur.parked.push(...(m[1].match(/Q\d+/g) || []));
        else if ((m = /^files: (.*)$/.exec(l))) cur.files.push(...list(m[1]));
        else if ((m = /^last seen: (.*)$/.exec(l))) cur.lastSeen = m[1];
      }
    } else if (sec === "Rulings") {
      if (l.startsWith("- ")) run.rulings.push(l.slice(2));
    }
  }
  derive(run, holds);
  return run;
}

function derive(run, holds = null) {
  const byN = new Map(run.stages.map((s) => [s.n, s]));
  const blocks = run.chain?.blocks ?? {};
  for (const s of run.stages) {
    const b = blocks[s.n];
    if (b) {
      s.code = b.code;
      if (s.raw.startsWith(b.code + " ")) s.name = s.raw.slice(b.code.length + 1);
      s.tickets = ids(b.tickets);
      s.files = [...b.files];
      s.after = b.after.filter((a) => byN.has(a) && a !== s.n);
      s.indep = b.indep;
    }
    const inf = run.inflight[s.n];
    if (inf) {
      if (!s.files.length) s.files = [...inf.files];
      s.lastSeen = inf.lastSeen;
    }
    if (s.state === "replanned") {
      const t = /stage (\d+)/.exec(s.landed);
      if (t && byN.has(Number(t[1]))) s.replacedBy = Number(t[1]);
    }
  }
  // The chain's last stage is the main session's and comes after everything
  // (chain.md Step 1.5). Drawn dashed: it is a convention, not an `after:` line.
  const last = run.stages[run.stages.length - 1];
  if (last && FINAL_STAGE.test(last.name) && !last.after.length) {
    last.implicit = run.stages.filter((s) => s !== last).map((s) => s.n);
  }
  // Which stages a decision still holds. A118: relay-morpheus is the judge -
  // `chain next --holds` prints its own IDLE <n> Q<k> <why> lines, and when
  // they are given the page draws exactly those (plus a `?` row's own parked
  // Qs, which are data in its In-flight block, not a rule). The rules below are
  // only the fallback for when relay-morpheus cannot be run.
  run.holdsFrom = holds ? "relay" : "estimate";
  if (holds) {
    const byQ = new Map(run.qs.map((q) => [q.id, q]));
    for (const q of run.qs) { q.blocks = list(q.f.blocks); q.files = list(q.f.files); q.holds = []; }
    const add = (n, qid) => {
      const q = byQ.get(qid), s = byN.get(n);
      if (!q || !s || q.holds.includes(n)) return;
      q.holds.push(n); s.waits.push(qid);
    };
    for (const h of holds) add(h.n, h.q);
    for (const s of run.stages) if (s.state === "parked") for (const qid of run.inflight[s.n]?.parked ?? []) if (HOLDING.has(byQ.get(qid)?.state)) add(s.n, qid);
    for (const q of run.qs) q.holds.sort((a, b) => a - b);
    for (const s of run.stages) s.waits.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    return;
  }
  for (const q of run.qs) {
    q.blocks = list(q.f.blocks);
    q.files = list(q.f.files);
    q.holds = [];
    if (!HOLDING.has(q.state)) continue;
    const blockIds = new Set(q.blocks.flatMap(ids));
    for (const s of run.stages) {
      if (s.indep.includes(q.id)) continue;
      let why = "";
      if (s.state === "parked" && run.inflight[s.n]?.parked.includes(q.id)) why = "parked";
      else if (s.state === "pending" || s.state === "failed") {
        if (s.tickets.some((t) => blockIds.has(t))) why = "blocks";
        else if (s.files.some((f) => q.files.some((g) => meets(f, g)))) why = "files";
        else if (run.chain && blocks[s.n] && !s.files.length) why = "nofiles";
      }
      if (why) { q.holds.push(s.n); s.waits.push(q.id); }
    }
  }
  // ... and a stage behind a `?` stage through after: waits on that stage's Qs.
  const byQ = new Map(run.qs.map((q) => [q.id, q]));
  for (const s of run.stages) {
    if (s.state !== "pending" && s.state !== "failed") continue;
    const seen = new Set(), todo = [...s.after];
    while (todo.length) {
      const d = byN.get(todo.pop());
      if (!d || seen.has(d.n)) continue;
      seen.add(d.n);
      if (d.state === "parked") {
        for (const qid of run.inflight[d.n]?.parked ?? []) {
          const q = byQ.get(qid);
          if (!q || !HOLDING.has(q.state) || s.indep.includes(qid) || s.waits.includes(qid)) continue;
          s.waits.push(qid); q.holds.push(s.n);
        }
      }
      todo.push(...d.after);
    }
  }
  for (const q of run.qs) q.holds.sort((a, b) => a - b);
  for (const s of run.stages) s.waits.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export function parseDesign(md) {
  const out = { title: "", parts: [] };
  let cur = null, para = [], inFence = false, tbl = null;
  const flush = () => { if (cur && !cur.lead && para.length) cur.lead = para.join(" "); para = []; };
  for (const l of md.replace(/\r/g, "").split("\n")) {
    if (!/^\s*\|/.test(l)) tbl = null; // a table is one run of consecutive | lines
    if (/^```/.test(l)) { inFence = !inFence; if (cur) cur.code++; continue; }
    if (inFence) continue;
    let m;
    if (!out.title && (m = /^# (.*)$/.exec(l))) { out.title = m[1].trim(); continue; }
    if ((m = /^## (.*)$/.exec(l))) { flush(); cur = { name: m[1].trim(), lead: "", subs: [], items: [], flows: [], bullets: 0, code: 0, tables: [] }; out.parts.push(cur); continue; }
    if (!cur) continue;
    if ((m = /^### (.*)$/.exec(l))) { flush(); cur.subs.push(m[1].trim()); continue; }
    if ((m = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(l))) {
      flush(); cur.bullets++;
      const txt = m[2].trim();
      if (txt) cur.items.push(txt);
      if (/\s+(?:->|\u2192)\s+/.test(txt)) cur.flows.push(...txt.split(/\s*(?:->|\u2192)\s*/).map((s) => s.trim()).filter(Boolean));
      continue;
    }
    if (/^\s*\|/.test(l)) {
      flush();
      const cells = l.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
      if (cells.every((c) => /^:?-+:?$/.test(c))) { if (tbl && tbl.rows.length === 1 && !tbl.head.length) tbl.head = tbl.rows.pop(); continue; }
      if (!tbl) { tbl = { head: [], rows: [] }; cur.tables.push(tbl); }
      tbl.rows.push(cells);
      continue;
    }
    if (l.trim() === "") { flush(); continue; }
    if (/\s+(?:->|\u2192)\s+/.test(l)) cur.flows.push(...l.split(/\s*(?:->|\u2192)\s*/).map((s) => s.trim()).filter(Boolean));
    if (!cur.lead) para.push(l.trim());
  }
  flush();
  for (const p of out.parts) { p.code = Math.floor(p.code / 2); if (p.lead.length > 220) p.lead = p.lead.slice(0, 217) + "..."; }
  return out;
}

// -------------------------------------------------------------- layout ----
// Column = dependency depth (after: plus the implicit final edge); a column's
// stages may run side by side, so each sits in its own lane.
export function layout(run) {
  const byN = new Map(run.stages.map((s) => [s.n, s]));
  const depth = new Map();
  const deps = (s) => [...s.after, ...s.implicit].filter((d) => byN.has(d));
  const visit = (s, seen) => {
    if (depth.has(s.n)) return depth.get(s.n);
    if (seen.has(s.n)) return 0; // a cycle in hand-edited after: lines - draw, do not hang
    seen.add(s.n);
    const d = Math.max(-1, ...deps(s).map((x) => visit(byN.get(x), seen))) + 1;
    depth.set(s.n, d);
    return d;
  };
  for (const s of run.stages) visit(s, new Set());
  const cols = [];
  for (const s of run.stages) (cols[depth.get(s.n)] ??= []).push(s);
  // a cycle can leave a depth unused; drop the hole or the lane count is NaN
  const dense = cols.filter(Boolean);
  const pos = new Map();
  dense.forEach((c, ci) => c.forEach((s, li) => pos.set(s.n, { col: ci, lane: li })));
  const edges = [];
  for (const s of run.stages) {
    for (const d of s.after) edges.push({ from: d, to: s.n, kind: "after" });
    for (const d of s.implicit) edges.push({ from: d, to: s.n, kind: "implicit" });
    if (s.replacedBy) edges.push({ from: s.n, to: s.replacedBy, kind: "replaced" });
  }
  return { cols: dense, pos, edges };
}

// ---------------------------------------------------------------- html ----
const esc = (s) => String(s ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "\u2026" : s);
function wrap(text, width) {
  const ind = /^\s*/.exec(String(text))[0], cont = ind + "  ";
  const out = [];
  let line = "", pre = ind;
  const push = (l) => { out.push(pre + l); pre = cont; };
  for (let w of String(text).split(/\s+/).filter(Boolean)) {
    const room = () => width - pre.length;
    while (w.length > room()) { if (line) { push(line); line = ""; } const r = Math.max(room(), 1); push(w.slice(0, r)); w = w.slice(r); }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= room()) line += " " + w;
    else { push(line); line = w; }
  }
  if (line) push(line);
  return out.length ? out : [""];
}
const tspans = (lines, x, y, lh) =>
  lines.map((t, i) => `<tspan x="${x}" y="${y + i * lh}">${esc(t)}</tspan>`).join("");

// The graph's inner markup, shared by the page (stageGraph) and the SVG output (renderSvg).
function stageGraphParts(run) {
  const { cols, pos, edges } = layout(run);
  const NW = 208, NH = 70, CW = 252, RH = 86, PX = 14, PY = 30;
  const lanes = Math.max(...cols.map((c) => c.length));
  const W = PX * 2 + cols.length * CW - (CW - NW), H = PY + lanes * RH + 6;
  const xy = (n) => { const p = pos.get(n); return { x: PX + p.col * CW, y: PY + p.lane * RH }; };
  const bands = Array.from({ length: lanes }, (_, i) =>
    `<rect class="band" x="0" y="${PY + i * RH - 8}" width="${W}" height="${RH - 2}" rx="6"/>` +
    `<text class="lane" x="${W - 6}" y="${PY + i * RH + 4}" text-anchor="end">lane ${i + 1}</text>`).join("");
  const heads = cols.map((c, i) =>
    `<text class="colh" x="${PX + i * CW}" y="16">${i === 0 ? "start" : "step " + (i + 1)}${c.length > 1 ? " \u00b7 " + c.length + " in parallel" : ""}</text>`).join("");
  const arrows = edges.map((e) => {
    const a = xy(e.from), b = xy(e.to);
    const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x - 4, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
    const d = x2 > x1
      ? `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
      : `M${a.x + NW / 2},${a.y + NH} C${a.x + NW / 2},${a.y + NH + 30} ${b.x + NW / 2},${b.y - 30} ${b.x + NW / 2},${b.y - 4}`;
    return `<path class="edge e-${e.kind}" data-edge="${e.from}-${e.to}" data-kind="${e.kind}" d="${d}" marker-end="url(#holo-arrow)"/>`;
  }).join("");
  const nodes = run.stages.map((s) => {
    const { x, y } = xy(s.n);
    const tip = [`stage ${s.n}${s.code ? " " + s.code : ""} - ${s.name}`, `state: ${LABEL[s.state]}${s.state === "unknown" ? " (" + s.st + ")" : ""}`,
      `owner: ${s.owner}`, `landed: ${s.landed}`, `files: ${s.files.join(", ") || "-"}`,
      s.after.length ? `after: ${s.after.join(", ")}` : "", s.waits.length ? `waits on: ${s.waits.join(", ")}` : ""].filter(Boolean).join("\n");
    const third = s.waits.length ? `waits on ${s.waits.join(" ")}`
      : s.files.length ? `${s.files.length} file${s.files.length > 1 ? "s" : ""}${s.tickets.length ? " \u00b7 " + s.tickets.join(" ") : ""}`
      : s.landed !== "-" ? `landed ${s.landed}` : s.owner;
    return `<g class="node s-${s.state}" data-stage="${s.n}" data-state="${s.state}" transform="translate(${x},${y})">` +
      `<title>${esc(tip)}</title>` +
      `<rect width="${NW}" height="${NH}" rx="7"/>` +
      `<text class="nid" x="10" y="19">#${s.n}${s.code ? " \u00b7 " + esc(s.code) : ""}</text>` +
      `<text class="nst" x="${NW - 10}" y="19" text-anchor="end">${LABEL[s.state]}</text>` +
      `<text class="nname" x="10" y="39">${esc(clip(s.name, 29))}</text>` +
      `<text class="nmeta${s.waits.length ? " held" : ""}" x="10" y="58">${esc(clip(third, 32))}</text></g>`;
  }).join("");
  return { W, H, inner: bands + heads + arrows + nodes, cols };
}

const ARROW_DEFS = `<defs><marker id="holo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker></defs>`;

function stageGraph(run) {
  if (!run.stages.length) return `<p class="empty">No stage rows in this run file.</p>`;
  const { W, H, inner, cols } = stageGraphParts(run);
  return `<div class="scroll"><svg class="graph" role="img" aria-label="Stage graph of ${esc(run.id)}: ${run.stages.length} stages in ${cols.length} step(s)" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="min-width:${Math.min(W, 560)}px">` +
    ARROW_DEFS + inner + `</svg></div>`;
}

function stageList(run) {
  const rows = run.stages.map((s) =>
    `<li class="srow s-${s.state}" data-stage="${s.n}" data-state="${s.state}">` +
    `<span class="dot" aria-hidden="true"></span>` +
    `<span class="sn">${s.n}</span>` +
    `<span class="sname">${s.code ? `<b>${esc(s.code)}</b> ` : ""}${esc(s.name)}` +
    `<span class="sfiles">${s.files.length ? esc(s.files.join(" \u00b7 ")) : "files: not listed in the run file"}` +
    `${s.after.length ? ` \u00b7 after ${s.after.join(", ")}` : ""}${s.waits.length ? ` \u00b7 waits on ${s.waits.join(", ")}` : ""}</span></span>` +
    `<span class="sst">${LABEL[s.state]}${s.state === "unknown" ? " (" + esc(s.st) + ")" : ""}` +
    `<span class="sl">${s.landed !== "-" ? esc(s.landed) : esc(s.owner)}</span></span></li>`).join("");
  return `<ol class="stages">${rows}</ol>`;
}

export function blockDiagramSvg(raw, title = "Block diagram") {
  const list = normalizeDiagram(raw);
  if (!list.length) return "";
  const cols = Math.min(list.length, 3), rows = Math.ceil(list.length / cols);
  const BW = 152, BH = 52, GX = 24, GY = 18, PX = 8, PY = 8;
  const W = PX * 2 + cols * BW + (cols - 1) * GX, H = PY * 2 + rows * BH + (rows - 1) * GY;
  const edges = [];
  const boxes = list.map((b, idx) => {
    const c = idx % cols, r = Math.floor(idx / cols);
    const x = PX + c * (BW + GX), y = PY + r * (BH + GY);
    if (idx + 1 < list.length) {
      const nc = (idx + 1) % cols, nr = Math.floor((idx + 1) / cols);
      const nx = PX + nc * (BW + GX), ny = PY + nr * (BH + GY);
      const d = nr === r ? `M${x + BW},${y + BH / 2} L${nx - 3},${ny + BH / 2}`
        : `M${x + BW / 2},${y + BH} L${nx + BW / 2},${ny - 3}`;
      edges.push(`<path class="bd-edge" d="${d}" marker-end="url(#bd-arrow)"/>`);
    }
    return `<g class="bd-node bd-${esc(b.kind || "block")}" data-block="${idx + 1}" transform="translate(${x},${y})">` +
      `<rect class="bd-box" width="${BW}" height="${BH}" rx="6"/>` +
      `<rect class="bd-bar" width="${BW}" height="5" rx="3"/>` +
      `<text class="bd-title" x="9" y="22">${esc(clip(b.title, 20))}</text>` +
      `<text class="bd-sub" x="9" y="39">${esc(clip(b.subtitle || ("block " + (idx + 1)), 23))}</text></g>`;
  });
  return `<svg class="block-diagram" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">` +
    `<defs><marker id="bd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker></defs>` +
    edges.join("") + boxes.join("") + `</svg>`;
}

function optionFlow(run, q, o, i) {
  const W = 268, half = 126, lh = 15;
  const top = wrap(o.label, 30), does = wrap(o.does || "-", 15), hurts = wrap(o.hurts || "-", 15);
  const then = wrap(`then: ${q.blocks.length ? "unblocks " + q.blocks.join(", ") : "unblocks the parked work"}` +
    `${q.holds.length ? "; re-plans stage " + q.holds.join(", ") : ""}`, 34);
  const th = 30 + top.length * lh + (o.rec ? 16 : 0);
  const by = th + 22, bh = 26 + Math.max(does.length, hurts.length) * lh;
  const ty = by + bh + 22, tH = 14 + then.length * lh;
  const H = ty + tH + 2;
  const rec = o.rec ? `<text class="rtag" x="12" y="${38 + top.length * lh}">recommended</text>` : "";
  const def = q.f.default && q.f.default === o.label ? `<text class="dtag" x="${W - 12}" y="17" text-anchor="end">default</text>` : "";
  const explainHtml = o.explain ? `<p class="opt-explain"><b>What this action does:</b> ${esc(o.explain)}</p>` : "";
  const pcHtml = `<div class="pros-cons">` +
    `<span class="pro-card"><b class="pc-k">Pros:</b> ${esc(o.pros || o.does || "-")}</span>` +
    `<span class="con-card"><b class="pc-k">Cons:</b> ${esc(o.cons || o.hurts || "-")}</span>` +
    `</div>`;
  return `<figure class="opt${o.rec ? " rec" : ""}" data-rec="${o.rec ? 1 : 0}" data-option="${esc(o.label)}">` +
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Option ${i + 1}: ${esc(o.label)}. Pros: ${esc(o.does)}. Cons: ${esc(o.hurts)}.">` +
    `<rect class="b-pick" x="1" y="1" width="${W - 2}" height="${th}" rx="7"/>` +
    `<text class="okey" x="12" y="17">option ${i + 1}</text>${def}` +
    `<text class="olabel">${tspans(top, 12, 36, lh)}</text>${rec}` +
    `<path class="edge" d="M${W / 2},${th + 1} L${half / 2 + 1},${by - 3}" marker-end="url(#holo-arrow)"/>` +
    `<path class="edge" d="M${W / 2},${th + 1} L${W - half / 2 - 1},${by - 3}" marker-end="url(#holo-arrow)"/>` +
    `<rect class="b-does" x="1" y="${by}" width="${half}" height="${bh}" rx="6"/>` +
    `<text class="bk" x="10" y="${by + 16}">pros \u00b7 does</text><text class="bt">${tspans(does, 10, by + 32, lh)}</text>` +
    `<rect class="b-hurts" x="${W - half - 1}" y="${by}" width="${half}" height="${bh}" rx="6"/>` +
    `<text class="bk" x="${W - half + 8}" y="${by + 16}">cons \u00b7 hurts</text><text class="bt">${tspans(hurts, W - half + 8, by + 32, lh)}</text>` +
    `<path class="edge" d="M${half / 2 + 1},${by + bh} L${W / 2},${ty - 3}" marker-end="url(#holo-arrow)"/>` +
    `<path class="edge" d="M${W - half / 2 - 1},${by + bh} L${W / 2},${ty - 3}"/>` +
    `<rect class="b-then" x="1" y="${ty}" width="${W - 2}" height="${tH}" rx="6"/>` +
    `<text class="bt">${tspans(then, 12, ty + 18, lh)}</text>` +
    `</svg>` +
    explainHtml + pcHtml +
    `<button type="button" class="ans" hidden data-q="${q.id}" data-answer="${esc(o.label)}">Choose ${esc(clip(o.label, 28))}</button>` +
    `</figure>`;
}

function qCard(run, q) {
  const n = run.qs.filter((x) => ASKABLE.has(x.state)).length;
  const pos = run.qs.filter((x) => ASKABLE.has(x.state)).indexOf(q) + 1;
  const meta = [
    ["ticket", q.f.ticket], ["reason", q.f.reason], ["parked", q.f.parked],
    ["blocks", q.blocks.join(", ")], ["holds stages", q.holds.join(", ")],
    ["files", q.files.join(", ")], ["default", q.f.default], ["done", q.f.done], ["gated", q.f.gated],
  ].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
  const diag = q.f.diagram ? blockDiagramSvg(q.f.diagram, `${q.id} action diagram`) : "";
  return `<article class="qcard" data-q="${q.id}" data-state="${q.state}">` +
    `<header><span class="qid">${esc(run.id)} ${q.id} (${pos}/${n})</span>` +
    `<span class="chip">${esc(q.f.header || q.id)}</span><span class="qst">${esc(q.state)}</span></header>` +
    `<h3>${esc(q.f.question || "(no question text)")}</h3>` +
    `<dl class="meta">${meta}</dl>` +
    diag +
    `<div class="opts">${q.options.map((o, i) => optionFlow(run, q, o, i)).join("")}</div>` +
    `<div class="answer" hidden><label>Or in your own words <input type="text" maxlength="300" data-q="${q.id}"></label>` +
    `<button type="button" class="ans-own" data-q="${q.id}">Send</button>` +
    `<p class="sent" aria-live="polite"></p></div>` +
    `</article>`;
}

function otherQs(run) {
  const rest = run.qs.filter((q) => !ASKABLE.has(q.state));
  if (!rest.length) return "";
  const rows = rest.map((q) => {
    const out = q.f.replanned ? `replanned: ${q.f.replanned}` : q.f.moot ? `moot: ${q.f.moot}` : q.f["same-as"] ? `same as ${q.f["same-as"]}` : `answer: ${q.f.answer ?? "-"}`;
    return `<li data-q="${q.id}" data-state="${esc(q.state)}"><span class="qid">${q.id}</span><span class="qst">${esc(q.state)}</span>` +
      `<span>${esc(q.f.question || "")}<span class="sfiles">${esc(out)}${HOLDING.has(q.state) && q.holds.length ? " \u00b7 still holds stage " + q.holds.join(", ") : ""}</span></span></li>`;
  }).join("");
  return `<details class="closedq"><summary>${rest.length} other decision${rest.length > 1 ? "s" : ""} (answered, ruled, re-planned, moot)</summary><ul>${rows}</ul></details>`;
}

function designBlock(d, src) {
  if (!d) return "";
  const cards = d.parts.map((p, i) => {
    const nodes = (p.flows && p.flows.length)
      ? p.flows.map((f, idx) => ({ title: f, subtitle: `flow ${idx + 1}`, kind: "flow" }))
      : p.subs.length
      ? p.subs.map((s, idx) => ({ title: s, subtitle: (p.items && p.items[idx]) || `part ${idx + 1}`, kind: "block" }))
      : (p.items && p.items.length)
      ? p.items.map((it, idx) => ({ title: it, subtitle: `step ${idx + 1}`, kind: "action" }))
      : [];
    const diag = nodes.length ? blockDiagramSvg(nodes, `${p.name} block diagram`) : "";
    return `<article class="comp" data-component="${i + 1}"><h3><span class="cn">${i + 1}</span>${esc(p.name)}</h3>` +
      (p.lead ? `<p>${esc(p.lead)}</p>` : "") +
      diag +
      (p.subs.length ? `<ul>${p.subs.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : "") +
      p.tables.map((t) => `<table>${t.head.length ? `<thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` : ""}<tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`).join("") +
      `<p class="cm">${p.subs.length} part${p.subs.length === 1 ? "" : "s"} \u00b7 ${p.bullets} point${p.bullets === 1 ? "" : "s"}${p.code ? " \u00b7 " + p.code + " code block" + (p.code > 1 ? "s" : "") : ""}${p.tables.length ? " \u00b7 " + p.tables.length + " table" + (p.tables.length > 1 ? "s" : "") : ""}</p></article>`;
  }).join("");
  return `<section class="design"><h2>Design \u00b7 ${esc(d.title || basename(src))}<span class="n">${d.parts.length} sections</span></h2>` +
    `<p class="src">${esc(src)}</p><div class="comps">${cards}</div></section>`;
}

const DARK = `
  --ground:#121512; --surface:#191d19; --ink:#e6e9e5; --mid:#a0a79f; --faint:#6f766e; --rule:#2b302a;
  --landed:#6cc28d; --landed-bg:#16271c; --inflight:#7fb0f0; --inflight-bg:#152235;
  --parked:#c3a1ec; --parked-bg:#251c33; --failed:#f08b80; --failed-bg:#341a17;
  --replanned:#9da19c; --replanned-bg:#222622; --pending:#a0a79f; --pending-bg:#191d19;
  --does:#6cc28d; --does-bg:#16271c; --hurts:#f08b80; --hurts-bg:#341a17; --accent:#e5a660; --accent-bg:#33240f;
`;
const CSS = `
:root{
  --ground:#f3f4f1; --surface:#fbfbf9; --ink:#1a1d1a; --mid:#5a615a; --faint:#8a908a; --rule:#dde1db;
  --landed:#2f7d4f; --landed-bg:#e3f1e8; --inflight:#1f63b8; --inflight-bg:#e2ecf9;
  --parked:#7a4bb3; --parked-bg:#efe7f8; --failed:#b3261e; --failed-bg:#f8e3e1;
  --replanned:#7b7f7b; --replanned-bg:#eceeeb; --pending:#5a615a; --pending-bg:#fbfbf9;
  --does:#2f7d4f; --does-bg:#e8f3ec; --hurts:#b3261e; --hurts-bg:#f9e9e7; --accent:#a8590c; --accent-bg:#fbefe2;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; --mono:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK}}}
:root[data-theme="dark"]{${DARK}}
*{box-sizing:border-box}
body{background:var(--ground);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.5;margin:0 auto;
  max-width:64rem;padding:2rem 16px 4rem;-webkit-font-smoothing:antialiased}
h1{font-family:var(--mono);font-size:1rem;margin:0 0 .25rem;letter-spacing:.03em}
h1 .t{color:var(--mid);font-weight:400}
.sub{color:var(--mid);font-size:.8125rem;margin:0 0 1rem;overflow-wrap:anywhere}
h2{display:flex;gap:.5rem;align-items:baseline;font-family:var(--mono);font-size:.6875rem;text-transform:uppercase;
  letter-spacing:.12em;color:var(--mid);margin:2.25rem 0 .75rem;padding-bottom:.4rem;border-bottom:1px solid var(--rule)}
h2 .n{font-weight:400;color:var(--faint)}
.counts{display:flex;flex-wrap:wrap;border:1px solid var(--rule);border-radius:4px;background:var(--surface);overflow:hidden}
.counts div{flex:1 1 5.5rem;padding:.5rem .7rem;border-left:1px solid var(--rule)}
.counts div:first-child{border-left:0}
.counts b{display:block;font-family:var(--mono);font-size:1.05rem;font-variant-numeric:tabular-nums}
.counts span{font-size:.6875rem;color:var(--faint);text-transform:uppercase;letter-spacing:.05em}
.counts .c-landed b{color:var(--landed)} .counts .c-inflight b{color:var(--inflight)} .counts .c-parked b{color:var(--parked)}
.counts .c-failed b{color:var(--failed)} .counts .c-q b{color:var(--accent)}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--rule);border-radius:6px;background:var(--surface);padding:.5rem}
svg{display:block;font-family:var(--sans)}
.graph{max-width:none;height:auto}
.band{fill:var(--ground);opacity:.55} .lane{fill:var(--faint);font-size:10px;font-family:var(--mono)}
.colh{fill:var(--mid);font-size:10.5px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.06em}
.edge{fill:none;stroke:var(--faint);stroke-width:1.5} .e-implicit{stroke-dasharray:5 4} .e-replaced{stroke-dasharray:2 3;stroke:var(--replanned)}
.arrowhead{fill:var(--faint)}
.node rect{stroke-width:1.6}
.nid{font-family:var(--mono);font-size:11.5px;font-weight:700;fill:var(--ink)}
.nst{font-size:10.5px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.05em}
.nname{font-size:12.5px;fill:var(--ink)} .nmeta{font-size:11px;fill:var(--mid);font-family:var(--mono)} .nmeta.held{fill:var(--parked)}
${["landed", "inflight", "parked", "failed", "replanned", "pending", "unknown"].map((s) => {
  const c = s === "unknown" ? "failed" : s;
  return `.s-${s} rect{fill:var(--${c}-bg);stroke:var(--${c})} .s-${s} .nst{fill:var(--${c})} .srow.s-${s} .dot{background:var(--${c})} .srow.s-${s} .sst{color:var(--${c})}`;
}).join("\n")}
.s-pending rect{stroke-dasharray:4 3} .s-replanned rect{stroke-dasharray:2 3} .s-replanned .nname{text-decoration:line-through}
.legend{display:flex;flex-wrap:wrap;gap:.35rem .9rem;margin:.6rem 0 0;padding:0;list-style:none;font-size:.75rem;color:var(--mid)}
.legend li{display:flex;align-items:center;gap:.35rem}
.legend i,.dot{display:inline-block;width:.7rem;height:.7rem;border-radius:2px}
.stages{list-style:none;margin:1rem 0 0;padding:0}
.srow{display:grid;grid-template-columns:.8rem 2.6rem minmax(0,1fr) auto;gap:.6rem;align-items:baseline;padding:.45rem 0;border-bottom:1px solid var(--rule)}
.sn{font-family:var(--mono);font-weight:700;font-variant-numeric:tabular-nums}
.sname{min-width:0;overflow-wrap:anywhere} .sname b{font-family:var(--mono);font-size:.8125rem}
.sfiles{display:block;font-family:var(--mono);font-size:.75rem;color:var(--mid);overflow-wrap:anywhere}
.sst{font-family:var(--mono);font-size:.6875rem;text-transform:uppercase;letter-spacing:.05em;text-align:right;white-space:nowrap}
.sl{display:block;color:var(--faint);text-transform:none;letter-spacing:0}
.qcard{background:var(--surface);border:1px solid var(--rule);border-left:3px solid var(--accent);border-radius:6px;padding:1rem;margin:0 0 1.25rem}
.qcard header{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;font-family:var(--mono);font-size:.75rem}
.qid{font-weight:700} .chip{background:var(--accent-bg);color:var(--accent);border-radius:3px;padding:0 .4rem}
.qst{color:var(--faint);text-transform:uppercase;letter-spacing:.05em}
.qcard h3{font-size:1.05rem;margin:.5rem 0 .6rem;line-height:1.35}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.3rem 1rem;margin:0 0 .9rem}
.meta div{min-width:0} .meta dt{font-size:.6875rem;color:var(--faint);text-transform:uppercase;letter-spacing:.05em}
.meta dd{margin:0;font-family:var(--mono);font-size:.75rem;overflow-wrap:anywhere}
.opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:.75rem}
.opt{margin:0;padding:.5rem;border:1px solid var(--rule);border-radius:6px;background:var(--ground)}
.opt.rec{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.opt svg{width:100%;height:auto}
.b-pick{fill:var(--surface);stroke:var(--mid);stroke-width:1.2} .opt.rec .b-pick{fill:var(--accent-bg);stroke:var(--accent)}
.b-does{fill:var(--does-bg);stroke:var(--does)} .b-hurts{fill:var(--hurts-bg);stroke:var(--hurts)} .b-then{fill:var(--surface);stroke:var(--rule)}
.okey,.bk{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.06em;fill:var(--faint)}
.dtag{font-family:var(--mono);font-size:10px;fill:var(--mid)} .rtag{font-family:var(--mono);font-size:10.5px;font-weight:700;fill:var(--accent)}
.olabel{font-size:13.5px;font-weight:600;fill:var(--ink)} .bt{font-size:12px;fill:var(--ink)}
.opt-explain{font-size:.78rem;margin:.35rem 0 0;color:var(--ink)}
.pros-cons{display:grid;grid-template-columns:1fr 1fr;gap:.35rem;margin-top:.35rem}
.pro-card,.con-card{font-size:.75rem;padding:.25rem .4rem;border-radius:4px;border:1px solid var(--rule)}
.pro-card{background:var(--does-bg);border-color:var(--does)} .con-card{background:var(--hurts-bg);border-color:var(--hurts)}
.pc-k{font-family:var(--mono);font-size:.6875rem;text-transform:uppercase}
.pro-card .pc-k{color:var(--does)} .con-card .pc-k{color:var(--hurts)}
.block-diagram{width:100%;height:auto;margin:.4rem 0 .6rem;border:1px solid var(--rule);border-radius:6px;background:var(--ground);padding:.3rem}
.bd-box{fill:var(--surface);stroke:var(--rule);stroke-width:1.3} .bd-bar{fill:var(--accent)}
.bd-action .bd-bar{fill:var(--inflight)} .bd-flow .bd-bar{fill:var(--landed)}
.bd-title{font-size:11.5px;font-weight:700;fill:var(--ink)} .bd-sub{font-size:10px;fill:var(--mid);font-family:var(--mono)}
.bd-edge{fill:none;stroke:var(--faint);stroke-width:1.4}
button{font:inherit;font-size:.8125rem;margin-top:.5rem;padding:.4rem .8rem;border-radius:4px;border:1px solid var(--accent);
  background:var(--accent-bg);color:var(--ink);cursor:pointer;min-height:2.25rem}
button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.opt button{width:100%}
.answer{margin-top:.75rem} .answer label{display:flex;flex-direction:column;gap:.25rem;font-size:.75rem;color:var(--mid)}
.answer input{font:inherit;padding:.4rem;border:1px solid var(--rule);border-radius:4px;background:var(--surface);color:var(--ink)}
.sent{font-family:var(--mono);font-size:.75rem;color:var(--landed);min-height:1em;margin:.4rem 0 0}
.closedq ul,.comps ul{list-style:none;padding:0;margin:.5rem 0 0}
.closedq li{display:grid;grid-template-columns:2.6rem 6.5rem minmax(0,1fr);gap:.5rem;padding:.35rem 0;border-bottom:1px solid var(--rule);font-size:.8125rem}
summary{cursor:pointer;font-family:var(--mono);font-size:.6875rem;text-transform:uppercase;letter-spacing:.12em;color:var(--mid);margin-top:.5rem}
.comps{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:.75rem}
.comp{background:var(--surface);border:1px solid var(--rule);border-radius:6px;padding:.8rem}
.comp h3{display:flex;gap:.5rem;align-items:baseline;font-size:.9375rem;margin:0 0 .4rem}
.cn{font-family:var(--mono);font-size:.75rem;color:var(--accent)}
.comp p{margin:0 0 .4rem;font-size:.8125rem} .comp li{font-size:.8125rem;padding:.1rem 0;border-top:1px solid var(--rule)}
.comp table{border-collapse:collapse;font-size:.75rem;margin:.4rem 0;width:100%} .comp th,.comp td{border:1px solid var(--rule);padding:.2rem .4rem;text-align:left;vertical-align:top}
.cm,.src{font-family:var(--mono);font-size:.6875rem;color:var(--faint)}
.empty{color:var(--mid)}
.foot{margin-top:2.5rem;font-size:.75rem;color:var(--faint)}
@media (max-width:480px){.srow{grid-template-columns:.8rem 2.2rem minmax(0,1fr)} .sst{grid-column:3;text-align:left}}
`;

// Answers back from the page (Claude Code, `db` capability): one document per
// decision in the `answers` collection. The page only records a choice; the
// session reads it (ArtifactData list) and writes `relay-morpheus.sh answer`.
// Outside a viewer that grants `db` - a saved file, another host - the
// buttons stay hidden and the page is read-only.
const CLIENT = `
(function(){
  var run = document.querySelector("main[data-run]");
  if (!run || !window.claude || typeof window.claude.use !== "function") return;
  var runId = run.getAttribute("data-run");
  window.claude.use("db").then(function(db){
    if (!db) return;
    var col = db.collection("answers");
    var cards = document.querySelectorAll(".qcard");
    cards.forEach(function(card){
      card.querySelectorAll("button.ans").forEach(function(b){ b.hidden = false; });
      var a = card.querySelector(".answer"); if (a) a.hidden = false;
    });
    function say(q, text){
      var p = document.querySelector('.qcard[data-q="' + q + '"] .sent');
      if (p) p.textContent = text;
    }
    function send(q, answer, kind){
      answer = String(answer || "").trim();
      if (!answer) return;
      say(q, "sending...");
      col.doc(q).set({ run: runId, q: q, answer: answer.slice(0, 300), kind: kind, at: new Date().toISOString() })
        .then(function(){ say(q, "sent: " + answer + " - the session writes it to the run file"); })
        .catch(function(e){ say(q, "not sent (" + ((e && e.code) || "error") + ") - answer in the terminal instead"); });
    }
    document.addEventListener("click", function(ev){
      var b = ev.target.closest && ev.target.closest("button");
      if (!b) return;
      var q = b.getAttribute("data-q");
      if (b.classList.contains("ans")) send(q, b.getAttribute("data-answer"), "option");
      else if (b.classList.contains("ans-own")) {
        var i = document.querySelector('.answer input[data-q="' + q + '"]');
        send(q, i && i.value, "words");
      }
    });
    col.onSnapshot(function(snap){
      snap.docs.forEach(function(d){
        var v = d.data(); if (v && v.run === runId && v.answer) say(d.id, "sent: " + v.answer + " - the session writes it to the run file");
      });
    }, function(){});
  });
})();
`;

export function render(run, opts = {}) {
  const design = opts.design ? designBlock(opts.design, opts.designPath || "") : "";
  const title = run ? `Holo ${run.id}` : `Holo design`;
  let body = "";
  if (run) {
    const c = Object.fromEntries(ORDER.map((s) => [s, run.stages.filter((x) => x.state === s).length]));
    const askable = run.qs.filter((q) => ASKABLE.has(q.state));
    const chips = ORDER.filter((s) => s !== "unknown" || c.unknown)
      .map((s) => `<div class="c-${s}"><b>${c[s]}</b><span>${LABEL[s]}</span></div>`).join("") +
      `<div class="c-q"><b>${askable.length}</b><span>open decisions</span></div>`;
    const ch = run.chain;
    const sub = [run.plan && `plan ${run.plan}`, run.updated && `updated ${run.updated}`,
      ch && `driver ${ch.driver}`, ch && `hold ${ch.hold}`, ch && `mode ${ch.mode}`].filter(Boolean).map(esc).join(" \u00b7 ");
    const legend = ORDER.filter((s) => s !== "unknown").map((s) =>
      `<li><i style="background:var(--${s})"></i>${LABEL[s]}</li>`).join("") +
      `<li>\u2192 after:</li><li>- - \u2192 final stage, by convention</li>`;
    const qs = askable.length
      ? askable.map((q) => qCard(run, q)).join("")
      : `<p class="empty">No open decisions in ${esc(run.id)}.</p>`;
    body = `<header><h1>${esc(run.id)} <span class="t">\u00b7 ${esc(run.title)}</span></h1><p class="sub">${sub}</p>` +
      `<div class="counts">${chips}</div></header>` +
      (opts.anatomy ? `<section class="anatomy"><h2>The run as a machine<span class="n">${run.stages.length} stations</span></h2>${anatomyFigure(run, opts.now)}</section>` : "") +
      `<section class="decisions"><h2>Decisions waiting on you<span class="n">${askable.length}</span></h2>${qs}${otherQs(run)}</section>` +
      `<section class="run"><h2>Stage graph<span class="n">${run.stages.length} stages</span></h2>${stageGraph(run)}` +
      `<ul class="legend">${legend}</ul>${stageList(run)}</section>`;
  }
  body += design;
  const src = [run && opts.runPath, opts.designPath].filter(Boolean).map(esc).join(" + ");
  body = `<main data-run="${esc(run?.id ?? "")}">${body}<p class="foot">Drawn by holo-r2d2 from ${src || "the run file"}` +
    `${run ? ` at ${esc(run.updated || "?")}` : ""}. It decides nothing: answers are written to the run file by the session (relay-morpheus answer).` +
    `${run && run.chain ? ` Holds: ${run.holdsFrom === "relay" ? "as relay-morpheus chain next judges them" : "estimated here - relay-morpheus could not be run"}.` : ""}</p></main>`;
  const fig = run && opts.anatomy;
  return { title, css: fig ? CSS + ANATOMY_CSS : CSS, body, script: fig ? CLIENT + ANATOMY_SCRIPT : CLIENT };
}

export const artifactPage = (r) => `<title>${esc(r.title)}</title>\n<style>${r.css}</style>\n${r.body}\n<script>${r.script}</script>\n`;
export const standalonePage = (r) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
  `<title>${esc(r.title)}</title>\n<style>${r.css}</style>\n</head>\n<body>\n${r.body}\n<script>${r.script}</script>\n</body>\n</html>\n`;

// --------------------------------------------------------------- ascii ----
const ASCII_MAP = { "\u2014": "-", "\u2013": "-", "\u00b7": ".", "\u2026": "...", "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2192": "->", "\u00a7": "S", "\u00d7": "x" };
const toAscii = (s) => String(s ?? "").replace(/[^\x09\x0a\x20-\x7e]/g, (c) => ASCII_MAP[c] ?? "?");

export function renderAscii(run, opts = {}) {
  const out = [];
  if (run) {
    out.push(`${run.id} - ${run.title}${run.holdsFrom === "estimate" && run.chain ? "  (holds estimated - relay-morpheus not run)" : ""}`);
    out.push([run.plan && `plan: ${run.plan}`, run.updated && `updated: ${run.updated}`,
      run.chain && `driver: ${run.chain.driver}  hold: ${run.chain.hold}  mode: ${run.chain.mode}`].filter(Boolean).join("   "));
    out.push(ORDER.map((s) => `${GLYPH[s]} ${LABEL[s]} ${run.stages.filter((x) => x.state === s).length}`).join("  "));
    const askable = run.qs.filter((q) => ASKABLE.has(q.state));
    out.push("", `DECISIONS WAITING ON YOU (${askable.length})`);
    if (!askable.length) out.push("  none");
    askable.forEach((q, qi) => {
      out.push(`  ${run.id} ${q.id} (${qi + 1}/${askable.length}) [${q.f.header || q.id}] ${q.f.reason || ""} - ${q.state}`);
      out.push(`    ${q.f.question || ""}`);
      out.push(`    ticket ${q.f.ticket || "-"} | blocks ${q.blocks.join(", ") || "-"} | holds stage ${q.holds.join(", ") || "-"}`);
      out.push(`    files ${q.files.join(", ") || "-"}`);
      q.options.forEach((o, i) => {
        const tags = [o.rec && "recommended", q.f.default === o.label && "default"].filter(Boolean).join(", ");
        out.push(`    ${o.rec ? "*" : " "} ${i + 1}. ${o.label}${tags ? "  (" + tags + ")" : ""}`);
        out.push(`         does:  ${o.does}`);
        out.push(`         hurts: ${o.hurts}`);
      });
    });
    const rest = run.qs.filter((q) => !ASKABLE.has(q.state));
    if (rest.length) out.push(`  other: ${rest.map((q) => `${q.id} ${q.state}`).join(", ")}`);
    const { cols } = layout(run);
    out.push("", `STAGE GRAPH (${run.stages.length} stages; one step = stages that may run side by side)`);
    cols.forEach((c, ci) => {
      out.push(`  step ${ci + 1}${c.length > 1 ? `  (${c.length} lanes)` : ""}`);
      for (const s of c) {
        const dep = [...s.after.map((a) => `after ${a}`), s.implicit.length ? "after all (final)" : ""].filter(Boolean).join(", ");
        out.push(`    ${GLYPH[s.state]} ${String(s.n).padStart(3)} ${s.code ? s.code + " " : ""}${s.name}  -- ${LABEL[s.state]}` +
          `${s.landed !== "-" ? " " + s.landed : ""}${s.waits.length ? "  waits on " + s.waits.join(" ") : ""}`);
        out.push(`          files: ${s.files.join(", ") || "-"}${dep ? "   " + dep : ""}${s.replacedBy ? "   replaced by " + s.replacedBy : ""}`);
      }
    });
  }
  if (opts.design) {
    const d = opts.design;
    out.push("", `DESIGN ${d.title} (${opts.designPath || ""}) - ${d.parts.length} sections`);
    d.parts.forEach((p, i) => {
      out.push(`  ${i + 1}. ${p.name}  [${p.subs.length} parts, ${p.bullets} points]`);
      for (const s of p.subs) out.push(`       - ${s}`);
      for (const t of p.tables) for (const r of (t.head.length ? [t.head, ...t.rows] : t.rows)) out.push("       | " + r.join(" | ") + " |");
    });
  }
  return toAscii(out.join("\n")) + "\n";
}

// ------------------------------------------------------------ markdown ----
const MERMAID_STROKE = { landed: "#2f7d4f", inflight: "#1f63b8", parked: "#7a4bb3", failed: "#b3261e", replanned: "#7b7f7b", pending: "#5a615a", unknown: "#b3261e" };
const mlabel = (s) => String(s).replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;");
// Run-file and design text is data: no raw HTML, and a line standing alone opens no fence, heading, list or quote.
const mdx = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mdLine = (s) => mdx(s).replace(/^(\s*)(`{3}|~{3}|#|[-*+](?=\s))/, "$1\\$2").replace(/^(\s*\d+)([.)](?=\s))/, "$1\\$2");
const mdTable = (head, rows) => {
  const w = Math.max(head.length, ...rows.map((r) => r.length), 1);
  const row = (r) => "| " + Array.from({ length: w }, (_, i) => mdx(r[i]).replace(/\|/g, "\\|")).join(" | ") + " |";
  return [row(head.length ? head : Array(w).fill("")), "|" + " --- |".repeat(w), ...rows.map(row)].join("\n");
};
export function renderMarkdown(run, opts = {}) {
  const out = [];
  if (run) {
    out.push(`# Holo ${mdx(run.id)} - ${mdx(run.title)}`, "");
    const ch = run.chain;
    out.push(mdx([run.plan && `plan ${run.plan}`, run.updated && `updated ${run.updated}`, ch && `driver ${ch.driver}`, ch && `hold ${ch.hold}`, ch && `mode ${ch.mode}`].filter(Boolean).join(" · ")), "");
    out.push("## Counts", "", mdTable(["state", "stages"], ORDER.filter((s) => s !== "unknown" || run.stages.some((x) => x.state === s)).map((s) => [LABEL[s], String(run.stages.filter((x) => x.state === s).length)])), "");
    const askable = run.qs.filter((q) => ASKABLE.has(q.state));
    out.push(`## Decisions waiting on you (${askable.length})`, "");
    if (!askable.length) out.push(`No open decisions in ${run.id}.`, "");
    for (const q of askable) {
      out.push(`### ${q.id} - ${mdx(q.f.header || q.id)} (${q.state})`, "", q.f.question ? mdLine(q.f.question) : "(no question text)", "");
      for (const [k, v] of [["ticket", q.f.ticket], ["reason", q.f.reason], ["blocks", q.blocks.join(", ")], ["holds stages", q.holds.join(", ")], ["files", q.files.join(", ")], ["default", q.f.default]]) if (v) out.push(`- ${k}: ${mdx(v)}`);
      out.push("", mdTable(["#", "option", "does", "hurts"], q.options.map((o, i) => [String(i + 1), o.label + (o.rec ? " (recommended)" : ""), o.does || "-", o.hurts || "-"])), "");
    }
    out.push("## Stage graph", "", "```mermaid", "flowchart LR");
    for (const s of run.stages) out.push(`  S${s.n}["#${s.n}${s.code ? " · " + mlabel(s.code) : ""} ${mlabel(s.name)}"]:::${s.state}`);
    for (const e of layout(run).edges) out.push(e.kind === "after" ? `  S${e.from} --> S${e.to}` : e.kind === "implicit" ? `  S${e.from} -.-> S${e.to}` : `  S${e.from} -. replaced .-> S${e.to}`);
    for (const s of Object.keys(MERMAID_STROKE)) out.push(`  classDef ${s} stroke:${MERMAID_STROKE[s]},stroke-width:2px`);
    out.push("```", "", "## Stages", "", mdTable(["#", "stage", "state", "owner", "landed", "files"], run.stages.map((s) => [String(s.n), (s.code ? s.code + " " : "") + s.name, LABEL[s.state] + (s.state === "unknown" ? ` (${s.st})` : ""), s.owner, s.landed, s.files.join(", ") || "-"])), "");
  }
  if (opts.design) {
    const d = opts.design;
    out.push(`## Design - ${mdx(d.title)} (${d.parts.length} sections)`, "", opts.designPath ? `Source: ${mdx(opts.designPath)}` : "", "");
    d.parts.forEach((p, i) => {
      out.push(`### ${i + 1}. ${mdx(p.name)}`, "");
      if (p.lead) out.push(mdLine(p.lead), "");
      if (p.subs.length) out.push(...p.subs.map((s) => `- ${mdx(s)}`), "");
      for (const t of p.tables) out.push(mdTable(t.head, t.rows), "");
      out.push(`${p.subs.length} part${p.subs.length === 1 ? "" : "s"} · ${p.bullets} point${p.bullets === 1 ? "" : "s"}${p.code ? ` · ${p.code} code block${p.code > 1 ? "s" : ""}` : ""}${p.tables.length ? ` · ${p.tables.length} table${p.tables.length > 1 ? "s" : ""}` : ""}`, "");
    });
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

// ----------------------------------------------------------------- svg ----
// Light theme, literal colours: a standalone image cannot rely on prefers-color-scheme.
const SVG_INK = MERMAID_STROKE; // the light CSS state colours, literal
const SVG_BG = { landed: "#e3f1e8", inflight: "#e2ecf9", parked: "#efe7f8", failed: "#f8e3e1", replanned: "#eceeeb", pending: "#fbfbf9", unknown: "#f8e3e1" };
export function renderSvg(run, opts = {}) {
  const lines = [];
  if (run) {
    const ch = run.chain;
    lines.push(`${run.id} - ${run.title}`, [run.plan && `plan ${run.plan}`, run.updated && `updated ${run.updated}`, ch && `driver ${ch.driver}  hold ${ch.hold}  mode ${ch.mode}`].filter(Boolean).join("   "));
    lines.push(ORDER.map((s) => `${LABEL[s]} ${run.stages.filter((x) => x.state === s).length}`).join("   "), "");
    const askable = run.qs.filter((q) => ASKABLE.has(q.state));
    lines.push(`DECISIONS (${askable.length})`);
    if (!askable.length) lines.push("  none");
    for (const q of askable) {
      lines.push(`  ${q.id} [${q.f.header || q.id}] ${q.f.question || ""}`, `    ticket ${q.f.ticket || "-"} | blocks ${q.blocks.join(", ") || "-"} | holds stage ${q.holds.join(", ") || "-"} | default ${q.f.default || "-"}` +
        `${q.f.reason ? " | reason " + q.f.reason : ""}${q.files.length ? " | files " + q.files.join(", ") : ""}`);
      q.options.forEach((o, i) => lines.push(`    ${i + 1}. ${o.label}${o.rec ? " (recommended)" : ""} - does: ${o.does || "-"} - hurts: ${o.hurts || "-"}`));
    }
    lines.push("", "STAGES");
    if (!run.stages.length) lines.push("  No stage rows in this run file.");
    for (const s of run.stages) lines.push(`  #${s.n} ${s.code ? s.code + " " : ""}${s.name} - ${LABEL[s.state]}${s.landed !== "-" ? " " + s.landed : ""} - ${s.owner}${s.files.length ? " - " + s.files.join(", ") : ""}`);
  }
  if (opts.design) {
    const d = opts.design;
    lines.push("", `DESIGN ${d.title}${opts.designPath ? " (" + opts.designPath + ")" : ""} - ${d.parts.length} sections`);
    d.parts.forEach((p, i) => {
      lines.push(`  ${i + 1}. ${p.name}  [${p.subs.length} parts, ${p.bullets} points, ${p.tables.length} tables]`);
      for (const s of p.subs) lines.push(`       - ${s}`);
      for (const t of p.tables) for (const r of (t.head.length ? [t.head, ...t.rows] : t.rows)) lines.push(`       | ${r.join(" | ")} |`);
    });
  }
  const rows = lines.flatMap((l) => l === "" ? [""] : wrap(l, 110));
  const g = run && run.stages.length ? stageGraphParts(run) : null;
  const LH = 18, PAD = 16;
  const W = Math.max(g ? g.W : 0, 720), gy = PAD, ty = (g ? g.H + PAD : 0) + PAD;
  const H = ty + rows.length * LH + PAD;
  const style = `text{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;fill:#1a1d1a}.row{font-family:ui-monospace,Consolas,monospace;font-size:12.5px}` +
    `.band{fill:#f3f4f1;opacity:.55}.lane,.colh{font-size:10px;fill:#8a908a}.edge{fill:none;stroke:#8a908a;stroke-width:1.5}.e-implicit{stroke-dasharray:5 4}.e-replaced{stroke-dasharray:2 3;stroke:#7b7f7b}.arrowhead{fill:#8a908a}` +
    `.node rect{stroke-width:1.6}.nid{font-size:11.5px;font-weight:700}.nst{font-size:10.5px}.nname{font-size:12.5px}.nmeta{font-size:11px;fill:#5a615a}.nmeta.held{fill:${SVG_INK.parked}}` +
    Object.keys(SVG_INK).map((s) => `.s-${s} rect{fill:${SVG_BG[s]};stroke:${SVG_INK[s]}}.s-${s} .nst{fill:${SVG_INK[s]}}`).join("") + `.s-pending rect{stroke-dasharray:4 3}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Holo ${esc(run ? run.id : "design")}">` +
    `<style>${style}</style>${ARROW_DEFS}` +
    `<rect width="${W}" height="${H}" fill="#fbfbf9"/>` +
    (g ? `<g transform="translate(0,${gy})">${g.inner}</g>` : "") +
    rows.map((r, i) => `<text class="row" x="${PAD}" y="${ty + (i + 1) * LH - 4}" xml:space="preserve">${esc(r)}</text>`).join("") + `</svg>\n`;
}

// ----------------------------------------------------------------- cli ----
function findRoot(start) {
  let d = resolve(start);
  for (;;) {
    if (existsSync(join(d, ".skillator"))) return d;
    if (existsSync(join(d, ".git"))) return resolve(start); // never climb out of the repo
    const up = dirname(d);
    if (up === d) return resolve(start);
    d = up;
  }
}

async function runFiles(root) {
  const dir = join(root, ".skillator");
  let names = [];
  try { names = await readdir(dir); } catch { return []; }
  return names.filter((n) => /^run-\d+-.*\.md$/.test(n)).map((n) => join(dir, n));
}

// F44: runs are named RUN-0012 (run-0012-*.md); runs named before that are
// run-12-*.md. Any spelling - 12, RUN-12, RUN-0012 - finds either, by number.
function runFilesFor(arg, files) {
  const m = /^(?:RUN-)?(\d+)$/i.exec(arg);
  if (!m) return null;
  return files.filter((f) => { const k = /^run-(\d+)-/.exec(basename(f)); return k && BigInt(k[1]) === BigInt(m[1]); });
}

async function resolveRun(arg, root) {
  if (arg && existsSync(arg) && (await stat(arg)).isFile()) return resolve(arg);
  const files = await runFiles(root);
  if (arg) {
    const hit = runFilesFor(arg, files);
    if (!hit) throw new Error(`'${arg}' is not a run file, RUN-<n> or <n>`);
    if (!hit.length) throw new Error(`no .skillator/run-${arg.replace(/^RUN-/i, "")}-*.md under ${root}`);
    return hit[0];
  }
  // No run named: the live one - a `~` row or a decision still open.
  const live = [];
  for (const f of files) {
    const r = parseRun(await readFile(f, "utf8"));
    if (r.stages.some((s) => s.state === "inflight") || r.qs.some((q) => ASKABLE.has(q.state))) live.push([f, r.id]);
  }
  if (live.length === 1) return live[0][0];
  if (!live.length && files.length === 1) return files[0];
  const cand = (live.length ? live : files.map((f) => [f, basename(f)])).map(([f, id]) => `  ${id}  ${f}`).join("\n");
  const e = new Error(`${live.length ? live.length + " live runs" : files.length ? "no live run" : "no run files"} - name one (Help me, Obi-Wan RUN-<n>):\n${cand}`);
  e.code = 2;
  throw e;
}

async function buildFixture(dir) {
  dir = resolve(dir);
  if (existsSync(dir)) throw new Error(`fixture dir already exists: ${dir}`);
  const src = join(HERE, "fixtures", "repo-two-qs");
  await cp(src, dir, { recursive: true, filter: (p) => basename(p) !== "_run.md" });
  const env = { ...process.env, GIT_AUTHOR_DATE: "2026-09-01T09:00:00+00:00", GIT_COMMITTER_DATE: "2026-09-01T09:00:00+00:00" };
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { env, encoding: "utf8" }).trim();
  git("init", "-q");
  for (const [k, v] of [["user.email", "fixture@example.invalid"], ["user.name", "fixture"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) git("config", k, v);
  git("add", "-A");
  git("commit", "-qm", "B3 B4 F3: case-insensitive find, blank titles refused, by_author [AAAB]");
  const sha = git("rev-parse", "--short=7", "HEAD");
  await mkdir(join(dir, ".skillator"), { recursive: true });
  const md = (await readFile(join(src, "_run.md"), "utf8")).replaceAll("@LANDED@", sha);
  await writeFile(join(dir, ".skillator", "run-1-shelf-export.md"), md);
  git("add", "-A");
  git("commit", "-qm", "RUN-1: stage 1 landed, stage 2 parked on Q1 and Q2");
  return dir;
}

export function batchLines(html, art, wiz = "", decisionCount = 0) {
  const lines = [`\npage: ${resolve(html)}  (Artifact tool: publish ${resolve(art)})`];
  if (wiz) lines.push(`answer all ${decisionCount} in the decision wizard: ${resolve(wiz)}`);
  return lines.join("\n");
}

function parseArgs(argv) {
  const o = { pos: [], mode: "artifact" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === "--ascii") o.mode = "ascii";
    else if (a === "--html") o.mode = "html";
    else if (a === "--md") o.mode = "md";
    else if (a === "--svg") o.mode = "svg";
    else if (a === "--wizard") o.mode = "wizard";
    else if (a === "--next-wizard") { o.mode = "wizard"; o.nextWizard = val(); }
    else if (a === "--batch") o.mode = "batch";
    else if (a === "--anatomy") o.anatomy = true;
    else if (a === "--decisions") { o.mode = "wizard"; o.decisions = val(); }
    else if (a === "--answers") o.answers = val();
    else if (a === "--out") o.out = val();
    else if (a === "--ticket") o.ticket = val();
    else if (a === "--design") o.design = val();
    else if (a === "--root") o.root = val();
    else if (a === "--fixture") o.fixture = val();
    else if (a === "--selftest") o.selftest = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else if (a.startsWith("--")) throw new Error(`unknown flag ${a}`);
    else o.pos.push(a);
  }
  if (o.mode === "wizard" && o.answers && !o.nextWizard && o.ticket === undefined) {
    o.nextWizard = o.answers;
    delete o.answers;
  }
  if (o.pos.length > 1) throw new Error(`one run at a time, got: ${o.pos.join(" ")}`);
  if (o.ticket !== undefined) {
    if (!/^[A-Za-z]{1,3}[0-9]+[a-z]?$/.test(o.ticket)) throw new Error("invalid ticket ID");
    o.ticket = o.ticket.replace(/^[A-Za-z]+/, x => x.toUpperCase());
    if (!["html", "ascii"].includes(o.mode) || o.pos.length || o.answers || o.nextWizard || o.decisions || o.anatomy || o.fixture || o.out) throw new Error("--ticket requires --html or --ascii; no run, answers, wizard, anatomy, fixture or custom output");
  }
  return o;
}

// Generated output: .skillator/holo/ carries a `*` .gitignore, so it never lands in a commit.
async function writeGenerated(root, out, text) {
  await mkdir(dirname(out), { recursive: true });
  const gen = join(root, ".skillator", "holo");
  if (dirname(out).toLowerCase() === gen.toLowerCase() && !existsSync(join(gen, ".gitignore"))) await writeFile(join(gen, ".gitignore"), "*\n");
  await writeFile(out, text, "utf8");
}

// A118: the holds as relay-morpheus judges them - `chain next --holds`, read-only
// (it refreshes no lease and writes nothing). sh first, then the ps1 twin;
// HOLO_RELAY_CMD replaces both (tests). null when the run has no chain or
// relay-morpheus cannot be run - the page then falls back to its estimate.
export function parseHolds(text) {
  return String(text).split(/\r?\n/).map((l) => /^IDLE (\d+) (Q\d+) (\w+)\s*$/.exec(l)).filter(Boolean).map((m) => ({ n: Number(m[1]), q: m[2], why: m[3] }));
}
function relayHolds(md, runPath, root) {
  if (!/^## Chain\r?$/m.test(md)) return null;
  const env = { ...process.env, RELAY_RUN: runPath };
  const tries = [];
  // HOLO_RELAY_CMD: a test hook only (the selftest's stub relay); unset in use.
  if (process.env.HOLO_RELAY_CMD) tries.push(["sh", ["-c", process.env.HOLO_RELAY_CMD]]);
  else {
    const rm = join(HERE, "..", "..", "relay-morpheus", "hooks");
    if (existsSync(join(rm, "relay-morpheus.sh"))) tries.push(["sh", [join(rm, "relay-morpheus.sh"), "chain", "next", "--holds"]]);
    if (existsSync(join(rm, "relay-morpheus.ps1"))) tries.push(["powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(rm, "relay-morpheus.ps1"), "-Mode", "chain", "-Action", "next", "-Holds", "-Run", runPath]]);
  }
  // A port that cannot start or fails (a broken sh, a timeout) falls through to
  // the next; 30 s each, so a dead sh costs one PowerShell start, not a minute.
  for (const [cmd, args] of tries) {
    try { return parseHolds(execFileSync(cmd, args, { env, cwd: root, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "ignore"] })); }
    catch { /* next */ }
  }
  return null;
}

// F116: source facts become ordinary renderer components, never HTML or commands.
export function ticketModel(md, id) {
  const rows = md.split(/\r?\n/).flatMap((line, i) => {
    const m = /^[ \t]*- \[([ ~%!? >x-])\][ \t]+([A-Z]{1,3}[0-9]+[a-z]?)[ \t]*[\u2014\u2013-][ \t]*(.*)$/.exec(line);
    return m ? [{ id: m[2], mark: m[1], title: m[3], line, n: i + 1 }] : [];
  });
  const hits = rows.filter(t => t.id === id);
  if (hits.length !== 1) throw new Error(`${id}: ${hits.length} matching rows; need exactly one`);
  const t = hits[0], names = { ' ': 'Pending', '!': 'Blocked', '>': 'Deferred', '~': 'In progress', '%': 'Testing', '?': 'Decision', x: 'Done', '-': 'Cancelled' };
  const notes = [...t.title.matchAll(/\((blocked|deferred|testing): ([^()]*)\)/g)].map(m => m[0]);
  const linked = [...new Set(notes.flatMap(ids))].filter(x => x !== id).map(x => {
    const hits = rows.filter(r => r.id === x);
    return hits.length === 1 ? `${x}: ${names[hits[0].mark]}` : `${x}: evidence missing or duplicate`;
  });
  const part = (name, lead, subs = []) => ({ name, lead, subs, tables: [], bullets: 0, code: 0 });
  return { title: `Ticket ${id} decision support`, parts: [
    part('Source and current state', `TICKETS.md:${t.n} - ${names[t.mark]}`, [t.line, `Owner: ${/\[owner:([^\]]*)\]/.exec(t.title)?.[1]?.trim() || 'unowned'}`]),
    part('Current wait and testing notes', notes.join(' ; ') || 'No managed wait or testing notes.', linked),
    part('Status choices', [' ', '!', '>'].includes(t.mark) ? 'Eligible for guarded Pending / Blocked / Deferred changes.' : 'Use the existing worker, verification, decision or reopen workflow.', [
      'Pending: the blocker or deferral is resolved', 'Blocked: work cannot continue; record what is needed', 'Deferred: intentionally postponed; record when to revisit.',
      'Wait resolution is unknown. Linked completed work does not establish that human conditions are resolved. This page never edits status or answers decisions.'
    ]),
    part('Plan evidence', /\bPlan: S[0-9]+/.exec(t.title)?.[0] || 'No explicit plan pointer. No plan inferred from mentions.')
  ] };
}
async function ticketPage(root, o) {
  const design = ticketModel(await readFile(join(root, 'TICKETS.md'), 'utf8'), o.ticket);
  const matches = [];
  for (const path of (await runFiles(root)).sort()) {
    const run = parseRun(await readFile(path, 'utf8'));
    if (run.stages.some(s => [...s.tickets, ...ids(s.raw)].includes(o.ticket)) || run.qs.some(q => Object.values(q.f).some(v => ids(v).includes(o.ticket)))) matches.push({ run, path });
  }
  design.parts.push({ name: 'Run evidence', lead: matches.length ? `${matches.length} matching runs; none selected as authoritative.` : 'No matching run evidence.', subs: matches.map(({run, path}) => `${relative(root, path)}: ${run.id}; stages ${run.stages.map(s => s.n).join(', ')}; decisions ${run.qs.map(q => q.id).join(', ') || 'none'}`), tables: [], bullets: 0, code: 0 });
  const rendered = render(null, { design, designPath: 'TICKETS.md' });
  for (const {run, path} of matches) rendered.body += render(run, { runPath: relative(root, path) }).body;
  if (o.design) rendered.body += render(null, { design: parseDesign(await readFile(o.design, 'utf8')), designPath: o.design }).body;
  if (o.mode === 'ascii') {
    process.stdout.write(renderAscii(null, { design, designPath: 'TICKETS.md' }));
    for (const {run, path} of matches) process.stdout.write(renderAscii(run, { runPath: relative(root, path) }));
    return;
  }
  const out = resolve(join(root, '.skillator', 'holo', `ticket-${o.ticket}.html`));
  await writeGenerated(root, out, standalonePage(rendered));
  console.log(`holo: ticket ${o.ticket}, ${matches.length} matching runs -> ${out}`);
}

async function main(argv) {
  const o = parseArgs(argv);
  if (o.help) { console.log((await readFile(fileURLToPath(import.meta.url), "utf8")).split("\n").slice(1, 21).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return; }
  if (o.selftest) return selftest();
  if (o.fixture) { console.log(await buildFixture(o.fixture)); return; }
  if (o.answers) {
    const r = answersToCommands(JSON.parse(await readFile(o.answers, "utf8")));
    console.log("# POSIX sh lines (Git Bash on Windows) - read them, then run them yourself");
    for (const c of r.commands) console.log(c);
    for (const x of r.review) console.log(`# review: ${x}`);
    for (const x of r.open) console.log(`# still open: ${x}`);
    return;
  }
  const root = findRoot(o.root ?? process.cwd());
  if (o.ticket) return ticketPage(root, o);
  if (o.mode === "wizard") {
    let set, stem;
    if (o.decisions) { set = JSON.parse(await readFile(o.decisions, "utf8")); stem = String(set && set.id || "decisions"); }
    else {
      const runPath = await resolveRun(o.pos[0], root);
      const md = await readFile(runPath, "utf8");
      const run = parseRun(md, relayHolds(md, runPath, root));
      if (!run.id) throw new Error(`${runPath}: no '# RUN-<n> - <title>' line - not a relay run file`);
      set = setFromRun(run, relative(root, runPath).replace(/\\/g, "/")); stem = run.id;
    }
    if (o.nextWizard) {
      set = nextWizardSet(set, JSON.parse(await readFile(o.nextWizard, "utf8")));
    }
    const out = resolve(o.out ?? join(root, ".skillator", "holo", `${stem.replace(/[^A-Za-z0-9_.-]/g, "-")}.wizard.html`));
    await writeGenerated(root, out, wizardPage(set));
    console.log(`holo: wizard ${set.id}${set.round ? ` (round ${set.round})` : ""}, ${set.decisions.length} decision${set.decisions.length === 1 ? "" : "s"} to answer, ${(set.settled || []).length} settled -> ${out}`);
    return;
  }
  let run = null, runPath = "";
  if (o.pos.length || !o.design) {
    runPath = await resolveRun(o.pos[0], root);
    const md = await readFile(runPath, "utf8");
    run = parseRun(md, relayHolds(md, runPath, root));
    if (!run.id) throw new Error(`${runPath}: no '# RUN-<n> - <title>' line - not a relay run file`);
  }
  let design = null;
  if (o.design) design = parseDesign(await readFile(o.design, "utf8"));
  const rel = (p) => (p ? relative(root, p).replace(/\\/g, "/") : p);
  const opts = { design, designPath: o.design && rel(resolve(o.design)), runPath: rel(runPath), anatomy: o.anatomy && o.mode !== "ascii" };
  if (o.mode === "ascii") { process.stdout.write(renderAscii(run, opts)); return; }
  // F41 end batch: every drawing at once, so none is skipped - two GREEN runs
  // that ran the pieces one by one drew the wizard and the ASCII but never the
  // page, and pasted neither picture.
  if (o.mode === "batch") {
    if (!run) throw new Error("--batch draws a run - name one");
    const r = render(run, opts), dir = join(root, ".skillator", "holo");
    const art = resolve(join(dir, `${run.id}.artifact.html`)), html = resolve(join(dir, `${run.id}.html`));
    await writeGenerated(root, art, artifactPage(r));
    await writeGenerated(root, html, standalonePage(r));
    const set = setFromRun(run, rel(runPath));
    let wiz = "";
    if (set.decisions.length) { wiz = resolve(join(dir, `${run.id}.wizard.html`)); await writeGenerated(root, wiz, wizardPage(set)); }
    process.stdout.write(renderAscii(run, opts));
    console.log(batchLines(html, art, wiz, set.decisions.length));
    return;
  }
  if ((o.mode === "md" || o.mode === "svg") && o.anatomy) throw new Error("--anatomy draws the page: use it with the Artifact or --html output");
  const stem = run ? run.id : basename(o.design).replace(/\.md$/i, "");
  if (o.mode === "md" || o.mode === "svg") {
    const out = resolve(o.out ?? join(root, ".skillator", "holo", `${stem}.${o.mode}`));
    await writeGenerated(root, out, o.mode === "md" ? renderMarkdown(run, opts) : renderSvg(run, opts));
    console.log(`holo: ${run ? `${run.id} ${run.stages.length} stages` : "design only"}${design ? `, ${design.parts.length} design sections` : ""} -> ${out}` +
      (o.mode === "md" ? " (Markdown with a Mermaid stage graph)" : " (standalone SVG)"));
    return;
  }
  const r = render(run, opts);
  const out = resolve(o.out ?? join(root, ".skillator", "holo", `${stem}${o.mode === "html" ? "" : ".artifact"}.html`));
  await writeGenerated(root, out, o.mode === "html" ? standalonePage(r) : artifactPage(r));
  const nq = run ? run.qs.filter((q) => ASKABLE.has(q.state)).length : 0;
  // The levers link to the wizard by a relative name: write it beside the page.
  if (opts.anatomy && run && nq) await writeGenerated(root, join(dirname(out), `${run.id}.wizard.html`), wizardPage(setFromRun(run, rel(runPath))));
  console.log(`holo: ${run ? `${run.id} ${run.stages.length} stages, ${nq} open decision${nq === 1 ? "" : "s"}` : "design only"}` +
    `${design ? `, ${design.parts.length} design sections` : ""} -> ${out}` +
    (o.mode === "html" ? " (standalone page)" : " (Artifact page: publish it with the Artifact tool, capabilities {db:{}})"));
}

// ------------------------------------------------------------ selftest ----
function selftest() {
  let fails = 0;
  const ok = (c, msg, got) => { if (!c) { fails++; console.error(`selftest FAIL: ${msg}`, got === undefined ? "" : got); } };
  const fx = (n) => readFileSyncText(join(HERE, "fixtures", n));
  const rowsOf = (md) => [...md.matchAll(/^\|\s*(\d+)\s*\|[^|]*\|([^|]*)\|/gm)].map((m) => [Number(m[1]), STATE[m[2].trim()] ?? "unknown"]);

  // F116: ticket facts reuse every design component and escape source data.
  ok(parseArgs(['--ticket', 'f91', '--html']).ticket === 'F91', 'ticket canonical args');
  for (const args of [['--ticket','../bad','--html'], ['--ticket','F91','--wizard'], ['--ticket','F91','--html','--answers','x'], ['--ticket','F91','--html','--out','TICKETS.md']]) {
    let refused = false; try { parseArgs(args); } catch { refused = true; } ok(refused, 'ticket incompatible args refused');
  }
  const ticket = ticketModel('- [>] F91 - </script><img src=x onerror=1> & "quotes" `ticks` [owner: @asha] (deferred: F9 and owner review)\n- [x] F9 - done\n- [ ] F910 - other', 'F91');
  const ticketHtml = standalonePage(render(null, {design: ticket, designPath: 'TICKETS.md'}));
  ok(ticketHtml.includes('&lt;/script&gt;&lt;img') && !ticketHtml.includes('<img src=x'), 'ticket source escaped');
  ok(ticketHtml.includes('Deferred') && ticketHtml.includes('F9: Done') && ticketHtml.includes('Owner: @asha') && ticketHtml.includes('TICKETS.md:1'), 'ticket facts and exact linked ID');
  for (let i = 1; i <= ticket.parts.length; i++) ok(ticketHtml.includes(`data-component="${i}"`), `ticket component ${i} rendered`);
  let duplicate = false; try { ticketModel('- [ ] F91 - one\n- [ ] F91 - two', 'F91'); } catch { duplicate = true; } ok(duplicate, 'duplicate ticket refused');

  // 1. every state, every Q state, a chain with after:, files, a replan
  const md = fx("fixture-all-states.md");
  const run = parseRun(md);
  const r = render(run, { runPath: "fixture-all-states.md" });
  const page = artifactPage(r), full = standalonePage(r), ascii = renderAscii(run);
  const rows = rowsOf(md);
  ok(rows.length === 8 && run.stages.length === rows.length, "all-states: 8 rows parsed", run.stages.length);
  for (const st of ["pending", "inflight", "landed", "failed", "parked", "replanned", "unknown"]) {
    ok(run.stages.some((s) => s.state === st), `all-states: fixture covers ${st}`);
  }
  // The graph is generated, not drawn: every row of the table - read here by
  // a regex independent of parseRun - is a node, a list row and an ASCII line
  // carrying its own state.
  for (const [n, st] of rows) {
    const re = new RegExp(`data-stage="${n}" data-state="${st}"`, "g");
    ok((page.match(re) || []).length === 2, `stage ${n} drawn as ${st} in graph and list`, (page.match(re) || []).length);
    ok(new RegExp(`^\\s+\\${GLYPH[st][0]}\\${GLYPH[st][1]}\\${GLYPH[st][2]}\\s+${n} `, "m").test(ascii), `ascii row for stage ${n} as ${st}`);
  }
  ok((page.match(/class="node /g) || []).length === rows.length, "one node per row, no extras");
  ok(page.includes('data-edge="1-2" data-kind="after"') && page.includes('data-edge="2-4" data-kind="after"'), "after: edges drawn");
  ok(page.includes('data-edge="5-6" data-kind="replaced"'), "replanned stage points at its replacement");
  ok(page.includes('data-edge="1-8" data-kind="implicit"'), "final stage after everything, dashed");
  ok((page.match(/data-edge="/g) || []).length === 10 && !page.includes('data-edge="9-'), "10 edges, none invented (after: 9 names no stage)", (page.match(/data-edge="/g) || []).length);
  const qOpen = run.qs.filter((q) => ASKABLE.has(q.state));
  ok(qOpen.length === 2 && (page.match(/<article class="qcard"/g) || []).length === 2, "a card per open/asked Q only", qOpen.length);
  for (const q of qOpen) for (const o of q.options) ok(page.includes(`data-option="${esc(o.label)}"`), `${q.id} option ${o.label} drawn`);
  ok((page.match(/data-rec="1"/g) || []).length === 2, "recommended marked once per card");
  const q1 = run.qs.find((q) => q.id === "Q1");
  ok(q1.holds.join() === "3,4", "Q1 holds the parked stage 3 and stage 4 (blocks)", q1.holds);
  ok(run.qs.find((q) => q.id === "Q100")?.state === "replanned", "Q100 header parsed (no stage word on it)");
  ok(run.qs.length === 7, "seven Qs, one per state", run.qs.length);
  ok(!run.qs.find((q) => q.id === "Q3").holds.length, "a moot Q holds nothing");
  ok(run.stages.find((s) => s.n === 4).waits.includes("Q1"), "stage 4 waits on Q1");
  ok(!run.stages.find((s) => s.n === 2).files.some((f) => f.includes("prompt")), "indented prompt lines are not fields");
  ok(run.stages.find((s) => s.n === 2).name === "F2 export <b>", "code stripped from the stage cell");
  ok(page.includes("F2 export &lt;b&gt;") && !page.includes("export <b>"), "html escaped");
  ok(!/<(!doctype|html|head|body)\b/i.test(page), "artifact page has no wrapper tags");
  ok(/^<!doctype html>/.test(full) && full.includes('name="viewport"'), "standalone page has its own doctype and viewport");
  ok(page.includes("@media (prefers-color-scheme:dark)") && page.includes(':root[data-theme="dark"]') && /body\{background:var\(--ground\)/.test(page), "tokens, dark mode, body background");
  ok(!/<script[^>]+src=/i.test(page) && !/https?:\/\//.test(page), "no external fetch: draws offline");
  ok(!/[^\x09\x0a\x20-\x7e]/.test(ascii), "ascii output is ASCII");
  ok(/<title>Holo RUN-9<\/title>/.test(page), "two-to-four word title");

  // 2. a plain (non-chain) run file, the RUN-11 shape: rows only
  const plain = parseRun(fx("fixture-plain.md"));
  const pp = artifactPage(render(plain));
  ok(plain.stages.length === 4 && !plain.chain, "plain: 4 rows, no chain");
  for (const [n, st] of rowsOf(fx("fixture-plain.md"))) ok(pp.includes(`data-stage="${n}" data-state="${st}"`), `plain: stage ${n} as ${st}`);
  ok(pp.includes("No open decisions in RUN-3"), "plain: says there are no decisions");
  ok(plain.stages[3].implicit.length === 3, "plain: final stage after the other three");

  // 3. the RED/GREEN fixture's run file: two open Qs
  const two = parseRun(fx("repo-two-qs/_run.md").replaceAll("@LANDED@", "abc1234"));
  const tp = artifactPage(render(two));
  ok((tp.match(/<article class="qcard"/g) || []).length === 2, "two-qs: two cards");
  ok(two.stages.find((s) => s.n === 3).waits.join() === "Q1,Q2", "two-qs: stage 3 waits on Q1 (F6 in its blocks) and Q2 (after the ? stage 2), as chain next says", two.stages.find((s) => s.n === 3).waits);
  ok(tp.includes('data-edge="2-3" data-kind="after"'), "two-qs: 3 after 2");
  ok(renderAscii(two).includes("RUN-1 Q2 (2/2) [Match]"), "two-qs: ascii numbers the batch");

  // 4. design sections
  const d = parseDesign(fx("fixture-design.md"));
  const dp = artifactPage(render(null, { design: d, designPath: "fixture-design.md" }));
  ok(d.parts.length === 3 && (dp.match(/class="comp"/g) || []).length === 3, "design: one component per ## section", d.parts.length);
  ok(d.parts[1].subs.length === 2, "design: ### parts listed", d.parts[1].subs);
  ok(!d.parts.some((p) => p.name.includes("not a heading")), "design: fenced code is skipped");
  ok(d.parts[1].tables.length === 1 && d.parts[1].tables[0].head.join("|") === "flag|does" && d.parts[1].tables[0].rows.length === 2 && d.parts[1].tables[0].rows[1][1] === "every book", "design: a pipe table is head + rows, separator dropped", d.parts[1].tables);
  ok(d.parts[2].tables.length === 1 && d.parts[2].tables[0].head.length === 0 && d.parts[2].tables[0].rows[0][1] === "3 cases", "design: a one-line table has no head", d.parts[2].tables);
  ok((dp.match(/<table>/g) || []).length === 2 && dp.includes("<th>flag</th>") && dp.includes("<td>every book</td>"), "design: tables drawn in the page");
  ok(renderAscii(null, { design: d, designPath: "fixture-design.md" }).includes("| `--author` | filters by author |"), "design: tables in the ascii");
  const mdOut = renderMarkdown(run, { runPath: "fixture-all-states.md", design: d, designPath: "fixture-design.md" });
  ok(/^# Holo RUN-9 - /.test(mdOut), "md: title line");
  ok(mdOut.includes("```mermaid\nflowchart LR\n"), "md: a mermaid flowchart");
  for (const [n, st] of rows) ok(new RegExp(`^  S${n}\\[".*"\\]:::${st}$`, "m").test(mdOut), `md: stage ${n} node as ${st}`);
  ok(mdOut.includes("  S1 --> S2") && mdOut.includes("  S2 --> S4") && mdOut.includes("  S1 -.-> S8") && mdOut.includes("  S5 -. replaced .-> S6"), "md: after, implicit and replaced edges");
  ok((mdOut.match(/^### Q\d+ /gm) || []).length === 2, "md: one block per open/asked Q");
  ok(mdOut.includes("| flag | does |") && mdOut.includes("| `--all` | every book |"), "md: design tables reproduced");
  ok(parseArgs(["RUN-12", "--md"]).mode === "md", "--md is a mode");
  const svgOut = renderSvg(run, { runPath: "fixture-all-states.md", design: d, designPath: "fixture-design.md" });
  ok(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svgOut) && svgOut.trim().endsWith("</svg>"), "svg: one standalone svg element");
  for (const [n, st] of rows) ok(svgOut.includes(`data-stage="${n}" data-state="${st}"`), `svg: stage ${n} drawn as ${st}`);
  ok((svgOut.match(/data-edge="/g) || []).length === 10, "svg: the same 10 edges");
  ok(!/<script|var\(--|https?:\/\//.test(svgOut.replace('xmlns="http://www.w3.org/2000/svg"', "")), "svg: no script, no css variable, no external url");
  ok(svgOut.includes("DECISIONS (2)") && svgOut.includes("| flag | does |"), "svg: decisions and design tables as text");
  ok(artifactPage(render(run, { runPath: "x" })).includes('data-edge="1-2" data-kind="after"'), "svg split: the page still draws the graph");
  ok(parseArgs(["RUN-12", "--svg"]).mode === "svg", "--svg is a mode");
  const mdEsc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const q of qOpen) for (const o of q.options) ok(mdOut.includes(mdEsc(o.label)) && svgOut.includes(esc(o.label)), `md/svg: ${q.id} option ${o.label} carried`);
  ok(svgOut.includes("reason taste") && svgOut.includes("files src/export.py"), "svg: a decision's reason and files, as the page and .md");
  ok(svgOut.includes(".held{"), "svg: a .held rule, as the page");
  ok(mdOut.includes("| unknown (z) |"), "md: an unknown state shows its raw cell");
  ok(wrap("    aaa bbb ccc", 11).join("|") === "    aaa bbb|      ccc", "svg: wrap keeps the indent, continuations two more", wrap("    aaa bbb ccc", 11));
  // Hostile run-file and design text: the .md stays one document, the .svg well-formed XML.
  const nasty = parseRun("# RUN-5 - nasty <b>\n\n## Stages\n| # | stage | state | owner | heartbeat | landed |\n|---|---|---|---|---|---|\n| 1 | say <hi> \"q\" | ~ | - | - | - |\n| 2 | c\x01d | | - | - | - |\n\n" +
    "## Decisions\n### Q1 open\nheader: <friends>\nquestion: ```\noptions:\n  - <b>yes</b> (Recommended) | a & b | -\n  - no | - | -\n### Q2 open\nquestion: ## not a heading\noptions:\n  - ok | - | -\n");
  const nd = parseDesign("# T\n\n## A\n| a \\| b | c |\n|---|---|\n| --- | --- |\n| x | y |\n\n## B\n|---|---|\n| p | q |\n");
  const nmd = renderMarkdown(nasty, { design: nd }), nsvg = renderSvg(nasty, { design: nd });
  ok(nmd.includes('S1["#1 say #lt;hi#gt; #quot;q#quot;"]'), "md: < and \" in a stage name become #lt; and #quot; in the Mermaid label");
  ok((nmd.match(/^```/gm) || []).length === 2 && nmd.includes("\n\\```\n"), "md: a lone ``` question is not a fence", nmd);
  ok(!/^## not a heading/m.test(nmd) && nmd.includes("\\## not a heading"), "md: a ## question is not a heading");
  ok(nmd.includes("# Holo RUN-5 - nasty &lt;b&gt;") && nmd.includes("&lt;friends&gt;") && nmd.includes("&lt;b&gt;yes&lt;/b&gt;") && nmd.includes("a &amp; b") && !/<(b|friends)>/.test(nmd), "md: no raw HTML from the run file");
  ok(nd.parts[0].tables[0].head.join("~") === "a | b~c" && nd.parts[0].tables[0].rows.length === 1, "design: an escaped pipe is one cell; a stray separator row is dropped", nd.parts[0].tables[0]);
  ok(nd.parts[1].tables[0].rows.length === 1 && nd.parts[1].tables[0].rows[0].join("~") === "p~q", "design: a separator-first table keeps no --- row", nd.parts[1].tables[0]);
  ok(nmd.includes("| a \\| b | c |"), "md: the escaped pipe re-escaped on output");
  ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(nsvg), "svg: a control character in a stage name is stripped (well-formed XML)");

  // 5. a run that decided something odd still draws: unknown state, cycle
  const odd = parseRun("# RUN-4 - odd\n\n## Stages\n| # | stage | state | owner | heartbeat | landed |\n|---|---|---|---|---|---|\n| 1 | a | z | - | - | - |\n| 2 | b |   | - | - | - |\n\n## Chain\ndriver: -     hold: -     mode: agents\n### AAAA - stage 1 - a\nafter: 2\nprompt: |\n  x\n### AAAB - stage 2 - b\nafter: 1\nprompt: |\n  y\n");
  const op = artifactPage(render(odd));
  ok(op.includes('data-stage="1" data-state="unknown"') && op.includes('data-stage="2" data-state="pending"'), "unknown state and a cycle still draw");
  ok(!op.includes("NaN"), "a cycle leaves no NaN in the drawing");
  const hdr = parseRun("# RUN-6 - hdr\n\n## Decisions\n### Q1 open\nquestion: first\n### Q2 answered 2026-09-01T10:30Z by-user\nquestion: second\n");
  ok(hdr.qs.length === 1 && hdr.qs[0].f.question === "first", "an unreadable Q header never merges into the Q above");
  ok(parseArgs(["--html", "RUN-12"]).pos[0] === "RUN-12", "--html takes no path; the run stays the run");
  ok(parseArgs(["RUN-12", "--batch"]).mode === "batch", "--batch is a mode");
  // F44: RUN-0012 is the run name now; an old run-12 file still answers to it.
  const rf = ["/r/.skillator/run-0012-new.md", "/r/.skillator/run-7-old.md", "/r/.skillator/run-120-other.md"];
  ok(["12", "RUN-12", "RUN-0012", "0012"].every((a) => (runFilesFor(a, rf) || [])[0] === rf[0]), "F44: 12, RUN-12 and RUN-0012 all find run-0012");
  ok(["7", "RUN-0007"].every((a) => (runFilesFor(a, rf) || [])[0] === rf[1]), "F44: RUN-0007 finds an old run-7 file");
  ok(parseRun("# RUN-0012 - padded\n").id === "RUN-0012", "F44: a padded header parses");
  // A118: relay-morpheus judges the holds. Given its lines, the page draws
  // them even where holo's own rules would say otherwise - a holds change in
  // relay-morpheus moves the page with no edit here.
  const h1 = parseHolds("NEXT 7 AAAB\nIDLE 3 Q2 files\nIDLE 4 - after 3\nIDLE 5 Q1 blocks\n");
  ok(h1.length === 2 && h1[0].n === 3 && h1[0].q === "Q2" && h1[1].why === "blocks", "holds: IDLE Q lines parsed, others skipped", h1);
  const rr = parseRun(md, [{ n: 6, q: "Q2", why: "files" }]);
  ok(rr.holdsFrom === "relay" && rr.qs.find((q) => q.id === "Q2").holds.join() === "3,6" && rr.stages.find((s) => s.n === 6).waits.join() === "Q2", "holds: relay's lines drawn as given (3 is the parked row's own Q2)", rr.qs.find((q) => q.id === "Q2").holds);
  ok(rr.qs.find((q) => q.id === "Q1").holds.join() === "3", "holds: a parked row keeps its own parked Qs (data, not a rule)", rr.qs.find((q) => q.id === "Q1").holds);
  ok(parseRun(md).holdsFrom === "estimate", "holds: no relay lines -> the estimate");
  ok(/^## Chain\r?$/m.test(md.replace(/\n/g, "\r\n")), "holds: a CRLF run file still reads as a chain run");
  ok(artifactPage(render(rr)).includes("as relay-morpheus chain next judges them") && artifactPage(render(parseRun(md))).includes("estimated here"), "holds: the page says where its holds came from");
  ok(!artifactPage(render(plain)).includes("Holds:"), "holds: a run with no chain says nothing about holds");

  // 6. F42 wizard: only open/asked decisions are asked; the rest is settled
  const set = setFromRun(run, "fixture-all-states.md");
  ok(set.decisions.map((x) => x.id).join() === "Q1,Q2", "wizard: asks the open and asked Qs only", set.decisions.map((x) => x.id));
  ok(set.settled.length === 5, "wizard: answered, ruled, moot, same-as, replanned are settled", set.settled.length);
  ok(set.decisions.every((x) => x.options.filter((y) => y.recommended).length <= 1), "wizard: one recommendation at most");
  const wp = wizardPage(set);
  ok(/^<!doctype html>/.test(wp) && wp.includes('name="viewport"'), "wizard: standalone page");
  ok(!/<script[^>]+src=|<link[^>]+href=|https?:\/\//i.test(wp), "wizard: offline - no external script, style or URL");
  ok(!/\binnerHTML\b|outerHTML|insertAdjacentHTML|document\.write/.test(wp), "wizard: user text never parsed as HTML");
  const evil = { schema: "holo-decisions/1", id: "X", title: "</script><b>", decisions: [{ id: "Q1", question: "</script><script>alert(1)</script>", options: [{ id: "a", label: "<img src=x>" }] }] };
  const ep = wizardPage(evil);
  ok((ep.match(/<\/script>/g) || []).length === 2, "wizard: embedded set cannot close its script tag", (ep.match(/<\/script>/g) || []).length);
  ok(!/"checked"|checked:\s*true/.test(wp), "wizard: nothing pre-selected");
  let threw = false; try { checkSet({ schema: "holo-decisions/1", id: "X", decisions: [{ id: "Q1", question: "q", options: [{ id: "custom", label: "c" }] }] }); } catch { threw = true; }
  ok(threw, "wizard: a reserved option id is refused");
  threw = false; try { checkSet({ schema: "holo-decisions/1", id: "X", decisions: [{ id: "Q1", question: "q", options: [{ id: "a", label: "a", recommended: true }, { id: "b", label: "b", recommended: true }] }] }); } catch { threw = true; }
  ok(threw, "wizard: two recommendations are refused");
  // 7. F42 answers back: finalized only, single-quoted, custom flagged
  const fin = { schema: "holo-answers/1", set: "RUN-9", owner: "Owner", reviewed: true, finalizedAt: "2026-10-16T10:00:00Z", answers: [
    { id: "Q1", status: "answered", choice: { id: "o1", label: "Keep it's $(rm -rf /) `x`" }, notes: "" },
    { id: "Q2", status: "custom-review-required", choice: { id: "custom" }, custom: "do B then C", notes: "by Friday" },
    { id: "Q3", status: "deferred", choice: { id: "defer" }, clarification: "ask legal" }] };
  const cmds = answersToCommands(fin);
  ok(cmds.commands[0] === "sh relay-morpheus.sh 9 answer Q1 'Keep it'\\''s $(rm -rf /) `x`'", "answers: run id named, single quotes, a quote escaped, $() inert", cmds.commands[0]);
  ok(cmds.commands[1] === "sh relay-morpheus.sh 9 answer Q2 'do B then C - by Friday'" && cmds.review.length === 1, "answers: custom passed verbatim and flagged for review", cmds);
  const odd2 = answersToCommands({ ...fin, answers: [
    { id: "Q1", status: "answered", choice: { id: "custom" }, custom: "line one\nline two", notes: "" },
    { id: "Q2", status: "answered", choice: { id: "defer" }, clarification: "" },
    { id: "Q3", status: "answered", choice: { id: "o1", label: "--ruled" } },
    { id: "Q4", status: "answered", choice: { id: "custom" }, custom: "" }] });
  ok(odd2.commands.length === 1 && odd2.commands[0].endsWith("'line one line two'"), "answers: text folded onto one line", odd2.commands);
  ok(odd2.open.length === 3, "answers: status recomputed from the choice; flag-like and empty text held back", odd2.open);
  threw = false; try { answersToCommands({ ...fin, set: "my-review" }); } catch { threw = true; }
  ok(threw, "answers: a set that is not a relay run is refused");
  threw = false; try { checkSet({ schema: "holo-decisions/1", id: "X", decisions: [{ id: "__proto__", question: "q", options: [] }] }); } catch { threw = true; }
  ok(threw, "wizard: a prototype name is not a decision id");
  threw = false; try { checkSet({ schema: "holo-decisions/1", id: "X", decisions: [{ id: "Q1", question: "q", options: [], sources: "a.md" }] }); } catch { threw = true; }
  ok(threw, "wizard: sources must be a list of text");
  ok(wizardPage({ schema: "holo-decisions/1", id: "X", decisions: [{ id: "Q1", question: "free text only", options: [] }] }).includes("free text only"), "wizard: a decision with no options still renders (custom and discuss-first)");
  ok(cmds.open.length === 1 && cmds.open[0].startsWith("Q3: deferred"), "answers: a deferred decision stays open", cmds.open);
  threw = false; try { answersToCommands({ ...fin, finalizedAt: null }); } catch { threw = true; }
  ok(threw, "answers: a draft is refused");

  // 8. F134: full paths, visual block diagrams, pros/cons & explain, continuous discussion wizard
  const bLines = batchLines(".skillator/holo/RUN-9.html", ".skillator/holo/RUN-9.artifact.html", ".skillator/holo/RUN-9.wizard.html", 2);
  ok(bLines.includes(resolve(".skillator/holo/RUN-9.html")) && bLines.includes(resolve(".skillator/holo/RUN-9.artifact.html")) && bLines.includes(resolve(".skillator/holo/RUN-9.wizard.html")), "F134(1): batch output always prints resolved full paths");
  ok(dp.includes('class="block-diagram"') && dp.includes('class="bd-node'), "F134(2): design sections render visual SVG block diagrams");
  const flowDesign = parseDesign("# Drone UI\n\n## Flight Pipeline\nTakeoff -> Scan Grid -> Return Home\n");
  const flowPage = artifactPage(render(null, { design: flowDesign }));
  ok(flowDesign.parts[0].flows.length === 3 && flowPage.includes('class="block-diagram"') && flowPage.includes("Takeoff") && flowPage.includes("Scan Grid"), "F134(2): arrow flow in design section renders block diagram");
  const runDiag = parseRun("# RUN-10 - drone\n\n## Stages\n| # | stage | state | owner | heartbeat | landed |\n|---|---|---|---|---|---|\n| 1 | fly | ? | - | - | - |\n\n## Decisions\n### Q1 open\nquestion: Drone action?\ndiagram: Hover -> Capture -> Land\noptions:\n  - Sweep (Recommended) | fast coverage | battery drain | Sweeps the sector in 3 passes\n");
  const runDiagPage = artifactPage(render(runDiag));
  ok(runDiagPage.includes('class="block-diagram"') && runDiagPage.includes("What this action does:") && runDiagPage.includes("Sweeps the sector in 3 passes") && runDiagPage.includes("Pros:") && runDiagPage.includes("Cons:") && runDiagPage.includes("pros \u00b7 does") && runDiagPage.includes("cons \u00b7 hurts"), "F134(2,3): decision card renders block diagram, action explanation, and Pros/Cons");
  const pcSet = checkSet({ schema: "holo-decisions/1", id: "DRONE", decisions: [{ id: "Q1", question: "Mode?", diagram: [{ title: "Init", subtitle: "arm motors", kind: "action" }, { title: "Fly", subtitle: "waypoint", kind: "flow" }], options: [{ id: "o1", label: "Auto", explain: "Autonomous waypoint loop", pros: "Hands-free", cons: "Needs GPS lock", recommended: true }] }] });
  ok(pcSet.decisions[0].options[0].does === "Hands-free" && pcSet.decisions[0].options[0].tradeoff === "Needs GPS lock", "F134(3): checkSet maps pros/cons aliases to does/tradeoff");
  ok(wp.includes("Ask / Explain more - generate detailed explanation in next HTML") && wp.includes('statusOf(d) === "incomplete"') && wp.includes("renderBlockDiagram") && wp.includes("What this action does"), "F134(3,4): wizard includes Ask/Explain more option, unblocks finalize for defer/custom, and renders block diagrams + Pros/Cons");
  const r2 = nextWizardSet(set, {
    schema: "holo-answers/1", set: "RUN-9", owner: "Owner", reviewed: true, finalizedAt: "2026-10-30T00:00:00Z",
    answers: [
      { id: "Q1", status: "answered", choice: { id: "o1", label: set.decisions[0].options[0].label }, notes: "approved" },
      { id: "Q2", status: "deferred", choice: { id: "defer" }, clarification: "Explain memory vs speed trade-off in detail", notes: "" },
    ],
  });
  ok(r2.round === 2 && r2.decisions.length === 1 && r2.decisions[0].id === "Q2" && r2.settled.length === 6, "F134(4): nextWizardSet moves answered Q1 to settled and keeps deferred Q2 open for Round 2");
  ok(r2.decisions[0].discussion && r2.decisions[0].discussion.prompt.includes("Explain memory vs speed") && r2.decisions[0].options.every((o) => o.explain && o.pros && o.cons), "F134(4): nextWizardSet expands explanation, pros/cons, and discussion context");
  const wp2 = wizardPage(r2);
  ok(wp2.includes("Discussion & Explanation Requested") && wp2.includes("Explain memory vs speed"), "F134(4): Round 2 wizard HTML embeds the discussion request and expanded explanations");
  ok(parseArgs(["RUN-9", "--next-wizard", "ans.json"]).nextWizard === "ans.json" && parseArgs(["RUN-9", "--wizard", "--answers", "ans.json"]).nextWizard === "ans.json", "F134(4): CLI parses --next-wizard and --wizard --answers");

  if (fails) { console.error(`selftest: ${fails} failed`); process.exitCode = 1; } else console.log("selftest: ok");
}

function readFileSyncText(p) { return readFileSync(p, "utf8"); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(`holo: ${e.message}`); process.exit(e.code === 2 ? 2 : 1); });
}
