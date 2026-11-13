// holo-r2d2 F164: four extra HTML presentations of the same parsed run
// (timeline, executive, runbook, mindmap) plus themes. Fed by parseRun and
// the layout(run) value passed in from holo.mjs; imports nothing from it
// (the anatomy.mjs / understand.mjs precedent - esc/clip duplicated).

const esc = (s) => String(s ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clip = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "\u2026" : String(s ?? ""));
const LABEL = {
  pending: "pending", inflight: "in flight", landed: "landed", failed: "failed",
  parked: "parked", replanned: "replanned", unknown: "unknown",
};
const ASKABLE = new Set(["open", "asked"]);

export const FORMATS = ["timeline", "executive", "runbook", "mindmap"];
export const THEMES = ["dark", "light", "contrast", "print"];

// The only door times enter through: a full ISO stamp or nothing.
export function parseTime(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(t)) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

export function themeCss(theme) {
  if (theme === "contrast") return `:root[data-theme="contrast"]{
  --ground:#000000; --surface:#000000; --ink:#ffffff; --mid:#e8e8e8; --faint:#c9c9c9; --rule:#ffffff;
  --landed:#33ff99; --landed-bg:#000000; --inflight:#66ccff; --inflight-bg:#000000;
  --parked:#ff99ff; --parked-bg:#000000; --failed:#ff8888; --failed-bg:#000000;
  --replanned:#e8e8e8; --replanned-bg:#000000; --pending:#c9c9c9; --pending-bg:#000000;
  --does:#33ff99; --does-bg:#000000; --hurts:#ff8888; --hurts-bg:#000000;
  --accent:#ffff00; --accent-bg:#000000; --focus:#ffff00;
}`;
  if (theme === "print") return `:root[data-theme="print"]{
  --ground:#ffffff; --surface:#ffffff; --ink:#000000; --mid:#333333; --faint:#555555; --rule:#8a8a8a;
  --landed:#14532d; --landed-bg:#ffffff; --inflight:#1e3a8a; --inflight-bg:#ffffff;
  --parked:#581c87; --parked-bg:#ffffff; --failed:#7f1d1d; --failed-bg:#ffffff;
  --replanned:#333333; --replanned-bg:#ffffff; --pending:#333333; --pending-bg:#ffffff;
  --does:#14532d; --does-bg:#ffffff; --hurts:#7f1d1d; --hurts-bg:#ffffff;
  --accent:#000000; --accent-bg:#ffffff; --focus:#000000;
}`;
  return "";
}

const DARK = `
  --ground:#121512; --surface:#191d19; --ink:#e6e9e5; --mid:#a0a79f; --faint:#6f766e; --rule:#2b302a;
  --landed:#6cc28d; --landed-bg:#16271c; --inflight:#7fb0f0; --inflight-bg:#152235;
  --parked:#c3a1ec; --parked-bg:#251c33; --failed:#f08b80; --failed-bg:#341a17;
  --replanned:#9da19c; --replanned-bg:#222622; --pending:#a0a79f; --pending-bg:#191d19;
  --does:#6cc28d; --does-bg:#16271c; --hurts:#f08b80; --hurts-bg:#341a17; --accent:#e5a660; --accent-bg:#33240f;
`;

