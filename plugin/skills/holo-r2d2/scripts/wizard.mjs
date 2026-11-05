// holo-r2d2 decision wizard (F42 / F134): one owner decision per step, answered
// on the page it is read on. Self-contained offline HTML file - no fetch, no
// fonts, no libraries - built from a relay run's open decisions or from a
// decision set (holo-decisions/1 JSON). The page decides nothing: the
// recommendation is shown first and never selected; finalizing is local; the
// exported JSON or copied CLI commands go back to the session, which turns them
// into `relay-morpheus.sh answer` calls (answersToCommands).

export const SET_SCHEMA = "holo-decisions/1";
export const ANSWER_SCHEMA = "holo-answers/1";
const MAX_TEXT = 4000;

const str = (v) => (v == null ? "" : String(v));
const escH = (s) => str(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clipText = (s, n) => { s = str(s).trim(); return s.length > n ? s.slice(0, n - 1) + "\u2026" : s; };
const ASKABLE = new Set(["open", "asked"]);

export function normalizeDiagram(raw) {
  if (!raw) return [];
  if (typeof raw === "string") {
    return raw.split(/\s*(?:->|\u2192|\|)\s*/).map((s) => s.trim()).filter(Boolean)
      .map((title, i) => ({ title, subtitle: `step ${i + 1}`, kind: "flow" }));
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((x, i) => typeof x === "string"
    ? { title: x, subtitle: `step ${i + 1}`, kind: "block" }
    : { title: str(x && (x.title || x.label)), subtitle: str(x && (x.subtitle || x.does || "")), kind: str((x && x.kind) || "block") }
  ).filter((x) => x.title.trim());
}

// Single-option Causal Conduit architectural SVG (server-side export).
export function renderArchitecturalSvg(step, option, label = "Architectural decision flow") {
  const d = step || {};
  const o = option || (d.options && d.options[0]) || { label: "Option", does: "Action", tradeoff: "Trade-off", consequence: "Unblocks pipeline" };
  const nowTxt = clipText(d.now || d.header || "Current state", 22);
  const gateTxt = clipText(d.id || "Gate", 12);
  const optTxt = clipText(o.label || "Option", 22);
  const doesTxt = clipText(o.pros || o.does || "Direct execution", 22);
  const consTxt = clipText(o.cons || o.tradeoff || "Standard trade-off", 22);
  const scopeTxt = clipText(d.scope || o.consequence || "Downstream stages", 24);
  const W = 680, H = 136;
  return `<svg class="arch-flow-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escH(label)}">` +
    `<title>${escH(label)}</title>` +
    `<desc>Causal conduit flow from ${escH(nowTxt)} through gate ${escH(gateTxt)} and option ${escH(optTxt)} to ${escH(scopeTxt)}.</desc>` +
    `<defs><marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="bd-arrow"/></marker></defs>` +
    `<rect class="bd-box" x="10" y="42" width="124" height="52" rx="6"/>` +
    `<text class="bd-sub" x="18" y="60">NOW</text><text class="bd-title" x="18" y="78">${escH(nowTxt)}</text>` +
    `<path class="bd-edge" d="M134,68 L168,68" marker-end="url(#arch-arrow)"/>` +
    `<polygon class="bd-gate" points="184,38 242,38 254,68 242,98 184,98 172,68"/>` +
    `<text class="bd-sub" x="192" y="62">GATE</text><text class="bd-title" x="192" y="80">${escH(gateTxt)}</text>` +
    `<path class="bd-edge" d="M254,68 L288,68" marker-end="url(#arch-arrow)"/>` +
    `<rect class="bd-box" x="292" y="42" width="136" height="52" rx="6"/>` +
    `<rect class="bd-bar" x="292" y="42" width="136" height="5" rx="3"/>` +
    `<text class="bd-title" x="300" y="64">${escH(optTxt)}</text><text class="bd-sub" x="300" y="82">${escH(doesTxt)}</text>` +
    `<path class="bd-edge" d="M428,56 C460,56 460,28 492,28" marker-end="url(#arch-arrow)"/>` +
    `<path class="bd-edge" d="M428,80 C460,80 460,104 492,104" marker-end="url(#arch-arrow)"/>` +
    `<g class="bd-pro"><rect class="bd-box" x="496" y="8" width="172" height="44" rx="6"/><text class="bd-sub" x="504" y="24">PROS / UNBLOCKS</text><text class="bd-title" x="504" y="41">${escH(scopeTxt)}</text></g>` +
    `<g class="bd-con"><rect class="bd-box" x="496" y="82" width="172" height="44" rx="6"/><text class="bd-sub" x="504" y="98">CONS / COST</text><text class="bd-title" x="504" y="115">${escH(consTxt)}</text></g>` +
    `</svg>`;
}

// Multi-lane parallel comparison SVG (server-side export).
export function renderParallelLanesSvg(decision, options, label = "Parallel option comparison") {
  const d = decision || {};
  const opts = Array.isArray(options) && options.length ? options : (d.options || []);
  if (!opts.length) return "";
  const LH = 64, GAP = 12, PY = 14, W = 680;
  const H = PY * 2 + opts.length * LH + (opts.length - 1) * GAP;
  const gy = Math.round(H / 2);
  const lanes = opts.map((o, i) => {
    const y = PY + i * (LH + GAP);
    const cy = y + Math.round(LH / 2);
    const rec = !!(o.recommended || o.rec);
    return `<path class="bd-edge${rec ? " bd-edge-rec" : ""}" d="M114,${gy} C152,${gy} 152,${cy} 188,${cy}" marker-end="url(#lane-arrow)"/>` +
      `<g class="lane-opt${rec ? " bd-pro" : ""}" transform="translate(192,${y})">` +
      `<rect class="bd-box" width="474" height="${LH}" rx="7"/>` +
      `<rect class="bd-bar" width="6" height="${LH}" rx="3"/>` +
      `<text class="bd-title" x="16" y="23">${i + 1}. ${escH(clipText(o.label, 28))}${rec ? " (Recommended)" : ""}</text>` +
      `<text class="bd-sub" x="16" y="42">Pros: ${escH(clipText(o.pros || o.does || "-", 26))} \u00b7 Cons: ${escH(clipText(o.cons || o.tradeoff || o.hurts || "-", 24))}</text>` +
      `<text class="bd-sub" x="16" y="56">${escH(clipText(o.consequence || d.scope || "Unblocks downstream work", 58))}</text>` +
      `</g>`;
  }).join("");
  return `<svg class="parallel-lanes-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escH(label)}">` +
    `<title>${escH(label)}</title>` +
    `<defs><marker id="lane-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="bd-arrow"/></marker></defs>` +
    `<polygon class="bd-gate" points="22,${gy - 26} 98,${gy - 26} 114,${gy} 98,${gy + 26} 22,${gy + 26} 8,${gy}"/>` +
    `<text class="bd-title" x="28" y="${gy + 4}">${escH(clipText(d.id || "Gate", 10))}</text>` +
    lanes + `</svg>`;
}

// A relay run's decisions as a set: open/asked ones are asked; answered, ruled,
// moot and same-as ones are the settled reference, with the run file as source.
export function setFromRun(run, runPath) {
  const src = `${runPath || run.id} (## Decisions)`;
  const runStages = (run.stages || []).map((s) => ({
    n: s.n,
    name: str(s.name),
    state: str(s.state || "pending"),
    waits: [...(s.waits || [])],
  }));
  const decisions = run.qs.filter((q) => ASKABLE.has(q.state)).map((q) => {
    const then = `then: ${q.blocks.length ? "unblocks " + q.blocks.join(", ") : "unblocks the parked work"}` +
      `${q.holds.length ? "; re-plans stage " + q.holds.join(", ") : ""}`;
    const d = {
      id: q.id, ticket: str(q.f.ticket), header: str(q.f.header),
      question: str(q.f.question) || "(no question text in the run file)",
      now: str(q.f.parked ? `parked by ${q.f.parked}` : ""),
      why: str(q.f.reason), scope: [q.blocks.length ? `blocks ${q.blocks.join(", ")}` : "", q.holds.length ? `holds stage ${q.holds.join(", ")}` : "", q.files.length ? `files ${q.files.join(", ")}` : ""].filter(Boolean).join(" \u00b7 "),
      files: [...(q.files || [])],
      holds: [...(q.holds || [])],
      blocks: [...(q.blocks || [])],
      stages: runStages,
      example: "", recommendation: q.options.some((o) => o.rec) ? "Marked recommended in the run file." : "",
      options: q.options.filter((o) => str(o.label).trim()).map((o, i) => ({
        id: "o" + (i + 1), label: o.label, explain: str(o.explain || ""),
        does: o.does, pros: o.does, tradeoff: o.hurts, cons: o.hurts, recommended: !!o.rec,
        consequence: `${o.does ? o.does + ". " : ""}${o.hurts ? "Cost: " + o.hurts + ". " : ""}${then}.`,
      })),
      sources: [`${src} ${q.id} ${q.state} ${q.ts}`.trim()],
    };
    if (q.f.diagram) d.diagram = str(q.f.diagram);
    return d;
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
  const checkDiag = (dg, where) => {
    if (dg == null || typeof dg === "string") return;
    if (!Array.isArray(dg)) bad(`${where} must be text or a list`);
    for (const b of dg) {
      if (typeof b === "string") continue;
      if (!b || typeof b !== "object") bad(`${where} item must be text or an object`);
      for (const k of ["title", "label", "subtitle", "kind"]) text(b[k], `${where}.${k}`);
    }
  };
  for (const k of ["id", "title", "source"]) text(set[k], k);
  if (set.round != null && (typeof set.round !== "number" || !Number.isFinite(set.round))) bad("round must be a number");
  for (const d of set.decisions) {
    if (!d || typeof d !== "object") bad("a decision is not an object");
    if (!ID.test(str(d.id)) || RESERVED.has(d.id)) bad(`decision id "${d.id}" must be 1-40 of A-Z a-z 0-9 _ . - and not a reserved name`);
    if (seen.has(d.id)) bad(`decision id ${d.id} twice`); seen.add(d.id);
    for (const k of ["ticket", "header", "question", "now", "why", "scope", "example", "recommendation"]) text(d[k], `${d.id}.${k}`);
    if (!str(d.question).trim()) bad(`${d.id}: question is required`);
    if (!Array.isArray(d.options)) bad(`${d.id}: options must be a list (it may be empty: custom and discuss-first are always offered)`);
    if (d.sources != null && (!Array.isArray(d.sources) || d.sources.some((x) => typeof x !== "string"))) bad(`${d.id}: sources must be a list of text`);
    checkDiag(d.diagram, `${d.id}.diagram`);
    if (d.discussion != null) {
      if (typeof d.discussion !== "object" || Array.isArray(d.discussion)) bad(`${d.id}.discussion must be an object`);
      for (const k of ["kind", "prompt", "notes", "previousStatus"]) text(d.discussion[k], `${d.id}.discussion.${k}`);
    }
    const oids = new Set();
    for (const o of d.options) {
      if (!o || typeof o !== "object") bad(`${d.id}: an option is not an object`);
      if (!ID.test(str(o.id)) || RESERVED.has(o.id)) bad(`${d.id}: option id "${o.id}"`);
      if (oids.has(o.id) || o.id === "custom" || o.id === "defer" || o.id === "explain") bad(`${d.id}: option id ${o.id} repeats or is reserved`);
      oids.add(o.id);
      for (const k of ["label", "explain", "does", "pros", "tradeoff", "cons", "consequence"]) text(o[k], `${d.id}/${o.id}.${k}`);
      if (!str(o.label).trim()) bad(`${d.id}/${o.id}: label is required`);
      if (o.pros && !o.does) o.does = o.pros;
      if (o.does && !o.pros) o.pros = o.does;
      if (o.cons && !o.tradeoff) o.tradeoff = o.cons;
      if (o.tradeoff && !o.cons) o.cons = o.tradeoff;
      checkDiag(o.diagram, `${d.id}/${o.id}.diagram`);
    }
    if (d.options.filter((o) => o.recommended).length > 1) bad(`${d.id}: more than one recommended option`);
  }
  if (set.settled != null && !Array.isArray(set.settled)) bad("settled must be a list");
  for (const s of set.settled || []) for (const k of ["id", "ticket", "question", "state", "answer", "source"]) text(s && s[k], `settled.${k}`);
  return set;
}

// Continuous discussion (F134): build the Round N+1 wizard set from the previous
// decision set and an exported holo-answers/1 JSON. Answered decisions move into
// `settled` (read-only); "custom" (Something else) and "defer"/"explain" (Ask /
// Explain more) stay open with an expanded Discussion & Explanation banner,
// auto-populated option explanations, pros/cons, and block diagrams.
export function nextWizardSet(set, ans) {
  checkSet(set);
  if (!ans || ans.schema !== ANSWER_SCHEMA || !Array.isArray(ans.answers)) throw new Error(`answers: schema must be "${ANSWER_SCHEMA}"`);
  if (str(ans.set) !== str(set.id)) throw new Error(`answers: set "${str(ans.set)}" does not match active set "${set.id}"`);
  if (ans.setSchema && ans.setSchema !== set.schema) throw new Error(`answers: setSchema "${ans.setSchema}" does not match active set schema "${set.schema}"`);
  const activeRound = Number(set.round) || 1;
  if (ans.round != null && (!Number.isFinite(ans.round) || ans.round !== activeRound)) {
    throw new Error(`answers: round ${ans.round} does not match active round ${activeRound}`);
  }
  if (!ans.finalizedAt || typeof ans.finalizedAt !== "string" || !ans.finalizedAt.trim() || !ans.reviewed || ans.reviewed !== true || !str(ans.owner).trim() || ans.final === false) {
    throw new Error("answers: a draft, not finalized and reviewed by its owner - cannot settle decisions");
  }

  const knownDecisions = new Map(set.decisions.map((d) => [d.id, d]));
  const settledIds = new Set((set.settled || []).map((s) => s.id));
  const seen = new Set();
  for (const a of ans.answers) {
    if (!a || typeof a !== "object") throw new Error("answers: an answer is not an object");
    if (settledIds.has(a.id)) throw new Error(`answers: decision "${a.id}" is already settled in active set`);
    if (!knownDecisions.has(a.id)) throw new Error(`answers: unknown decision id "${a && a.id}"`);
    if (seen.has(a.id)) throw new Error(`answers: decision "${a.id}" answered twice`);
    seen.add(a.id);
    const d = knownDecisions.get(a.id);
    if (a.question != null && str(a.question).trim() && str(a.question).trim() !== str(d.question).trim()) {
      throw new Error(`answers: decision "${a.id}" question text does not match active set`);
    }
    if (a.choice != null) {
      if (typeof a.choice !== "object" || Array.isArray(a.choice)) throw new Error(`answers: decision "${a.id}" choice must be an object`);
      const rawCid = a.choice.id;
      if (rawCid != null && typeof rawCid !== "string") throw new Error(`answers: decision "${a.id}" choice id must be text`);
      const cid = str(rawCid);
      const isExplain = cid === "defer" || cid === "explain";
      const isCustom = cid === "custom";
      if (cid && !isExplain && !isCustom) {
        const picked = d.options.find((o) => o.id === cid);
        if (!picked) throw new Error(`answers: decision "${a.id}" has unknown option id "${cid}"`);
        if (a.choice.label != null && str(a.choice.label).trim() && str(a.choice.label).trim() !== str(picked.label).trim()) {
          throw new Error(`answers: decision "${a.id}" option "${cid}" label does not match active set`);
        }
      }
    }
    if (a.options != null && Array.isArray(a.options)) {
      for (const opt of a.options) {
        if (opt && opt.id && !d.options.some((o) => o.id === opt.id)) {
          throw new Error(`answers: decision "${a.id}" option list does not match active set`);
        }
      }
    }
  }

  const round = activeRound + 1;
  const byId = new Map(ans.answers.map((a) => [a && a.id, a]));
  const decisions = [], settled = [...(set.settled || [])];
  for (const d of set.decisions) {
    const a = byId.get(d.id);
    const cid = a && a.choice && typeof a.choice === "object" ? str(a.choice.id) : "";
    const isExplain = cid === "defer" || cid === "explain";
    const isCustom = cid === "custom";
    const picked = !isExplain && !isCustom && cid ? d.options.find((o) => o.id === cid) : null;
    if (picked) {
      settled.push({
        id: d.id, ticket: str(d.ticket), question: str(d.question), state: "answered",
        answer: picked.label + (str(a.notes).trim() ? " - " + str(a.notes).trim() : ""),
        source: `${ans.set || set.id} round ${round - 1}`,
      });
      continue;
    }
    const promptText = str(isCustom ? a?.custom : a?.clarification).trim();
    const opts = d.options.map((o) => ({
      ...o,
      pros: o.pros || o.does || "Direct implementation path",
      does: o.does || o.pros || "Direct implementation path",
      cons: o.cons || o.tradeoff || "Standard trade-off",
      tradeoff: o.tradeoff || o.cons || "Standard trade-off",
      explain: o.explain || [o.does && `What this action does: ${o.does}`, o.tradeoff && `Cons: ${o.tradeoff}`, o.consequence && `Then: ${o.consequence}`].filter(Boolean).join(" \u00b7 ") || `Executes ${o.label}.`,
    }));
    if (isCustom && promptText) {
      const customId = `custom_r${round - 1}`;
      if (!opts.some((o) => o.id === customId)) {
        opts.push({
          id: customId,
          label: `Custom direction: ${promptText.slice(0, 60)}`,
          explain: `Your custom direction from Round ${round - 1}: ${promptText}`,
          does: `Applies custom direction: ${promptText}`,
          pros: `Applies custom direction: ${promptText}`,
          tradeoff: "Requires custom implementation check",
          cons: "Requires custom implementation check",
          consequence: "Proceeds with your custom direction once confirmed.",
          recommended: false,
        });
      }
    }
    const nextD = {
      ...d,
      options: opts,
      diagram: d.diagram || [
        { title: d.header || d.id, subtitle: "Decision context", kind: "block" },
        ...(promptText ? [{ title: isCustom ? "Custom Proposal" : "Explain Request", subtitle: promptText.slice(0, 24), kind: "action" }] : []),
        ...opts.slice(0, 3).map((o) => ({ title: o.label, subtitle: o.does || "Option", kind: o.recommended ? "action" : "flow" })),
      ],
    };
    if (promptText || isExplain || isCustom) {
      nextD.discussion = {
        round,
        kind: isCustom ? "custom" : "explain",
        prompt: promptText || "Requested deeper explanation of options, pros, and cons.",
        notes: str(a?.notes).trim(),
        previousStatus: isCustom ? "custom-review-required" : "deferred",
      };
    }
    decisions.push(nextD);
  }
  const baseTitle = str(set.title || set.id).replace(/\s*\(Round \d+\)$/, "");
  return checkSet({ ...set, round, title: `${baseTitle} (Round ${round})`, decisions, settled });
}

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
    const isDefer = cid === "defer" || cid === "explain";
    let textv = "", custom = false;
    if (cid === "custom") { textv = one(a.custom); custom = true; }
    else if (cid && !isDefer) textv = one(a.choice.label);
    if (isDefer || !cid) { out.open.push(`${a.id}: ${isDefer ? "deferred" : "no answer"}${one(a.clarification) ? " - " + one(a.clarification) : ""}`); continue; }
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

export function wizardPage(set) {
  checkSet(set);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Decisions - ${escH(set.title || set.id)}</title>
<style>${CSS}</style></head>
<body>
<a class="skip" href="#main">Skip to the decision</a>
<header class="top"><div class="wrap">
  <div class="top-row">
    <div>
      <p class="eyebrow">Owner decisions \u00b7 <span id="setid"></span></p>
      <h1 id="title"></h1>
    </div>
    <div class="head-controls">
      <input type="search" id="decision-search" placeholder="Filter decisions (/)" aria-label="Filter decisions" autocomplete="off">
      <button type="button" id="btn-shortcuts" class="quiet" aria-label="Keyboard shortcuts (?)">Shortcuts ?</button>
    </div>
  </div>
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
<dialog id="shortcuts-dlg" aria-labelledby="shortcuts-title"><form method="dialog">
  <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
  <dl class="shortcuts-list">
    <div><dt><kbd>1</kbd> \u2013 <kbd>9</kbd></dt><dd>Select option 1 through 9 on the active decision</dd></div>
    <div><dt><kbd>[</kbd> / <kbd>]</kbd></dt><dd>Previous / Next decision step (or Alt+Left / Alt+Right)</dd></div>
    <div><dt><kbd>/</kbd></dt><dd>Focus the decision filter search input</dd></div>
    <div><dt><kbd>?</kbd></dt><dd>Open this keyboard shortcuts sheet</dd></div>
    <div><dt><kbd>Esc</kbd></dt><dd>Close open dialog</dd></div>
  </dl>
  <div class="row"><button value="close" class="primary">Close</button></div>
</form></dialog>
<script type="application/json" id="holo-set">${embed(set)}</script>
<script>${CLIENT}</script>
</body></html>
`;
}

const CSS = `
:root{--bg:#f6f8fa;--card:#ffffff;--ink:#1f2328;--muted:#656d76;--line:#d0d7de;--accent:#0969da;--accent-ink:#ffffff;--rec:#1a7f37;--rec-bg:#dafbe1;--warn:#cf222e;--warn-bg:#ffebe9;--sel:#ddf4ff;--focus:#fd8c73;--conduit:#8c959f;--conduit-active:#0969da}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0d1117;--card:#161b22;--ink:#f0f6fc;--muted:#8b949e;--line:#30363d;--accent:#58a6ff;--accent-ink:#0d1117;--rec:#3fb950;--rec-bg:#11281a;--warn:#f85149;--warn-bg:#321617;--sel:#182c44;--focus:#f0883e;--conduit:#484f58;--conduit-active:#58a6ff}}
:root[data-theme="dark"]{--bg:#0d1117;--card:#161b22;--ink:#f0f6fc;--muted:#8b949e;--line:#30363d;--accent:#58a6ff;--accent-ink:#0d1117;--rec:#3fb950;--rec-bg:#11281a;--warn:#f85149;--warn-bg:#321617;--sel:#182c44;--focus:#f0883e;--conduit:#484f58;--conduit-active:#58a6ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:anywhere}
.wrap{max-width:1160px;margin:0 auto;padding:0 16px}
.skip{position:absolute;left:-999px}.skip:focus{left:16px;top:8px;background:var(--card);padding:8px;z-index:9}
.top{border-bottom:1px solid var(--line);background:var(--card);padding:16px 0 10px}
.top-row{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px}
.head-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
#decision-search{min-height:44px;min-width:200px;padding:6px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:inherit;font-size:.9rem}
.eyebrow{margin:0;color:var(--muted);font-size:.82rem;letter-spacing:.04em;text-transform:uppercase}
h1{font-size:1.45rem;margin:.2rem 0 .6rem;line-height:1.25}
h2{font-size:1.3rem;line-height:1.3;margin:.3rem 0 .8rem}
.progress{height:6px;background:var(--line);border-radius:3px;overflow:hidden}#bar{height:100%;width:0;background:var(--accent)}
.muted{color:var(--muted)}.small{font-size:.85rem}
nav ol{list-style:none;display:flex;flex-wrap:wrap;gap:6px;margin:.6rem 0 0;padding:0}
nav button{min-height:44px;min-width:44px;padding:4px 10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;font:inherit;font-size:.9rem;cursor:pointer;font-variant-numeric:tabular-nums}
nav button[aria-current=step]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
nav .st{display:inline-block;width:1.1em;text-align:center}
main{padding:20px 16px 8px}
.subbar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;margin-bottom:16px;background:var(--card);border:1px solid var(--line);border-radius:10px}
.blast-radius-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.br-chip{font:600 .8rem/1.2 ui-monospace,"SF Mono",Menlo,Consolas,monospace;padding:4px 8px;border-radius:6px;background:var(--bg);border:1px solid var(--line);color:var(--ink)}
.br-chip.br-hold{border-color:var(--warn);background:var(--warn-bg);color:var(--warn)}
.br-chip.br-ticket{border-color:var(--accent);background:var(--sel);color:var(--accent)}
.view-toggle{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.view-toggle button{min-height:38px;padding:4px 12px;border:0;background:var(--bg);color:var(--ink);cursor:pointer;font-size:.86rem;font-weight:600}
.view-toggle button[aria-pressed="true"]{background:var(--accent);color:var(--accent-ink)}
.mini-stage-graph{display:block;width:100%;max-width:560px;height:48px;margin:0 0 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);padding:4px}
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
.opt-explain{display:block;font-size:.9rem;color:var(--ink);margin-top:.2rem}
.pros-cons{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:.45rem;margin-top:.35rem}
.pro-card,.con-card{display:block;font-size:.86rem;padding:.3rem .55rem;border-radius:6px;border:1px solid var(--line)}
.pro-card{background:var(--rec-bg);border-color:var(--rec)}.con-card{background:var(--warn-bg);border-color:var(--warn)}
.pc-k{font-weight:700;text-transform:uppercase;font-size:.74rem;letter-spacing:.04em;margin-right:.3rem}
.pro-card .pc-k{color:var(--rec)}.con-card .pc-k{color:var(--warn)}
.block-diagram,.arch-flow-svg,.parallel-lanes-svg{display:block;width:100%;height:auto;margin:.5rem 0 .85rem;border:1px solid var(--line);border-radius:8px;background:var(--card);padding:.35rem}
.bd-box{fill:var(--bg);stroke:var(--line);stroke-width:1.4}.bd-bar{fill:var(--accent)}
.bd-gate{fill:var(--sel);stroke:var(--accent);stroke-width:1.6}
.bd-pro .bd-box{fill:var(--rec-bg);stroke:var(--rec)}.bd-pro .bd-bar{fill:var(--rec)}
.bd-con .bd-box{fill:var(--warn-bg);stroke:var(--warn)}.bd-con .bd-bar{fill:var(--warn)}
.bd-title{font-size:12px;font-weight:700;fill:var(--ink)}.bd-sub{font-size:10.5px;fill:var(--muted)}
.bd-edge{fill:none;stroke:var(--conduit);stroke-width:1.6}.bd-edge-rec{stroke:var(--rec);stroke-width:2}.bd-arrow{fill:var(--conduit)}
.comparison-matrix-wrap{overflow-x:auto;margin:0 0 1rem;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.comparison-matrix{width:100%;border-collapse:collapse;font-size:.9rem}
.comparison-matrix caption{text-align:left;font-weight:700;padding:.65rem .8rem;border-bottom:1px solid var(--line);color:var(--muted)}
.comparison-matrix th,.comparison-matrix td{padding:.6rem .75rem;border-top:1px solid var(--line);border-right:1px solid var(--line);text-align:left;vertical-align:top}
.comparison-matrix th[scope="row"]{width:9.5rem;background:var(--bg);font-weight:700;color:var(--muted)}
.comparison-matrix .col-active{background:var(--sel);box-shadow:inset 0 0 0 2px var(--accent)}
.btn-select-opt{min-height:40px;padding:.35rem .75rem;border-radius:7px;border:1px solid var(--accent);background:var(--card);color:var(--ink);font-weight:600;cursor:pointer}
.btn-select-opt.active{background:var(--accent);color:var(--accent-ink)}
.discuss-banner{border:1px solid var(--accent);background:var(--sel);margin-bottom:1rem}
.discuss-banner h3{margin:0 0 .35rem;font-size:1.02rem;color:var(--accent)}
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
.flow .pick{border-color:var(--accent)}.flow .pro{border-color:var(--rec);background:var(--rec-bg)}.flow .cost{border-color:var(--warn);background:var(--warn-bg)}.flow .then{border-style:dashed}
.note-ex{font-size:.85rem;color:var(--muted);margin:.4rem 0 0}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin:1.2rem 0 .5rem}
button{font:inherit}
.primary,.secondary,.quiet,.danger,.copy-cmds{min-height:44px;padding:.5rem 1rem;border-radius:9px;cursor:pointer;border:1px solid var(--line)}
.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:600}
.secondary,.copy-cmds{background:var(--card);color:var(--ink);font-weight:600}
.quiet{background:transparent;color:var(--ink)}
.danger{background:var(--warn);color:#fff;border-color:var(--warn)}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.foot{padding:12px 16px 32px;border-top:1px solid var(--line);margin-top:24px}
.tools{display:flex;flex-wrap:wrap;gap:8px}
.filebtn{display:inline-flex;align-items:center;position:relative}
.filebtn input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}
.filebtn:focus-within{outline:3px solid var(--focus);outline-offset:2px}
.dashboard-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:10px;margin:0 0 1rem}
.metric-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.7rem .9rem}
.metric-card b{display:block;font-size:1.35rem;font-variant-numeric:tabular-nums}
.metric-card span{font-size:.8rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.blast-summary-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.75rem .95rem;margin:0 0 1rem;font-size:.9rem}
.cmd-section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.85rem 1rem;margin:1rem 0}
.cmd-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:.5rem}
.cmd-box{margin:0;padding:.65rem .8rem;background:var(--bg);border:1px solid var(--line);border-radius:8px;font:13px/1.45 ui-monospace,"SF Mono",Menlo,Consolas,monospace;overflow-x:auto}
.review ol{padding-left:1.2rem}.review li{margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid var(--line)}
.badge{display:inline-block;font-size:.78rem;font-weight:700;border-radius:6px;padding:.05rem .45rem;margin-left:.4rem;border:1px solid currentColor}
.b-answered{color:var(--rec)}.b-custom-review-required{color:var(--accent)}.b-deferred,.b-incomplete{color:var(--warn)}
.settled{margin-top:1.5rem}.settled summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600}
.settled table{border-collapse:collapse;width:100%;font-size:.92rem}.settled td,.settled th{border-top:1px solid var(--line);padding:.4rem;text-align:left;vertical-align:top}
.banner{border-radius:10px;padding:.7rem .9rem;margin:0 0 1rem;background:var(--sel)}
.banner.warn{background:var(--warn-bg)}
dialog{border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);max-width:min(92vw,480px);padding:1rem 1.2rem}
dialog .row{display:flex;gap:8px;justify-content:flex-end;margin-top:1rem}
.shortcuts-list{display:grid;gap:.55rem;margin:.8rem 0}
.shortcuts-list div{display:grid;grid-template-columns:6.5rem 1fr;gap:.5rem;align-items:baseline}
kbd{font:700 .8rem ui-monospace,monospace;padding:2px 6px;border:1px solid var(--line);border-radius:4px;background:var(--bg)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
@media (prefers-reduced-motion:no-preference){#bar{transition:width .25s}}
`;

// The page's own code. Text from the set or a draft only ever reaches the DOM
// through textContent / value.
const CLIENT = String.raw`(() => {
"use strict";
const SET = JSON.parse(document.getElementById("holo-set").textContent);
const SCHEMA = "holo-answers/1", MAX = ${MAX_TEXT}, MAX_FILE = 1048576;
const KEY = "holo-wizard:v1:" + SET.id + ":" + hash(JSON.stringify(SET.decisions.map(d => [d.id, d.options.map(o => o.id)])));
const SVG_NS = (document.documentElement.namespaceURI || "").replace("1999/xhtml", "2000/svg");
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
const svgEl = (tag, attrs, ...kids) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "text") n.textContent = v; else n.setAttribute(k, String(v));
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
};
const clip = (s, n) => { s = String(s || "").trim(); return s.length > n ? s.slice(0, n - 1) + "\u2026" : s; };
function normDiag(raw) {
  if (!raw) return [];
  if (typeof raw === "string") return raw.split(/\s*(?:->|\u2192|\|)\s*/).map((s, i) => ({ title: s.trim(), subtitle: "step " + (i + 1), kind: "flow" })).filter(x => x.title);
  if (!Array.isArray(raw)) return [];
  return raw.map((x, i) => typeof x === "string" ? { title: x, subtitle: "step " + (i + 1), kind: "block" } : { title: String((x && (x.title || x.label)) || ""), subtitle: String((x && (x.subtitle || x.does)) || ""), kind: String((x && x.kind) || "block") }).filter(x => x.title.trim());
}
function renderBlockDiagram(items, label) {
  const list = normDiag(items);
  if (!list.length) return null;
  const cols = Math.min(list.length, 3), rows = Math.ceil(list.length / cols);
  const BW = 152, BH = 52, GX = 24, GY = 18, PX = 8, PY = 8;
  const W = PX * 2 + cols * BW + (cols - 1) * GX, H = PY * 2 + rows * BH + (rows - 1) * GY;
  const svg = svgEl("svg", { class: "block-diagram", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": label || "Block diagram" },
    svgEl("defs", null, svgEl("marker", { id: "wiz-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" },
      svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: "bd-arrow" }))));
  list.forEach((b, idx) => {
    const c = idx % cols, r = Math.floor(idx / cols);
    const x = PX + c * (BW + GX), y = PY + r * (BH + GY);
    if (idx + 1 < list.length) {
      const nc = (idx + 1) % cols, nr = Math.floor((idx + 1) / cols);
      const nx = PX + nc * (BW + GX), ny = PY + nr * (BH + GY);
      const d = nr === r ? "M" + (x + BW) + "," + (y + BH / 2) + " L" + (nx - 3) + "," + (ny + BH / 2)
        : "M" + (x + BW / 2) + "," + (y + BH) + " L" + (nx + BW / 2) + "," + (ny - 3);
      svg.append(svgEl("path", { class: "bd-edge", d, "marker-end": "url(#wiz-arrow)" }));
    }
    svg.append(svgEl("g", { class: "bd-node bd-" + (b.kind || "block"), transform: "translate(" + x + "," + y + ")" },
      svgEl("rect", { class: "bd-box", width: BW, height: BH, rx: 6 }),
      svgEl("rect", { class: "bd-bar", width: BW, height: 5, rx: 3 }),
      svgEl("text", { class: "bd-title", x: 9, y: 22, text: clip(b.title, 20) }),
      svgEl("text", { class: "bd-sub", x: 9, y: 39, text: clip(b.subtitle || ("block " + (idx + 1)), 23) })));
  });
  return svg;
}
function renderArchitecturalSvg(d, o, label) {
  if (!o) return null;
  const W = 540, H = 128;
  const nowTxt = clip(d.now || d.header || "Current state", 18);
  const gateTxt = clip(d.id || "Gate", 10);
  const optTxt = clip(o.label || "Option", 18);
  const doesTxt = clip(o.pros || o.does || "Action", 18);
  const consTxt = clip(o.cons || o.tradeoff || "Trade-off", 18);
  const scopeTxt = clip(d.scope || o.consequence || "Unblocks pipeline", 20);
  return svgEl("svg", { class: "arch-flow-svg", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": label || "Architectural flow" },
    svgEl("title", { text: label || "Architectural flow" }),
    svgEl("defs", null, svgEl("marker", { id: "arch-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" },
      svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: "bd-arrow" }))),
    svgEl("rect", { class: "bd-box", x: 8, y: 38, width: 104, height: 50, rx: 6 }),
    svgEl("text", { class: "bd-sub", x: 15, y: 55, text: "NOW" }),
    svgEl("text", { class: "bd-title", x: 15, y: 74, text: nowTxt }),
    svgEl("path", { class: "bd-edge", d: "M112,63 L136,63", "marker-end": "url(#arch-arrow)" }),
    svgEl("polygon", { class: "bd-gate", points: "148,36 196,36 206,63 196,90 148,90 138,63" }),
    svgEl("text", { class: "bd-title", x: 154, y: 67, text: gateTxt }),
    svgEl("path", { class: "bd-edge", d: "M206,63 L230,63", "marker-end": "url(#arch-arrow)" }),
    svgEl("rect", { class: "bd-box", x: 234, y: 38, width: 118, height: 50, rx: 6 }),
    svgEl("rect", { class: "bd-bar", x: 234, y: 38, width: 118, height: 5, rx: 3 }),
    svgEl("text", { class: "bd-title", x: 242, y: 58, text: optTxt }),
    svgEl("text", { class: "bd-sub", x: 242, y: 76, text: doesTxt }),
    svgEl("path", { class: "bd-edge", d: "M352,52 C374,52 374,28 394,28", "marker-end": "url(#arch-arrow)" }),
    svgEl("path", { class: "bd-edge", d: "M352,74 C374,74 374,98 394,98", "marker-end": "url(#arch-arrow)" }),
    svgEl("g", { class: "bd-pro" },
      svgEl("rect", { class: "bd-box", x: 398, y: 8, width: 134, height: 42, rx: 6 }),
      svgEl("text", { class: "bd-sub", x: 405, y: 23, text: "UNBLOCKS" }),
      svgEl("text", { class: "bd-title", x: 405, y: 39, text: scopeTxt })),
    svgEl("g", { class: "bd-con" },
      svgEl("rect", { class: "bd-box", x: 398, y: 76, width: 134, height: 42, rx: 6 }),
      svgEl("text", { class: "bd-sub", x: 405, y: 91, text: "COST" }),
      svgEl("text", { class: "bd-title", x: 405, y: 107, text: consTxt })));
}
function renderParallelLanesSvg(d, opts, label) {
  const list = Array.isArray(opts) ? opts : [];
  if (!list.length) return null;
  const LH = 54, GAP = 10, PY = 10, W = 540;
  const H = PY * 2 + list.length * LH + (list.length - 1) * GAP;
  const gy = Math.round(H / 2);
  const svg = svgEl("svg", { class: "parallel-lanes-svg", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": label || "Parallel option lanes" },
    svgEl("title", { text: label || "Parallel option lanes" }),
    svgEl("defs", null, svgEl("marker", { id: "lane-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" },
      svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: "bd-arrow" }))),
    svgEl("polygon", { class: "bd-gate", points: "18," + (gy - 22) + " 78," + (gy - 22) + " 90," + gy + " 78," + (gy + 22) + " 18," + (gy + 22) + " 6," + gy }),
    svgEl("text", { class: "bd-title", x: 24, y: gy + 4, text: clip(d.id || "Gate", 8) }));
  list.forEach((o, idx) => {
    const y = PY + idx * (LH + GAP), cy = y + Math.round(LH / 2);
    svg.append(
      svgEl("path", { class: "bd-edge" + (o.recommended ? " bd-edge-rec" : ""), d: "M90," + gy + " C118," + gy + " 118," + cy + " 144," + cy, "marker-end": "url(#lane-arrow)" }),
      svgEl("g", { class: "lane-opt" + (o.recommended ? " bd-pro" : ""), transform: "translate(148," + y + ")" },
        svgEl("rect", { class: "bd-box", width: 382, height: LH, rx: 6 }),
        svgEl("rect", { class: "bd-bar", width: 5, height: LH, rx: 2 }),
        svgEl("text", { class: "bd-title", x: 12, y: 20, text: (idx + 1) + ". " + clip(o.label, 24) + (o.recommended ? " (Recommended)" : "") }),
        svgEl("text", { class: "bd-sub", x: 12, y: 39, text: "Pros: " + clip(o.pros || o.does || "-", 20) + " \u00b7 Cons: " + clip(o.cons || o.tradeoff || "-", 18) })));
  });
  return svg;
}
function renderMiniStageGraph(d) {
  const held = (d.holds && d.holds.length) ? "Stage " + d.holds.join(", ") : (d.now || "Held Stage");
  const blk = (d.blocks && d.blocks.length) ? "Unblocks " + d.blocks.join(", ") : (d.ticket ? "Ticket " + d.ticket : "Downstream");
  return svgEl("svg", { class: "mini-stage-graph", viewBox: "0 0 540 44", role: "img", "aria-label": "Stage context strip for " + d.id },
    svgEl("title", { text: "Mini stage graph for " + d.id }),
    svgEl("g", { class: "bd-pro" },
      svgEl("rect", { class: "bd-box", x: 6, y: 5, width: 146, height: 34, rx: 5 }),
      svgEl("text", { class: "bd-title", x: 14, y: 26, text: "Upstream Stage [x]" })),
    svgEl("path", { class: "bd-edge", d: "M152,22 L186,22" }),
    svgEl("g", { class: "bd-con" },
      svgEl("rect", { class: "bd-box", x: 190, y: 5, width: 162, height: 34, rx: 5 }),
      svgEl("text", { class: "bd-title", x: 198, y: 26, text: clip(held + " [? " + d.id + "]", 22) })),
    svgEl("path", { class: "bd-edge", d: "M352,22 L386,22" }),
    svgEl("g", null,
      svgEl("rect", { class: "bd-box", x: 390, y: 5, width: 144, height: 34, rx: 5 }),
      svgEl("text", { class: "bd-title", x: 398, y: 26, text: clip(blk, 20) })));
}
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
const blank = () => ({ choice: "", custom: "", clarification: "", notes: "", skipped: false });
let st = { answers: Object.create(null), owner: "", reviewed: false, finalizedAt: null, step: 0, imported: false, viewMode: "flow", search: "" };
let storageOk = true;
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const v = JSON.parse(raw); if (v && typeof v === "object" && v.answers) st = Object.assign(st, v); } }
  catch (e) { storageOk = false; }
  for (const d of SET.decisions) st.answers[d.id] = Object.assign(blank(), st.answers[d.id] || {});
  st.step = Math.min(Math.max(0, st.step | 0), SET.decisions.length);
  if (!st.viewMode) st.viewMode = "flow";
}
function save(quiet) {
  try { localStorage.setItem(KEY, JSON.stringify(st)); storageOk = true; if (!quiet) say("Draft saved in this browser."); }
  catch (e) { storageOk = false; say("Could not save in this browser (" + (e && e.name || "storage error") + "). Use Download draft JSON to keep your answers."); }
}
function say(m) { $("status").textContent = ""; setTimeout(() => { $("status").textContent = m; }, 30); }
function statusOf(d) {
  const a = st.answers[d.id];
  if (a.choice === "defer" || a.choice === "explain") return a.clarification.trim() ? "deferred" : "incomplete";
  if (a.choice === "custom") return a.custom.trim() ? "custom-review-required" : "incomplete";
  if (a.choice && d.options.some(o => o.id === a.choice)) return "answered";
  return "incomplete";
}
const LABEL = { "answered": "Answered", "custom-review-required": "Custom - needs review", "deferred": "Ask / Explain in next HTML", "incomplete": "Not answered" };
const GLYPH = { "answered": "\u2713", "custom-review-required": "\u270e", "deferred": "\u23f8", "incomplete": "\u00b7" };
function unapprove() { if (st.reviewed || st.finalizedAt) { st.reviewed = false; st.finalizedAt = null; say("An answer changed, so the review approval was cleared."); } }

