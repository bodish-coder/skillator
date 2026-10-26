#!/usr/bin/env node
// Bake TICKETS.md into a single self-contained HTML page for the Artifact tool.
//
//   node skills/tickets-zordon/board/artifact.mjs [TICKETS.md] [out.html]
//
// Defaults: ./TICKETS.md -> ./.tickets-board.html (gitignored).
// The archive beside the board (TICKETS-archive.md, written by
// practice/scripts/archive-tickets.sh) is read too when present: its tickets
// count in the chips and sit in the closed list, marked archived (F27).
// Output is Artifact-shaped: no <!doctype>/<html>/<head>/<body>, the wrapper
// supplies those. Self-check: node artifact.mjs --selftest

import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const STATES = {
  " ": ["pending", "[ ]"],
  "~": ["in-progress", "[~]"],
  "!": ["blocked", "[!]"],
  "?": ["decision", "[?]"],   // F45: pending decision - open, waiting on a [decide:] person
  "%": ["testing", "[%]"],    // F62: testing - built, waiting on a test result; open
  ">": ["deferred", "[>]"],
  "x": ["done", "[x]"],
  "-": ["cancelled", "[-]"],
};
const GROUPS = [["B", "Bugs"], ["F", "Features"], ["A", "Agent-found"]];
// ponytail: anything outside B/F/A still has to appear somewhere — a ticket
// counted in the chips but listed in no section is a lying header.
const inGroups = (id) => GROUPS.some(([p]) => id.startsWith(p));
// ponytail: ID + em-dash + title is the whole line format the skill enforces.
// A hyphen separator is tolerated because hand-typed tickets use one.
const LINE = /^(\s*)- \[([ x~!?%>-])\]\s+([A-Za-z]+\d+[a-z]?)\s*[—-]\s*(.*)$/;
// F43/F45: trailing `[app: ..] [decide: @x] [owner: @x] [by: @y, a@b]` tags. Lifted out of the
// title and drawn as chips; a line without them parses exactly as before.
const TAG = /\s*\[(app|decide|owner|by):\s*([^\]]*)\]/g;

export function parse(md) {
  const out = [];
  for (const raw of md.split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (!m) continue;
    const [, indent, ch, id, title] = m;
    const state = STATES[ch];
    if (!state) continue;
    const tags = [];
    const bare = title.replace(TAG, (_, k, v) => { tags.push([k, v.trim()]); return ""; });
    out.push({ id, title: bare.trim(), tags, status: state[0], glyph: state[1], sub: indent.length > 0 });
  }
  return out;
}