const FORMAT_CSS = `
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
body{background:var(--ground);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.5;margin:0 auto;max-width:64rem;padding:2rem 16px 4rem;-webkit-font-smoothing:antialiased}
h1{font-family:var(--mono);font-size:1rem;margin:0 0 .25rem;letter-spacing:.03em}
h1 .t{color:var(--mid);font-weight:400}
.sub{color:var(--mid);font-size:.8125rem;margin:0 0 1rem;overflow-wrap:anywhere}
h2{font-family:var(--mono);font-size:.6875rem;text-transform:uppercase;letter-spacing:.12em;color:var(--mid);margin:2.25rem 0 .75rem;padding-bottom:.4rem;border-bottom:1px solid var(--rule)}
.skip{position:absolute;left:-999px}
.skip:focus{left:8px;top:8px;background:var(--surface);color:var(--ink);padding:.4rem .7rem;z-index:5}
:focus-visible{outline:3px solid var(--focus,var(--accent));outline-offset:2px}
.foot{margin-top:2.5rem;font-size:.75rem;color:var(--faint)}
.empty{color:var(--mid)}
.mono{font-family:var(--mono)}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--rule);border-radius:6px;background:var(--surface);padding:.5rem}
.dot{display:inline-block;width:.7rem;height:.7rem;border-radius:50%;flex:none}
${["landed", "inflight", "parked", "failed", "replanned", "pending", "unknown"].map((s) => {
  const c = s === "unknown" ? "failed" : s;
  return `.s-${s} .dot{background:var(--${c})} .s-${s} .sst{color:var(--${c})}`;
}).join("\n")}
.rail-row{display:grid;grid-template-columns:.8rem 2.6rem minmax(0,1fr) auto;gap:.6rem;align-items:baseline;padding:.45rem 0;border-bottom:1px solid var(--rule)}
.sn{font-family:var(--mono);font-weight:700;font-variant-numeric:tabular-nums}
.sname{min-width:0;overflow-wrap:anywhere} .sname b{font-family:var(--mono);font-size:.8125rem}
.sfiles{display:block;font-family:var(--mono);font-size:.75rem;color:var(--mid);overflow-wrap:anywhere}
.sst{font-family:var(--mono);font-size:.6875rem;text-transform:uppercase;letter-spacing:.05em;text-align:right;white-space:nowrap}
table{border-collapse:collapse;font-size:.8125rem;margin:.5rem 0;width:100%}
th,td{border:1px solid var(--rule);padding:.3rem .5rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}
th{font-family:var(--mono);font-size:.6875rem;text-transform:uppercase;letter-spacing:.05em;color:var(--mid)}
button{font:inherit;font-size:.8125rem;padding:.4rem .8rem;border-radius:4px;border:1px solid var(--accent);background:var(--accent-bg);color:var(--ink);cursor:pointer;min-height:44px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media print{body{max-width:none} .no-print{display:none!important}}
.tl-svg{max-width:none;height:auto}
.tl-axis{font-family:var(--mono);font-size:10.5px;fill:var(--mid)}
.tl-axisline{stroke:var(--rule);stroke-width:1.5}
.tl-n{font-family:var(--mono);font-size:11px;fill:var(--ink)}
.tl-cpbadge{font-family:var(--mono);font-size:10px;font-weight:700;fill:var(--accent)}
.tl-bar{fill:var(--inflight-bg);stroke:var(--inflight);stroke-width:1.5}
.tl-pt{fill:var(--accent);stroke:var(--accent)}
.tl-cp{font-family:var(--mono);font-size:.8125rem}
.tl-rail{list-style:none;margin:1rem 0 0;padding:0}
.tl-filters{display:flex;flex-wrap:wrap;gap:.4rem;margin:.5rem 0}
[data-critical="1"]{border-left:3px solid var(--accent)}
@media print{.tl-svg,.tl-filters{display:none!important}}
`;

