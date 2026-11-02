// holo-r2d2 understand mode: interactive architecture & causal knowledge-graph
// explorer inspired by Understand-Anything, built strictly from the relay run
// file (and optional design file). Self-contained offline HTML + inline SVG -
// zero external scripts, fonts, or network requests; zero DOM HTML parsing.

const str = (v) => (v == null ? "" : String(v));
const escH = (s) => str(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clip = (s, n) => { s = str(s).trim(); return s.length > n ? s.slice(0, n - 1) + "\u2026" : s; };
const embed = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const ASKABLE = new Set(["open", "asked"]);

function topModule(p) {
  const clean = str(p).replace(/\\/g, "/").replace(/^\.\//, "");
  const parts = clean.split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join("/") : "root";
}

export function extractDomainGraph(run, design = null) {
  const nodes = [];
  const edges = [];
  const fileMap = new Map();
  const ticketMap = new Map();

  const ensureFile = (f) => {
    const clean = str(f).trim();
    if (!clean || clean === "-") return null;
    if (!fileMap.has(clean)) {
      const node = {
        id: "file:" + clean,
        key: clean,
        kind: "file",
        label: clean.split("/").pop() || clean,
        path: clean,
        module: topModule(clean),
        state: "file",
        stages: [],
        decisions: [],
        why: `Touched in module ${topModule(clean)} during run ${run?.id || "design"}.`,
      };
      fileMap.set(clean, node);
    }
    return fileMap.get(clean);
  };

  const ensureTicket = (t) => {
    const clean = str(t).trim();
    if (!clean || clean === "-") return null;
    if (!ticketMap.has(clean)) {
      const node = {
        id: "ticket:" + clean,
        key: clean,
        kind: "ticket",
        label: clean,
        state: "ticket",
        stages: [],
        decisions: [],
        why: `Target ticket ${clean} tracked across pipeline stages and decision gates.`,
      };
      ticketMap.set(clean, node);
    }
    return ticketMap.get(clean);
  };

  if (run) {
    for (const s of run.stages || []) {
      const sid = "stage-" + s.n;
      const waitsTxt = (s.waits && s.waits.length) ? ` Held by ${s.waits.join(", ")}.` : "";
      const filesTxt = (s.files && s.files.length) ? ` Modifies ${s.files.length} file${s.files.length === 1 ? "" : "s"}.` : " No explicit files listed.";
      nodes.push({
        id: sid,
        n: s.n,
        code: str(s.code),
        kind: "stage",
        label: `#${s.n}${s.code ? " " + s.code : ""} ${s.name}`,
        name: str(s.name),
        state: str(s.state || "pending"),
        owner: str(s.owner || "-"),
        landed: str(s.landed || "-"),
        files: [...(s.files || [])],
        tickets: [...(s.tickets || [])],
        after: [...(s.after || [])],
        waits: [...(s.waits || [])],
        why: `Stage ${s.n} (${s.state || "pending"}): ${s.name}.${waitsTxt}${filesTxt}`,
      });
      for (const a of s.after || []) {
        edges.push({ from: "stage-" + a, to: sid, kind: "after", label: "after" });
      }
      for (const imp of s.implicit || []) {
        edges.push({ from: "stage-" + imp, to: sid, kind: "implicit", label: "final convention" });
      }
      if (s.replacedBy) {
        edges.push({ from: sid, to: "stage-" + s.replacedBy, kind: "replaced", label: "replanned to" });
      }
      for (const f of s.files || []) {
        const fn = ensureFile(f);
        if (fn) {
          if (!fn.stages.includes(s.n)) fn.stages.push(s.n);
          edges.push({ from: sid, to: fn.id, kind: "touches", label: "modifies" });
        }
      }
      for (const t of s.tickets || []) {
        const tn = ensureTicket(t);
        if (tn) {
          if (!tn.stages.includes(s.n)) tn.stages.push(s.n);
          edges.push({ from: sid, to: tn.id, kind: "implements", label: "delivers" });
        }
      }
    }

    for (const q of run.qs || []) {
      const qNode = {
        id: q.id,
        nodeId: "decision-" + q.id,
        kind: "decision",
        label: `${q.id}: ${q.f?.header || clip(q.f?.question || q.id, 28)}`,
        question: str(q.f?.question || ""),
        header: str(q.f?.header || q.id),
        state: str(q.state || "open"),
        reason: str(q.f?.reason || ""),
        ticket: str(q.f?.ticket || ""),
        holds: [...(q.holds || [])],
        blocks: [...(q.blocks || [])],
        files: [...(q.files || [])],
        options: (q.options || []).map((o) => ({
          label: str(o.label),
          does: str(o.does),
          hurts: str(o.hurts),
          recommended: !!o.rec,
        })),
        why: str(q.f?.reason)
          ? `Decision gate ${q.id} (${q.state}): ${q.f.reason}. ${q.holds?.length ? "Holds stage " + q.holds.join(", ") + "." : "No stages currently held."}`
          : `Decision gate ${q.id} (${q.state}): ${q.f?.question || "Owner decision point"}.`,
      };
      nodes.push(qNode);
      for (const h of q.holds || []) {
        edges.push({ from: q.id, to: "stage-" + h, kind: "holds", label: "holds stage" });
      }
      for (const f of q.files || []) {
        const fn = ensureFile(f);
        if (fn) {
          if (!fn.decisions.includes(q.id)) fn.decisions.push(q.id);
          edges.push({ from: q.id, to: fn.id, kind: "touches", label: "impacts file" });
        }
      }
      const allTickets = new Set([...(q.blocks || []), ...(q.f?.ticket ? [q.f.ticket] : [])]);
      for (const b of allTickets) {
        for (const tid of str(b).match(/\b[A-Z]{1,3}\d+[a-z]?\b/g) || []) {
          const tn = ensureTicket(tid);
          if (tn) {
            if (!tn.decisions.includes(q.id)) tn.decisions.push(q.id);
            edges.push({ from: q.id, to: tn.id, kind: "blocks", label: "gates ticket" });
          }
        }
      }
    }
  }

  for (const fn of fileMap.values()) {
    fn.why = `Module ${fn.module}: touched by stage${fn.stages.length === 1 ? "" : "s"} ${fn.stages.join(", ") || "none"}${fn.decisions.length ? " and gated by " + fn.decisions.join(", ") : ""}.`;
    nodes.push(fn);
  }
  for (const tn of ticketMap.values()) {
    tn.why = `Ticket ${tn.label}: worked in stage${tn.stages.length === 1 ? "" : "s"} ${tn.stages.join(", ") || "none"}${tn.decisions.length ? ", gated by decision " + tn.decisions.join(", ") : ""}.`;
    nodes.push(tn);
  }

  if (design && Array.isArray(design.parts)) {
    design.parts.forEach((p, idx) => {
      nodes.push({
        id: "design-" + (idx + 1),
        kind: "design",
        label: `${idx + 1}. ${p.name}`,
        state: "design",
        why: p.lead || `Design section ${idx + 1} (${p.subs?.length || 0} subsections, ${p.bullets || 0} points).`,
      });
    });
  }

  const stageNodes = nodes.filter((n) => n.kind === "stage");
  const decisionNodes = nodes.filter((n) => n.kind === "decision");
  const fileNodes = nodes.filter((n) => n.kind === "file");
  const ticketNodes = nodes.filter((n) => n.kind === "ticket");

  const landedIds = stageNodes.filter((s) => s.state === "landed").map((s) => s.id);
  const openDecisionIds = decisionNodes.filter((d) => ASKABLE.has(d.state)).map((d) => d.id);
  const heldStageIds = stageNodes.filter((s) => s.state === "parked" || (s.waits && s.waits.length)).map((s) => s.id);
  const pendingIds = stageNodes.filter((s) => s.state === "pending" || s.state === "inflight").map((s) => s.id);

  const tour = [
    {
      step: 1,
      title: "1. Run Goal & Scope",
      body: `${run?.id || "Design"} (${run?.title || design?.title || "Architecture Explorer"}) spans ${stageNodes.length} pipeline stage${stageNodes.length === 1 ? "" : "s"}, ${fileNodes.length} file${fileNodes.length === 1 ? "" : "s"}, ${ticketNodes.length} ticket${ticketNodes.length === 1 ? "" : "s"}, and ${decisionNodes.length} decision gate${decisionNodes.length === 1 ? "" : "s"}.`,
      focusKinds: ["stage", "decision", "file", "ticket"],
      focusIds: [],
    },
    {
      step: 2,
      title: "2. Landed Foundations",
      body: landedIds.length
        ? `${landedIds.length} stage${landedIds.length === 1 ? " has" : "s have"} already landed and verified their changes into the run baseline.`
        : "No stages have landed yet; the pipeline is at its starting gates.",
      focusKinds: ["stage"],
      focusIds: landedIds,
    },
    {
      step: 3,
      title: "3. Active Gates & Decisions",
      body: openDecisionIds.length
        ? `${openDecisionIds.length} open owner decision${openDecisionIds.length === 1 ? "" : "s"} (${openDecisionIds.join(", ")}) currently hold ${heldStageIds.length} downstream stage${heldStageIds.length === 1 ? "" : "s"}. Click any gate node to inspect its blast radius.`
        : "Zero open decision gates are blocking the pipeline.",
      focusKinds: ["decision"],
      focusIds: [...openDecisionIds, ...heldStageIds],
    },
    {
      step: 4,
      title: "4. Pending Pipeline",
      body: pendingIds.length
        ? `${pendingIds.length} stage${pendingIds.length === 1 ? " is" : "s are"} queued or in flight along the execution dependency chain.`
        : "All pipeline stages have reached a terminal or parked state.",
      focusKinds: ["stage"],
      focusIds: pendingIds,
    },
    {
      step: 5,
      title: "5. Architectural File & Ticket Map",
      body: `${fileNodes.length} file${fileNodes.length === 1 ? "" : "s"} across ${new Set(fileNodes.map((f) => f.module)).size || 1} module group${new Set(fileNodes.map((f) => f.module)).size === 1 ? "" : "s"} connect to ${ticketNodes.length} ticket${ticketNodes.length === 1 ? "" : "s"}. Select any file or ticket to trace its upstream stage and decision conduits.`,
      focusKinds: ["file", "ticket"],
      focusIds: [...fileNodes.map((f) => f.id), ...ticketNodes.map((t) => t.id)],
    },
  ];

  const summary = {
    runId: run?.id || "DESIGN",
    title: run?.title || design?.title || "Architecture & Causal Graph",
    stageCount: stageNodes.length,
    fileCount: fileNodes.length,
    ticketCount: ticketNodes.length,
    decisionCount: decisionNodes.length,
    openDecisionCount: openDecisionIds.length,
  };

  return { nodes, edges, summary, tour };
}

function renderConduitSchematic(graph) {
  const stages = graph.nodes.filter((n) => n.kind === "stage");
  const decisions = graph.nodes.filter((n) => n.kind === "decision");
  const files = graph.nodes.filter((n) => n.kind === "file");
  const tickets = graph.nodes.filter((n) => n.kind === "ticket");

  const NW = 188, NH = 56, GX = 32, PX = 24;
  const lanes = [
    { key: "stages", label: "LANE 1 \u00b7 PIPELINE STAGES", y: 52, items: stages },
    { key: "gates", label: "LANE 2 \u00b7 DECISION GATES", y: 172, items: decisions },
    { key: "files", label: "LANE 3 \u00b7 FILES & MODULES", y: 292, items: files },
    { key: "tickets", label: "LANE 4 \u00b7 TARGET TICKETS", y: 412, items: tickets },
  ];

  const maxCols = Math.max(1, ...lanes.map((l) => l.items.length));
  const W = Math.max(820, PX * 2 + maxCols * NW + Math.max(0, maxCols - 1) * GX);
  const H = 504;

  const pos = new Map();
  for (const lane of lanes) {
    lane.items.forEach((item, idx) => {
      pos.set(item.id, { x: PX + idx * (NW + GX), y: lane.y, lane: lane.key });
    });
  }

  const laneBands = lanes.map((l) =>
    `<g class="lane lane-${l.key}">` +
    `<rect class="lane-bg" x="8" y="${l.y - 26}" width="${W - 16}" height="${NH + 38}" rx="8"/>` +
    `<text class="lane-title" x="${PX}" y="${l.y - 9}">${escH(l.label)} (${l.items.length})</text>` +
    `</g>`
  ).join("");

  const edgePaths = graph.edges.map((e, idx) => {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) return "";
    let d = "";
    if (a.y === b.y) {
      const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2;
      const mx = (x1 + x2) / 2;
      d = x2 >= x1
        ? `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
        : `M${a.x + NW / 2},${a.y + NH} C${a.x + NW / 2},${a.y + NH + 24} ${b.x + NW / 2},${b.y + NH + 24} ${b.x + NW / 2},${b.y + NH}`;
    } else {
      const x1 = a.x + NW / 2, y1 = a.y < b.y ? a.y + NH : a.y;
      const x2 = b.x + NW / 2, y2 = a.y < b.y ? b.y : b.y + NH;
      const my = (y1 + y2) / 2;
      d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
    }
    return `<path class="conduit-path edge-${escH(e.kind)}" data-edge-idx="${idx}" data-from="${escH(e.from)}" data-to="${escH(e.to)}" data-kind="${escH(e.kind)}" d="${d}" marker-end="url(#conduit-arrow)"/>`;
  }).join("");

  const nodeGroups = graph.nodes.map((n) => {
    const p = pos.get(n.id);
    if (!p) return "";
    const sub = n.kind === "stage"
      ? `${n.state} \u00b7 ${n.files.length} file${n.files.length === 1 ? "" : "s"}`
      : n.kind === "decision"
      ? `${n.state} \u00b7 holds ${n.holds.length || 0}`
      : n.kind === "file"
      ? `module: ${n.module}`
      : n.kind === "ticket"
      ? `${n.stages.length} stage${n.stages.length === 1 ? "" : "s"}`
      : n.state;
    const shape = n.kind === "decision"
      ? `<polygon class="node-box" points="10,0 ${NW - 10},0 ${NW},14 ${NW},${NH - 14} ${NW - 10},${NH} 10,${NH} 0,${NH - 14} 0,14"/>`
      : `<rect class="node-box" width="${NW}" height="${NH}" rx="8"/>`;
    return `<g class="u-node kind-${escH(n.kind)} state-${escH(n.state)}" tabindex="0" role="button" aria-label="${escH(n.label)} (${escH(n.kind)})" data-node-id="${escH(n.id)}" data-kind="${escH(n.kind)}" transform="translate(${p.x},${p.y})">` +
      `<title>${escH(n.why || n.label)}</title>` +
      shape +
      `<circle class="state-lamp" cx="14" cy="18" r="4.5"/>` +
      `<text class="u-title" x="25" y="22">${escH(clip(n.label, 21))}</text>` +
      `<text class="u-sub" x="14" y="42">${escH(clip(sub, 25))}</text>` +
      `</g>`;
  }).join("");

  return `<svg id="understand-svg" class="understand-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="understand-svg-title understand-svg-desc">` +
    `<title id="understand-svg-title">Architecture and Causal Conduit Graph for ${escH(graph.summary.runId)}</title>` +
    `<desc id="understand-svg-desc">Interactive four-lane schematic mapping pipeline stages, decision gates, files, and tickets with causal dependency conduits.</desc>` +
    `<defs><marker id="conduit-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="conduit-arrow"/></marker></defs>` +
    laneBands + edgePaths + nodeGroups + `</svg>`;
}

export function understandPage(run, opts = {}) {
  const graph = extractDomainGraph(run, opts.design || null);
  const s = graph.summary;
  const svg = renderConduitSchematic(graph);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Understand \u00b7 ${escH(s.runId)} - ${escH(s.title)}</title>
<style>${CSS}</style></head>
<body>
<a class="skip" href="#understand-main">Skip to architecture explorer</a>
<header class="understand-head">
  <div class="head-left">
    <span class="run-badge">${escH(s.runId)}</span>
    <h1>${escH(s.title)}</h1>
  </div>
  <div class="filter-bar" role="toolbar" aria-label="Filter graph nodes">
    <button type="button" class="filter-pill active" data-filter="all" aria-pressed="true">All (${graph.nodes.length})</button>
    <button type="button" class="filter-pill" data-filter="stage" aria-pressed="false">Stages (${s.stageCount})</button>
    <button type="button" class="filter-pill" data-filter="decision" aria-pressed="false">Decisions (${s.decisionCount})</button>
    <button type="button" class="filter-pill" data-filter="file" aria-pressed="false">Files (${s.fileCount})</button>
    <button type="button" class="filter-pill" data-filter="ticket" aria-pressed="false">Tickets (${s.ticketCount})</button>
  </div>
  <div class="head-tools">
    <label class="search-wrap" for="understand-search">
      <span class="sr-only">Search nodes</span>
      <input type="search" id="understand-search" placeholder="Search stages, files, Qs (/)" autocomplete="off">
    </label>
    <button type="button" id="btn-tour" class="tour-btn">Guided Tour (5)</button>
  </div>
</header>
<p id="filter-status" class="sr-only" role="status" aria-live="polite"></p>
<main id="understand-main" class="understand-main" tabindex="-1">
  <section id="understand-canvas" class="canvas-pane" aria-label="Causal Conduit Schematic">
    <div class="canvas-scroll">${svg}</div>
    <p id="empty-filter-msg" class="empty-msg" hidden>No matching nodes or decisions for the active filter.</p>
  </section>
  <aside id="node-inspector" class="inspector-pane" aria-live="polite" aria-label="Node Inspector">
    <div class="inspector-head">
      <span id="insp-kind" class="insp-tag">STAGE</span>
      <span id="insp-state" class="insp-state">landed</span>
    </div>
    <h2 id="insp-title">Select a node</h2>
    <div class="why-block">
      <h3>Why it matters</h3>
      <p id="insp-why">Click any stage, decision gate, file, or ticket on the schematic to inspect its causal triggers and downstream blast radius.</p>
    </div>
    <div class="conduit-cols">
      <div>
        <h3>Inbound Causes</h3>
        <div id="insp-inbound" class="inbound-chips"></div>
      </div>
      <div>
        <h3>Outbound Blast Radius</h3>
        <div id="insp-outbound" class="outbound-chips"></div>
      </div>
    </div>
    <div class="insp-actions">
      <button type="button" id="btn-isolate" class="secondary-btn">Isolate connected</button>
      <button type="button" id="btn-reset-view" class="quiet-btn">Reset view</button>
    </div>
  </aside>
</main>
<aside id="guided-tour-deck" class="tour-deck" aria-live="polite" aria-label="Guided Tour">
  <div class="tour-top">
    <span id="tour-step-badge" class="tour-badge">Step 1 of 5</span>
    <button type="button" id="tour-exit" class="quiet-btn" aria-label="Exit Guided Tour">\u2715 Exit</button>
  </div>
  <h3 id="tour-title"></h3>
  <p id="tour-body"></p>
  <div class="tour-nav">
    <button type="button" id="tour-prev" class="secondary-btn">\u2190 Prev</button>
    <button type="button" id="tour-next" class="primary-btn">Next \u2192</button>
  </div>
</aside>
<script type="application/json" id="understand-data">${embed(graph)}</script>
<script>${CLIENT}</script>
</body></html>
`;
}

const DARK_VARS = `
  --bg:#0d1117;--card:#161b22;--ink:#f0f6fc;--muted:#8b949e;--line:#30363d;
  --accent:#58a6ff;--accent-ink:#0d1117;--rec:#3fb950;--rec-bg:#11281a;
  --warn:#f85149;--warn-bg:#321617;--sel:#182c44;--focus:#f0883e;
  --conduit:#484f58;--conduit-active:#58a6ff;--parked:#bc8cff;--parked-bg:#271c3a;
`;

const CSS = `
:root{
  --bg:#f6f8fa;--card:#ffffff;--ink:#1f2328;--muted:#656d76;--line:#d0d7de;
  --accent:#0969da;--accent-ink:#ffffff;--rec:#1a7f37;--rec-bg:#dafbe1;
  --warn:#cf222e;--warn-bg:#ffebe9;--sel:#ddf4ff;--focus:#fd8c73;
  --conduit:#8c959f;--conduit-active:#0969da;--parked:#8250df;--parked-bg:#fbefff;
  --sans:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK_VARS}}}
:root[data-theme="dark"]{${DARK_VARS}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 var(--sans);overflow-x:hidden}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
.skip{position:absolute;left:-999px}.skip:focus{left:16px;top:8px;background:var(--card);padding:8px 12px;z-index:99;border:2px solid var(--focus);border-radius:6px}
.understand-head{position:sticky;top:0;z-index:15;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:var(--card);border-bottom:1px solid var(--line)}
.head-left{display:flex;align-items:center;gap:10px}
.run-badge{font:700 13px/1 var(--mono);background:var(--sel);color:var(--accent);border:1px solid var(--accent);padding:5px 8px;border-radius:6px}
h1{font-size:18px;margin:0;font-weight:700}
.filter-bar{display:flex;flex-wrap:wrap;gap:6px}
.filter-pill,.tour-btn,.primary-btn,.secondary-btn,.quiet-btn,.chip-btn{min-height:44px;padding:6px 12px;border-radius:8px;font:600 13px/1.2 var(--sans);cursor:pointer;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-variant-numeric:tabular-nums}
.filter-pill.active{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.filter-pill:hover,.secondary-btn:hover,.quiet-btn:hover,.chip-btn:hover{border-color:var(--accent)}
.primary-btn,.tour-btn{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.head-tools{display:flex;align-items:center;gap:8px}
#understand-search{min-height:44px;min-width:220px;padding:6px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:14px var(--sans)}
.understand-main{display:grid;grid-template-columns:minmax(540px,1fr) 360px;gap:16px;padding:16px;align-items:start}
@media (max-width:980px){.understand-main{grid-template-columns:1fr}}
.canvas-pane{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;overflow:hidden}
.canvas-scroll{overflow-x:auto}
.understand-svg{display:block;height:auto}
.lane-bg{fill:var(--bg);stroke:var(--line);stroke-width:1}
.lane-title{font:700 11px var(--mono);fill:var(--muted);letter-spacing:.06em}
.conduit-path{fill:none;stroke:var(--conduit);stroke-width:1.75;opacity:.75;transition:stroke .15s,stroke-width .15s,opacity .15s}
.conduit-path.edge-holds,.conduit-path.edge-blocks{stroke:var(--warn);stroke-dasharray:5 3}
.conduit-path.active{stroke:var(--conduit-active);stroke-width:2.8;opacity:1}
.conduit-arrow{fill:var(--conduit)}
.u-node{cursor:pointer;transition:opacity .15s}
.u-node .node-box{fill:var(--card);stroke:var(--line);stroke-width:1.6}
.u-node.selected .node-box{stroke:var(--accent);stroke-width:2.8;fill:var(--sel)}
.u-node.tour-dim{opacity:.2}
.u-title{font:700 12.5px var(--sans);fill:var(--ink)}
.u-sub{font:11px var(--mono);fill:var(--muted)}
.state-lamp{fill:var(--muted)}
.state-landed .state-lamp{fill:var(--rec)}.state-landed .node-box{stroke:var(--rec);fill:var(--rec-bg)}
.state-inflight .state-lamp{fill:var(--focus)}
.state-parked .state-lamp,.kind-decision .state-lamp{fill:var(--parked)}.state-parked .node-box,.kind-decision .node-box{stroke:var(--parked);fill:var(--parked-bg)}
.state-failed .state-lamp{fill:var(--warn)}.state-failed .node-box{stroke:var(--warn);fill:var(--warn-bg)}
.inspector-pane{position:sticky;top:72px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.inspector-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.insp-tag,.insp-state,.tour-badge{font:700 11px var(--mono);text-transform:uppercase;padding:3px 8px;border-radius:6px;background:var(--sel);color:var(--accent)}
#insp-title{font-size:17px;margin:4px 0 12px}
.why-block{background:var(--bg);border-left:3px solid var(--accent);padding:10px 12px;border-radius:6px;margin-bottom:14px}
.why-block h3,.conduit-cols h3{font:700 11px var(--mono);text-transform:uppercase;color:var(--muted);margin:0 0 6px}
.why-block p{margin:0;font-size:14px}
.conduit-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.inbound-chips,.outbound-chips{display:flex;flex-direction:column;gap:6px}
.chip-btn{min-height:36px;text-align:left;padding:5px 8px;font:12px var(--mono)}
.insp-actions{display:flex;gap:8px}
.tour-deck{position:fixed;right:20px;bottom:20px;width:min(400px,calc(100vw - 32px));z-index:20;background:var(--card);border:2px solid var(--accent);border-radius:12px;padding:16px;box-shadow:0 8px 28px rgba(0,0,0,.22)}
.tour-deck[hidden]{display:none}
.tour-top,.tour-nav{display:flex;justify-content:space-between;align-items:center;gap:8px}
#tour-title{margin:10px 0 6px;font-size:16px}
#tour-body{margin:0 0 12px;font-size:14px;color:var(--muted)}
.empty-msg{padding:16px;color:var(--muted);font-weight:600}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;

const CLIENT = String.raw`(() => {
"use strict";
const GRAPH = JSON.parse(document.getElementById("understand-data").textContent);
const $ = (id) => document.getElementById(id);
const el = (tag, attrs, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
};

let activeFilter = "all";
let searchQuery = "";
let selectedId = GRAPH.nodes[0] ? GRAPH.nodes[0].id : null;
let isolatedId = null;
let tourIdx = 0;
let tourOpen = false;

const nodeById = new Map(GRAPH.nodes.map((n) => [n.id, n]));

function selectNode(id) {
  const n = nodeById.get(id);
  if (!n) return;
  selectedId = id;
  $("insp-kind").textContent = n.kind.toUpperCase();
  $("insp-state").textContent = n.state || n.kind;
  $("insp-title").textContent = n.label;
  $("insp-why").textContent = n.why || "";

  const inBox = $("insp-inbound"), outBox = $("insp-outbound");
  inBox.textContent = ""; outBox.textContent = "";
  const inEdges = GRAPH.edges.filter((e) => e.to === id);
  const outEdges = GRAPH.edges.filter((e) => e.from === id);

  if (!inEdges.length) inBox.append(el("span", { class: "u-sub", text: "None (entry point)" }));
  for (const e of inEdges) {
    const src = nodeById.get(e.from);
    if (src) inBox.append(el("button", { type: "button", class: "chip-btn", text: "\u2190 " + src.label, onclick: () => selectNode(src.id) }));
  }

  if (!outEdges.length) outBox.append(el("span", { class: "u-sub", text: "None (terminal)" }));
  for (const e of outEdges) {
    const dst = nodeById.get(e.to);
    if (dst) outBox.append(el("button", { type: "button", class: "chip-btn", text: "\u2192 " + dst.label, onclick: () => selectNode(dst.id) }));
  }

  document.querySelectorAll(".u-node").forEach((g) => {
    g.classList.toggle("selected", g.getAttribute("data-node-id") === id);
  });
  document.querySelectorAll(".conduit-path").forEach((p) => {
    const from = p.getAttribute("data-from"), to = p.getAttribute("data-to");
    p.classList.toggle("active", from === id || to === id);
  });
}

function applyFilter() {
  const q = searchQuery.trim().toLowerCase();
  const connected = new Set();
  if (isolatedId) {
    connected.add(isolatedId);
    for (const e of GRAPH.edges) {
      if (e.from === isolatedId) connected.add(e.to);
      if (e.to === isolatedId) connected.add(e.from);
    }
  }
  const tourStep = tourOpen ? GRAPH.tour[tourIdx] : null;
  let visibleCount = 0;

  document.querySelectorAll(".u-node").forEach((g) => {
    const id = g.getAttribute("data-node-id");
    const n = nodeById.get(id);
    if (!n) return;
    const kindOk = activeFilter === "all" || n.kind === activeFilter;
    const textOk = !q || [n.label, n.why, n.path, n.question].some((s) => String(s || "").toLowerCase().includes(q));
    const isoOk = !isolatedId || connected.has(id);
    const show = kindOk && textOk && isoOk;
    g.style.display = show ? "" : "none";
    if (show) visibleCount++;
    if (tourStep) {
      const hit = (tourStep.focusIds && tourStep.focusIds.length)
        ? tourStep.focusIds.includes(id)
        : tourStep.focusKinds.includes(n.kind);
      g.classList.toggle("tour-dim", !hit);
    } else {
      g.classList.remove("tour-dim");
    }
  });

  $("empty-filter-msg").hidden = visibleCount > 0;
  $("filter-status").textContent = visibleCount + " node" + (visibleCount === 1 ? "" : "s") + " visible.";
}

function renderTour() {
  const deck = $("guided-tour-deck");
  deck.hidden = !tourOpen;
  if (!tourOpen || !GRAPH.tour.length) { applyFilter(); return; }
  const step = GRAPH.tour[tourIdx];
  $("tour-step-badge").textContent = "Step " + (tourIdx + 1) + " of " + GRAPH.tour.length;
  $("tour-title").textContent = step.title;
  $("tour-body").textContent = step.body;
  $("tour-prev").disabled = tourIdx === 0;
  $("tour-next").textContent = tourIdx + 1 < GRAPH.tour.length ? "Next \u2192" : "Finish";
  if (step.focusIds && step.focusIds[0] && nodeById.has(step.focusIds[0])) selectNode(step.focusIds[0]);
  applyFilter();
}

document.querySelectorAll(".filter-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeFilter = btn.getAttribute("data-filter") || "all";
    document.querySelectorAll(".filter-pill").forEach((b) => {
      const act = b === btn;
      b.classList.toggle("active", act);
      b.setAttribute("aria-pressed", act ? "true" : "false");
    });
    applyFilter();
  });
});

let searchTimer = null;
$("understand-search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { searchQuery = e.target.value || ""; applyFilter(); }, 80);
});

document.querySelectorAll(".u-node").forEach((g) => {
  const id = g.getAttribute("data-node-id");
  g.addEventListener("click", () => selectNode(id));
  g.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectNode(id); }
  });
});

$("btn-isolate").addEventListener("click", () => {
  isolatedId = isolatedId === selectedId ? null : selectedId;
  $("btn-isolate").textContent = isolatedId ? "Show all nodes" : "Isolate connected";
  applyFilter();
});

$("btn-reset-view").addEventListener("click", () => {
  isolatedId = null; activeFilter = "all"; searchQuery = ""; tourOpen = false;
  $("understand-search").value = "";
  $("btn-isolate").textContent = "Isolate connected";
  document.querySelectorAll(".filter-pill").forEach((b) => {
    const act = b.getAttribute("data-filter") === "all";
    b.classList.toggle("active", act);
    b.setAttribute("aria-pressed", act ? "true" : "false");
  });
  renderTour();
});

$("btn-tour").addEventListener("click", () => { tourOpen = true; tourIdx = 0; renderTour(); });
$("tour-exit").addEventListener("click", () => { tourOpen = false; renderTour(); });
$("tour-prev").addEventListener("click", () => { if (tourIdx > 0) { tourIdx--; renderTour(); } });
$("tour-next").addEventListener("click", () => {
  if (tourIdx + 1 < GRAPH.tour.length) { tourIdx++; renderTour(); }
  else { tourOpen = false; renderTour(); }
});

document.addEventListener("keydown", (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
    e.preventDefault(); $("understand-search").focus();
  } else if (e.key === "Escape") {
    if (tourOpen) { tourOpen = false; renderTour(); }
    else if (isolatedId) { isolatedId = null; $("btn-isolate").textContent = "Isolate connected"; applyFilter(); }
  } else if (tourOpen && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
    if (e.key === "ArrowRight" && tourIdx + 1 < GRAPH.tour.length) { tourIdx++; renderTour(); }
    else if (e.key === "ArrowLeft" && tourIdx > 0) { tourIdx--; renderTour(); }
  }
});

if (selectedId) selectNode(selectedId);
renderTour();
})();`;