export function tally(ts) {
  const n = (s) => ts.filter((t) => t.status === s).length;
  const c = {
    pending: n("pending"), inprogress: n("in-progress"), testing: n("testing"), blocked: n("blocked"),
    decision: n("decision"), deferred: n("deferred"), done: n("done"), cancelled: n("cancelled"),
  };
  c.open = c.pending + c.inprogress + c.testing + c.blocked + c.decision;
  c.closed = c.done + c.cancelled;
  c.total = c.open + c.deferred + c.closed;
  return c;
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function countLine(c) {
  return `${c.open} open (${c.pending} pending · ${c.inprogress} in-progress · ${c.testing} testing · ${c.blocked} blocked` +
    ` · ${c.decision} pending decision)` +
    ` · ${c.deferred} deferred · ${c.closed} closed (${c.done} done · ${c.cancelled} cancelled)` +
    ` · ${c.total} total`;
}

const tagChips = (t) => (t.tags || []).length
  ? ` <span class="tags">${t.tags.map(([k, v]) =>
      `<span class="tag tag-${k}"><b>${k}</b> ${esc(v)}</span>`).join("")}</span>`
  : "";

const li = (t) =>
  `<li class="s-${t.status.replace("-", "")}${t.sub ? " sub" : ""}">` +
  `<span class="g" aria-hidden="true">${t.glyph}</span>` +
  `<span class="id">${esc(t.id)}</span>` +
  `<span class="t">${esc(t.title)}${tagChips(t)}</span>` +
  `<span class="st">${t.status === "decision" ? "pending decision" : t.status}${t.archived ? " · archived" : ""}</span></li>`;

function section(name, ts) {
  if (!ts.length) return "";
  return `<section><h2>${name}<span class="n">${ts.length}</span></h2>` +
    `<ul>${ts.map(li).join("")}</ul></section>`;
}

const CHIPS = [
  ["pending", "pending"], ["inprogress", "in progress"], ["testing", "testing"], ["blocked", "blocked"], ["decision", "to decide"],
  ["deferred", "deferred"], ["done", "done"], ["cancelled", "cancelled"],
];

function chips(c) {
  const cells = CHIPS.map(([k, label]) =>
    `<div class="chip c-${k}"><span class="v">${c[k]}</span><span class="k">${label}</span></div>`
  ).join("");
  return `<div class="counts" data-count-line="${esc(countLine(c))}">${cells}` +
    `<div class="chip c-total"><span class="v">${c.total}</span><span class="k">total</span></div></div>`;
}

export function render(md, title, archiveMd = "", archiveName = "TICKETS-archive.md") {
  const board = parse(md);
  // Archived tickets are closed by construction; anything else in that file
  // is still shown, never dropped, so the chips never lie about it.
  const archived = parse(archiveMd).map((t) => ({ ...t, archived: true }));
  const ts = board.concat(archived);
  const c = tally(ts);
  const isClosed = (t) => t.status === "done" || t.status === "cancelled";
  const parentOf = (t) => t.id.replace(/[a-z]$/, "");
  // A done sub-part of a live parent stays with the parent — filing it under
  // "closed" strands it beside unrelated tickets with nothing to explain it.
  const openParents = new Set(board.filter((t) => !isClosed(t)).map((t) => t.id));
  const isLive = (t) => !t.archived && (!isClosed(t) || (t.sub && openParents.has(parentOf(t))));
  const live = ts.filter(isLive);
  const closed = ts.filter((t) => !isLive(t));
  const sections = GROUPS.map(([p, name]) =>
    section(name, live.filter((t) => t.id.startsWith(p)))).join("") +
    section("Other", live.filter((t) => !inGroups(t.id)));
  const body = sections || `<p class="empty">Nothing open. The whole board is closed.</p>`;
  const narch = archived.length;
  const archNote = narch ? ` (${narch} archived in ${esc(archiveName)})` : "";
  const rest = closed.length
    ? `<details><summary>${closed.length} closed — done and cancelled${archNote}</summary>` +
      `<ul>${closed.map(li).join("")}</ul></details>`
    : "";
  return `<title>TICKETS · ${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;700&display=swap">
<style>
:root{
  --ground:#f4f5f2; --surface:#fbfbf9; --ink:#191c19; --mid:#5c625c; --faint:#8b918b;
  --rule:#dfe3dd; --amber:#a8590c; --red:#b0241a; --violet:#6d3fb3; --teal:#0b6e70; --sans:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#141714; --surface:#191d19; --ink:#e7eae6; --mid:#9aa199; --faint:#6e756d;
  --rule:#2a2f29; --amber:#e0a25c; --red:#f08b80; --violet:#b9a0ef; --teal:#6cc9c9;
}}
:root[data-theme="dark"]{
  --ground:#141714; --surface:#191d19; --ink:#e7eae6; --mid:#9aa199; --faint:#6e756d;
  --rule:#2a2f29; --amber:#e0a25c; --red:#f08b80; --violet:#b9a0ef; --teal:#6cc9c9;
}
*{box-sizing:border-box}
body{background:var(--ground);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.5;
  padding:2.5rem 1.25rem 4rem;max-width:56rem;margin:0 auto;-webkit-font-smoothing:antialiased}
header{display:flex;flex-direction:column;gap:1rem;margin-bottom:2rem}
h1{font-family:var(--mono);font-size:1rem;font-weight:700;letter-spacing:.04em;margin:0}
h1 .repo{color:var(--mid);font-weight:400}
.counts{display:flex;flex-wrap:wrap;gap:0;border:1px solid var(--rule);border-radius:3px;
  background:var(--surface);overflow:hidden}
.chip{flex:1 1 6rem;display:flex;flex-direction:column;gap:.1rem;padding:.6rem .75rem;
  border-left:1px solid var(--rule)}
.chip:first-child{border-left:0}
.chip .v{font-family:var(--mono);font-size:1.05rem;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
.chip .k{font-size:.6875rem;color:var(--faint);letter-spacing:.05em;text-transform:uppercase}
.c-inprogress .v{color:var(--amber)}
.c-blocked .v{color:var(--red)}
.c-decision .v{color:var(--violet)}
.c-testing .v{color:var(--teal)}
.c-total{background:color-mix(in oklab,var(--ground) 60%,var(--surface))}
section{margin:0 0 2rem}
h2{display:flex;align-items:baseline;gap:.5rem;font-family:var(--mono);font-size:.6875rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.12em;color:var(--mid);margin:0 0 .25rem;
  padding-bottom:.4rem;border-bottom:1px solid var(--rule)}
h2 .n{font-weight:400;color:var(--faint);font-variant-numeric:tabular-nums}
ul{list-style:none;margin:0;padding:0}
li{display:grid;grid-template-columns:1.9rem 3.4rem 1fr auto;gap:.5rem;align-items:baseline;
  padding:.4rem 0;border-bottom:1px solid var(--rule)}
li.sub{padding-left:1.4rem;grid-template-columns:1.9rem 3.4rem 1fr auto}
.g,.id{font-family:var(--mono);font-size:.8125rem}
.g{color:var(--faint)}
.id{font-weight:700;font-variant-numeric:tabular-nums}
.t{min-width:0;overflow-wrap:anywhere}
.st{font-size:.6875rem;color:var(--faint);letter-spacing:.04em;text-align:right;white-space:nowrap}
.s-inprogress .id,.s-inprogress .g,.s-inprogress .st{color:var(--amber)}
.s-blocked .id,.s-blocked .g,.s-blocked .st{color:var(--red)}
.s-decision .id,.s-decision .g,.s-decision .st{color:var(--violet)}
.s-testing .id,.s-testing .g,.s-testing .st{color:var(--teal)}
.s-deferred .id,.s-deferred .t{color:var(--mid)}
.s-done .t,.s-cancelled .t{color:var(--mid);text-decoration:line-through;text-decoration-color:var(--rule)}
details{margin-top:2.5rem;border-top:1px solid var(--rule);padding-top:.75rem}
summary{cursor:pointer;font-family:var(--mono);font-size:.6875rem;text-transform:uppercase;
  letter-spacing:.12em;color:var(--mid)}
summary:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
details ul{margin-top:.75rem}
.empty{color:var(--mid)}
.tags{display:inline-flex;flex-wrap:wrap;gap:.25rem;margin-left:.25rem;vertical-align:baseline}
.tag{font-family:var(--mono);font-size:.6875rem;line-height:1.3;color:var(--mid);
  border:1px solid var(--rule);border-radius:3px;padding:0 .35rem;background:var(--surface);white-space:nowrap}
.tag b{font-weight:400;color:var(--faint)}
.tag-owner{color:var(--ink)}
.tag-decide{color:var(--violet);border-color:var(--violet)}
</style>
<header>
  <h1>TICKETS <span class="repo">· ${esc(title)}</span></h1>
  ${chips(c)}
</header>
${body}
${rest}`;
}

const ok = (cond, msg, got) => { if (!cond) { console.error(`selftest FAIL: ${msg}`, got ?? ""); process.exitCode = 1; } };

function selftest() {
  const md = `
## Bugs
- [x] B1 — Done thing
- [~] B2 — Working <thing> & more
  - [ ] B2a — sub part
- [!] B3 — Stuck (blocked: creds)
## Features
- [ ] F1 — Dark mode
## Agent-found
- [>] A2 — Later (deferred: after rewrite)
- [-] A3 — Dropped
  - [x] B3a — done sub-part of a blocked parent
- [ ] Z9 — unrecognised prefix
not a ticket line
`;
  const ts = parse(md);
  const c = tally(ts);
  ok(ts.length === 9, "parsed 9", ts.length);
  ok(ts.find((t) => t.id === "B2a")?.sub === true, "B2a is a sub-part");
  ok(c.open === 5 && c.deferred === 1 && c.closed === 3 && c.total === 9, "counts", c);
  const html = render(md, "demo");
  ok(html.includes("Working &lt;thing&gt; &amp; more"), "escapes html");
  ok(!/<(!doctype|html|head|body)\b/i.test(html), "no wrapper tags");
  ok(html.includes('data-count-line="5 open (3 pending · 1 in-progress · 0 testing · 1 blocked · 0 pending decision) · 1 deferred · 3 closed (2 done · 1 cancelled) · 9 total"'), "count line");
  // every ticket the chips count must appear in a list — see inGroups
  const shown = (html.match(/<li /g) || []).length;
  ok(shown === 9, "every ticket rendered", shown);
  ok(html.indexOf(">B3a<") < html.indexOf("<details"), "done sub-part stays with its live parent");
  ok(html.includes(">Other<"), "unrecognised prefix gets a section");
  // F27: archived tickets count, sit in the closed list, and say so.
  const arch = `## Bugs
- [x] B0 — archived long ago
- [-] A0 — archived cancel
`;
  const h2 = render(md, "demo", arch);
  ok(h2.includes("11 total"), "archived tickets counted", h2.match(/data-count-line="[^"]*"/)?.[0]);
  ok(h2.includes("4 closed — done and cancelled (2 archived in TICKETS-archive.md)"), "closed summary names the archive");
  ok(h2.indexOf(">B0<") > h2.indexOf("<details"), "archived ticket sits in the closed list");
  ok(h2.includes("done · archived"), "archived ticket is marked");
  ok(!render(md, "demo").includes("archived in"), "no archive, no archive note");
  // F43: tags come off the title, render as chips, and never break the parse.
  const tagged = parse(`- [~] F12 — Bulk <x> [app: web, api] [owner: @asha] [by: @vidul, z@q.io] (@cc-abc123)
- [ ] F13 — Plain [ish] title`);
  ok(tagged.length === 2, "tagged lines parse", tagged.length);
  ok(tagged[0].title === "Bulk <x> (@cc-abc123)", "tags lifted off the title", tagged[0].title);
  ok(JSON.stringify(tagged[0].tags) === JSON.stringify([["app", "web, api"], ["owner", "@asha"], ["by", "@vidul, z@q.io"]]), "tags read", tagged[0].tags);
  ok(tagged[1].title === "Plain [ish] title" && tagged[1].tags.length === 0, "a bracket that is not a tag stays", tagged[1]);
  const th = render(`## Features
- [~] F12 — Bulk [app: web] [owner: @asha] (@cc-abc123)`, "demo");
  ok(th.includes('<span class="tag tag-app"><b>app</b> web</span>') && th.includes('<span class="tag tag-owner"><b>owner</b> @asha</span>'), "tags render as chips");
  ok(!/<span class="t">[^<]*\[app:/.test(th), "no raw tag text in the title");
  // F45: [?] is "pending decision" - parsed, counted inside open, labelled.
  const dmd = `## Features
- [?] F30 — Pick a vendor [decide: @asha]
- [ ] F31 — Plain
- [x] F32 — Done
`;
  const dts = parse(dmd);
  ok(dts.length === 3 && dts[0].status === "decision" && dts[0].glyph === "[?]", "[?] parses as decision", dts[0]);
  const dc = tally(dts);
  ok(dc.decision === 1 && dc.open === 2 && dc.closed === 1 && dc.total === 3, "[?] counts as open", dc);
  const dh = render(dmd, "demo");
  ok(dh.includes('data-count-line="2 open (1 pending · 0 in-progress · 0 testing · 0 blocked · 1 pending decision) · 0 deferred · 1 closed (1 done · 0 cancelled) · 3 total"'), "count line names pending decision", dh.match(/data-count-line="[^"]*"/)?.[0]);
  ok(dh.includes('<li class="s-decision">') && dh.includes('>pending decision<'), "[?] row has its own class and label");
  ok(dh.includes('c-decision'), "a pending-decision chip");
  ok(dh.indexOf(">F30<") < dh.indexOf("<details"), "[?] is listed open, not closed");
  // F45: [decide: @x] is a tag like the others - a chip, never title text.
  ok(dts[0].title === "Pick a vendor" && dts[0].tags.length === 1 && dts[0].tags[0][0] === "decide", "decide tag lifted off the title", dts[0]);
  ok(!/<span class="t">[^<]*\[decide:/.test(dh), "no raw [decide: in the title");
  ok((dh.match(/class="tag tag-decide"/g) || []).length === 1 && dh.includes('<span class="tag tag-decide"><b>decide</b> @asha</span>'), "one decide chip");
  const three = parse("- [ ] F33 — Split [app: web] [decide: @vidul] [owner: @asha] (@cc-1)")[0];
  ok(three.title === "Split (@cc-1)" && JSON.stringify(three.tags) === JSON.stringify([["app", "web"], ["decide", "@vidul"], ["owner", "@asha"]]), "app + decide + owner split cleanly", three);
  // F62: [%] is "testing" - built, waiting on a test result; open, its own row and chip.
  const tmd = `## Features
- [%] F40 — Built thing (testing: owner live check)
- [ ] F41 — Plain
- [x] F42 — Done
`;
  const tts = parse(tmd);
  ok(tts.length === 3 && tts[0].status === "testing" && tts[0].glyph === "[%]", "[%] parses as testing", tts[0]);
  const tc = tally(tts);
  ok(tc.testing === 1 && tc.open === 2 && tc.closed === 1 && tc.total === 3, "[%] counts as open", tc);
  const thh = render(tmd, "demo");
  ok(thh.includes('data-count-line="2 open (1 pending · 0 in-progress · 1 testing · 0 blocked · 0 pending decision) · 0 deferred · 1 closed (1 done · 0 cancelled) · 3 total"'), "count line names testing", thh.match(/data-count-line="[^"]*"/)?.[0]);
  ok(thh.includes('<li class="s-testing">') && thh.includes('>testing<'), "[%] row has its own class and label");
  ok(thh.includes('c-testing'), "a testing chip");
  ok(thh.indexOf(">F40<") < thh.indexOf("<details"), "[%] is listed open, not closed");
  if (!process.exitCode) console.log("selftest: ok");
}

if (process.argv[2] === "--selftest") {
  selftest();
} else {
  const mdPath = resolve(process.argv[2] ?? join(process.cwd(), "TICKETS.md"));
  const outPath = resolve(process.argv[3] ?? join(process.cwd(), ".tickets-board.html"));
  let md;
  try {
    md = await readFile(mdPath, "utf8");
  } catch (e) {
    console.error(`artifact: cannot read ${mdPath} (${e.code ?? e.message}).
` +
      `Run this from the repo root, or pass the board's path as the first argument.`);
    process.exit(1);
  }
  const archPath = mdPath.replace(/\.md$/i, "-archive.md");
  let archMd = "";
  if (archPath !== mdPath) {
    try { archMd = await readFile(archPath, "utf8"); } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  const html = render(md, basename(resolve(mdPath, "..")), archMd, basename(archPath));
  try {
    await writeFile(outPath, html, "utf8");
  } catch (e) {
    console.error(`artifact: cannot write ${outPath} (${e.code ?? e.message}).`);
    process.exit(1);
  }
  const na = parse(archMd).length;
  console.log(`artifact: ${parse(md).length} tickets from ${mdPath}` +
    (na ? ` + ${na} archived from ${basename(archPath)}` : "") + ` -> ${outPath}`);
}
