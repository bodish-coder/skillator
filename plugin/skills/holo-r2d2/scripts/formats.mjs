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
`;

export const FORMAT_RENDERERS = {};

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
