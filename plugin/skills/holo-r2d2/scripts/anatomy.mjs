// holo-r2d2 --anatomy (F83): a relay run drawn as a bench machine. One station
// per stage on a rail in stage order, its lamp the state; after: lines are
// belts, a re-planned stage rides a bypass track to its replacement, an open
// decision is a lever that opens the wizard. Every number on the card comes
// from the parsed run, the same model that places the parts.
//
// Construction rules (isometric projection, shading by facing, painter's order
// by separating planes, the framed card with title, hint and live readout,
// motion stilled under prefers-reduced-motion) follow wheresryan22/anatomy:
//
// MIT License
//
// Copyright (c) 2026 Ryan
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ASKABLE = new Set(["open", "asked"]);

// Camera: azimuth 20 deg so the long rail reads left to right, elevation 30.
const SA = Math.sin(Math.PI / 9), CA = Math.cos(Math.PI / 9), SE = 0.5, CE = Math.sqrt(3) / 2, K = 1.15;
const iso = ([x, y, z]) => [K * (x * CA - y * SA), K * ((x * SA + y * CA) * SE - z * CE)];
const pt = (p) => iso(p).map((v) => v.toFixed(1)).join(",");
const poly = (ps, cls) => `<path class="${cls}" d="M${ps.map(pt).join("L")}Z"/>`;

// A box seen from +x +y +z: top, front (+y) and side (+x), each its own tone.
const boxSvg = ([x0, y0, z0, x1, y1, z1], cls = "") =>
  `<g class="bx${cls ? " " + cls : ""}">` +
  poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], "r") +
  poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], "f") +
  poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], "t") + `</g>`;

// Text lying on a +y face, its baseline at p.
const faceText = (p, text, cls, size) => {
  const [ox, oy] = iso(p);
  return `<text class="${cls}" font-size="${size}" transform="matrix(${(K * CA).toFixed(3)},${(K * SA * SE).toFixed(3)},0,${(K * CE).toFixed(3)},${ox.toFixed(1)},${oy.toFixed(1)})">${esc(text)}</text>`;
};

// a is behind b when a plane x, y or z separates them with a on the far side.
export const behind = (a, b) => a[3] <= b[0] || a[4] <= b[1] || a[5] <= b[2];

// Painter's order: a before b wherever b hides part of a (Kahn's sort over the
// separating-plane relation); ties go back to front by depth.
function paint(parts) {
  const n = parts.length, into = new Array(n).fill(0), next = parts.map(() => []);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    if (behind(parts[i].box, parts[j].box) && !behind(parts[j].box, parts[i].box)) { next[i].push(j); into[j]++; }
  }
  const depth = (b) => (b[0] + b[3]) * SA + (b[1] + b[4]) * CA + (b[2] + b[5]);
  const ready = parts.map((_, i) => i).filter((i) => !into[i]), out = [];
  while (ready.length) {
    ready.sort((a, b) => depth(parts[b].box) - depth(parts[a].box));
    const i = ready.pop();
    out.push(parts[i]);
    for (const j of next[i]) if (!--into[j]) ready.push(j);
  }
  return out.length === n ? out : parts; // a cycle cannot come from disjoint boxes; never hang
}

const W = 40, SP = 66, D = 26, Y0 = -10, Z0 = 3, H = 24;

