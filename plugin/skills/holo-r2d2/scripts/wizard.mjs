// holo-r2d2 decision wizard (F42): one owner decision per step, answered on the
// page it is read on. A self-contained offline HTML file - no fetch, no fonts,
// no libraries - built from a relay run's open decisions or from a decision set
// (holo-decisions/1 JSON). The page decides nothing: the recommendation is shown
// first and never selected; finalizing is local; the exported JSON goes back to
// the session, which turns it into `relay-morpheus.sh answer` calls (answersToCommands).

export const SET_SCHEMA = "holo-decisions/1";
export const ANSWER_SCHEMA = "holo-answers/1";
const MAX_TEXT = 4000;

const str = (v) => (v == null ? "" : String(v));
const ASKABLE = new Set(["open", "asked"]);

// A relay run's decisions as a set: open/asked ones are asked; answered, ruled,
// moot and same-as ones are the settled reference, with the run file as source.
export function setFromRun(run, runPath) {
  const src = `${runPath || run.id} (## Decisions)`;
  const decisions = run.qs.filter((q) => ASKABLE.has(q.state)).map((q) => {
    const then = `then: ${q.blocks.length ? "unblocks " + q.blocks.join(", ") : "unblocks the parked work"}` +
      `${q.holds.length ? "; re-plans stage " + q.holds.join(", ") : ""}`;
    return {
      id: q.id, ticket: str(q.f.ticket), header: str(q.f.header),
      question: str(q.f.question) || "(no question text in the run file)",
      now: str(q.f.parked ? `parked by ${q.f.parked}` : ""),
      why: str(q.f.reason), scope: [q.blocks.length ? `blocks ${q.blocks.join(", ")}` : "", q.holds.length ? `holds stage ${q.holds.join(", ")}` : "", q.files.length ? `files ${q.files.join(", ")}` : ""].filter(Boolean).join(" \u00b7 "),
      example: "", recommendation: q.options.some((o) => o.rec) ? "Marked recommended in the run file." : "",
      options: q.options.filter((o) => str(o.label).trim()).map((o, i) => ({
        id: "o" + (i + 1), label: o.label, does: o.does, tradeoff: o.hurts, recommended: !!o.rec,
        consequence: `${o.does ? o.does + ". " : ""}${o.hurts ? "Cost: " + o.hurts + ". " : ""}${then}.`,
      })),
      sources: [`${src} ${q.id} ${q.state} ${q.ts}`.trim()],
    };
  });
  const settled = run.qs.filter((q) => !ASKABLE.has(q.state)).map((q) => ({
    id: q.id, ticket: str(q.f.ticket), question: str(q.f.question), state: q.state,
    answer: str(q.f.answer ?? q.f.replanned ?? q.f.moot ?? (q.f["same-as"] ? "same as " + q.f["same-as"] : "")),
    source: `${src} ${q.id}`,
  }));
  return { schema: SET_SCHEMA, id: run.id, title: `${run.id} - ${run.title}`, source: runPath || run.id, decisions, settled };
}

// Throws on a set the page could not ask honestly.
export function checkSet(set) {
  const bad = (m) => { throw new Error(`decision set: ${m}`); };
  if (!set || set.schema !== SET_SCHEMA) bad(`schema must be "${SET_SCHEMA}"`);
  if (!str(set.id).trim()) bad("id is required");
  if (!Array.isArray(set.decisions)) bad("decisions must be a list");
  const seen = new Set();
  const ID = /^[A-Za-z0-9_.-]{1,40}$/, RESERVED = new Set(["__proto__", "constructor", "prototype", "hasOwnProperty", "toString", "valueOf"]);
  const text = (v, where) => { if (v != null && typeof v !== "string") bad(`${where} must be text`); };
  for (const k of ["id", "title", "source"]) text(set[k], k);
  for (const d of set.decisions) {
    if (!d || typeof d !== "object") bad("a decision is not an object");
    if (!ID.test(str(d.id)) || RESERVED.has(d.id)) bad(`decision id "${d.id}" must be 1-40 of A-Z a-z 0-9 _ . - and not a reserved name`);
    if (seen.has(d.id)) bad(`decision id ${d.id} twice`); seen.add(d.id);
    for (const k of ["ticket", "header", "question", "now", "why", "scope", "example", "recommendation"]) text(d[k], `${d.id}.${k}`);
    if (!str(d.question).trim()) bad(`${d.id}: question is required`);
    if (!Array.isArray(d.options)) bad(`${d.id}: options must be a list (it may be empty: custom and discuss-first are always offered)`);
    if (d.sources != null && (!Array.isArray(d.sources) || d.sources.some((x) => typeof x !== "string"))) bad(`${d.id}: sources must be a list of text`);
    const oids = new Set();
    for (const o of d.options) {
      if (!o || typeof o !== "object") bad(`${d.id}: an option is not an object`);
      if (!ID.test(str(o.id)) || RESERVED.has(o.id)) bad(`${d.id}: option id "${o.id}"`);
      if (oids.has(o.id) || o.id === "custom" || o.id === "defer") bad(`${d.id}: option id ${o.id} repeats or is reserved`);
      oids.add(o.id);
      for (const k of ["label", "does", "tradeoff", "consequence"]) text(o[k], `${d.id}/${o.id}.${k}`);
      if (!str(o.label).trim()) bad(`${d.id}/${o.id}: label is required`);
    }
    if (d.options.filter((o) => o.recommended).length > 1) bad(`${d.id}: more than one recommended option`);
  }
  if (set.settled != null && !Array.isArray(set.settled)) bad("settled must be a list");
  for (const s of set.settled || []) for (const k of ["id", "ticket", "question", "state", "answer", "source"]) text(s && s[k], `settled.${k}`);
  return set;
}