// ------------------------------------------------------------- timeline ----
export function timelineModel(run, layoutData) {
  const events = [];
  const add = (raw, kind, label, extra = {}) => {
    const at = parseTime(raw);
    if (at !== null) events.push({ at, raw: String(raw), kind, label, ...extra });
  };
  add(run.started, "started", "run started");
  add(run.updated, "updated", "run updated");
  for (const s of run.stages) {
    add(s.dispatchedAt, "dispatched", `stage ${s.n} dispatched`, { n: s.n });
    add(s.heartbeat, "heartbeat", `stage ${s.n} heartbeat`, { n: s.n });
  }
  for (const q of run.qs) {
    add(q.ts, "decision", `${q.id} ${q.state}`, { q: q.id });
    add(q.f.answered, "answered", `${q.id} answered`, { q: q.id });
    add(q.f.ruled, "ruled", `${q.id} ruled`, { q: q.id });
  }
  events.sort((a, b) => a.at - b.at);
  const distinct = [...new Set(events.map((e) => e.at))];
  const window = distinct.length >= 2 ? { start: distinct[0], end: distinct[distinct.length - 1] } : null;
  // Longest after: chain by stage count; memoised DFS, in-stack guard on cycles.
  const byN = new Map(run.stages.map((s) => [s.n, s]));
  const memo = new Map();
  const chain = (n, stack) => {
    if (memo.has(n)) return memo.get(n);
    if (stack.has(n)) return null; // cyclic branch contributes nothing
    stack.add(n);
    let best = null;
    for (const d of [...(byN.get(n)?.after ?? [])].sort((a, b) => a - b)) {
      if (!byN.has(d)) continue;
      const c = chain(d, stack);
      if (c && (!best || c.length > best.length)) best = c;
    }
    stack.delete(n);
    const out = [...(best ?? []), n];
    memo.set(n, out);
    return out;
  };
  let criticalPath = [];
  for (const s of [...run.stages].sort((a, b) => a.n - b.n)) {
    const c = chain(s.n, new Set());
    if (c.length > criticalPath.length) criticalPath = c;
  }
  const crit = new Set(criticalPath);
  const pos = layoutData?.pos ?? new Map();
  const rows = run.stages.map((s) => {
    const p = pos.get(s.n) ?? { col: 0, lane: 0 };
    const from = parseTime(s.dispatchedAt), to = parseTime(s.heartbeat);
    const bar = from !== null && to !== null && to >= from ? { from, to, kind: "observed" } : null;
    const points = [];
    if (from !== null) points.push({ at: from, kind: "dispatched", raw: s.dispatchedAt });
    if (to !== null) points.push({ at: to, kind: "heartbeat", raw: s.heartbeat });
    return { n: s.n, code: s.code, name: s.name, state: s.state, st: s.st, lane: p.lane, col: p.col, bar, points, critical: crit.has(s.n) };
  }).sort((a, b) => a.lane - b.lane || a.n - b.n);
  const laneCount = rows.length ? Math.max(...rows.map((r) => r.lane)) + 1 : 0;
  return { window, events, rows, criticalPath, laneCount, stepCount: layoutData?.cols?.length ?? 0 };
}

const TL_SCRIPT = `
(function(){
  var status = document.getElementById("tl-count");
  function show(lane){
    var n = 0;
    document.querySelectorAll("[data-tl-row]").forEach(function(el){
      var on = lane === "all" || el.getAttribute("data-lane") === lane;
      el.hidden = !on; if (on) n++;
    });
    document.querySelectorAll("[data-lane-btn]").forEach(function(b){
      b.setAttribute("aria-pressed", b.getAttribute("data-lane-btn") === lane ? "true" : "false");
    });
    if (status) status.textContent = n + " stage row" + (n === 1 ? "" : "s") + " shown";
  }
  document.querySelectorAll("[data-lane-btn]").forEach(function(b){
    b.addEventListener("click", function(){ show(b.getAttribute("data-lane-btn")); });
  });
})();
`;