// Every solid of the bench, as {id, box, svg}, in painter's order.
export function figureParts(run) {
  const slot = new Map(run.stages.map((s, i) => [s.n, i]));
  const sx = (n) => slot.get(n) * SP;
  const N = run.stages.length;
  const parts = [];
  // Levers: an open or asked decision, beside the first station it holds.
  const qs = run.qs.filter((q) => ASKABLE.has(q.state));
  const leverAt = new Map();
  for (const q of qs) {
    const n = q.holds.find((k) => slot.has(k)) ?? run.stages[N - 1]?.n;
    if (n === undefined) continue;
    (leverAt.get(n) ?? leverAt.set(n, []).get(n)).push(q);
  }
  const deep = Math.max(0, ...[...leverAt.values()].map((l) => l.length));
  // Sidings: one lane each behind the main line.
  const bypassed = run.stages.filter((s) => s.state === "replanned");
  const lane = new Map(bypassed.map((s, k) => [s.n, -50 - k * 40]));
  // Belts: one floor lane each in front of the levers.
  const belts = run.stages.flatMap((s) => s.after.filter((a) => slot.has(a)).map((a) => [a, s.n]));
  const beltY = 20 + deep * 12;
  const yMin = Math.min(Y0, ...lane.values()) - 10, yMax = beltY + belts.length * 9 + 6;
  const xMax = Math.max(1, N) * SP - SP + W + 26;

  // Plate on four feet.
  const feet = [[-10, yMin + 4], [xMax - 10, yMin + 4], [-10, yMax - 10], [xMax - 10, yMax - 10]];
  parts.push({ id: "plate", box: [-14, yMin, -10, xMax, yMax, 0],
    svg: feet.map(([x, y]) => boxSvg([x, y, -10, x + 6, y + 6, -6], "foot")).join("") + boxSvg([-14, yMin, -6, xMax, yMax, 0], "plate") });
  parts.push({ id: "rail", box: [-8, 0, 0, xMax - 8, 10, Z0], svg: boxSvg([-8, 0, 0, xMax - 8, 10, Z0], "rail") });

  run.stages.forEach((s) => {
    const x = sx(s.n), y = lane.get(s.n) ?? Y0;
    if (lane.has(s.n)) {
      const to = s.replacedBy && slot.has(s.replacedBy) ? sx(s.replacedBy) : x;
      const b = [Math.min(x, to) - 4, y + 8, 0, Math.max(x, to) + W + 4, y + 18, Z0];
      parts.push({ id: `bypass ${s.n}`, box: b, svg: `<g data-bypass="${s.n}-${s.replacedBy ?? "-"}">${boxSvg(b, "rail")}</g>` });
    }
    const body = [x, y, Z0, x + W, y + D, Z0 + H];
    const lx = x + W / 2 - 5, ly = y + D / 2 - 5, top = Z0 + H;
    const lamp = [lx, ly, top, lx + 10, ly + 10, top + 6];
    const [hx, hy] = iso([lx + 5, ly + 5, top + 6]);
    const tip = `stage ${s.n}${s.code ? " " + s.code : ""} - ${s.name}\nstate: ${s.state}${s.landed !== "-" ? "\nlanded: " + s.landed : ""}${s.waits.length ? "\nwaits on: " + s.waits.join(", ") : ""}`;
    const sha = s.state === "landed" && /^[0-9a-f]{7,40}$/i.test(s.landed) ? s.landed.slice(0, 7) : "";
    parts.push({ id: `station ${s.n}`, box: [x, y, Z0, x + W, y + D, top + 6],
      svg: `<g class="st st-${s.state}" data-station="${s.n}" data-state="${s.state}"><title>${esc(tip)}</title>` +
        boxSvg(body, "body") +
        faceText([x + 3, y + D, top - 7], `#${s.n}`, "eng", 6) +
        (sha ? `<g class="tag">${faceText([x + 3, y + D, Z0 + 6], sha, "sha", 6.4)}</g>` : "") +
        (s.state === "inflight" ? `<ellipse class="pulse" cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" rx="15" ry="8"/>` : "") +
        boxSvg(lamp, `lamp lamp-${s.state}`) + `</g>` });
    (leverAt.get(s.n) ?? []).forEach((q, j) => {
      const bx = x + W + 8, by = 18 + j * 12;
      const tipq = `${run.id} ${q.id} ${q.state}: ${q.f.question || ""} - open the decision wizard`;
      parts.push({ id: `lever ${q.id}`, box: [bx, by, 0, bx + 10, by + 10, 24],
        svg: `<a class="lever" href="${esc(run.id)}.wizard.html" data-q="${q.id}" aria-label="${esc(tipq)}"><title>${esc(tipq)}</title>` +
          boxSvg([bx, by, 0, bx + 10, by + 10, 4], "base") + boxSvg([bx + 4, by + 4, 4, bx + 6, by + 6, 19], "rod") +
          boxSvg([bx + 2.5, by + 2.5, 19, bx + 7.5, by + 7.5, 24], "knob") + `</a>` });
    });
  });

  belts.forEach(([a, b], k) => {
    const xa = sx(a) + W / 2, xb = sx(b) + W / 2, y = beltY + k * 9;
    const [l, r] = xa < xb ? [xa, xb] : [xb, xa];
    parts.push({ id: `belt ${a}-${b}`, box: [l - 4, y, 0, r + 4, y + 6, 5],
      svg: `<g data-belt="${a}-${b}">` + boxSvg([l - 4, y, 0, l + 4, y + 6, 5], "drum") +
        boxSvg([l + 4, y + 1, 1.5, r - 4, y + 5, 3], "band") + boxSvg([r - 4, y, 0, r + 4, y + 6, 5], "drum") + `</g>` });
  });
  return paint(parts);
}

const age = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + " min" : m < 2880 ? Math.floor(m / 60) + " h" : Math.floor(m / 1440) + " d"; };