function header() {
  $("setid").textContent = SET.id; $("title").textContent = SET.title || SET.id;
  document.title = "Decisions - " + (SET.title || SET.id);
  const n = SET.decisions.length, done = SET.decisions.filter(d => statusOf(d) !== "incomplete").length;
  $("bar").style.width = (n ? (done / n) * 100 : 100) + "%";
  $("progress-text").textContent = done + " of " + n + " decisions have a response" + (st.finalizedAt ? " \u00b7 finalized" : st.reviewed ? " \u00b7 reviewed, not finalized" : " \u00b7 nothing is approved until you finalize");
  const ol = $("steps"); ol.textContent = "";
  const q = String(st.search || "").trim().toLowerCase();
  SET.decisions.forEach((d, i) => {
    const s = statusOf(d);
    const match = !q || [d.id, d.ticket, d.header, d.question, d.scope].some(v => String(v || "").toLowerCase().includes(q));
    if (!match) return;
    ol.append(el("li", null, el("button", { type: "button", "aria-current": st.step === i ? "step" : null, "aria-label": d.id + ", " + LABEL[s], onclick: () => go(i) },
      el("span", { class: "st", "aria-hidden": "true", text: GLYPH[s] }), " " + d.id)));
  });
  ol.append(el("li", null, el("button", { type: "button", "aria-current": st.step === n ? "step" : null, onclick: () => go(n) }, "Review")));
}