// The finalized export -> one relay-morpheus answer line per answered decision,
// for the run the answers were made for (its id names the run, never "the one
// here"). POSIX sh lines: single quotes only - page text is typed by whoever
// opened the page. The run file is line-based, so text is folded onto one line;
// text relay-morpheus would read as a flag or a comment is held back. Custom
// directions go through verbatim but are flagged for interpretation.
export function answersToCommands(ans, rm = "relay-morpheus.sh") {
  if (!ans || ans.schema !== ANSWER_SCHEMA) throw new Error(`answers: schema must be "${ANSWER_SCHEMA}"`);
  if (!ans.finalizedAt || !ans.reviewed || !str(ans.owner).trim()) throw new Error("answers: a draft, not finalized and reviewed by its owner - nothing is applied");
  const m = /^RUN-(\d+)$/.exec(str(ans.set));
  if (!m) throw new Error(`answers: set "${str(ans.set).slice(0, 40)}" is not a relay run - read the answers into the work by hand`);
  const q = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
  const one = (s) => str(s).replace(/\s+/g, " ").trim();
  const out = { commands: [], review: [], open: [] };
  for (const a of ans.answers || []) {
    if (!a || !/^Q\d+$/.test(str(a.id))) { out.open.push(`${a && a.id}: not a relay decision id`); continue; }
    const cid = a.choice && typeof a.choice === "object" ? str(a.choice.id) : "";
    const notes = one(a.notes);
    let textv = "", custom = false;
    if (cid === "custom") { textv = one(a.custom); custom = true; }
    else if (cid && cid !== "defer") textv = one(a.choice.label);
    if (cid === "defer" || !cid) { out.open.push(`${a.id}: ${cid === "defer" ? "deferred" : "no answer"}${one(a.clarification) ? " - " + one(a.clarification) : ""}`); continue; }
    if (!textv) { out.open.push(`${a.id}: ${custom ? "custom direction" : "choice"} has no text`); continue; }
    const full = textv + (notes ? " - " + notes : "");
    if (/^(--|#)/.test(full)) { out.open.push(`${a.id}: the answer starts with "${full.slice(0, 2)}", which relay-morpheus reads as a flag or comment - record it by hand: ${full}`); continue; }
    out.commands.push(`sh ${rm} ${m[1]} answer ${a.id} ${q(full)}`);
    if (custom) out.review.push(`${a.id}: custom direction - interpret and check it before building on it`);
  }
  return out;
}

// Embedded data: JSON with every `<` escaped, so no string closes the script.
const embed = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const escH = (s) => str(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function wizardPage(set) {
  checkSet(set);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Decisions - ${escH(set.title || set.id)}</title>
<style>${CSS}</style></head>
<body>
<a class="skip" href="#main">Skip to the decision</a>
<header class="top"><div class="wrap">
  <p class="eyebrow">Owner decisions \u00b7 <span id="setid"></span></p>
  <h1 id="title"></h1>
  <div class="progress" aria-hidden="true"><div id="bar"></div></div>
  <p id="progress-text" class="muted"></p>
  <nav aria-label="Decisions"><ol id="steps"></ol></nav>
</div></header>
<main id="main" class="wrap" tabindex="-1"></main>
<footer class="wrap foot">
  <p id="status" role="status" aria-live="polite"></p>
  <div class="tools">
    <button type="button" id="export-draft" class="quiet">Download draft JSON</button>
    <label class="quiet filebtn">Import a draft<input type="file" id="import" accept="application/json,.json"></label>
    <button type="button" id="fresh" class="quiet">Start fresh</button>
  </div>
  <p class="muted small">Saved in this browser only. Download the JSON to keep a portable copy. Nothing on this page is sent anywhere.</p>
</footer>
<dialog id="confirm"><form method="dialog"><h2 id="confirm-title"></h2><p id="confirm-text"></p>
  <div class="row"><button value="cancel" class="quiet">Cancel</button><button value="ok" id="confirm-ok" class="danger">Replace</button></div></form></dialog>
<script type="application/json" id="holo-set">${embed(set)}</script>
<script>${CLIENT}</script>
</body></html>
`;
}

const CSS = `
:root{--bg:#f7f6f2;--card:#fff;--ink:#1d2021;--muted:#55595c;--line:#d6d3cb;--accent:#0b5cad;--accent-ink:#fff;--rec:#1d6b3a;--rec-bg:#e6f2ea;--warn:#a23b12;--warn-bg:#fbeae2;--sel:#e8f0fa;--focus:#c25e00}
@media (prefers-color-scheme:dark){:root{--bg:#141618;--card:#1d2023;--ink:#ecebe7;--muted:#b0b3b6;--line:#3a3f44;--accent:#6fb0f2;--accent-ink:#0b1420;--rec:#7fd39b;--rec-bg:#16301f;--warn:#f39a73;--warn-bg:#3a1f14;--sel:#1b2a3b;--focus:#ffb35c}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:anywhere}
.wrap{max-width:1120px;margin:0 auto;padding:0 16px}
.skip{position:absolute;left:-999px}.skip:focus{left:16px;top:8px;background:var(--card);padding:8px;z-index:9}
.top{border-bottom:1px solid var(--line);background:var(--card);padding:16px 0 8px}
.eyebrow{margin:0;color:var(--muted);font-size:.85rem;letter-spacing:.04em;text-transform:uppercase}
h1{font-size:1.45rem;margin:.2rem 0 .6rem;line-height:1.25}
h2{font-size:1.3rem;line-height:1.3;margin:.3rem 0 .8rem}
.progress{height:6px;background:var(--line);border-radius:3px;overflow:hidden}#bar{height:100%;width:0;background:var(--accent)}
.muted{color:var(--muted)}.small{font-size:.85rem}
nav ol{list-style:none;display:flex;flex-wrap:wrap;gap:6px;margin:.6rem 0 0;padding:0}
nav button{min-height:44px;min-width:44px;padding:4px 10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;font:inherit;font-size:.9rem;cursor:pointer}
nav button[aria-current=step]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
nav .st{display:inline-block;width:1.1em;text-align:center}
main{padding:20px 16px 8px}
.step{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:24px;align-items:start}
@media (max-width:820px){.step{display:flex;flex-direction:column;gap:16px}.step>section{display:contents}.step fieldset{order:1}.step aside.preview{order:2}.step .after{order:3}.step .recbox,.step .ctx{align-self:stretch}}
.ids{font-size:.9rem;color:var(--muted);margin:0}
.ctx{margin:0 0 1rem;display:grid;gap:.5rem}
.ctx div{display:grid;grid-template-columns:8.5em minmax(0,1fr);gap:.6rem}
@media (max-width:480px){.ctx div{grid-template-columns:minmax(0,1fr);gap:0}}
.ctx dt{font-weight:600;color:var(--muted)}.ctx dd{margin:0}
.example{border-left:3px solid var(--line);padding:.2rem 0 .2rem .8rem;margin:0 0 1rem}
.recbox{background:var(--rec-bg);border-radius:10px;padding:.7rem .9rem;margin:0 0 1rem}
.recbox strong{color:var(--rec)}
fieldset{border:0;margin:0;padding:0;min-width:0}
legend{font-weight:600;margin-bottom:.5rem;padding:0}
.opt{display:flex;gap:.7rem;align-items:flex-start;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:.7rem .8rem;margin:0 0 .55rem;min-height:44px;cursor:pointer}
.opt:has(input:checked){border-color:var(--accent);background:var(--sel);box-shadow:inset 0 0 0 1px var(--accent)}
.opt input{width:22px;height:22px;margin:.15rem 0 0;flex:none;accent-color:var(--accent)}
.opt .lbl{font-weight:600}.opt .tag{font-size:.78rem;font-weight:700;color:var(--rec);margin-left:.4rem;text-transform:uppercase;letter-spacing:.03em}
.opt .meta{display:block;font-size:.93rem;color:var(--muted);margin-top:.15rem}
.opt.alt{border-style:dashed}
.need{margin:.2rem 0 .7rem 2.3rem}
label.blk{display:block;font-weight:600;margin:.8rem 0 .3rem}
textarea,input[type=text]{width:100%;font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:.55rem .65rem;min-height:44px}
textarea{min-height:5.5em;resize:vertical}
.err{color:var(--warn);font-weight:600;margin:.25rem 0 0}
[aria-invalid=true]{border-color:var(--warn)!important;box-shadow:0 0 0 1px var(--warn)}
details.src{margin-top:1rem;font-size:.9rem}details.src summary{cursor:pointer;min-height:44px;display:flex;align-items:center}
details.src ul{margin:.3rem 0 0;padding-left:1.2rem}
aside.preview{position:sticky;top:12px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:1rem}
@media (max-width:820px){aside.preview{position:static}}
.preview h3{margin:0 0 .6rem;font-size:1rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.flow{list-style:none;margin:0;padding:0}
.flow li{position:relative;padding:.45rem .7rem;border-radius:8px;border:1px solid var(--line);margin-bottom:22px}
.flow li:not(:last-child)::after{content:"";position:absolute;left:50%;bottom:-19px;width:2px;height:16px;background:var(--line)}
.flow .k{display:block;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.flow .pick{border-color:var(--accent)}.flow .cost{border-color:var(--warn);background:var(--warn-bg)}.flow .then{border-style:dashed}
.note-ex{font-size:.85rem;color:var(--muted);margin:.4rem 0 0}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin:1.2rem 0 .5rem}
button{font:inherit}
.primary,.secondary,.quiet,.danger{min-height:44px;padding:.5rem 1rem;border-radius:9px;cursor:pointer;border:1px solid var(--line)}
.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:600}
.secondary{background:var(--card);color:var(--ink)}
.quiet{background:transparent;color:var(--ink)}
.danger{background:var(--warn);color:#fff;border-color:var(--warn)}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.foot{padding:12px 16px 32px;border-top:1px solid var(--line);margin-top:24px}
.tools{display:flex;flex-wrap:wrap;gap:8px}
.filebtn{display:inline-flex;align-items:center;position:relative}
.filebtn input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}
.filebtn:focus-within{outline:3px solid var(--focus);outline-offset:2px}
.review ol{padding-left:1.2rem}.review li{margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid var(--line)}
.badge{display:inline-block;font-size:.78rem;font-weight:700;border-radius:6px;padding:.05rem .45rem;margin-left:.4rem;border:1px solid currentColor}
.b-answered{color:var(--rec)}.b-custom-review-required{color:var(--accent)}.b-deferred,.b-incomplete{color:var(--warn)}
.settled{margin-top:1.5rem}.settled summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600}
.settled table{border-collapse:collapse;width:100%;font-size:.92rem}.settled td,.settled th{border-top:1px solid var(--line);padding:.4rem;text-align:left;vertical-align:top}
.banner{border-radius:10px;padding:.7rem .9rem;margin:0 0 1rem;background:var(--sel)}
.banner.warn{background:var(--warn-bg)}
dialog{border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);max-width:min(92vw,460px)}
dialog .row{display:flex;gap:8px;justify-content:flex-end}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
@media (prefers-reduced-motion:no-preference){#bar{transition:width .25s}}
`;

// The page's own code. Text from the set or a draft only ever reaches the DOM
// through textContent / value - never innerHTML.
const CLIENT = String.raw`(() => {
"use strict";
const SET = JSON.parse(document.getElementById("holo-set").textContent);
const SCHEMA = "holo-answers/1", MAX = ${MAX_TEXT}, MAX_FILE = 1048576;
const KEY = "holo-wizard:v1:" + SET.id + ":" + hash(JSON.stringify(SET.decisions.map(d => [d.id, d.options.map(o => o.id)])));
const $ = (id) => document.getElementById(id);
const el = (tag, attrs, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "text") n.textContent = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
};
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
const blank = () => ({ choice: "", custom: "", clarification: "", notes: "", skipped: false });
let st = { answers: Object.create(null), owner: "", reviewed: false, finalizedAt: null, step: 0, imported: false };
let storageOk = true;
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const v = JSON.parse(raw); if (v && typeof v === "object" && v.answers) st = Object.assign(st, v); } }
  catch (e) { storageOk = false; }
  for (const d of SET.decisions) st.answers[d.id] = Object.assign(blank(), st.answers[d.id] || {});
  st.step = Math.min(Math.max(0, st.step | 0), SET.decisions.length);
}
function save(quiet) {
  try { localStorage.setItem(KEY, JSON.stringify(st)); storageOk = true; if (!quiet) say("Draft saved in this browser."); }
  catch (e) { storageOk = false; say("Could not save in this browser (" + (e && e.name || "storage error") + "). Use Download draft JSON to keep your answers."); }
}
function say(m) { $("status").textContent = ""; setTimeout(() => { $("status").textContent = m; }, 30); }
function statusOf(d) {
  const a = st.answers[d.id];
  if (a.choice === "defer") return a.clarification.trim() ? "deferred" : "incomplete";
  if (a.choice === "custom") return a.custom.trim() ? "custom-review-required" : "incomplete";
  if (a.choice && d.options.some(o => o.id === a.choice)) return "answered";
  return "incomplete";
}
const LABEL = { "answered": "Answered", "custom-review-required": "Custom - needs review", "deferred": "Deferred for discussion", "incomplete": "Not answered" };
const GLYPH = { "answered": "\u2713", "custom-review-required": "\u270e", "deferred": "\u23f8", "incomplete": "\u00b7" };
function unapprove() { if (st.reviewed || st.finalizedAt) { st.reviewed = false; st.finalizedAt = null; say("An answer changed, so the review approval was cleared."); } }

function header() {
  $("setid").textContent = SET.id; $("title").textContent = SET.title || SET.id;
  document.title = "Decisions - " + (SET.title || SET.id);
  const n = SET.decisions.length, done = SET.decisions.filter(d => statusOf(d) !== "incomplete").length;
  $("bar").style.width = (n ? (done / n) * 100 : 100) + "%";
  $("progress-text").textContent = done + " of " + n + " decisions have a response" + (st.finalizedAt ? " \u00b7 finalized" : st.reviewed ? " \u00b7 reviewed, not finalized" : " \u00b7 nothing is approved until you finalize");
  const ol = $("steps"); ol.textContent = "";
  SET.decisions.forEach((d, i) => {
    const s = statusOf(d);
    ol.append(el("li", null, el("button", { type: "button", "aria-current": st.step === i ? "step" : null, "aria-label": d.id + ", " + LABEL[s], onclick: () => go(i) },
      el("span", { class: "st", "aria-hidden": "true", text: GLYPH[s] }), " " + d.id)));
  });
  ol.append(el("li", null, el("button", { type: "button", "aria-current": st.step === n ? "step" : null, onclick: () => go(n) }, "Review")));
}

function go(i, focusMain) {
  st.step = Math.min(Math.max(0, i), SET.decisions.length); save(true); render();
  const h = document.querySelector("main h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
  window.scrollTo(0, 0);
}

function render() {
  header();
  const m = $("main"); m.textContent = "";
  if (st.step >= SET.decisions.length) return m.append(review());
  m.append(stepView(SET.decisions[st.step], st.step));
}

function stepView(d, i) {
  const a = st.answers[d.id], n = SET.decisions.length;
  const errs = {};
  const rec = d.options.find(o => o.recommended);
  const ctx = [["What exists now", d.now], ["Why it matters", d.why], ["Scope", d.scope]].filter(([, v]) => v);
  const name = "q-" + d.id;
  const opt = (id, labelKids, meta, extra) => {
    const inp = el("input", { type: "radio", name, value: id, id: name + "-" + id, checked: a.choice === id || null,
      onchange: () => { a.choice = id; a.skipped = false; unapprove(); save(true); refreshPreview(); header(); toggleNeeds(); } });
    return el("label", { class: "opt" + (extra ? " alt" : ""), for: name + "-" + id }, inp, el("span", null, labelKids, meta ? el("span", { class: "meta", text: meta }) : null));
  };
  const customTa = el("textarea", { id: name + "-custom-text", maxlength: MAX, "aria-describedby": name + "-custom-err",
    oninput: (e) => { a.custom = e.target.value; unapprove(); save(true); refreshPreview(); } });
  customTa.value = a.custom;
  const deferTa = el("textarea", { id: name + "-defer-text", maxlength: MAX, "aria-describedby": name + "-defer-err",
    oninput: (e) => { a.clarification = e.target.value; unapprove(); save(true); refreshPreview(); } });
  deferTa.value = a.clarification;
  const notes = el("textarea", { id: name + "-notes", class: "after", maxlength: MAX, oninput: (e) => { a.notes = e.target.value; unapprove(); save(true); } });
  notes.value = a.notes;
  const customNeed = el("div", { class: "need", hidden: a.choice !== "custom" || null },
    el("label", { class: "blk", for: customTa.id, text: "Your direction (required)" }), customTa, el("p", { class: "err", id: name + "-custom-err", "aria-live": "polite" }));
  const deferNeed = el("div", { class: "need", hidden: a.choice !== "defer" || null },
    el("label", { class: "blk", for: deferTa.id, text: "What needs discussing first (required)" }), deferTa, el("p", { class: "err", id: name + "-defer-err", "aria-live": "polite" }));
  function toggleNeeds() { customNeed.hidden = a.choice !== "custom"; deferNeed.hidden = a.choice !== "defer"; }
  const choiceErr = el("p", { class: "err", id: name + "-err", "aria-live": "polite" });
  const fs = el("fieldset", { "aria-describedby": name + "-err" },
    el("legend", { text: "Your answer" }),
    d.options.map(o => opt(o.id, [el("span", { class: "lbl", text: o.label }), o.recommended ? el("span", { class: "tag", text: "Recommended" }) : null],
      [o.does && "Does: " + o.does, o.tradeoff && "Trade-off: " + o.tradeoff].filter(Boolean).join(" \u00b7 "))),
    opt("custom", el("span", { class: "lbl", text: "Something else - I'll describe it" }), "Recorded verbatim; it still needs interpreting and checking before it is built.", true),
    customNeed,
    opt("defer", el("span", { class: "lbl", text: "Not yet - discuss first" }), "Holds this decision open; finalizing waits for it.", true),
    deferNeed, choiceErr);
  const preview = el("aside", { class: "preview", "aria-live": "polite", "aria-label": "What your choice leads to" });
  function refreshPreview() {
    preview.textContent = "";
    preview.append(el("h3", { text: "If you choose this" }));
    const o = d.options.find(x => x.id === a.choice);
    const flow = el("ol", { class: "flow" });
    if (o) {
      flow.append(el("li", { class: "pick" }, el("span", { class: "k", text: "Choice" }), o.label));
      if (o.does) flow.append(el("li", null, el("span", { class: "k", text: "What it does" }), o.does));
      if (o.tradeoff) flow.append(el("li", { class: "cost" }, el("span", { class: "k", text: "What it costs" }), o.tradeoff));
      if (o.consequence) flow.append(el("li", { class: "then" }, el("span", { class: "k", text: "Then" }), o.consequence));
    } else if (a.choice === "custom") {
      flow.append(el("li", { class: "pick" }, el("span", { class: "k", text: "Your direction" }), a.custom.trim() || "(not written yet)"));
      flow.append(el("li", { class: "then" }, el("span", { class: "k", text: "Then" }), "Sent back as your exact words. Someone still has to interpret and check it - it is not treated as understood."));
    } else if (a.choice === "defer") {
      flow.append(el("li", { class: "pick" }, el("span", { class: "k", text: "Held for discussion" }), a.clarification.trim() || "(what to discuss is not written yet)"));
      flow.append(el("li", { class: "then" }, el("span", { class: "k", text: "Then" }), "This stays open. Finalizing waits until it has an answer."));
    } else {
      flow.append(el("li", null, el("span", { class: "k", text: "Nothing chosen yet" }), rec ? "Pick an option to see where it leads. The recommendation is \u201c" + rec.label + "\u201d - it is not selected for you." : "Pick an option to see where it leads."));
    }
    preview.append(flow, el("p", { class: "note-ex", text: "An illustration of the choice, not live data or test results." }));
  }
  refreshPreview();
  function validate() {
    let first = null;
    const set = (node, errNode, msg) => { node.setAttribute("aria-invalid", msg ? "true" : "false"); errNode.textContent = msg || ""; if (msg && !first) first = node; };
    choiceErr.textContent = ""; customTa.removeAttribute("aria-invalid"); deferTa.removeAttribute("aria-invalid");
    customNeed.querySelector(".err").textContent = ""; deferNeed.querySelector(".err").textContent = "";
    if (!a.choice) { choiceErr.textContent = "Choose an option, or use Skip for now."; first = fs.querySelector("input"); }
    else if (a.choice === "custom") set(customTa, customNeed.querySelector(".err"), a.custom.trim() ? "" : "Describe your direction, or pick another option.");
    else if (a.choice === "defer") set(deferTa, deferNeed.querySelector(".err"), a.clarification.trim() ? "" : "Say what needs discussing, so the hold can be resolved.");
    if (first) first.focus();
    return !first;
  }
  const left = el("section", { "aria-labelledby": name + "-h" },
    el("p", { class: "ids", text: "Decision " + (i + 1) + " of " + n + " \u00b7 " + d.id + (d.ticket ? " \u00b7 ticket " + d.ticket : "") + (d.header ? " \u00b7 " + d.header : "") }),
    el("h2", { id: name + "-h", text: d.question }),
    ctx.length ? el("dl", { class: "ctx" }, ctx.map(([k, v]) => el("div", null, el("dt", { text: k }), el("dd", { text: v })))) : null,
    d.example ? el("p", { class: "example" }, el("strong", { text: "Example: " }), d.example) : null,
    rec ? el("div", { class: "recbox" }, el("strong", { text: "Recommended: " + rec.label }), d.recommendation ? el("div", { text: d.recommendation }) : null, el("div", { class: "small muted", text: "Shown first, not chosen for you." }))
        : el("div", { class: "recbox" }, el("strong", { text: "No recommendation" }), el("div", { text: d.recommendation || "None of the options can responsibly be recommended from the evidence given." })),
    fs,
    el("label", { class: "blk after", for: notes.id, text: "Conditions or notes (optional)" }), notes,
    el("div", { class: "actions after" },
      el("button", { type: "button", class: "primary", onclick: () => { if (validate()) { a.skipped = false; save(); go(i + 1); } } }, i + 1 < n ? "Save & continue" : "Save & review"),
      el("button", { type: "button", class: "secondary", onclick: () => { a.skipped = true; save(true); go(i + 1); } }, "Skip for now"),
      i > 0 ? el("button", { type: "button", class: "quiet", onclick: () => go(i - 1) }, "Back") : null),
    (d.sources && d.sources.length) ? el("details", { class: "src after" }, el("summary", { text: "Sources for this decision" }), el("ul", null, d.sources.map(s => el("li", { text: s })))) : null);
  return el("div", { class: "step" }, left, preview);
}

function review() {
  const n = SET.decisions.length;
  const rows = SET.decisions.map((d, i) => {
    const a = st.answers[d.id], s = statusOf(d), o = d.options.find(x => x.id === a.choice);
    const what = o ? o.label : a.choice === "custom" ? "Custom: " + (a.custom || "(empty)") : a.choice === "defer" ? "Discuss first: " + (a.clarification || "(empty)") : "No answer";
    return el("li", null,
      el("div", null, el("strong", { text: d.id + " - " + d.question }), el("span", { class: "badge b-" + s, text: LABEL[s] })),
      el("div", { text: what }), a.notes ? el("div", { class: "muted", text: "Notes: " + a.notes }) : null,
      el("button", { type: "button", class: "secondary", onclick: () => go(i), "aria-label": "Edit " + d.id }, "Edit"));
  });
  const blockers = SET.decisions.filter(d => !["answered", "custom-review-required"].includes(statusOf(d)));
  const owner = el("input", { type: "text", id: "owner", maxlength: 200, autocomplete: "name", "aria-describedby": "owner-err",
    oninput: (e) => { st.owner = e.target.value; unapprove(); save(true); sync(); } });
  owner.value = st.owner;
  const chk = el("input", { type: "checkbox", id: "reviewed", checked: st.reviewed || null, "aria-describedby": "fin-err",
    onchange: (e) => { st.reviewed = e.target.checked; if (!st.reviewed) st.finalizedAt = null; save(true); sync(); } });
  const finErr = el("p", { class: "err", id: "fin-err", "aria-live": "polite" });
  const fin = el("button", { type: "button", class: "primary", onclick: finalize }, "Finalize and download");
  const state = el("p", { class: "banner" });
  function sync() {
    header(); chk.checked = !!st.reviewed;
    state.className = "banner" + (blockers.length ? " warn" : "");
    state.textContent = blockers.length ? blockers.length + " decision" + (blockers.length > 1 ? "s" : "") + " still block finalizing (" + blockers.map(d => d.id + ": " + LABEL[statusOf(d)].toLowerCase()).join("; ") + "). A draft can be downloaded at any time."
      : st.finalizedAt ? "Finalized " + st.finalizedAt + " by " + st.owner + ". Share the downloaded JSON in the working conversation - it has not been sent or applied anywhere."
      : "Every decision has a response. Check them, then add your name and confirm to finalize.";
  }
  function finalize() {
    finErr.textContent = "";
    if (blockers.length) { finErr.textContent = "Answer or resolve every decision first - deferred and unanswered ones block finalizing."; return go(SET.decisions.indexOf(blockers[0])); }
    if (!st.owner.trim()) { owner.setAttribute("aria-invalid", "true"); $("owner-err").textContent = "Your name is required to finalize."; return owner.focus(); }
    owner.removeAttribute("aria-invalid"); $("owner-err").textContent = "";
    if (!st.reviewed) { finErr.textContent = "Confirm you reviewed every answer."; return chk.focus(); }
    st.finalizedAt = new Date().toISOString(); st.imported = false; save(true); sync();
    download(true); say("Finalized and downloaded. Share that JSON file in the working conversation.");
  }
  const settled = (SET.settled && SET.settled.length) ? el("details", { class: "settled" }, el("summary", { text: SET.settled.length + " already settled (read-only)" }),
    el("table", null, el("thead", null, el("tr", null, ["ID", "Question", "Settled as", "Source"].map(h => el("th", { scope: "col", text: h })))),
      el("tbody", null, SET.settled.map(s => el("tr", null, el("td", { text: s.id }), el("td", { text: s.question }), el("td", { text: (s.state ? s.state + ": " : "") + (s.answer || "-") }), el("td", { text: s.source || "-" })))))) : null;
  sync();
  return el("section", { class: "review", "aria-labelledby": "rv-h" },
    el("h2", { id: "rv-h", text: "Review your answers" }),
    st.imported ? el("p", { class: "banner warn", text: "These answers were imported from a file. Review them again before finalizing." }) : null,
    state, el("ol", null, rows),
    el("label", { class: "blk", for: "owner", text: "Your name (decision owner)" }), owner, el("p", { class: "err", id: "owner-err", "aria-live": "polite" }),
    el("label", { class: "opt", for: "reviewed" }, chk, el("span", { class: "lbl", text: "I reviewed every answer above and they are my decisions." })),
    finErr, el("div", { class: "actions" }, fin, el("button", { type: "button", class: "secondary", onclick: () => download(false) }, "Download draft JSON"),
      el("button", { type: "button", class: "quiet", onclick: () => go(n - 1) }, "Back")),
    el("p", { class: "muted small", text: "Saving, downloading, recommendations and time spent never count as approval. Only finalizing does, and it stays on this device until you share the file." }),
    settled);
}

function exportObj(final) {
  return {
    schema: SCHEMA, set: SET.id, setSchema: SET.schema, title: SET.title || SET.id, source: SET.source || "",
    exportedAt: new Date().toISOString(), finalizedAt: final ? st.finalizedAt : null, final: !!final,
    owner: st.owner, reviewed: final ? st.reviewed : false,
    answers: SET.decisions.map(d => {
      const a = st.answers[d.id], o = d.options.find(x => x.id === a.choice);
      return { id: d.id, ticket: d.ticket || "", question: d.question, status: statusOf(d),
        choice: o ? { id: o.id, label: o.label, does: o.does || "", tradeoff: o.tradeoff || "" } : a.choice === "custom" || a.choice === "defer" ? { id: a.choice } : null,
        custom: a.custom, clarification: a.clarification, notes: a.notes, skipped: !!a.skipped,
        options: d.options.map(x => ({ id: x.id, label: x.label, recommended: !!x.recommended })) };
    }),
  };
}
function download(final) {
  const blob = new Blob([JSON.stringify(exportObj(final), null, 2)], { type: "application/json" });
  const u = URL.createObjectURL(blob), a = el("a", { href: u, download: SET.id + "-decisions-" + (final ? "FINAL" : "draft") + ".json" });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000);
  if (!final) say("Draft downloaded. It stays a draft, whatever was finalized before.");
}

function validateImport(v) {
  const bad = (m) => { throw new Error(m); };
  if (!v || typeof v !== "object" || Array.isArray(v)) bad("not a JSON object");
  if (v.schema !== SCHEMA) bad("schema is not " + SCHEMA);
  if (v.set !== SET.id) bad("it is for " + String(v.set).slice(0, 60) + ", not " + SET.id);
  if (!Array.isArray(v.answers)) bad("no answers list");
  const ids = new Map(SET.decisions.map(d => [d.id, d]));
  const out = {};
  for (const a of v.answers) {
    if (!a || typeof a !== "object") bad("an answer is not an object");
    const d = ids.get(a.id); if (!d) bad("unknown decision id " + String(a.id).slice(0, 40));
    if (out[a.id]) bad("decision " + a.id + " twice");
    for (const k of ["custom", "clarification", "notes"]) { if (a[k] != null && typeof a[k] !== "string") bad(a.id + ": " + k + " must be text"); if ((a[k] || "").length > MAX) bad(a.id + ": " + k + " is longer than " + MAX); }
    if (a.choice != null && (typeof a.choice !== "object" || Array.isArray(a.choice))) bad(a.id + ": choice must be an object or null");
    const cid = a.choice && a.choice.id;
    if (cid != null && typeof cid !== "string") bad(a.id + ": choice id must be text");
    if (cid && cid !== "custom" && cid !== "defer" && !d.options.some(o => o.id === cid)) bad(a.id + ": unknown option " + cid.slice(0, 40));
    out[a.id] = { choice: cid || "", custom: a.custom || "", clarification: a.clarification || "", notes: a.notes || "", skipped: !!a.skipped };
  }
  if (v.owner != null && (typeof v.owner !== "string" || v.owner.length > 200)) bad("owner must be short text");
  return { answers: out, owner: v.owner || "" };
}
function ask(title, text, okLabel) {
  const dlg = $("confirm");
  $("confirm-title").textContent = title; $("confirm-text").textContent = text; $("confirm-ok").textContent = okLabel;
  return new Promise(res => {
    if (typeof dlg.showModal !== "function") return res(window.confirm(title + "\n\n" + text));
    dlg.returnValue = ""; dlg.showModal(); dlg.addEventListener("close", () => res(dlg.returnValue === "ok"), { once: true });
  });
}
const hasWork = () => st.owner || SET.decisions.some(d => { const a = st.answers[d.id]; return a.choice || a.custom || a.clarification || a.notes; });

$("export-draft").addEventListener("click", () => download(false));
$("import").addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = "";
  if (!f) return;
  try {
    if (f.size > MAX_FILE) throw new Error("file is larger than 1 MB");
    let v; try { v = JSON.parse(await f.text()); } catch (x) { throw new Error("not valid JSON"); }
    const got = validateImport(v);
    if (hasWork() && !(await ask("Replace your current answers?", "The imported file replaces every answer on this page. Download a draft first if you want to keep them.", "Replace"))) return say("Import cancelled; nothing changed.");
    for (const d of SET.decisions) st.answers[d.id] = Object.assign(blank(), got.answers[d.id] || {});
    st.owner = got.owner; st.reviewed = false; st.finalizedAt = null; st.imported = true; save(true);
    go(SET.decisions.length); say("Imported. Review every answer again before finalizing.");
  } catch (x) { say("Import refused: " + x.message + ". Nothing changed."); }
});
$("fresh").addEventListener("click", async () => {
  if (!(await ask("Start fresh?", "This clears every answer, note and your name from this page in this browser. Downloaded files are not touched.", "Clear everything"))) return;
  st = { answers: {}, owner: "", reviewed: false, finalizedAt: null, step: 0, imported: false };
  for (const d of SET.decisions) st.answers[d.id] = blank();
  try { localStorage.removeItem(KEY); } catch (e) {}
  save(true); go(0); say("Started fresh.");
});

load(); render();
if (!storageOk) say("This browser is not saving drafts for this page. Use Download draft JSON to keep your answers.");
})();`;