// The card: Fig 1 and the title on top, the bench, the hint and the live
// readout (stage n of m, heartbeat age, the resume sentence) below.
export function anatomyFigure(run, now = Date.now()) {
  const parts = figureParts(run);
  const pts = parts.flatMap(({ box: [x0, y0, z0, x1, y1, z1] }) =>
    [[x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z0], [x0, y1, z0], [x1, y0, z0]].map(iso));
  const minX = Math.min(...pts.map((p) => p[0])) - 12, minY = Math.min(...pts.map((p) => p[1])) - 12;
  const vw = Math.max(...pts.map((p) => p[0])) - minX + 12, vh = Math.max(...pts.map((p) => p[1])) - minY + 12;
  const m = run.stages.length, done = run.stages.filter((s) => s.state === "landed" || s.state === "replanned").length;
  const hb = run.stages.map((s) => s.heartbeat).filter((h) => /^\d{4}-\d\d-\d\dT/.test(h)).sort().pop();
  const nq = run.qs.filter((q) => ASKABLE.has(q.state)).length;
  const count = (st) => run.stages.filter((s) => s.state === st).length;
  const label = `${run.id} as a bench machine: ${m} stations in stage order, ${count("landed")} landed, ${count("inflight")} in flight, ` +
    `${count("failed")} failed, ${count("replanned")} re-planned, ${nq} decision lever${nq === 1 ? "" : "s"} waiting on you.`;
  const keys = ["pending", "inflight", "landed", "failed", "parked", "replanned"].map((s) =>
    `<li><i class="key key-${s}"></i>${s === "inflight" ? "in flight" : s === "replanned" ? "re-planned, on the bypass" : s}</li>`).join("");
  return `<figure class="iso-card" data-figure="bench">` +
    `<div class="iso-head"><span>Fig 1</span><span>${esc(run.id)} · ${esc(run.title)}</span></div>` +
    `<div class="scroll iso-stage"><svg class="bench" role="group" aria-label="${esc(label)}" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}" style="min-width:${Math.min(Math.round(vw), 560)}px">` +
    parts.map((p) => p.svg).join("") + `</svg></div>` +
    `<figcaption class="iso-foot"><span class="hint">One station per stage, its lamp the state. ${nq ? "A lever is a decision waiting on you: open it to answer in the wizard." : "No lever: nothing waits on you."}</span>` +
    `<span class="readout" data-readout>stage ${Math.min(done + 1, m)} of ${m} · ` +
    (hb ? `<span data-hb-at="${esc(hb)}">heartbeat ${age(now - Date.parse(hb))} ago</span>` : `<span>no heartbeat</span>`) +
    ` · resume: continue ${esc(run.id)}</span></figcaption></figure>` +
    `<ul class="legend iso-keys">${keys}<li>belt: an after: line</li></ul>`;
}

const TONES = `--iso-top:#2c322c; --iso-front:#20251f; --iso-side:#171b17; --iso-edge:#7c837b;`;
export const ANATOMY_CSS = `
:root{--iso-top:#fdfdfb; --iso-front:#e2e6df; --iso-side:#c9cfc6; --iso-edge:#4d544d}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${TONES}}}
:root[data-theme="dark"]{${TONES}}
.iso-card{margin:0;background:var(--surface);border:1px solid var(--rule);border-radius:6px;padding:.6rem .75rem}
.iso-head,.iso-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.25rem 1rem;font-family:var(--mono);font-size:.75rem;color:var(--mid)}
.iso-head span:first-child{font-weight:700;color:var(--ink)}
.iso-stage{border:0;padding:.25rem 0;background:none}
.bench{width:100%;height:auto}
.bx path{stroke:var(--iso-edge);stroke-width:.5;stroke-linejoin:round}
.bx .t{fill:var(--iso-top)} .bx .f{fill:var(--iso-front)} .bx .r{fill:var(--iso-side)}
.plate .t{fill:var(--ground)} .rail .t,.band .t{fill:var(--faint)} .drum .t{fill:var(--mid)}
.st-replanned .body{opacity:.6}
.lamp{--c:var(--pending)}
.lamp .t{fill:var(--c)} .lamp .f{fill:color-mix(in srgb,var(--c) 78%,#000)} .lamp .r{fill:color-mix(in srgb,var(--c) 60%,#000)}
${["pending", "landed", "failed", "parked", "replanned"].map((s) => `.lamp-${s},.key-${s}{--c:var(--${s})}`).join(" ")}
.lamp-inflight,.key-inflight{--c:var(--accent)} .lamp-unknown{--c:var(--failed)} .key{background:var(--c)}
.pulse{fill:var(--accent);opacity:.35;animation:iso-pulse 1.6s ease-in-out infinite alternate}
@keyframes iso-pulse{from{opacity:.12}to{opacity:.5}}
@media (prefers-reduced-motion:reduce){.pulse{animation:none;opacity:.35}}
.eng{font-family:var(--mono);font-weight:700;fill:var(--mid)} .sha{font-family:var(--mono);font-weight:700;fill:var(--landed)}
.lever{cursor:pointer} .lever .knob .t{fill:var(--parked)} .lever .knob .f,.lever .knob .r{fill:color-mix(in srgb,var(--parked) 70%,#000)}
.lever:hover .knob .t{fill:var(--ink)} .lever:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.readout{color:var(--ink);font-variant-numeric:tabular-nums}
`;

// Keeps the heartbeat age true while the page stays open.
export const ANATOMY_SCRIPT = `
(function(){
  var el = document.querySelector("[data-hb-at]");
  if (!el) return;
  var at = Date.parse(el.getAttribute("data-hb-at")), age = ${age.toString()};
  function tick(){ el.textContent = "heartbeat " + age(Date.now() - at) + " ago"; }
  tick(); setInterval(tick, 30000);
})();
`;