function go(i) {
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

function buildBlastChips(d) {
  const files = Array.isArray(d.files) ? d.files : [];
  const holds = Array.isArray(d.holds) ? d.holds : [];
  const blocks = Array.isArray(d.blocks) ? d.blocks : (d.ticket ? [d.ticket] : []);
  return el("div", { class: "blast-radius-chips", "aria-label": "Blast radius summary" },
    el("span", { class: "br-chip", text: files.length ? (files.length + " file" + (files.length === 1 ? "" : "s") + " impacted") : (d.scope || "Scope in run file") }),
    holds.length ? el("span", { class: "br-chip br-hold", text: "holds stage " + holds.join(", ") }) : null,
    blocks.length ? el("span", { class: "br-chip br-ticket", text: "blocks " + blocks.join(", ") }) : null);
}

function buildComparisonMatrix(d, a, onPick) {
  const opts = d.options || [];
  const headRow = el("tr", null,
    el("th", { scope: "col", text: "Attribute" }),
    opts.map((o, idx) => el("th", { scope: "col", class: a.choice === o.id ? "col-active" : null, text: (idx + 1) + ". " + o.label })));
  const rowOf = (title, fn) => el("tr", null,
    el("th", { scope: "row", text: title }),
    opts.map(o => el("td", { class: a.choice === o.id ? "col-active" : null }, fn(o))));
  const tbl = el("table", { class: "comparison-matrix" },
    el("caption", { text: "Side-by-side option comparison for " + d.id }),
    el("thead", null, headRow),
    el("tbody", null,
      rowOf("Action / Does", o => o.explain || o.does || "-"),
      rowOf("Pros", o => o.pros || o.does || "-"),
      rowOf("Cons & Trade-offs", o => o.cons || o.tradeoff || "-"),
      rowOf("Blast Radius", o => o.consequence || d.scope || "Unblocks downstream work"),
      rowOf("Recommendation", o => o.recommended ? el("strong", { text: "Recommended" }) : "-"),
      rowOf("Selection", (o, idx) => el("button", {
        type: "button",
        class: "btn-select-opt" + (a.choice === o.id ? " active" : ""),
        onclick: () => onPick(o.id),
        text: a.choice === o.id ? "Selected [" + (idx + 1) + "]" : "Select Option " + (idx + 1) + " [" + (idx + 1) + "]",
      }))));
  return el("div", { class: "comparison-matrix-wrap" }, tbl);
}

function stepView(d, i) {
  const a = st.answers[d.id], n = SET.decisions.length;
  const rec = d.options.find(o => o.recommended);
  const ctx = [["What exists now", d.now], ["Why it matters", d.why], ["Scope", d.scope]].filter(([, v]) => v);
  const name = "q-" + d.id;
  const isDefer = () => a.choice === "defer" || a.choice === "explain";
  const selectChoice = (id) => {
    a.choice = id; a.skipped = false; unapprove(); save(true); render();
  };
  const opt = (id, labelKids, meta, extra, extraKids) => {
    const checkedVal = (id === "defer" ? isDefer() : a.choice === id) || null;
    const inp = el("input", { type: "radio", name, value: id, id: name + "-" + id, checked: checkedVal,
      onchange: () => { a.choice = id; a.skipped = false; unapprove(); save(true); refreshPreview(); header(); toggleNeeds(); } });
    return el("label", { class: "opt" + (extra ? " alt" : ""), for: name + "-" + id }, inp,
      el("span", null, labelKids, meta ? el("span", { class: "meta", text: meta }) : null, extraKids || null));
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
  const deferNeed = el("div", { class: "need", hidden: !isDefer() || null },
    el("label", { class: "blk", for: deferTa.id, text: "What to explain or discuss in the next HTML (required)" }), deferTa, el("p", { class: "err", id: name + "-defer-err", "aria-live": "polite" }));
  function toggleNeeds() { customNeed.hidden = a.choice !== "custom"; deferNeed.hidden = !isDefer(); }
  const choiceErr = el("p", { class: "err", id: name + "-err", "aria-live": "polite" });
  const fs = el("fieldset", { "aria-describedby": name + "-err" },
    el("legend", { text: "Your answer (press 1-9 for quick pick)" }),
    d.options.map((o, idx) => {
      const pros = o.pros || o.does || "", cons = o.cons || o.tradeoff || "";
      const pc = (pros || cons) ? el("span", { class: "pros-cons" },
        pros ? el("span", { class: "pro-card" }, el("strong", { class: "pc-k", text: "Pros:" }), pros) : null,
        cons ? el("span", { class: "con-card" }, el("strong", { class: "pc-k", text: "Cons:" }), cons) : null) : null;
      return opt(o.id,
        [el("span", { class: "lbl", text: (idx + 1) + ". " + o.label }), o.recommended ? el("span", { class: "tag", text: "Recommended" }) : null],
        [o.does && "Does: " + o.does, o.tradeoff && "Trade-off: " + o.tradeoff].filter(Boolean).join(" \u00b7 "),
        false,
        [o.explain ? el("span", { class: "opt-explain", text: "What this action does: " + o.explain }) : null, pc]);
    }),
    opt("custom", el("span", { class: "lbl", text: "Something else - I'll describe it" }), "Recorded verbatim; can be finalized and carried forward into the next wizard round.", true),
    customNeed,
    opt("defer", el("span", { class: "lbl", text: "Ask / Explain more - generate detailed explanation in next HTML" }), "Ask a question or request a deeper explanation; finalizes and carries forward to the next wizard round.", true),
    deferNeed, choiceErr);
  const preview = el("aside", { class: "preview", "aria-live": "polite", "aria-label": "What your choice leads to" });
  function refreshPreview() {
    preview.textContent = "";
    preview.append(el("h3", { text: "If you choose this" }));
    const o = d.options.find(x => x.id === a.choice);
    const flow = el("ol", { class: "flow" });
    if (o) {
      const archSvg = renderArchitecturalSvg(d, o, "Architectural flow for " + o.label);
      if (archSvg) preview.append(archSvg);
      const diagItems = o.diagram ? normDiag(o.diagram) : [
        { title: o.label, subtitle: o.explain || "Action", kind: "action" },
        ...(o.pros || o.does ? [{ title: "Pros", subtitle: o.pros || o.does, kind: "pro" }] : []),
        ...(o.cons || o.tradeoff ? [{ title: "Cons", subtitle: o.cons || o.tradeoff, kind: "con" }] : []),
        ...(o.consequence ? [{ title: "Outcome", subtitle: o.consequence, kind: "flow" }] : []),
      ];
      const svg = renderBlockDiagram(diagItems, "Action flow for " + o.label);
      if (svg) preview.append(svg);
      flow.append(el("li", { class: "pick" }, el("span", { class: "k", text: "Choice" }), o.label));
      if (o.explain) flow.append(el("li", null, el("span", { class: "k", text: "What this action does" }), o.explain));
      if (o.does || o.pros) flow.append(el("li", { class: "pro" }, el("span", { class: "k", text: "Pros (What it does)" }), o.pros || o.does));
      if (o.tradeoff || o.cons) flow.append(el("li", { class: "cost" }, el("span", { class: "k", text: "Cons (What it costs)" }), o.cons || o.tradeoff));
      if (o.consequence) flow.append(el("li", { class: "then" }, el("span", { class: "k", text: "Then" }), o.consequence));
    } else if (a.choice === "custom") {
      const svg = renderBlockDiagram([
        { title: "Custom Direction", subtitle: a.custom.trim() || "Describe below", kind: "action" },
        { title: "Export JSON", subtitle: "Finalize allowed", kind: "pro" },
        { title: "Next Round / Build", subtitle: "Reviewed & applied", kind: "flow" },
      ], "Custom direction flow");
      if (svg) preview.append(svg);
      flow.append(el("li", { class: "pick" }, el("span", { class: "k", text: "Your direction" }), a.custom.trim() || "(not written yet)"));
      flow.append(el("li", { class: "then" }, el("span", { class: "k", text: "Then" }), "Sent back as your exact words. You can finalize and download JSON now, or generate the next HTML round."));
    } else if (isDefer()) {
      const svg = renderBlockDiagram([
        { title: "Ask / Explain", subtitle: a.clarification.trim() || "Write question", kind: "action" },
        { title: "Finalize JSON", subtitle: "Download allowed", kind: "pro" },
        { title: "Next HTML Round", subtitle: "Expanded explanation", kind: "flow" },
      ], "Continuous discussion flow");
      if (svg) preview.append(svg);
      flow.append(el("li", { class: "pick" }, el("span", { class: "k", text: "Ask / Explain more" }), a.clarification.trim() || "(what to explain is not written yet)"));
      flow.append(el("li", { class: "then" }, el("span", { class: "k", text: "Then" }), "Finalizing is allowed. Download the JSON and run --next-wizard to generate the next HTML with settled answers saved and this explanation expanded."));
    } else {
      const lanesSvg = renderParallelLanesSvg(d, d.options, "Parallel lanes comparison for " + d.id);
      if (lanesSvg) preview.append(lanesSvg);
      const fallbackDiag = d.diagram ? normDiag(d.diagram) : d.options.map((x, idx) => ({ title: x.label, subtitle: x.does || ("Option " + (idx + 1)), kind: x.recommended ? "pro" : "block" }));
      const svg = renderBlockDiagram(fallbackDiag, "Decision overview diagram");
      if (svg) preview.append(svg);
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
    else if (isDefer()) set(deferTa, deferNeed.querySelector(".err"), a.clarification.trim() ? "" : "Say what needs explaining or discussing, so the next round can answer it.");
    if (first) first.focus();
    return !first;
  }
  const discussBanner = d.discussion ? el("div", { class: "banner discuss-banner" },
    el("h3", { text: "Discussion & Explanation Requested (Round " + (d.discussion.round || 2) + ")" }),
    el("p", { text: (d.discussion.kind === "custom" ? "Your previous custom direction: " : "Your question / explain request: ") + d.discussion.prompt }),
    d.discussion.notes ? el("p", { class: "small muted", text: "Notes from previous round: " + d.discussion.notes }) : null) : null;
  const stepDiag = renderBlockDiagram(d.diagram || d.options.map((x, idx) => ({ title: x.label, subtitle: x.does || ("Option " + (idx + 1)), kind: x.recommended ? "pro" : "block" })), "Block diagram for " + d.id);
  const parallelDiag = renderParallelLanesSvg(d, d.options, "Parallel options for " + d.id);
  const subbar = el("div", { class: "subbar" },
    buildBlastChips(d),
    el("div", { id: "view-mode-toggle", class: "view-toggle", role: "group", "aria-label": "View mode" },
      el("button", { type: "button", "aria-pressed": st.viewMode !== "matrix" ? "true" : "false", onclick: () => { st.viewMode = "flow"; save(true); render(); }, text: "\u2635 Flow View" }),
      el("button", { type: "button", "aria-pressed": st.viewMode === "matrix" ? "true" : "false", onclick: () => { st.viewMode = "matrix"; save(true); render(); }, text: "\u229e Matrix View" })));
  const matrixEl = buildComparisonMatrix(d, a, selectChoice);
  matrixEl.hidden = st.viewMode !== "matrix";
  const left = el("section", { "aria-labelledby": name + "-h" },
    el("p", { class: "ids", text: "Decision " + (i + 1) + " of " + n + " \u00b7 " + d.id + (d.ticket ? " \u00b7 ticket " + d.ticket : "") + (d.header ? " \u00b7 " + d.header : "") }),
    el("h2", { id: name + "-h", text: d.question }),
    subbar,
    renderMiniStageGraph(d),
    discussBanner,
    ctx.length ? el("dl", { class: "ctx" }, ctx.map(([k, v]) => el("div", null, el("dt", { text: k }), el("dd", { text: v })))) : null,
    stepDiag,
    parallelDiag,
    matrixEl,
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

function buildCliCommands() {
  const m = /^RUN-(\d+)$/.exec(String(SET.id || ""));
  const runNum = m ? m[1] : String(SET.id || "1");
  const lines = [];
  for (const d of SET.decisions) {
    const a = st.answers[d.id], o = d.options.find(x => x.id === a.choice);
    const notes = String(a.notes || "").replace(/\s+/g, " ").trim();
    let val = "";
    if (o) val = o.label;
    else if (a.choice === "custom") val = String(a.custom || "").replace(/\s+/g, " ").trim();
    if (!val) continue;
    const full = val + (notes ? " - " + notes : "");
    const quoted = "'" + full.replace(/'/g, "'\\''") + "'";
    lines.push("sh relay-morpheus.sh " + runNum + " answer " + d.id + " " + quoted);
  }
  return lines.length ? lines.join("\n") : "# Answer at least one decision to generate relay-morpheus answer commands";
}

function copyText(txt, btn) {
  const done = () => {
    const orig = btn.textContent;
    btn.textContent = "\u2713 Copied!";
    say("Commands copied to clipboard.");
    setTimeout(() => { btn.textContent = orig; }, 2000);
  };
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
  } else {
    fallbackCopy(txt, done);
  }
}
function fallbackCopy(txt, done) {
  const ta = el("textarea", { style: "position:fixed;left:-9999px" });
  ta.value = txt; document.body.append(ta); ta.select();
  try { document.execCommand("copy"); done(); } catch (e) { say("Copy failed - select the command box text manually."); }
  ta.remove();
}

function review() {
  const n = SET.decisions.length;
  const counts = { answered: 0, custom: 0, deferred: 0, incomplete: 0 };
  const allFiles = new Set(), allStages = new Set(), allTickets = new Set();
  const rows = SET.decisions.map((d, i) => {
    const a = st.answers[d.id], s = statusOf(d), o = d.options.find(x => x.id === a.choice);
    if (s === "answered") counts.answered++;
    else if (s === "custom-review-required") counts.custom++;
    else if (s === "deferred") counts.deferred++;
    else counts.incomplete++;
    for (const f of d.files || []) allFiles.add(f);
    for (const h of d.holds || []) allStages.add(h);
    for (const b of d.blocks || []) allTickets.add(b);
    if (d.ticket) allTickets.add(d.ticket);
    const isDefer = a.choice === "defer" || a.choice === "explain";
    const what = o ? o.label : a.choice === "custom" ? "Custom: " + (a.custom || "(empty)") : isDefer ? "Ask / Explain more: " + (a.clarification || "(empty)") : "No answer";
    return el("li", null,
      el("div", null, el("strong", { text: d.id + " - " + d.question }), el("span", { class: "badge b-" + s, text: LABEL[s] })),
      el("div", { text: what }), a.notes ? el("div", { class: "muted", text: "Notes: " + a.notes }) : null,
      el("button", { type: "button", class: "secondary", onclick: () => go(i), "aria-label": "Edit " + d.id }, "Edit"));
  });
  const dashboard = el("div", { class: "dashboard-summary", "aria-label": "Decision summary metrics" },
    el("div", { class: "metric-card" }, el("b", { class: "b-answered", text: String(counts.answered) }), el("span", { text: "Answered" })),
    el("div", { class: "metric-card" }, el("b", { class: "b-custom-review-required", text: String(counts.custom) }), el("span", { text: "Custom Directions" })),
    el("div", { class: "metric-card" }, el("b", { class: "b-deferred", text: String(counts.deferred) }), el("span", { text: "Deferred / Explain" })),
    el("div", { class: "metric-card" }, el("b", { class: "b-incomplete", text: String(counts.incomplete) }), el("span", { text: "Incomplete" })));
  const blastCard = el("div", { class: "blast-summary-card" },
    el("strong", { text: "Aggregated Blast Radius: " }),
    allFiles.size + " file" + (allFiles.size === 1 ? "" : "s") + " \u00b7 " +
    allStages.size + " held stage" + (allStages.size === 1 ? "" : "s") + " \u00b7 " +
    allTickets.size + " ticket" + (allTickets.size === 1 ? "" : "s"));
  const cmdText = buildCliCommands();
  const copyBtn = el("button", { type: "button", id: "btn-copy-cmds", class: "copy-cmds", onclick: () => copyText(cmdText, copyBtn), text: "Copy CLI commands" });
  const cmdSection = el("div", { class: "cmd-section" },
    el("div", { class: "cmd-head" }, el("strong", { text: "relay-morpheus answer commands" }), copyBtn),
    el("pre", { class: "cmd-box" }, el("code", { text: cmdText })));
  const blockers = SET.decisions.filter(d => statusOf(d) === "incomplete");
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
      : st.finalizedAt ? "Finalized " + st.finalizedAt + " by " + st.owner + ". Share the downloaded JSON in the working conversation (or pass it to --next-wizard for continuous discussion)."
      : "Every decision has a response (options, custom directions, and Ask / Explain requests can all be finalized). Add your name and confirm to finalize.";
  }
  function finalize() {
    finErr.textContent = "";
    if (blockers.length) { finErr.textContent = "Provide a response for every decision first - unanswered ones block finalizing."; return go(SET.decisions.indexOf(blockers[0])); }
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
    dashboard,
    blastCard,
    st.imported ? el("p", { class: "banner warn", text: "These answers were imported from a file. Review them again before finalizing." }) : null,
    state, el("ol", null, rows),
    cmdSection,
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
    round: Number(SET.round) || 1,
    exportedAt: new Date().toISOString(), finalizedAt: final ? st.finalizedAt : null, final: !!final,
    owner: st.owner, reviewed: final ? st.reviewed : false,
    answers: SET.decisions.map(d => {
      const a = st.answers[d.id], o = d.options.find(x => x.id === a.choice);
      const isDefer = a.choice === "defer" || a.choice === "explain";
      return { id: d.id, ticket: d.ticket || "", question: d.question, status: statusOf(d),
        choice: o ? { id: o.id, label: o.label, does: o.does || "", tradeoff: o.tradeoff || "" } : a.choice === "custom" ? { id: "custom" } : isDefer ? { id: "defer" } : null,
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
    const rawCid = a.choice && a.choice.id;
    if (rawCid != null && typeof rawCid !== "string") bad(a.id + ": choice id must be text");
    const cid = rawCid === "explain" ? "defer" : rawCid;
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
  st = { answers: {}, owner: "", reviewed: false, finalizedAt: null, step: 0, imported: false, viewMode: "flow", search: "" };
  for (const d of SET.decisions) st.answers[d.id] = blank();
  try { localStorage.removeItem(KEY); } catch (e) {}
  save(true); go(0); say("Started fresh.");
});
$("decision-search").addEventListener("input", (e) => {
  st.search = e.target.value || "";
  header();
});
$("btn-shortcuts").addEventListener("click", () => {
  const dlg = $("shortcuts-dlg");
  if (dlg && typeof dlg.showModal === "function") dlg.showModal();
});
document.addEventListener("keydown", (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
    if (e.key === "Escape") document.activeElement.blur();
    return;
  }
  if (e.key === "/") {
    e.preventDefault(); $("decision-search").focus();
  } else if (e.key === "?") {
    e.preventDefault();
    const dlg = $("shortcuts-dlg");
    if (dlg && typeof dlg.showModal === "function") dlg.showModal();
  } else if (e.key === "[" || (e.altKey && e.key === "ArrowLeft")) {
    e.preventDefault(); if (st.step > 0) go(st.step - 1);
  } else if (e.key === "]" || (e.altKey && e.key === "ArrowRight")) {
    e.preventDefault(); if (st.step < SET.decisions.length) go(st.step + 1);
  } else if (/^[1-9]$/.test(e.key) && st.step < SET.decisions.length) {
    const d = SET.decisions[st.step];
    const idx = Number(e.key) - 1;
    if (d && d.options && d.options[idx]) {
      st.answers[d.id].choice = d.options[idx].id;
      st.answers[d.id].skipped = false;
      unapprove(); save(true); render();
    }
  }
});

load(); render();
if (!storageOk) say("This browser is not saving drafts for this page. Use Download draft JSON to keep your answers.");
})();`;