export function renderTimeline(run, ctx) {
  const m = timelineModel(run, ctx.layout);
  const byN = new Map(run.stages.map((s) => [s.n, s]));
  const head = `<header><h1>${esc(run.id)} <span class="t">\u00b7 ${esc(run.title)}</span></h1>` +
    `<p class="sub">timeline \u00b7 recorded times only \u00b7 ${m.rows.length} stages \u00b7 ${m.laneCount} lanes \u00b7 ${m.stepCount} steps</p></header>`;
  if (!run.stages.length) {
    const times = m.events.length
      ? `<h2>Recorded times</h2><ul>${m.events.map((e) => `<li class="mono">${esc(e.raw)} \u00b7 ${esc(e.label)}</li>`).join("")}</ul>`
      : "";
    return head + `<p class="empty">No stage rows in this run file.</p>` + times;
  }
  const cpLine = m.criticalPath.length
    ? `<p class="tl-cp">critical path (longest after: chain, by stage count): ${m.criticalPath.join(" -&gt; ")} (${m.criticalPath.length} stages)</p>`
    : `<p class="tl-cp">critical path (longest after: chain, by stage count): none recorded</p>`;
  const lanes = [...new Set(m.rows.map((r) => r.lane))].sort((a, b) => a - b);
  const filters = `<div class="tl-filters no-print" role="group" aria-label="Lane filter">` +
    `<button type="button" data-lane-btn="all" aria-pressed="true">all lanes</button>` +
    lanes.map((k) => `<button type="button" data-lane-btn="${k}" aria-pressed="false">lane ${k + 1}</button>`).join("") +
    `</div><p id="tl-count" class="sub" aria-live="polite"></p>`;
  let chart = "";
  if (m.window) {
    const W = 880, rowH = 30, top = 34, left = 150;
    const H = top + m.rows.length * rowH + 24;
    const x = (at) => left + ((at - m.window.start) / Math.max(1, m.window.end - m.window.start)) * (W - left - 16);
    const startRaw = m.events.find((e) => e.at === m.window.start)?.raw ?? "";
    const endRaw = [...m.events].reverse().find((e) => e.at === m.window.end)?.raw ?? "";
    const groups = m.rows.map((r, i) => {
      const y = top + i * rowH;
      const s = byN.get(r.n);
      const bar = r.bar ? `<rect class="tl-bar s-${r.state}" x="${x(r.bar.from).toFixed(1)}" y="${y + 9}" width="${Math.max(2, x(r.bar.to) - x(r.bar.from)).toFixed(1)}" height="10" rx="2"><title>observed: dispatched -&gt; last heartbeat</title></rect>` : "";
      const pts = r.points.map((p) => {
        const px = x(p.at).toFixed(1);
        return p.kind === "heartbeat"
          ? `<path class="tl-pt" d="M${px},${y + 6} L${(x(p.at) + 6).toFixed(1)},${y + 14} L${px},${y + 22} L${(x(p.at) - 6).toFixed(1)},${y + 14} Z"><title>heartbeat ${esc(p.raw)}</title></path>`
          : `<circle class="tl-pt" cx="${px}" cy="${y + 14}" r="4"><title>dispatched ${esc(p.raw)}</title></circle>`;
      }).join("");
      return `<g class="tl-row s-${r.state}" data-tl-row data-stage="${r.n}" data-lane="${r.lane}"${r.critical ? ' data-critical="1"' : ""} tabindex="0">` +
        `<title>stage ${r.n} ${esc(r.code)} ${esc(r.name)} - ${LABEL[r.state] || r.state}</title>` +
        `<circle class="dot" cx="10" cy="${y + 14}" r="5"/><text class="tl-n" x="20" y="${y + 18}">#${r.n} ${esc(clip(r.code || r.name, 14))}</text>` +
        (r.critical ? `<text class="tl-cpbadge" x="118" y="${y + 18}">CP</text>` : "") + bar + pts + `</g>`;
    }).join("");
    chart = `<div class="scroll"><svg class="tl-svg" role="img" aria-label="Timeline of ${esc(run.id)} from recorded times" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
      `<text class="tl-axis" x="${left}" y="16">${esc(startRaw)}</text><text class="tl-axis" x="${W - 16}" y="16" text-anchor="end">${esc(endRaw)}</text>` +
      `<line class="tl-axisline" x1="${left}" y1="22" x2="${W - 16}" y2="22"/>` + groups + `</svg></div>`;
  } else {
    chart = `<p class="empty">Not enough recorded times to draw a scale.</p>` +
      (m.events.length ? `<h2>Recorded times</h2><ul>${m.events.map((e) => `<li class="mono">${esc(e.raw)} \u00b7 ${esc(e.label)}</li>`).join("")}</ul>` : "");
  }
  const rail = `<ol class="tl-rail">${m.rows.map((r) => {
    const s = byN.get(r.n);
    return `<li class="rail-row s-${r.state}" data-tl-row data-stage="${r.n}" data-lane="${r.lane}"${r.critical ? ' data-critical="1"' : ""}>` +
      `<span class="dot" aria-hidden="true"></span><span class="sn">${r.n}</span>` +
      `<span class="sname">${r.code ? `<b>${esc(r.code)}</b> ` : ""}${esc(r.name)}<span class="sfiles">lane ${r.lane + 1} \u00b7 step ${r.col + 1}${r.critical ? ` \u00b7 CP` : ""}</span></span>` +
      `<span class="sst">${LABEL[r.state] || r.state}${r.state === "unknown" ? " (" + esc(r.st) + ")" : ""}</span></li>`;
  }).join("")}</ol>`;
  const table = `<h2>Recorded times</h2><div class="scroll"><table class="tl-table"><thead><tr><th>#</th><th>stage</th><th>state</th><th>dispatched</th><th>heartbeat</th><th>landed</th><th>note</th></tr></thead><tbody>` +
    m.rows.map((r) => {
      const s = byN.get(r.n);
      const note = r.bar ? "observed window: dispatched -&gt; last heartbeat" : "duration not recorded";
      return `<tr data-stage="${r.n}" data-lane="${r.lane}"><td>${r.n}</td><td>${r.code ? esc(r.code) + " " : ""}${esc(r.name)}</td><td>${LABEL[r.state] || r.state}</td>` +
        `<td class="mono">${esc(s.dispatchedAt || "-")}</td><td class="mono">${esc(s.heartbeat)}</td><td class="mono">${esc(s.landed)}</td><td>${note}</td></tr>`;
    }).join("") + `</tbody></table></div>`;
  return head + cpLine + filters + chart + rail + table + `<script>${TL_SCRIPT}</script>`;
}

export const FORMAT_RENDERERS = { timeline: renderTimeline };

export function formatPage(run, format, opts = {}) {
  if (!FORMATS.includes(format)) throw new Error(`unknown format ${format} (timeline, executive, runbook, mindmap)`);
  const renderer = FORMAT_RENDERERS[format];
  if (!renderer) throw new Error(`format ${format} is not implemented yet`);
  const ctx = { layout: opts.layout, now: opts.now, theme: opts.theme, runPath: opts.runPath };
  const body = renderer(run, ctx);
  const themeAttr = opts.theme ? ` data-theme="${esc(opts.theme)}"` : "";
  const src = opts.runPath ? esc(opts.runPath) : "the run file";
  const foot = `<p class="foot">Drawn by holo-r2d2 from ${src}` +
    `${run ? ` at ${esc(run.updated || "?")}` : ""}. It decides nothing: answers are written to the run file by the session (relay-morpheus answer).` +
    `${run && run.chain ? ` Holds: ${run.holdsFrom === "relay" ? "as relay-morpheus chain next judges them" : "estimated here - relay-morpheus could not be run"}.` : ""}</p>`;
  return `<!doctype html>\n<html lang="en"${themeAttr}>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<title>Holo ${esc(run?.id ?? "")} ${esc(format)}</title>\n<style>${FORMAT_CSS}${themeCss(opts.theme)}</style>\n</head>\n<body>\n` +
    `<a class="skip" href="#main">Skip to content</a>\n` +
    `<main id="main" data-run="${esc(run?.id ?? "")}" data-format="${esc(format)}">${body}${opts.designHtml || ""}${foot}</main>\n</body>\n</html>\n`;
}
